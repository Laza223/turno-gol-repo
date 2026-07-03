'use client'

export type ImagePreset = 'logo' | 'cover' | 'court'

export const PRESET_CONFIG: Record<ImagePreset, { aspect: number; maxWidth: number }> = {
  logo: { aspect: 1, maxWidth: 512 },
  cover: { aspect: 16 / 9, maxWidth: 1600 },
  court: { aspect: 4 / 3, maxWidth: 1280 },
}

/**
 * Redimensiona `file` al aspecto/ancho del preset con center-crop, re-encodea
 * a webp (q≈0.82) en un `<canvas>` y devuelve el Blob resultante. El re-encode
 * también descarta EXIF (no hay metadata a limpiar aparte).
 */
export function resizeToPreset(file: File, preset: ImagePreset): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('El archivo debe ser una imagen'))
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
        reject(new Error('No se pudo procesar la imagen'))
        return
      }
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo generar la imagen'))
            return
          }
          resolve(blob)
        },
        'image/webp',
        0.82,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('No se pudo leer la imagen'))
    }

    img.src = objectUrl
  })
}
