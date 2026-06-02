/**
 * Facets de cancha (superficie y formato) para badges y filtros de /explorar.
 * Las claves coinciden con `tenants.courtSurfaces` (surface_type enum) y
 * `tenants.courtFormats` (capacidad de la cancha).
 */

export type SurfaceKey = 'synthetic_grass' | 'natural_grass' | 'cement' | 'indoor'

export const SURFACE_LABELS: Record<SurfaceKey, string> = {
  synthetic_grass: 'Sintético',
  natural_grass: 'Césped natural',
  cement: 'Cemento',
  indoor: 'Indoor',
}

export const SURFACE_OPTIONS: { key: SurfaceKey; label: string }[] = (
  Object.keys(SURFACE_LABELS) as SurfaceKey[]
).map((key) => ({ key, label: SURFACE_LABELS[key] }))

export function surfaceLabel(key: string): string {
  return (SURFACE_LABELS as Record<string, string>)[key] ?? key
}

/** Capacidades soportadas (jugadores por equipo no, total de la cancha). */
export const FORMAT_OPTIONS = [5, 7, 8, 9, 11] as const

export function formatLabel(capacity: number): string {
  return `Fútbol ${capacity}`
}
