'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { PricingRule } from '@/modules/courts/court.types'
import { formatArs } from '@/lib/format'
import {
  type PriceGrid,
  type PricingTemplate,
  buildTemplateGrid,
  compressGridToRules,
  countEmptyCells,
  describeRules,
  expandRulesToGrid,
  getOperativeHours,
  hourLabel,
} from '@/modules/courts/pricing-grid'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { Label } from '@/components/ui/label'
import { PricingGrid } from './PricingGrid'

/** Otra cancha del complejo, fuente para "Copiar precios de otra cancha". */
export type CourtPricingSource = {
  id: string
  name: string
  rules: PricingRule[]
}

type TemplateMode = PricingTemplate['mode']

const MODE_OPTIONS: { value: TemplateMode; label: string }[] = [
  { value: 'uniform', label: 'Un precio' },
  { value: 'weekSplit', label: 'Lun a Jue / Vie a Dom' },
  { value: 'dayNight', label: 'Día y noche' },
]

type Props = {
  openingHours: OpeningHours
  initialRules: PricingRule[]
  otherCourts: CourtPricingSource[]
  /** Reglas comprimidas + celdas sin precio, en cada cambio (contrato con CourtForm). */
  onRulesChange: (rules: PricingRule[], meta: { emptyCount: number }) => void
}

/**
 * Sección de precios del form de cancha (pages/horarios-precios.md §3):
 * plantilla rápida (3 modos, generadores que pisan la grilla) + copiar de otra
 * cancha + resumen legible de reglas + la matriz hora×día plegada como ajuste
 * fino. Dueña única del estado de la grilla; comprime a reglas para el padre.
 */
export function PricingSection({ openingHours, initialRules, otherCourts, onRulesChange }: Props) {
  const hours = useMemo(() => getOperativeHours(openingHours), [openingHours])
  const [grid, setGrid] = useState<PriceGrid>(() => expandRulesToGrid(initialRules, openingHours))

  // Plantilla
  const [mode, setMode] = useState<TemplateMode>('uniform')
  const [uniformPriceCents, setUniformPriceCents] = useState<number | null>(null)
  const [weekPriceCents, setWeekPriceCents] = useState<number | null>(null)
  const [weekendPriceCents, setWeekendPriceCents] = useState<number | null>(null)
  const [dayPriceCents, setDayPriceCents] = useState<number | null>(null)
  const [nightPriceCents, setNightPriceCents] = useState<number | null>(null)
  const cutOptions = useMemo(() => hours.slice(1), [hours])
  const [cutHour, setCutHour] = useState<number>(() =>
    cutOptions.includes(18) ? 18 : (cutOptions[Math.floor(cutOptions.length / 2)] ?? 18),
  )

  // Copiar de otra cancha
  const [copyFromId, setCopyFromId] = useState<string>(otherCourts[0]?.id ?? '')

  // Ajuste fino plegado (progressive disclosure).
  const [showGrid, setShowGrid] = useState(false)

  const rules = useMemo(() => compressGridToRules(grid, openingHours), [grid, openingHours])
  const emptyCount = useMemo(() => countEmptyCells(grid, openingHours), [grid, openingHours])
  const summary = useMemo(() => describeRules(rules), [rules])

  useEffect(() => {
    onRulesChange(rules, { emptyCount })
  }, [rules, emptyCount, onRulesChange])

  const template: PricingTemplate | null = useMemo(() => {
    if (mode === 'uniform') {
      return uniformPriceCents != null ? { mode, price: uniformPriceCents } : null
    }
    if (mode === 'weekSplit') {
      return weekPriceCents != null && weekendPriceCents != null
        ? { mode, weekPrice: weekPriceCents, weekendPrice: weekendPriceCents }
        : null
    }
    return dayPriceCents != null && nightPriceCents != null
      ? { mode, cutHour, dayPrice: dayPriceCents, nightPrice: nightPriceCents }
      : null
  }, [
    mode,
    uniformPriceCents,
    weekPriceCents,
    weekendPriceCents,
    dayPriceCents,
    nightPriceCents,
    cutHour,
  ])

  function applyTemplate() {
    if (!template) return
    setGrid(buildTemplateGrid(openingHours, template))
  }

  function copyFromCourt() {
    const source = otherCourts.find((c) => c.id === copyFromId)
    if (!source) return
    setGrid(expandRulesToGrid(source.rules, openingHours))
  }

  if (hours.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        Configurá los horarios de atención del complejo antes de cargar precios.{' '}
        <Link href="/settings/horarios" className="font-medium underline underline-offset-2">
          Ir a horarios
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Plantilla rápida: el caso común son 1–2 campos, no 105 celdas. */}
      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Plantilla rápida</legend>

        <div role="presentation" className="flex flex-wrap gap-2">
          {MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="cursor-pointer">
              <input
                type="radio"
                name="pricing-template-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                  mode === opt.value
                    ? 'border-emerald-600 bg-primary/10 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {mode === 'uniform' && (
            <div className="space-y-1.5">
              <Label htmlFor="tpl-uniform">Precio por turno</Label>
              <MoneyInput
                id="tpl-uniform"
                placeholder="Ej: 20.000"
                valueCents={uniformPriceCents}
                onValueChange={setUniformPriceCents}
                className="w-32"
              />
            </div>
          )}

          {mode === 'weekSplit' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-week">Lun a Jue</Label>
                <MoneyInput
                  id="tpl-week"
                  placeholder="Ej: 16.000"
                  valueCents={weekPriceCents}
                  onValueChange={setWeekPriceCents}
                  className="w-32"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-weekend">Vie a Dom</Label>
                <MoneyInput
                  id="tpl-weekend"
                  placeholder="Ej: 22.000"
                  valueCents={weekendPriceCents}
                  onValueChange={setWeekendPriceCents}
                  className="w-32"
                />
              </div>
            </>
          )}

          {mode === 'dayNight' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-cut">La noche arranca a las</Label>
                <select
                  id="tpl-cut"
                  value={cutHour}
                  onChange={(e) => setCutHour(Number(e.target.value))}
                  className="block h-11 w-32 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10"
                >
                  {cutOptions.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-day">Precio de día</Label>
                <MoneyInput
                  id="tpl-day"
                  placeholder="Ej: 16.000"
                  valueCents={dayPriceCents}
                  onValueChange={setDayPriceCents}
                  className="w-32"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-night">Precio de noche</Label>
                <MoneyInput
                  id="tpl-night"
                  placeholder="Ej: 22.000"
                  valueCents={nightPriceCents}
                  onValueChange={setNightPriceCents}
                  className="w-32"
                />
              </div>
            </>
          )}

          <Button type="button" variant="outline" onClick={applyTemplate} disabled={!template}>
            Aplicar a toda la semana
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Pisa los precios cargados; después ajustá lo que quieras con «Ajustar por hora».
        </p>
      </fieldset>

      {/* Copiar de otra cancha: el caso "N canchas iguales" en un click. */}
      {otherCourts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="copy-court" className="text-sm text-muted-foreground">
            Copiar precios de otra cancha:
          </Label>
          <select
            id="copy-court"
            value={copyFromId}
            onChange={(e) => setCopyFromId(e.target.value)}
            className="block h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-9"
          >
            {otherCourts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={copyFromCourt}>
            Copiar
          </Button>
        </div>
      )}

      {/* Resumen legible: verificación sin leer la matriz. */}
      {summary.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {summary.map((row, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 px-3 py-2">
              <span className="font-medium text-foreground">{row.daysLabel}</span>
              <span className="text-muted-foreground">· {row.rangeLabel} ·</span>
              <span className="tabular-nums font-medium text-foreground">
                {formatArs(row.price)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          Sin precios todavía. Empezá por la plantilla rápida.
        </p>
      )}

      {emptyCount > 0 && summary.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Falta{emptyCount === 1 ? '' : 'n'} {emptyCount} horario{emptyCount === 1 ? '' : 's'} sin
          precio. Completalo{emptyCount === 1 ? '' : 's'} con la plantilla o con «Ajustar por hora».
        </p>
      )}

      {/* Ajuste fino: la matriz completa, plegada (progressive disclosure). */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setShowGrid((v) => !v)}
          aria-expanded={showGrid}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          Ajustar por hora
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showGrid ? 'rotate-180' : ''}`}
          />
        </button>
        {showGrid && (
          <div className="border-t border-border p-3">
            <PricingGrid openingHours={openingHours} grid={grid} onGridChange={setGrid} />
          </div>
        )}
      </div>
    </div>
  )
}
