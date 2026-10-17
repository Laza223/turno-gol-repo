import type { AvailabilityResponse } from '@/modules/tenants/public.service'

/**
 * 'free' = 2 canchas libres o más · 'last' = queda 1 de varias · 'only' = el filtro deja una sola
 * cancha y está libre (no es escasez, es la única que hay) · 'held' = ninguna libre pero alguien
 * está señando una (puede liberarse, decisión v2 D1) · 'full' = completo.
 */
type HourState = 'free' | 'last' | 'only' | 'held' | 'full'

type FreeCourt = {
  id: string
  name: string
  format: number
  /** Centavos tal como viene del slot: con `hidePrices` el servidor ya lo manda en `null`. */
  price: number | null
}

export type HourRow = {
  time: string
  freeCount: number
  state: HourState
  /** Canchas libres a esa hora, en el orden del servidor. */
  courts: FreeCourt[]
}

/**
 * Resume el día por hora para la página del complejo: cuántas canchas hay libres a cada hora y
 * cuáles son. `format` (opcional) deja solo las canchas de ese formato.
 *
 * El orden de las filas es el del servidor: `generateSlots` emite el DÍA OPERATIVO (…22:00,
 * 23:00, 00:00), y el `Map` conserva el orden de inserción. No se ordena por la etiqueta —
 * `'00:00' < '19:00'` como texto mandaría la madrugada de un complejo que cierra a la 01:00
 * arriba— ni se reimplementa la aritmética de día operativo (CLAUDE.md).
 *
 * Una hora sin ninguna cancha elegible (todas `past`) no sale: es una hora que ya pasó, no una
 * hora completa. Las `occupied` sí salen, como 'full'.
 */
export function summarizeHours(
  courts: AvailabilityResponse['courts'],
  format: number | null = null,
): HourRow[] {
  const pool = format === null ? courts : courts.filter((court) => court.format === format)

  // Por hora: las canchas libres, si queda algo por vivir (no `past`) y si alguien está señando.
  const byHour = new Map<string, { free: FreeCourt[]; upcoming: boolean; held: boolean }>()
  for (const court of pool) {
    for (const slot of court.slots) {
      let hour = byHour.get(slot.time)
      if (!hour) {
        hour = { free: [], upcoming: false, held: false }
        byHour.set(slot.time, hour)
      }
      if (slot.status === 'past') continue
      hour.upcoming = true
      if (slot.status === 'held') hour.held = true
      if (slot.status === 'free') {
        hour.free.push({ id: court.id, name: court.name, format: court.format, price: slot.price })
      }
    }
  }

  return [...byHour]
    .filter(([, hour]) => hour.upcoming)
    .map(([time, { free, held }]) => ({
      time,
      freeCount: free.length,
      state:
        free.length >= 2
          ? 'free'
          : free.length === 1
            ? pool.length === 1
              ? 'only'
              : 'last'
            : held
              ? 'held'
              : 'full',
      courts: free,
    }))
}
