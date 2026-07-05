'use client'

import { useEffect, useRef, useState } from 'react'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  DAY_KEYS,
  type PriceGrid,
  isHourActive,
  parsePesosToCents,
} from '@/modules/courts/pricing-grid'
import { cellKey, parseCellKey } from './cell-utils'

type Params = {
  openingHours: OpeningHours
  grid: PriceGrid
  onGridChange: (next: PriceGrid) => void
}

/**
 * Modelo de interacción de la grilla de precios: selección por click/arrastre/
 * Shift, modo bloque, edición inline de una celda y asignación masiva. Separado
 * de PricingGrid para que el componente quede como composición de toolbar +
 * tabla. Recibe la grilla controlada (`grid`/`onGridChange`, spec §3.3): nunca
 * muta estado propio de precios, sólo re-emite hacia arriba.
 */
export function useCellSelection({ openingHours, grid, onGridChange }: Params) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [bulkValue, setBulkValue] = useState('')

  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const draggingRef = useRef(false)
  const dragMovedRef = useRef(false)

  // Soltar el mouse en cualquier lado termina el arrastre.
  useEffect(() => {
    const up = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  function setCells(keys: string[], cents: number | null) {
    const next: PriceGrid = { ...grid }
    for (const key of keys) {
      const { day, hour } = parseCellKey(key)
      if (!isHourActive(openingHours[day], hour)) continue
      const dayCells = { ...(next[day] ?? {}) }
      if (cents == null) delete dayCells[hour]
      else dayCells[hour] = cents
      next[day] = dayCells
    }
    onGridChange(next)
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

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelected(new Set())
    setEditing(null)
  }

  const showBulkBar = selectMode || selected.size >= 2
  const canApplyBulk = parsePesosToCents(bulkValue) != null

  return {
    selected,
    selectMode,
    bulkValue,
    setBulkValue,
    editing,
    editValue,
    setEditValue,
    setEditing,
    showBulkBar,
    canApplyBulk,
    toggleSelectMode,
    commitEditor,
    handlePointerDown,
    handlePointerEnter,
    handleClick,
    applyBulk,
    clearSelectionPrices,
  }
}
