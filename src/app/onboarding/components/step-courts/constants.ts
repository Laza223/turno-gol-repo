import type { CourtRow } from '@/modules/courts/court.types'

// Mismas opciones que el form de /canchas (consistencia > completitud).
export const FORMATS = [4, 5, 6, 7, 8, 9, 10, 11] as const

export const SURFACE_OPTIONS = [
  { value: 'synthetic_grass', label: 'Césped sintético' },
  { value: 'natural_grass', label: 'Césped natural' },
  { value: 'cement', label: 'Cemento' },
  { value: 'tile', label: 'Baldosa' },
] as const

export type SurfaceType = (typeof SURFACE_OPTIONS)[number]['value']

/**
 * Un borrador de cancha del paso 3.
 *
 * Sin fotos a propósito: el wizard tenía un uploader por cancha cuyo resultado
 * el submit NUNCA mandaba —la cancha se creaba sin foto y el blob quedaba
 * huérfano en R2— y encima es lo primero que sobra en un alta rápida. Se cargan
 * después desde `/settings/canchas`, que ya tiene el mismo uploader.
 */
export type Draft = {
  key: number
  name: string
  format: number
  surfaceType: SurfaceType
  isCovered: boolean
  /** Precio por turno en centavos (MoneyInput ya entrega/recibe cents). */
  priceCents: number | null
}

/** Precio "desde" de una cancha existente para la fila-resumen. */
export function minPrice(court: CourtRow): number | null {
  const prices = court.pricing.rules.map((r) => r.price)
  return prices.length ? Math.min(...prices) : null
}
