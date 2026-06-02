import {
  Beer,
  DoorOpen,
  Flame,
  Lightbulb,
  ShowerHead,
  SquareParking,
  Umbrella,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

/**
 * Config compartida de amenities/servicios del complejo.
 * `tenants.amenities` es un JSONB `Record<string, boolean>` con estas claves.
 * Fuente única de label + ícono para tarjetas, perfil y filtros.
 */
export type AmenityKey =
  | 'duchas'
  | 'estacionamiento'
  | 'bar'
  | 'parrilla'
  | 'vestuario'
  | 'wifi'
  | 'techado'
  | 'iluminacion'

export const AMENITIES: Record<AmenityKey, { label: string; Icon: LucideIcon }> = {
  techado: { label: 'Techado', Icon: Umbrella },
  iluminacion: { label: 'Iluminación', Icon: Lightbulb },
  estacionamiento: { label: 'Estacionamiento', Icon: SquareParking },
  duchas: { label: 'Duchas', Icon: ShowerHead },
  vestuario: { label: 'Vestuario', Icon: DoorOpen },
  parrilla: { label: 'Parrilla', Icon: Flame },
  bar: { label: 'Bar', Icon: Beer },
  wifi: { label: 'WiFi', Icon: Wifi },
}

/** Orden de presentación (los más relevantes para elegir cancha primero). */
export const AMENITY_ORDER: AmenityKey[] = [
  'techado',
  'iluminacion',
  'estacionamiento',
  'duchas',
  'vestuario',
  'parrilla',
  'bar',
  'wifi',
]

/** Devuelve las claves de amenities activas (=== true) en orden de presentación. */
export function activeAmenities(
  amenities: Record<string, boolean> | null | undefined,
): AmenityKey[] {
  if (!amenities) return []
  return AMENITY_ORDER.filter((k) => amenities[k] === true)
}
