'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { PricingRule } from '@/modules/courts/court.types'
import {
  DAY_KEYS,
  DAY_LABELS,
  type DayKey,
  type PriceGrid,
  compressGridToRules,
  countEmptyCells,
  expandRulesToGrid,
  formatArs,
  getOperativeHours,
  hourLabel,
  isHourActive,
  parsePesosToCents,
} from '@/modules/courts/pricing-grid'
import { Button } from '@/components/ui/button'

type Props = {
  openingHours: OpeningHours
  initialRules: PricingRule[]
  /** Recibe las reglas comprimidas en cada cambio de la grilla. */
  onChange: (rules: PricingRule[]) => void
}

const cellKey = (day: DayKey, hour: number) => `${day}:${hour}`
function parseCellKey(key: string): { day: DayKey; hour: number } {
  const [day, hour] = key.split(':')
  return { day: day as DayKey, hour: Number(hour) }
}

// Heat map: barato → caro, interpolado en RGB. Inline style NO responde a
// `.dark`, así que se elige la rampa por tema. Light: emerald-50 → emerald-700.
// Dark: emerald-950 muy oscuro → emerald-500 brillante (sobre card oscuro).
const HEAT_LO = [236, 253, 245] // #ecfdf5
const HEAT_HI = [4, 120, 87] //   #047857
const HEAT_LO_DARK = [6, 33, 25] // ~emerald-950
const HEAT_HI_DARK = [16, 185, 129] // #10b981 emerald-500
function heatStyle(price: number, min: number, max: number, isDark: boolean): React.CSSProperties {
  const t = max > min ? (price - min) / (max - min) : 0.45
  const lo = isDark ? HEAT_LO_DARK : HEAT_LO
  const hi = isDark ? HEAT_HI_DARK : HEAT_HI
  const mix = (i: number) => Math.round(lo[i]! + (hi[i]! - lo[i]!) * t)
  return {
    backgroundColor: `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`,
    color: isDark ? (t > 0.52 ? '#022c22' : '#6ee7b7') : t > 0.52 ? '#ffffff' : '#064e3b',
  }
}

export function PricingGrid({ openingHours, initialRules, onChange }: Props) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const hours = useMemo(() => getOperativeHours(openingHours), [openingHours])
  const [grid, setGrid] = useState<PriceGrid>(() => expandRulesToGrid(initialRules, openingHours))

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [bulkValue, setBulkValue] = useState('')

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const draggingRef = useRef(false)
  const dragMovedRef = useRef(false)

  // Empuja reglas comprimidas al padre cada vez que cambia la grilla.
  useEffect(() => {
    onChange(compressGridToRules(grid, openingHours))
  }, [grid, openingHours, onChange])

  // Soltar el mouse en cualquier lado termina el arrastre.
  useEffect(() => {
    const up = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const priceStats = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const day of DAY_KEYS) {
      for (const v of Object.values(grid[day] ?? {})) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    return { min, max }
  }, [grid])

  const emptyCount = useMemo(() => countEmptyCells(grid, openingHours), [grid, openingHours])

  function setCells(keys: string[], cents: number | null) {
    setGrid((prev) => {
      const next: PriceGrid = { ...prev }
      for (const key of keys) {
        const { day, hour } = parseCellKey(key)
        if (!isHourActive(openingHours[day], hour)) continue
        const dayCells = { ...(next[day] ?? {}) }
        if (cents == null) delete dayCells[hour]
        else dayCells[hour] = cents
        next[day] = dayCells
      }
      return next
    })
  }

  function rectCells(a: string, b: string): string[] {
    const pa = parseCellKey(a)
    const pb = parseCellKey(b)
    const i1 = DAY_KEYS.indexOf(pa.day)
    const i2 = DAY_KEYS.indexOf(pb.day)
    const dLo = Math.min(i1, i2)
    const dHi = Math.max(i1, i2)
    const hLo = Math.min(pa.hour, pb.hour)
    const hHi = Math.max(pa.hour, pb.hour)
    const out: string[] = []
    for (let di = dLo; di <= dHi; di++) {
      const day = DAY_KEYS[di]!
      for (let h = hLo; h <= hHi; h++) {
        if (isHourActive(openingHours[day], h)) out.push(cellKey(day, h))
      }
    }
    return out
  }

  function openEditor(key: string) {
    const { day, hour } = parseCellKey(key)
    const cur = grid[day]?.[hour]
    setEditing(key)
    setEditValue(cur != null ? String(Math.round(cur / 100)) : '')
  }

  function commitEditor() {
    if (!editing) return
    setCells([editing], parsePesosToCents(editValue))
    setEditing(null)
  }

  function handlePointerDown(e: React.PointerEvent, key: string) {
    if (selectMode || e.pointerType !== 'mouse' || e.button !== 0) return
    draggingRef.current = true
    dragMovedRef.current = false
    setEditing(null)
    setAnchor(key)
    setSelected(new Set([key]))
  }

  function handlePointerEnter(key: string) {
    if (!draggingRef.current || !anchor) return
    dragMovedRef.current = true
    setSelected(new Set(rectCells(anchor, key)))
  }

  function handleClick(e: React.MouseEvent, key: string) {
    if (selectMode) {
      setAnchor(key)
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }
    if (e.shiftKey && anchor) {
      setSelected(new Set(rectCells(anchor, key)))
      return
    }
    if (dragMovedRef.current) return // fue un arrastre de selección, no un click
    setAnchor(key)
    openEditor(key)
  }

  function applyBulk() {
    const cents = parsePesosToCents(bulkValue)
    if (cents == null) return
    setCells(Array.from(selected), cents)
  }

  function clearSelectionPrices() {
    setCells(Array.from(selected), null)
  }

  const showBulkBar = selectMode || selected.size >= 2
  const dayCount = DAY_KEYS.length

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
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={selectMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setSelectMode((v) => !v)
            setSelected(new Set())
            setEditing(null)
          }}
        >
          {selectMode ? 'Selección activa' : 'Seleccionar bloque'}
        </Button>

        {showBulkBar && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.size} celda{selected.size === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyBulk()
                  }
                }}
                placeholder="35.000"
                aria-label="Precio para las celdas seleccionadas"
                className="h-9 w-24 rounded-md border border-border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={applyBulk}
              disabled={selected.size === 0 || parsePesosToCents(bulkValue) == null}
            >
              Asignar precio
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelectionPrices}
              disabled={selected.size === 0}
            >
              Vaciar
            </Button>
          </div>
        )}

        <p className="ml-auto text-xs text-muted-foreground">
          {selectMode
            ? 'Tocá celdas para sumarlas a la selección.'
            : 'Click para editar · arrastrá o Shift+click para un bloque.'}
        </p>
      </div>

      {/* Grilla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm select-none">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-16 bg-muted px-2 py-2 text-left text-xs font-semibold text-muted-foreground"
              >
                Hora
              </th>
              {DAY_KEYS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="bg-muted px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                  style={{ width: `${88 / dayCount}%` }}
                >
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium tabular-nums text-muted-foreground"
                >
                  {hourLabel(hour)}
                </th>
                {DAY_KEYS.map((day) => {
                  const key = cellKey(day, hour)
                  const active = isHourActive(openingHours[day], hour)
                  if (!active) {
                    return (
                      <td
                        key={day}
                        className="border-l border-border bg-muted/40 px-1 py-1 text-center text-muted-foreground/40"
                        aria-hidden
                      >
                        ·
                      </td>
                    )
                  }
                  const price = grid[day]?.[hour]
                  const isSelected = selected.has(key)
                  const isEditing = editing === key
                  const style =
                    price != null ? heatStyle(price, priceStats.min, priceStats.max, isDark) : undefined

                  return (
                    <td key={day} className="border-l border-border p-0.5">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEditor}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitEditor()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setEditing(null)
                            }
                          }}
                          aria-label={`Precio ${DAY_LABELS[day]} ${hourLabel(hour)}`}
                          className="h-8 w-full rounded-md border-2 border-emerald-600 bg-background text-foreground px-1 text-center text-xs tabular-nums focus-visible:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onPointerDown={(e) => handlePointerDown(e, key)}
                          onPointerEnter={() => handlePointerEnter(key)}
                          onClick={(e) => handleClick(e, key)}
                          style={style}
                          aria-label={`${DAY_LABELS[day]} ${hourLabel(hour)}${
                            price != null ? ` ${formatArs(price)}` : ' sin precio'
                          }`}
                          aria-pressed={isSelected}
                          className={`flex h-8 w-full items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors ${
                            price == null
                              ? 'bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30 dark:hover:bg-amber-500/20'
                              : ''
                          } ${
                            isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                          }`}
                        >
                          {price != null ? formatArs(price) : '—'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Estado */}
      {emptyCount > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Faltan {emptyCount} celda{emptyCount === 1 ? '' : 's'} con precio. Completalas antes de
          guardar (toda hora operativa necesita un precio).
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Todas las horas operativas tienen precio. Al guardar se comprimen en reglas automáticamente.
        </p>
      )}
    </div>
  )
}
