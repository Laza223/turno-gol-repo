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
import { effectiveCloseMins } from '@/shared/time/operating-day'
import type { PricingRule } from './court.types'

// Re-export para los consumidores históricos (PricingGrid, tests).
export { DAY_KEYS, DAY_LABELS }
export type { DayKey }

// parsePesosToCents vive en src/lib/money.ts (fuente única de parseo de plata,
// compartida con MoneyInput). Re-exportado acá para no romper los call sites
// e imports históricos de este módulo.
export { parsePesosToCents } from '@/lib/money'

// grid[day][hour] = precio en centavos. Clave ausente = celda vacía (sin precio).
export type PriceGrid = Record<DayKey, Record<number, number>>

// Hora de inicio (entero). "08:30" → 8. El grid trabaja en horas enteras.
function openHour(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number)
  return h ?? 0
}

// Cota superior exclusiva en horas, sobre el eje continuo de operating-day.ts
// (24 = medianoche, 25 = 01:00 del día siguiente…). Delega en effectiveCloseMins
// — la aritmética de "cierre pasada medianoche" es SUYA, acá solo se pasa a horas
// enteras (el grid trabaja en slots de 60 min, invariante SLOT_DURATION_MINUTES).
function closeHour(openHhmm: string, closeHhmm: string, closesNextDay: boolean): number {
  return Math.floor(effectiveCloseMins(openHhmm, closeHhmm, closesNextDay) / 60)
}

// "HH:00" a partir de una hora del eje continuo (puede ser ≥24): 24 → "00:00",
// 25 → "01:00"… Wraparound general con módulo, no un caso especial de 24: una
// grilla con madrugada de más de una hora (closesNextDay) dibuja varias filas
// post-medianoche y cada una necesita su propia etiqueta.
export function hourLabel(hour: number): string {
  return `${String(hour % 24).padStart(2, '0')}:00`
}

function hourToMins(hour: number): number {
  return hour * 60
}

/** ¿La hora cae dentro de la ventana operativa de ese día? `hour` puede ser ≥24
 * (madrugada, mismo día operativo que la noche anterior). */
export function isHourActive(
  day: OpeningHoursDay | undefined,
  hour: number,
  closesNextDay: boolean,
): boolean {
  if (!day || day.closed) return false
  const lo = openHour(day.open)
  const hi = closeHour(day.open, day.close, closesNextDay)
  return hi > lo && hour >= lo && hour < hi
}

/** Horas (slot-start) activas para un día puntual, ascendente. Puede devolver
 * horas ≥24 (madrugada del día operativo siguiente calendario). */
export function activeHoursForDay(
  openingHours: OpeningHours,
  day: DayKey,
  closesNextDay: boolean,
): number[] {
  const d = openingHours[day]
  if (!d || d.closed) return []
  const lo = openHour(d.open)
  const hi = closeHour(d.open, d.close, closesNextDay)
  const out: number[] = []
  for (let h = lo; h < hi; h++) out.push(h)
  return out
}

/**
 * Rango de horas a mostrar como filas: unión de las ventanas de todos los días
 * abiertos. Si ningún día abre, devuelve []. Al trabajar en el eje continuo (ver
 * closeHour), el orden numérico YA es el orden operativo: una madrugada queda en
 * 24, 25… después de las horas nocturnas (23), nunca reordenada al principio.
 */
export function getOperativeHours(openingHours: OpeningHours, closesNextDay: boolean): number[] {
  let min = Infinity
  let max = -Infinity
  for (const day of DAY_KEYS) {
    const d = openingHours[day]
    if (!d || d.closed) continue
    const lo = openHour(d.open)
    const hi = closeHour(d.open, d.close, closesNextDay)
    if (hi <= lo) continue
    if (lo < min) min = lo
    if (hi > max) max = hi
  }
  if (min === Infinity) return []
  const out: number[] = []
  for (let h = min; h < max; h++) out.push(h)
  return out
}

/**
 * Precio (centavos) de la regla que cubre (día, hora), o null si ninguna.
 * `hour` puede ser ≥24 (fila de madrugada): las reglas guardan horas de pared
 * (0–23), así que se busca por `hour % 24` — misma convención que
 * `priceForSlot` (src/lib/booking/pricing.ts), que jamás ve horas ≥24 porque
 * consume `bookings.time_start` (wall-clock) en vez de este eje continuo.
 */
function priceForCell(rules: PricingRule[], day: DayKey, hour: number): number | null {
  const m = hourToMins(hour % 24)
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
  closesNextDay: boolean,
): PriceGrid {
  const grid = {} as PriceGrid
  for (const day of DAY_KEYS) {
    grid[day] = {}
    for (const hour of activeHoursForDay(openingHours, day, closesNextDay)) {
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
  closesNextDay: boolean,
): PricingRule[] {
  type Entry = { day: DayKey; from: string; to: string; price: number }
  const entries: Entry[] = []

  for (const day of DAY_KEYS) {
    const cells = grid[day] ?? {}
    const hours = activeHoursForDay(openingHours, day, closesNextDay).filter(
      (h) => cells[h] != null,
    )
    let i = 0
    while (i < hours.length) {
      const startH = hours[i]!
      const price = cells[startH]!
      let j = i
      // extiende mientras: hora contigua, activa, mismo precio — Y sin cruzar
      // medianoche (hours[j] % 24 === 23 → 24 es el próximo). priceForCell/
      // priceForSlot solo entienden un rango DENTRO de un mismo día de pared
      // (o hasta '00:00' como caso especial); una regla "08:00→01:00" no la
      // sabría leer nadie, así que acá se corta en dos reglas del mismo día
      // operativo, igual que hace uniformRulesFromOpeningHours.
      while (
        j + 1 < hours.length &&
        hours[j + 1] === hours[j]! + 1 &&
        cells[hours[j + 1]!] === price &&
        hours[j]! % 24 !== 23
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
    .sort(
      (a, b) => toMins(a.from) - toMins(b.from) || toMins(a.to) - toMins(b.to) || a.price - b.price,
    )
    .map((g) => ({ days: g.days, from: g.from, to: g.to, price: g.price }))
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
  closesNextDay: boolean,
): PriceGrid {
  const grid = {} as PriceGrid
  for (const day of DAY_KEYS) {
    grid[day] = {}
    for (const hour of activeHoursForDay(openingHours, day, closesNextDay)) {
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
 * - Madrugada (flag y close <= open, close ≠ '00:00') → dos reglas, AMBAS del
 *   mismo día OPERATIVO (no calendario): [open, 00:00) + [00:00, close). El
 *   lookup real (priceForSlot/priceForDateSlot en src/lib/booking/pricing.ts,
 *   y calculatePrice vía artDateAt) busca la regla por día operativo — "bookings
 *   .date es el día operativo, no el calendario" (CLAUDE.md) — así que el turno
 *   de la 01:00 del sábado (noche del viernes) lo tiene que cubrir la regla del
 *   VIERNES, no la del sábado. Etiquetarla con el día calendario siguiente (como
 *   hacía esta función antes) tarifaba mal — o de plano no encontraba precio —
 *   cualquier franja de madrugada de un complejo `closesNextDay`.
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

  DAY_KEYS.forEach((day) => {
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
    push(day, '00:00', d.close)
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
export function countEmptyCells(
  grid: PriceGrid,
  openingHours: OpeningHours,
  closesNextDay: boolean,
): number {
  let n = 0
  for (const day of DAY_KEYS) {
    const cells = grid[day] ?? {}
    for (const h of activeHoursForDay(openingHours, day, closesNextDay)) {
      if (cells[h] == null) n++
    }
  }
  return n
}

// ---------------------------------------------------------------------------
// Auto-relleno de horas sin precio (decisión del dueño, no re-litigar): cuando
// el complejo amplía el horario, o cuando abre el editor de una cancha vieja
// con huecos, las celdas activas sin precio se completan solas — nunca queda
// una franja reservable sin tarifa. Es sugerencia visible, no algo que pasa a
// espaldas del dueño: quien llama a esta función es responsable de mostrar el
// detalle devuelto y dejar que la persona lo corrija antes de guardar.
// ---------------------------------------------------------------------------

/**
 * Una celda que se completó sola: qué día, qué hora, con qué precio.
 * Sin `export`: `FillGridGapsResult` ya lo re-expone a los consumidores, y knip
 * (parte del required check de CI) voltea el build ante un tipo exportado que
 * nadie importa desde otro módulo.
 */
type FilledCell = { day: DayKey; hour: number; price: number }

export type FillGridGapsResult = {
  grid: PriceGrid
  /** Detalle de lo rellenado, ordenado por día (lun..dom) y hora ascendente. */
  filled: FilledCell[]
}

function circularDayDistance(a: DayKey, b: DayKey): number {
  const diff = Math.abs(DAY_KEYS.indexOf(a) - DAY_KEYS.indexOf(b))
  return Math.min(diff, DAY_KEYS.length - diff)
}

/**
 * Completa las celdas activas sin precio. Orden de preferencia, del más
 * parecido al menos (decisión del dueño, no re-litigar):
 *  a) la hora inmediatamente anterior del mismo día,
 *  b) la hora inmediatamente siguiente del mismo día (para el hueco al
 *     principio del día, sin hora anterior),
 *  c) la MISMA hora en otro día que sí tenga precio — el día abierto más
 *     cercano (distancia circular sobre la semana),
 *  d) el precio más frecuente de toda la grilla ORIGINAL (huecos que ni el
 *     propio día ni ningún otro pueden explicar, ej. una franja que sólo
 *     existe en un único día del complejo).
 * Si la grilla está completamente vacía no hay nada que heredar: se devuelve
 * igual, sin inventar un número (ese es el caso de una cancha nueva sin
 * precio — ahí el dueño tiene que cargarlo él mismo).
 *
 * `seedPrice` cubre el caso en que la grilla quedó vacía PERO la cancha sí
 * tenía precio antes: pasa cuando el horario nuevo deja fuera de rango todas
 * las horas que lo tenían (el complejo cierra el único día con tarifa cargada,
 * por ejemplo). Sin él, esa cancha quedaría con el 100% de sus horas sin
 * precio, irreservable y sin que nadie se entere — que es exactamente el
 * agujero que este relleno viene a tapar. Quien llama es el que sabe si hubo
 * precio antes; sin ese dato el default sigue siendo no inventar nada.
 */
export function fillGridGaps(
  grid: PriceGrid,
  openingHours: OpeningHours,
  closesNextDay: boolean,
  seedPrice?: number | null,
): FillGridGapsResult {
  const out = {} as PriceGrid
  const activeByDay = {} as Record<DayKey, number[]>
  let anyPriceAtAll = false

  for (const day of DAY_KEYS) {
    out[day] = { ...(grid[day] ?? {}) }
    activeByDay[day] = activeHoursForDay(openingHours, day, closesNextDay)
    for (const h of activeByDay[day]) {
      if (out[day][h] != null) anyPriceAtAll = true
    }
  }

  const filled: FilledCell[] = []

  if (!anyPriceAtAll) {
    if (seedPrice == null) return { grid: out, filled: [] }
    for (const day of DAY_KEYS) {
      for (const h of activeByDay[day]) {
        out[day][h] = seedPrice
        filled.push({ day, hour: h, price: seedPrice })
      }
    }
    return { grid: out, filled }
  }

  // a) + b): dentro de cada día, primero forward-fill (hereda de la hora
  // anterior — cubre el medio y el final) y después backward-fill sobre lo
  // que quede vacío (hereda de la siguiente — cubre el principio del día).
  // El forward-fill lee `out` a medida que lo escribe, así que un hueco
  // heredado en esta misma pasada también sirve de ancla para el próximo.
  for (const day of DAY_KEYS) {
    const hours = activeByDay[day]
    for (let i = 1; i < hours.length; i++) {
      const h = hours[i]!
      if (out[day][h] != null) continue
      const prevPrice = out[day][hours[i - 1]!]
      if (prevPrice != null) {
        out[day][h] = prevPrice
        filled.push({ day, hour: h, price: prevPrice })
      }
    }
    for (let i = hours.length - 2; i >= 0; i--) {
      const h = hours[i]!
      if (out[day][h] != null) continue
      const nextPrice = out[day][hours[i + 1]!]
      if (nextPrice != null) {
        out[day][h] = nextPrice
        filled.push({ day, hour: h, price: nextPrice })
      }
    }
  }

  // c) misma hora, día abierto más cercano (ya con el relleno intra-día de
  // arriba aplicado, así que un día que arrancó vacío pero ya heredó de otro
  // día en una hora puede a su vez prestarle a un tercero).
  for (const day of DAY_KEYS) {
    for (const h of activeByDay[day]) {
      if (out[day][h] != null) continue
      let bestDay: DayKey | null = null
      let bestDist = Infinity
      for (const otherDay of DAY_KEYS) {
        if (otherDay === day || out[otherDay][h] == null) continue
        const dist = circularDayDistance(day, otherDay)
        if (dist < bestDist) {
          bestDist = dist
          bestDay = otherDay
        }
      }
      if (bestDay != null) {
        const price = out[bestDay][h]!
        out[day][h] = price
        filled.push({ day, hour: h, price })
      }
    }
  }

  // d) precio más frecuente de la grilla ORIGINAL (fallback final). Se calcula
  // sobre la grilla de entrada, no sobre `out`, para que un relleno anterior
  // no infle artificialmente su propia frecuencia.
  const freq = new Map<number, number>()
  for (const day of DAY_KEYS) {
    for (const h of activeByDay[day]) {
      const price = grid[day]?.[h]
      if (price != null) freq.set(price, (freq.get(price) ?? 0) + 1)
    }
  }
  let modePrice: number | null = null
  let modeCount = -1
  for (const [price, count] of freq) {
    if (count > modeCount) {
      modeCount = count
      modePrice = price
    }
  }
  if (modePrice != null) {
    for (const day of DAY_KEYS) {
      for (const h of activeByDay[day]) {
        if (out[day][h] == null) {
          out[day][h] = modePrice
          filled.push({ day, hour: h, price: modePrice })
        }
      }
    }
  }

  filled.sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.hour - b.hour)

  return { grid: out, filled }
}

/**
 * Precio que más veces aparece en las reglas guardadas de una cancha, contando
 * cada regla por la cantidad de días que cubre (una tarifa de lunes a viernes
 * pesa más que una de un solo domingo). Es la semilla de `fillGridGaps` para el
 * caso en que el horario nuevo deja fuera todas las horas con precio: lo que se
 * reusa es una tarifa que el complejo ya venía cobrando. Devuelve null si la
 * cancha nunca tuvo precio — ahí no hay nada que reusar y lo carga el dueño.
 */
export function mostFrequentRulePrice(rules: PricingRule[]): number | null {
  const freq = new Map<number, number>()
  for (const r of rules) {
    const weight = r.days.length || 1
    freq.set(r.price, (freq.get(r.price) ?? 0) + weight)
  }
  let best: number | null = null
  let bestCount = -1
  for (const [price, count] of freq) {
    if (count > bestCount) {
      bestCount = count
      best = price
    }
  }
  return best
}
