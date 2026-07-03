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
import { DAY_KEYS, DAY_LABELS, formatDayList, type DayKey } from '@/shared/time/week-days'
import type { PricingRule } from './court.types'

// Re-export para los consumidores históricos (PricingGrid, tests).
export { DAY_KEYS, DAY_LABELS }
export type { DayKey }

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

/** "35.000" / "35000" / "$35.000" → 3500000 centavos. null si no hay dígitos. */
export function parsePesosToCents(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '')
  if (digits === '') return null
  return Number(digits) * 100
}

// ---------------------------------------------------------------------------
// Plantilla rápida (rediseño 2026-07-02, pages/horarios-precios.md §3.2):
// generadores que llenan TODAS las celdas activas de una vez. No son editores
// bidireccionales — aplicar pisa la grilla; el estado real vive en las reglas.
// ---------------------------------------------------------------------------

export type PricingTemplate =
  | { mode: 'uniform'; price: number }
  // Split argentino real: el viernes se cobra como finde (matchea el default histórico).
  | { mode: 'weekSplit'; weekPrice: number; weekendPrice: number }
  // Corte único para todos los días: [apertura, cutHour) = día, [cutHour, cierre) = noche.
  | { mode: 'dayNight'; cutHour: number; dayPrice: number; nightPrice: number }

const WEEK_DAYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu']

/** Llena todas las celdas activas según la plantilla. Respeta ventanas y días cerrados. */
export function buildTemplateGrid(
  openingHours: OpeningHours,
  template: PricingTemplate,
): PriceGrid {
  const grid = {} as PriceGrid
  for (const day of DAY_KEYS) {
    grid[day] = {}
    for (const hour of activeHoursForDay(openingHours, day)) {
      let price: number
      switch (template.mode) {
        case 'uniform':
          price = template.price
          break
        case 'weekSplit':
          price = WEEK_DAYS.includes(day) ? template.weekPrice : template.weekendPrice
          break
        case 'dayNight':
          price = hour < template.cutHour ? template.dayPrice : template.nightPrice
          break
      }
      grid[day][hour] = price
    }
  }
  return grid
}

function hhmmToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Precio uniforme directo desde los horarios de apertura (wizard de onboarding,
 * pages/onboarding.md §5.2). A diferencia de buildTemplateGrid+compress, no pasa
 * por celdas de hora entera: usa los minutos exactos de open/close y soporta
 * madrugada (`closesNextDay`), que la grilla todavía no modela.
 *
 * - Día abierto normal → una regla [open, close). Cierre '00:00' = medianoche.
 * - Madrugada (flag y close <= open, close ≠ '00:00') → dos reglas: [open, 00:00)
 *   del día + [00:00, close) del día calendario SIGUIENTE — calculatePrice busca
 *   por día calendario, así el turno de la 01:00 del sábado (noche del viernes)
 *   lo cubre la regla del sábado.
 * - Sin el flag, un cierre <= apertura no genera slots → tampoco reglas.
 * - Rangos idénticos se fusionan por días. Sin días abiertos → [].
 */
export function uniformRulesFromOpeningHours(
  openingHours: OpeningHours,
  closesNextDay: boolean,
  priceCents: number,
): PricingRule[] {
  type Range = { from: string; to: string; days: DayKey[] }
  const groups = new Map<string, Range>()

  function push(day: DayKey, from: string, to: string) {
    const key = `${from}|${to}`
    const g = groups.get(key)
    if (g) {
      if (!g.days.includes(day)) g.days.push(day)
    } else {
      groups.set(key, { from, to, days: [day] })
    }
  }

  DAY_KEYS.forEach((day, i) => {
    const d = openingHours[day]
    if (!d || d.closed) return
    const openM = hhmmToMins(d.open)
    const closeM = hhmmToMins(d.close)
    if (d.close === '00:00' || closeM > openM) {
      push(day, d.open, d.close)
      return
    }
    if (!closesNextDay) return
    push(day, d.open, '00:00')
    push(DAY_KEYS[(i + 1) % DAY_KEYS.length]!, '00:00', d.close)
  })

  const closeMins = (hhmm: string) => (hhmm === '00:00' ? 24 * 60 : hhmmToMins(hhmm))
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      days: [...g.days].sort((a, b) => DAY_KEYS.indexOf(a) - DAY_KEYS.indexOf(b)),
    }))
    .sort((a, b) => hhmmToMins(a.from) - hhmmToMins(b.from) || closeMins(a.to) - closeMins(b.to))
    .map((g) => ({ days: g.days, from: g.from, to: g.to, price: priceCents }))
}

export type RuleDescription = {
  /** "Lun a Jue", "Sáb y Dom", "Todos los días". */
  daysLabel: string
  /** "08:00–18:00" (en-dash, §8.3). Cierre '00:00' = medianoche. */
  rangeLabel: string
  price: number
}

/** Reglas → filas legibles para el resumen (verificación sin leer la matriz). */
export function describeRules(rules: PricingRule[]): RuleDescription[] {
  return rules.map((r) => ({
    daysLabel: formatDayList(r.days),
    rangeLabel: `${r.from}–${r.to}`,
    price: r.price,
  }))
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
