// Lógica pura de la grilla de precios hora×día (cambio #13).
// Sin React: se testea como funciones. La UI (PricingGrid.tsx) la consume.
//
// Modelo:
//  - Filas = horas operativas (slot de 60 min). Una celda en la hora H representa
//    el precio del turno [H:00, H+1:00). Misma convención half-open que
//    calculatePrice/validatePricingRulesCoverage en court.service.ts.
//  - Columnas = días (mon..sun).
//  - Celda "activa" = el día está abierto y la hora cae dentro de su ventana.
//  - Guardar = comprimir celdas consecutivas con mismo precio en reglas JSONB.

import type { OpeningHours, OpeningHoursDay } from '@/modules/tenants/tenant.types'
import type { PricingRule } from './court.types'

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
}

// grid[day][hour] = precio en centavos. Clave ausente = celda vacía (sin precio).
export type PriceGrid = Record<DayKey, Record<number, number>>

// Hora de inicio (entero). "08:30" → 8. El grid trabaja en horas enteras.
function openHour(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number)
  return h ?? 0
}

// Cota superior exclusiva en horas. "00:00" (medianoche) → 24; "23:00" → 23.
function closeHour(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if ((h ?? 0) === 0 && (m ?? 0) === 0) return 24
  return h ?? 0
}

// "HH:00", con 24 → "00:00" (medianoche, fin de día).
export function hourLabel(hour: number): string {
  if (hour >= 24) return '00:00'
  return `${String(hour).padStart(2, '0')}:00`
}

function hourToMins(hour: number): number {
  return hour * 60
}

/** ¿La hora cae dentro de la ventana operativa de ese día? */
export function isHourActive(day: OpeningHoursDay | undefined, hour: number): boolean {
  if (!day || day.closed) return false
  const lo = openHour(day.open)
  const hi = closeHour(day.close)
  return hi > lo && hour >= lo && hour < hi
}

/** Horas (slot-start) activas para un día puntual, ascendente. */
function activeHoursForDay(openingHours: OpeningHours, day: DayKey): number[] {
  const d = openingHours[day]
  if (!d || d.closed) return []
  const lo = openHour(d.open)
  const hi = closeHour(d.close)
  const out: number[] = []
  for (let h = lo; h < hi; h++) out.push(h)
  return out
}

/**
 * Rango de horas a mostrar como filas: unión de las ventanas de todos los días
 * abiertos. Si ningún día abre, devuelve [].
 */
export function getOperativeHours(openingHours: OpeningHours): number[] {
  let min = Infinity
  let max = -Infinity
  for (const day of DAY_KEYS) {
    const d = openingHours[day]
    if (!d || d.closed) continue
    const lo = openHour(d.open)
    const hi = closeHour(d.close)
    if (hi <= lo) continue
    if (lo < min) min = lo
    if (hi > max) max = hi
  }
  if (min === Infinity) return []
  const out: number[] = []
  for (let h = min; h < max; h++) out.push(h)
  return out
}

/** Precio (centavos) de la regla que cubre (día, hora), o null si ninguna. */
function priceForCell(rules: PricingRule[], day: DayKey, hour: number): number | null {
  const m = hourToMins(hour)
  for (const r of rules) {
    if (!r.days.includes(day)) continue
    const fm = hourToMins(openHour(r.from))
    const tm = r.to === '00:00' ? 24 * 60 : hourToMins(openHour(r.to))
    if (m >= fm && m < tm) return r.price
  }
  return null
}

/** Reglas comprimidas → grilla de celdas individuales (solo celdas activas). */
export function expandRulesToGrid(
  rules: PricingRule[],
  openingHours: OpeningHours,
): PriceGrid {
  const grid = {} as PriceGrid
  for (const day of DAY_KEYS) {
    grid[day] = {}
    for (const hour of activeHoursForDay(openingHours, day)) {
      const price = priceForCell(rules, day, hour)
      if (price != null) grid[day][hour] = price
    }
  }
  return grid
}

/**
 * Grilla → reglas comprimidas. Dos pasos:
 *  1. Por día, fusiona horas consecutivas con el mismo precio en un intervalo.
 *  2. Fusiona días con intervalo idéntico (mismo from/to/price) en una regla.
 * Solo se consideran celdas activas con precio; las vacías se omiten (quedan
 * como hueco de cobertura, lo valida el server).
 */
export function compressGridToRules(
  grid: PriceGrid,
  openingHours: OpeningHours,
): PricingRule[] {
  type Entry = { day: DayKey; from: string; to: string; price: number }
  const entries: Entry[] = []

  for (const day of DAY_KEYS) {
    const cells = grid[day] ?? {}
    const hours = activeHoursForDay(openingHours, day).filter((h) => cells[h] != null)
    let i = 0
    while (i < hours.length) {
      const startH = hours[i]!
      const price = cells[startH]!
      let j = i
      // extiende mientras: hora contigua, activa, mismo precio
      while (
        j + 1 < hours.length &&
        hours[j + 1] === hours[j]! + 1 &&
        cells[hours[j + 1]!] === price
      ) {
        j++
      }
      const endH = hours[j]! // último slot cubierto → intervalo [startH, endH+1)
      entries.push({ day, from: hourLabel(startH), to: hourLabel(endH + 1), price })
      i = j + 1
    }
  }

  // Fusión por día: agrupa entries con mismo (from,to,price). Los días entran en
  // orden DAY_KEYS porque iteramos en ese orden arriba.
  const groups = new Map<string, { from: string; to: string; price: number; days: DayKey[] }>()
  for (const e of entries) {
    const key = `${e.from}|${e.to}|${e.price}`
    const g = groups.get(key)
    if (g) g.days.push(e.day)
    else groups.set(key, { from: e.from, to: e.to, price: e.price, days: [e.day] })
  }

  const toMins = (hhmm: string) => (hhmm === '00:00' ? 24 * 60 : hourToMins(openHour(hhmm)))
  return Array.from(groups.values())
    .sort((a, b) => toMins(a.from) - toMins(b.from) || toMins(a.to) - toMins(b.to) || a.price - b.price)
    .map((g) => ({ days: g.days, from: g.from, to: g.to, price: g.price }))
}

/** Centavos → "$35.000" (separador de miles argentino, sin decimales). */
export function formatArs(cents: number): string {
  const pesos = Math.round(cents / 100)
  return '$' + String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "35.000" / "35000" / "$35.000" → 3500000 centavos. null si no hay dígitos. */
export function parsePesosToCents(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '')
  if (digits === '') return null
  return Number(digits) * 100
}

/** Cuántas celdas activas siguen sin precio (bloquean el guardado). */
export function countEmptyCells(grid: PriceGrid, openingHours: OpeningHours): number {
  let n = 0
  for (const day of DAY_KEYS) {
    const cells = grid[day] ?? {}
    for (const h of activeHoursForDay(openingHours, day)) {
      if (cells[h] == null) n++
    }
  }
  return n
}
