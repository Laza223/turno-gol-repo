'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { PricingRule } from '@/modules/courts/court.types'
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  type PriceGrid,
  activeHoursForDay,
  compressGridToRules,
  countEmptyCells,
  expandRulesToGrid,
  fillGridGaps,
  getOperativeHours,
  hourLabel,
  mostFrequentRulePrice,
} from '@/modules/courts/pricing-grid'
import { formatDayList } from '@/shared/time/week-days'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectMenu } from '@/components/ui/select-menu'
import { cn } from '@/lib/utils'
import { PricingGrid } from '../PricingGrid'
import {
  type SimplePricing,
  buildGridFromSimple,
  emptySimplePricing,
  readSimplePricing,
  summarizePricing,
  summaryText,
} from './price-model'
import { WeekPricePreview } from './WeekPricePreview'

/** Otra cancha del complejo, fuente para "Igual que…". */
export type CourtPricingSource = { id: string; name: string; rules: PricingRule[] }

type Props = {
  openingHours: OpeningHours
  closesNextDay: boolean
  initialRules: PricingRule[]
  otherCourts: CourtPricingSource[]
  /** Reglas comprimidas + celdas sin precio, en cada cambio (contrato con CourtForm). */
  onRulesChange: (rules: PricingRule[], meta: { emptyCount: number }) => void
}

const YES_NO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Sí' },
] as const

const yesNoItem = (active: boolean) =>
  cn(
    'h-9 min-w-14 rounded-md px-3 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-card font-semibold text-foreground shadow-xs'
      : 'text-muted-foreground hover:text-foreground',
  )

/** "Cancha 1, Cancha 2 y 2 más". */
function namesList(names: string[]): string {
  if (names.length <= 3) {
    return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
  }
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`
}

/**
 * Precio del turno de una cancha. Reemplaza a la plantilla que había que
 * "aplicar": acá cada respuesta y cada precio se ven en la semana al instante,
 * y lo que se ve es lo que se guarda.
 *
 * Dueño único del estado de la grilla día × hora, como antes: el precio simple
 * es una forma de escribirla, "Igual que…" la copia de otra cancha y "Ajustar
 * hora por hora" la edita celda por celda. Hacia afuera entrega reglas
 * comprimidas (el contrato que CourtForm espera).
 */
export function PriceSetup({
  openingHours,
  closesNextDay,
  initialRules,
  otherCourts,
  onRulesChange,
}: Props) {
  const hours = useMemo(
    () => getOperativeHours(openingHours, closesNextDay),
    [openingHours, closesNextDay],
  )
  const openDays = useMemo(
    () => DAY_KEYS.filter((d) => activeHoursForDay(openingHours, d, closesNextDay).length > 0),
    [openingHours, closesNextDay],
  )

  // Auto-relleno al abrir (decisión del dueño, no re-litigar): una cancha
  // vieja con huecos —o un horario que se amplió después de cargarla— arranca
  // completa, con el precio de horas parecidas de la misma cancha, y con el
  // aviso de qué se completó. La semilla (la tarifa que esa cancha ya venía
  // cobrando) cubre el caso de que no quede ningún vecino de quien heredar.
  const [autoFilled] = useState(() =>
    fillGridGaps(
      expandRulesToGrid(initialRules, openingHours, closesNextDay),
      openingHours,
      closesNextDay,
      mostFrequentRulePrice(initialRules),
    ),
  )
  const [grid, setGrid] = useState<PriceGrid>(() => autoFilled.grid)
  const [simple, setSimple] = useState<SimplePricing | null>(() =>
    readSimplePricing(autoFilled.grid, openingHours, closesNextDay),
  )
  const [showHourly, setShowHourly] = useState(false)
  // La grilla de antes de "Pasar a un precio simple": nada se guarda hasta
  // "Guardar", pero sin esto la única vuelta atrás era cancelar todo el form.
  const [undoGrid, setUndoGrid] = useState<PriceGrid | null>(null)

  const rules = useMemo(
    () => compressGridToRules(grid, openingHours, closesNextDay),
    [grid, openingHours, closesNextDay],
  )
  const emptyCount = useMemo(
    () => countEmptyCells(grid, openingHours, closesNextDay),
    [grid, openingHours, closesNextDay],
  )
  useEffect(() => {
    onRulesChange(rules, { emptyCount })
  }, [rules, emptyCount, onRulesChange])

  // Otras canchas agrupadas por precio idéntico: con 5 canchas y dos precios
  // son dos opciones, no cinco.
  const sources = useMemo(() => {
    const byGrid = new Map<string, { grid: PriceGrid; names: string[]; rules: PricingRule[] }>()
    for (const c of otherCourts) {
      if (c.rules.length === 0) continue
      const g = expandRulesToGrid(c.rules, openingHours, closesNextDay)
      const key = JSON.stringify(g)
      const found = byGrid.get(key)
      if (found) found.names.push(c.name)
      else byGrid.set(key, { grid: g, names: [c.name], rules: c.rules })
    }
    return [...byGrid].map(([key, v]) => ({
      key,
      ...v,
      summary: summaryText(summarizePricing(v.rules, openingHours, closesNextDay)),
    }))
  }, [otherCourts, openingHours, closesNextDay])
  const currentKey = JSON.stringify(grid)

  function writeSimple(next: SimplePricing) {
    setUndoGrid(null)
    setSimple(next)
    setGrid(buildGridFromSimple(next, openingHours, closesNextDay))
  }

  function applyGrid(next: PriceGrid) {
    setUndoGrid(null)
    setGrid(next)
    setSimple(readSimplePricing(next, openingHours, closesNextDay))
  }

  function backToSimple() {
    const seed = mostFrequentRulePrice(rules)
    writeSimple({ ...emptySimplePricing(), base: { day: seed, night: null } })
    setUndoGrid(grid)
  }

  if (hours.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
        Primero cargá los horarios del complejo: el precio se pone para las horas en que abrís.{' '}
        <Link href="/settings/horarios" className="font-medium underline underline-offset-2">
          Ir a horarios
        </Link>
      </div>
    )
  }

  const cutOptions = hours.slice(1)
  const defaultCut = cutOptions.includes(18)
    ? 18
    : (cutOptions[Math.floor(cutOptions.length / 2)] ?? hours[0]!)
  const baseDays = openDays.filter((d) => !simple?.otherDays.includes(d))
  // "Sí" propone viernes a domingo, pero siempre deja al menos un día con el
  // precio de siempre: un complejo que abre solo el fin de semana arranca con
  // su último día como el distinto.
  const weekend = (['fri', 'sat', 'sun'] as DayKey[]).filter((d) => openDays.includes(d))
  const defaultOtherDays = weekend.length < openDays.length ? weekend : openDays.slice(-1)

  return (
    <div className="space-y-5">
      {autoFilled.filled.length > 0 && (
        <p
          role="status"
          className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3.5 py-2.5 text-sm text-blue-900 dark:text-blue-200"
        >
          Completamos {autoFilled.filled.length}{' '}
          {autoFilled.filled.length === 1 ? 'hora que estaba' : 'horas que estaban'} sin precio, con
          el precio de horas parecidas de esta cancha. Mirá que esté bien antes de guardar.
        </p>
      )}

      {sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">¿Cobra lo mismo que otra cancha?</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => {
              const active = s.key === currentKey
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => applyGrid(s.grid)}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-11 max-w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  {active && (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">
                      Igual que {namesList(s.names)}
                    </span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {s.summary}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {undoGrid && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground"
        >
          Toda la semana quedó con un solo precio.
          <button
            type="button"
            onClick={() => applyGrid(undoGrid)}
            className="inline-flex min-h-11 items-center rounded-md font-medium text-emerald-700 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 dark:text-emerald-400"
          >
            Deshacer
          </button>
        </p>
      )}

      {simple ? (
        <div className="divide-y divide-border rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              ¿Cobrás distinto a la noche?
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {simple.nightFrom != null && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  desde las
                  <SelectMenu
                    id="price-night-from"
                    aria-label="Hora en que arranca la noche"
                    value={String(simple.nightFrom)}
                    onChange={(v) => writeSimple({ ...simple, nightFrom: Number(v) })}
                    options={cutOptions.map((h) => ({ value: String(h), label: hourLabel(h) }))}
                    className="h-9 w-28 rounded-lg bg-card md:h-9"
                  />
                </label>
              )}
              <SegmentedControl
                aria-label="¿Cobrás distinto a la noche?"
                value={simple.nightFrom != null ? 'yes' : 'no'}
                onValueChange={(v) =>
                  writeSimple({ ...simple, nightFrom: v === 'yes' ? defaultCut : null })
                }
                options={YES_NO}
                itemClassName={yesNoItem}
                className="inline-flex rounded-lg bg-muted/70 p-0.5 dark:bg-muted"
              />
            </div>
          </div>

          {/* Con un solo día abierto no hay "otro día" que cobre distinto. */}
          {openDays.length > 1 && (
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-sm font-medium text-foreground">
                  ¿Algún día cobrás distinto?
                </span>
                <SegmentedControl
                  aria-label="¿Algún día cobrás distinto?"
                  value={simple.otherDays.length > 0 ? 'yes' : 'no'}
                  onValueChange={(v) =>
                    writeSimple({
                      ...simple,
                      otherDays: v === 'yes' ? defaultOtherDays : [],
                    })
                  }
                  options={YES_NO}
                  itemClassName={yesNoItem}
                  className="inline-flex rounded-lg bg-muted/70 p-0.5 dark:bg-muted"
                />
              </div>
              {simple.otherDays.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-sm text-muted-foreground">¿Cuáles?</span>
                  {DAY_KEYS.map((d) => {
                    const on = simple.otherDays.includes(d)
                    const open = openDays.includes(d)
                    // Nunca quedan todos los días como "distintos": ese sería el precio de siempre.
                    const lastBase = !on && baseDays.length === 1
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!open || lastBase}
                        aria-pressed={on}
                        onClick={() => {
                          const next = on
                            ? simple.otherDays.filter((x) => x !== d)
                            : DAY_KEYS.filter((x) => x === d || simple.otherDays.includes(x))
                          writeSimple({ ...simple, otherDays: next })
                        }}
                        className={cn(
                          'h-9 min-w-11 rounded-lg border px-2 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
                          on
                            ? 'border-primary bg-primary/10 font-semibold text-emerald-800 dark:text-emerald-300'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {DAY_LABELS[d]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <PriceInputs simple={simple} baseDays={baseDays} onChange={writeSimple} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Esta cancha cobra distinto según la hora, así que se ajusta hora por hora.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={backToSimple}>
            Pasar a un precio simple
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Así queda la semana</p>
        <WeekPricePreview grid={grid} openingHours={openingHours} closesNextDay={closesNextDay} />
        {emptyCount > 0 && (
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {/* Sin ningún precio, "Faltan 99 horas" asusta y no dice nada útil. */}
            {rules.length === 0
              ? 'Falta el precio del turno: cargalo arriba.'
              : `${emptyCount === 1 ? 'Falta 1 hora' : `Faltan ${emptyCount} horas`} sin precio: completá los precios de arriba.`}
          </p>
        )}
      </div>

      <div className="rounded-lg">
        <button
          type="button"
          onClick={() => setShowHourly((v) => !v)}
          aria-expanded={showHourly}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-left text-sm font-medium text-emerald-700 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 dark:text-emerald-400"
        >
          {simple
            ? '¿Una hora puntual cuesta otra cosa? Ajustar hora por hora'
            : 'Ajustar hora por hora'}
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform duration-200', showHourly && 'rotate-180')}
          />
        </button>
        {showHourly && (
          <div className="mt-2 rounded-lg border border-border p-3">
            <PricingGrid
              openingHours={openingHours}
              closesNextDay={closesNextDay}
              grid={grid}
              onGridChange={applyGrid}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PriceInputs({
  simple,
  baseDays,
  onChange,
}: {
  simple: SimplePricing
  baseDays: DayKey[]
  onChange: (next: SimplePricing) => void
}) {
  const hasNight = simple.nightFrom != null
  const hasOther = simple.otherDays.length > 0
  const rows = [
    { key: 'base' as const, label: hasOther ? formatDayList(baseDays) : null },
    ...(hasOther ? [{ key: 'other' as const, label: formatDayList(simple.otherDays) }] : []),
  ]
  if (!hasNight && !hasOther) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <label htmlFor="price-base-day" className="text-sm font-medium text-foreground">
          Precio del turno
        </label>
        <MoneyInput
          id="price-base-day"
          placeholder="Ej: 84.000"
          valueCents={simple.base.day}
          onValueChange={(v) => onChange({ ...simple, base: { ...simple.base, day: v } })}
          showWords={false}
          className="w-40"
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <div
        className={cn(
          'grid items-center gap-x-3 gap-y-2',
          hasOther && hasNight
            ? 'grid-cols-2 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,1fr)]'
            : hasOther
              ? 'grid-cols-[minmax(0,auto)_minmax(0,1fr)]'
              : 'grid-cols-2',
        )}
      >
        {hasOther && <span aria-hidden="true" className={cn(hasNight && 'hidden sm:block')} />}
        <span className="text-xs font-medium text-muted-foreground">
          {hasNight ? `Hasta las ${hourLabel(simple.nightFrom!)}` : 'Precio del turno'}
        </span>
        {hasNight && (
          <span className="text-xs font-medium text-muted-foreground">
            Desde las {hourLabel(simple.nightFrom!)}
          </span>
        )}
        {rows.map((row) => {
          const pair = simple[row.key]
          const set = (side: 'day' | 'night', v: number | null) =>
            onChange({ ...simple, [row.key]: { ...pair, [side]: v } })
          const who = row.label ? ` ${row.label}` : ''
          return (
            <div key={row.key} className="contents">
              {row.label && (
                <span
                  className={cn(
                    'pr-2 text-sm font-medium text-foreground',
                    hasNight && 'col-span-2 -mb-1 sm:col-span-1 sm:mb-0',
                  )}
                >
                  {row.label}
                </span>
              )}
              <MoneyInput
                aria-label={`Precio${who}${hasNight ? ` hasta las ${hourLabel(simple.nightFrom!)}` : ''}`}
                placeholder="Ej: 60.000"
                valueCents={pair.day}
                onValueChange={(v) => set('day', v)}
                showWords={false}
                className="w-full"
              />
              {hasNight && (
                <MoneyInput
                  aria-label={`Precio${who} desde las ${hourLabel(simple.nightFrom!)}`}
                  placeholder="Ej: 84.000"
                  valueCents={pair.night}
                  onValueChange={(v) => set('night', v)}
                  showWords={false}
                  className="w-full"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
