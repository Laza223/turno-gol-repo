import { PRESET_CONFIG, type ImagePreset } from './image-presets'

/**
 * Tope de píxeles de entrada. El archivo ya llega con tope de 2 MB, pero un PNG
 * chico puede declarar dimensiones enormes y reventar la memoria al decodificar.
 */
const MAX_INPUT_PIXELS = 40_000_000

/** Calidad del WebP: la misma que usa el recorte del navegador (0.82). */
const WEBP_QUALITY = 82

// Import dinámico: sharp es un binario nativo. Si no carga en un entorno, falla
// solo la subida o la imagen, no todo el módulo de actions que importa esto.
async function loadSharp() {
  return (await import('sharp')).default
}

/**
 * Recomprime en el server toda imagen que se sube, sin confiar en el navegador.
 * El cliente ya recorta y comprime (`resize-image.ts`), pero un POST directo
 * puede mandar cualquier cosa: acá se fija la medida del preset, el formato
 * WebP y se descarta la metadata (EXIF con ubicación incluido).
 *
 * Devuelve `null` si los bytes no son una imagen que se pueda leer.
 */
export async function compressUpload(
  bytes: Uint8Array,
  preset: ImagePreset,
): Promise<Uint8Array | null> {
  const { aspect, maxWidth } = PRESET_CONFIG[preset]
  const sharp = await loadSharp()
  try {
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      // Respeta la orientación de la foto del celular antes de soltar el EXIF.
      .rotate()
      .resize({
        width: maxWidth,
        height: Math.round(maxWidth / aspect),
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    return new Uint8Array(out)
  } catch {
    return null
  }
}

/**
 * Pasa a PNG una imagen ya guardada (el logo del complejo, que está en WebP)
 * para dibujarla con `next/og`: satori acepta el WebP pero lo deja en blanco
 * sin avisar. `width` es el ancho final en píxeles.
 */
export async function toPng(bytes: Uint8Array, width: number): Promise<Buffer> {
  const sharp = await loadSharp()
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width, height: width, fit: 'cover', withoutEnlargement: true })
    .png()
    .toBuffer()
}
