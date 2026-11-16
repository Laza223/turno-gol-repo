/**
 * Medidas de cada imagen que se sube. Las usan el recorte del navegador
 * (`resize-image.ts`) y la recompresión del server (`compress-image.ts`): las dos
 * puntas tienen que dar la misma imagen.
 */
export type ImagePreset = 'logo' | 'cover' | 'court'

export const PRESET_CONFIG: Record<ImagePreset, { aspect: number; maxWidth: number }> = {
  logo: { aspect: 1, maxWidth: 512 },
  cover: { aspect: 16 / 9, maxWidth: 1600 },
  court: { aspect: 4 / 3, maxWidth: 1280 },
}
