import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { AvailabilityResponse } from '@/modules/tenants/public.service'

/** Lo que arma la ventana de complejos del hero de la home (portal de vidrio, F2). */

/** Tarjetas de la ventana en la compu (en el celu se ven 2 y en la tablet 3, por CSS). */
const WINDOW_CARDS = 4

/**
 * Los complejos de la ventana: solo los que reservan online (los horarios libres de hoy son el
 * contenido de la tarjeta) y, entre esos, primero los que tienen foto. Dentro de cada grupo se
 * respeta el orden de la búsqueda. Nunca un orden pagado (decisión del dueño, 2026-09-27).
 */
export function pickWindowComplexes(results: PublicTenantCard[]): PublicTenantCard[] {
  const online = results.filter((t) => t.allowOnlineBooking)
  const withPhoto = online.filter((t) => t.coverUrl)
  const withoutPhoto = online.filter((t) => !t.coverUrl)
  return [...withPhoto, ...withoutPhoto].slice(0, WINDOW_CARDS)
}

/**
 * Los próximos horarios libres del día, sin repetir hora entre canchas. El orden es el de la
 * grilla del complejo y no el alfabético: con día operativo que cruza la medianoche, "00:00" va
 * después de "23:00", y la API ya los devuelve así por cancha (los que pasaron llegan `past`).
 */
export function freeTimes(availability: AvailabilityResponse, max: number): string[] {
  const byTime = new Map<string, number>()
  for (const court of availability.courts) {
    court.slots.forEach((s, order) => {
      if (s.status !== 'free' || byTime.has(s.time)) return
      byTime.set(s.time, order)
    })
  }
  return [...byTime.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([time]) => time)
}
