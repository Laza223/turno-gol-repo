import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { PricingRule } from '@/modules/courts/court.types'
import {
  DAY_KEYS,
  type DayKey,
  type PriceGrid,
  activeHoursForDay,
  expandRulesToGrid,
  hourLabel,
} from '@/modules/courts/pricing-grid'
import { formatDayList } from '@/shared/time/week-days'
import { formatArs } from '@/lib/format'

/**
 * El precio como lo dice un dueño en voz alta: "sale $ 60.000, a la noche
 * $ 84.000, y el finde otro poco más". Es una VISTA sobre la grilla día × hora
 * (`PriceGrid`), no un formato nuevo: se arma la grilla con
 * `buildGridFromSimple` y se guarda como siempre, comprimida a reglas por
 * `compressGridToRules`. El JSONB de `courts.pricing` no cambia.
 *
 * Cubre dos preguntas que se contestan por sí o por no —¿cambia a la noche?,
 * ¿algún día cobra distinto?— y hasta cuatro precios. Lo que no entra en eso
 * (tres franjas, cortes distintos por día) es "hora por hora" y se edita en
 * la grilla completa.
 */
export type SimplePricing = {
  /** Hora (eje continuo de pricing-grid: 24 = medianoche) en que arranca la noche. `null` = mismo precio todo el día. */
  nightFrom: number | null
  /** Días que cobran distinto al resto. Vacío = todos los días igual. */
  otherDays: DayKey[]
  base: PricePair
  other: PricePair
}

type PricePair = { day: number | null; night: number | null }

export function emptySimplePricing(): SimplePricing {
  return {
    nightFrom: null,
    otherDays: [],
    base: { day: null, night: null },
    other: { day: null, night: null },
  }
}

function priceAt(sp: SimplePricing, day: DayKey, hour: number): number | null {
  const pair = sp.otherDays.includes(day) ? sp.other : sp.base
  return sp.nightFrom != null && hour >= sp.nightFrom ? pair.night : pair.day
}

/** Grilla día × hora a partir del precio simple. Un precio que falta deja la celda vacía (y el guardado la frena). */
export function buildGridFromSimple(
  sp: SimplePricing,
  openingHours: OpeningHours,
  closesNextDay: boolean,
): PriceGrid {
  const grid = {} as PriceGrid
  for (const day of DAY_KEYS) {
    grid[day] = {}
    for (const hour of activeHoursForDay(openingHours, day, closesNextDay)) {
      const price = priceAt(sp, day, hour)
      if (price != null) grid[day][hour] = price
    }
  }
  return grid
}

type DaySignature = { day: DayKey; dayPrice: number | null; nightPrice: number | null }

/** Tramos consecutivos de igual precio de un día. `null` si alguna hora activa no tiene precio. */
function runsOf(grid: PriceGrid, hours: number[], day: DayKey) {
  const runs: { from: number; price: number }[] = []
  for (const h of hours) {
    const price = grid[day]?.[h]
    if (price == null) return null
    const last = runs.at(-1)
    if (!last || last.price !== price) runs.push({ from: h, price })
  }
  return runs
}

/** Agrupa los días por par día/noche; un lado sin horas (`null`) calza con cualquiera. */
function groupSignatures(signatures: DaySignature[]): { pair: PricePair; days: DayKey[] }[] | null {
  const groups: { pair: PricePair; days: DayKey[] }[] = []
  const fits = (a: number | null, b: number | null) => a == null || b == null || a === b
  // Primero los días que tienen los dos lados: definen los grupos sin ambigüedad.
  const ordered = [...signatures].sort(
    (a, b) =>
      Number(b.dayPrice != null && b.nightPrice != null) -
      Number(a.dayPrice != null && a.nightPrice != null),
  )
  for (const s of ordered) {
    const g = groups.find((x) => fits(x.pair.day, s.dayPrice) && fits(x.pair.night, s.nightPrice))
    if (g) {
      g.pair = { day: g.pair.day ?? s.dayPrice, night: g.pair.night ?? s.nightPrice }
      g.days.push(s.day)
    } else {
      groups.push({ pair: { day: s.dayPrice, night: s.nightPrice }, days: [s.day] })
    }
  }
  return groups.length <= 2 ? groups : null
}

function samePrices(
  a: PriceGrid,
  b: PriceGrid,
  openingHours: OpeningHours,
  closesNextDay: boolean,
) {
  return DAY_KEYS.every((day) =>
    activeHoursForDay(openingHours, day, closesNextDay).every((h) => a[day]?.[h] === b[day]?.[h]),
  )
}

/**
 * Lee la grilla como precio simple, o `null` si no entra en las dos preguntas
 * (se edita hora por hora). Una grilla vacía es el precio simple vacío: así
 * arranca una cancha nueva.
 *
 * Nunca adivina: el resultado se vuelve a armar y tiene que dar la MISMA
 * grilla celda por celda. Si no da, es `null` y nadie pisa un precio que el
 * dueño cargó a mano.
 */
export function readSimplePricing(
  grid: PriceGrid,
  openingHours: OpeningHours,
  closesNextDay: boolean,
): SimplePricing | null {
  const openDays = DAY_KEYS.filter(
    (d) => activeHoursForDay(openingHours, d, closesNextDay).length > 0,
  )
  const hasAnyPrice = openDays.some((d) => Object.keys(grid[d] ?? {}).length > 0)
  if (!hasAnyPrice) return emptySimplePricing()

  const perDay: { day: DayKey; hours: number[]; runs: { from: number; price: number }[] }[] = []
  for (const day of openDays) {
    const hours = activeHoursForDay(openingHours, day, closesNextDay)
    const runs = runsOf(grid, hours, day)
    if (!runs || runs.length > 2) return null
    perDay.push({ day, hours, runs })
  }

  const cuts = new Set(perDay.filter((d) => d.runs.length === 2).map((d) => d.runs[1]!.from))
  if (cuts.size > 1) return null
  const nightFrom = cuts.size === 1 ? [...cuts][0]! : null

  const signatures: DaySignature[] = perDay.map(({ day, hours, runs }) => {
    if (nightFrom == null) return { day, dayPrice: runs[0]!.price, nightPrice: null }
    const dayHours = hours.filter((h) => h < nightFrom)
    const nightHours = hours.filter((h) => h >= nightFrom)
    const at = (h: number) => grid[day]![h]!
    return {
      day,
      dayPrice: dayHours.length > 0 ? at(dayHours[0]!) : null,
      nightPrice: nightHours.length > 0 ? at(nightHours[0]!) : null,
    }
  })

  const groups = groupSignatures(signatures)
  if (!groups) return null

  // La base es el grupo con más días (el lunes desempata): "el resto" es la excepción.
  const [base, other] = [...groups].sort(
    (a, b) =>
      b.days.length - a.days.length ||
      Number(b.days.includes('mon')) - Number(a.days.includes('mon')),
  )
  const sp: SimplePricing = {
    nightFrom,
    otherDays: other ? DAY_KEYS.filter((d) => other.days.includes(d)) : [],
    base: base!.pair,
    other: other?.pair ?? { day: null, night: null },
  }
  return samePrices(
    buildGridFromSimple(sp, openingHours, closesNextDay),
    grid,
    openingHours,
    closesNextDay,
  )
    ? sp
    : null
}

/** Una línea de precio legible: "Lun a Jue" + los precios del día y de la noche. */
type PriceLine = { days: string | null; parts: { price: number; label: string | null }[] }

function pairLine(pair: PricePair, nightFrom: number | null, days: string | null): PriceLine {
  if (nightFrom == null || pair.night == null || pair.day === pair.night) {
    const price = pair.day ?? pair.night
    return { days, parts: price == null ? [] : [{ price, label: null }] }
  }
  if (pair.day == null) {
    return { days, parts: [{ price: pair.night, label: `desde las ${hourLabel(nightFrom)}` }] }
  }
  return {
    days,
    parts: [
      { price: pair.day, label: `hasta las ${hourLabel(nightFrom)}` },
      { price: pair.night, label: `desde las ${hourLabel(nightFrom)}` },
    ],
  }
}

export type PriceSummary =
  | { kind: 'empty' }
  | { kind: 'simple'; lines: PriceLine[] }
  | { kind: 'custom'; min: number; max: number }

/** El precio de una cancha en una o dos líneas, para la lista y para "Igual que…". */
export function summarizePricing(
  rules: PricingRule[],
  openingHours: OpeningHours,
  closesNextDay: boolean,
): PriceSummary {
  const grid = expandRulesToGrid(rules, openingHours, closesNextDay)
  const sp = readSimplePricing(grid, openingHours, closesNextDay)
  if (sp && sp.base.day == null && sp.base.night == null) return { kind: 'empty' }
  if (!sp) {
    const prices = DAY_KEYS.flatMap((d) => Object.values(grid[d] ?? {}))
    if (prices.length === 0) return { kind: 'empty' }
    return { kind: 'custom', min: Math.min(...prices), max: Math.max(...prices) }
  }
  if (sp.otherDays.length === 0)
    return { kind: 'simple', lines: [pairLine(sp.base, sp.nightFrom, null)] }
  const openDays = DAY_KEYS.filter(
    (d) => activeHoursForDay(openingHours, d, closesNextDay).length > 0,
  )
  const baseDays = openDays.filter((d) => !sp.otherDays.includes(d))
  return {
    kind: 'simple',
    lines: [
      pairLine(sp.base, sp.nightFrom, formatDayList(baseDays)),
      pairLine(sp.other, sp.nightFrom, formatDayList(sp.otherDays)),
    ],
  }
}

/** El resumen en una sola frase, para `aria-label` y para textos de confirmación. */
export function summaryText(summary: PriceSummary): string {
  if (summary.kind === 'empty') return 'Sin precio'
  if (summary.kind === 'custom')
    return `De ${formatArs(summary.min)} a ${formatArs(summary.max)} según la hora`
  return summary.lines
    .map((l) => {
      const parts = l.parts.map((p) =>
        p.label ? `${formatArs(p.price)} ${p.label}` : formatArs(p.price),
      )
      return [l.days, parts.join(' y ')].filter(Boolean).join(': ')
    })
    .join(' · ')
}
