'use client'

import { PRESET_CONFIG, type ImagePreset } from './image-presets'

export { PRESET_CONFIG, type ImagePreset }

/** La imagen elegida no se pudo leer o procesar en el navegador (no es un problema de red). */
export class ImageResizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageResizeError'
  }
}

/**
 * Redimensiona `file` al aspecto/ancho del preset con center-crop, re-encodea
 * a webp (q≈0.82) en un `<canvas>` y devuelve el Blob resultante. El re-encode
 * también descarta EXIF (no hay metadata a limpiar aparte). Todo rechazo es un
 * `ImageResizeError`.
 *
 * Safari (iPhone incluido) no genera webp: devuelve un PNG sin avisar, que en una
 * foto pesa varias veces más. Con `jpegFallback` se vuelve a exportar en JPEG
 * (q 0.85). Está apagado para `logo` porque JPEG no guarda transparencia; quien
 * no puede recibir PNG (la foto del jugador) lo pide.
 */
export function resizeToPreset(
  file: File,
  preset: ImagePreset,
  { jpegFallback = preset !== 'logo' }: { jpegFallback?: boolean } = {},
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new ImageResizeError('El archivo debe ser una imagen'))
  }

  const { aspect, maxWidth } = PRESET_CONFIG[preset]

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const srcAspect = img.width / img.height
      let cropW = img.width
      let cropH = img.height
      if (srcAspect > aspect) {
        cropW = img.height * aspect
      } else {
        cropH = img.width / aspect
      }
      const cropX = (img.width - cropW) / 2
      const cropY = (img.height - cropH) / 2

      const outW = Math.min(maxWidth, cropW)
      const outH = outW / aspect

      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new ImageResizeError('No se pudo procesar la imagen'))
        return
      }
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

      const finish = (blob: Blob | null) => {
        if (blob) resolve(blob)
        else reject(new ImageResizeError('No se pudo generar la imagen'))
      }

      canvas.toBlob(
        (blob) => {
          if (!jpegFallback || blob?.type === 'image/webp') {
            finish(blob)
            return
          }
          // En JPEG lo transparente sale negro: se pinta blanco por detrás.
          ctx.globalCompositeOperation = 'destination-over'
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, outW, outH)
          canvas.toBlob(finish, 'image/jpeg', 0.85)
        },
        'image/webp',
        0.82,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new ImageResizeError('No se pudo leer la imagen'))
    }

    img.src = objectUrl
  })
}
