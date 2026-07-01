/**
 * Facets de cancha (superficie y formato) para badges y filtros de /explorar.
 * Las claves coinciden con `tenants.courtSurfaces` (surface_type enum) y
 * `tenants.courtFormats` (formato de la cancha: Fútbol N).
 */

export type SurfaceKey = 'synthetic_grass' | 'natural_grass' | 'cement' | 'tile'

const SURFACE_LABELS: Record<SurfaceKey, string> = {
  synthetic_grass: 'Sintético',
  natural_grass: 'Césped natural',
  cement: 'Cemento',
  tile: 'Baldosa',
}

export const SURFACE_OPTIONS: { key: SurfaceKey; label: string }[] = (
  Object.keys(SURFACE_LABELS) as SurfaceKey[]
).map((key) => ({ key, label: SURFACE_LABELS[key] }))

export function surfaceLabel(key: string): string {
  return (SURFACE_LABELS as Record<string, string>)[key] ?? key
}

/** Formatos soportados (Fútbol 4 al 11, cambio #17). */
export const FORMAT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11] as const

export function formatLabel(format: number): string {
  return `Fútbol ${format}`
}
