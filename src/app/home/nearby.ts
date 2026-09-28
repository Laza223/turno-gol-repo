import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { AvailabilityResponse } from '@/modules/tenants/public.service'

/**
 * Qué canchas muestra el hero de la home. Decisiones del dueño (2026-09-27):
 *
 * - Solo complejos con reserva online activa (`allowOnlineBooking`), cobren
 *   seña por MercadoPago o no: MP no suma.
 * - Orden: perfil más completo primero (foto de portada, precio cargado) y
 *   después la distancia. Nunca un orden pagado.
 * - "Cerca" no es un número fijo para todo el país: el radio se abre de a
 *   escalones hasta juntar HERO_COUNT complejos. En el conurbano alcanza con
 *   5 km; desde Luján se abre hasta que entra General Rodríguez; más allá del
 *   último escalón no hay "cerca" y el hero lo dice.
 */
export const RADIUS_STEPS_KM = [5, 10, 20, 30, 40] as const
export const HERO_COUNT = 3

type Located = PublicTenantCard & { distanceKm: number }

export type NearbyPick = {
  picked: Located[]
  /** Cuántos complejos entraron en el radio elegido (para "Ver las N canchas"). */
  inZone: number
  radiusKm: number
}

function profileScore(t: PublicTenantCard): number {
  return (t.coverUrl ? 1 : 0) + (t.fromPriceCents != null ? 1 : 0)
}

export function pickNearby(results: PublicTenantCard[]): NearbyPick {
  const located = results.filter((t): t is Located => t.allowOnlineBooking && t.distanceKm != null)
  const maxKm = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]!
  const radiusKm =
    RADIUS_STEPS_KM.find((km) => located.filter((t) => t.distanceKm <= km).length >= HERO_COUNT) ??
    maxKm
  const zone = located.filter((t) => t.distanceKm <= radiusKm)
  const picked = [...zone]
    .sort((a, b) => profileScore(b) - profileScore(a) || a.distanceKm - b.distanceKm)
    .slice(0, HERO_COUNT)
  return { picked, inZone: zone.length, radiusKm }
}

function kmWithComma(km: number): string {
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km)
  return String(rounded).replace('.', ',')
}

/** "a 4,2 km" · "a 11 km" · "a menos de 1 km". */
export function distanceLabel(km: number): string {
  return km < 1 ? 'a menos de 1 km' : `a ${kmWithComma(km)} km`
}

/** La cifra del titular va entera: "a 4 km". */
export function headlineDistance(km: number): string {
  return km < 1 ? 'a menos de 1 km' : `a ${Math.round(km)} km`
}

/** [5, 7] → "Fútbol 5 y 7" · [5, 7, 11] → "Fútbol 5, 7 y 11". */
export function formatsLabel(formats: number[]): string | null {
  const f = [...new Set(formats)].sort((a, b) => a - b)
  if (f.length === 0) return null
  if (f.length === 1) return `Fútbol ${f[0]}`
  return `Fútbol ${f.slice(0, -1).join(', ')} y ${f[f.length - 1]}`
}

export type FreeSlot = { time: string; href: string }

/**
 * Los próximos turnos libres del día, sin repetir horario entre canchas, cada
 * uno con el link directo a reservar en la primera cancha libre a esa hora
 * (mismo link que las pills de /explorar). El orden es el de la grilla del
 * complejo, no alfabético: con día operativo que cruza la medianoche, "00:00"
 * va después de "23:00", y la API ya los devuelve así por cancha.
 */
export function freeSlots(
  slug: string,
  availability: AvailabilityResponse,
  max: number,
): FreeSlot[] {
  const byTime = new Map<string, { slot: FreeSlot; order: number }>()
  for (const court of availability.courts) {
    court.slots.forEach((s, order) => {
      if (s.status !== 'free' || byTime.has(s.time)) return
      const href = `/${slug}/reservar?court=${court.id}&date=${availability.date}&time=${s.time}&dur=${s.duration}`
      byTime.set(s.time, { slot: { time: s.time, href }, order })
    })
  }
  return [...byTime.values()]
    .sort((a, b) => a.order - b.order)
    .slice(0, max)
    .map((v) => v.slot)
}
