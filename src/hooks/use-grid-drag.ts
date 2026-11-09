'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { resolveDropTarget, type DragTarget } from '@/lib/booking/grid-drag'
import type { CellState, GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'

/** Mouse: se arrastra al pasar este umbral (así un click sigue abriendo el panel). */
const MOUSE_THRESHOLD_PX = 4
/** Touch: hay que mantener apretado, quieto, este tiempo; si no, es scroll. */
const LONG_PRESS_MS = 350
const TOUCH_SLOP_PX = 8
/** Cerca del borde de la grilla, el arrastre la scrollea. */
const EDGE_PX = 48
const EDGE_SPEED_PX = 14

export type DragState = {
  booking: GridBooking
  x: number
  y: number
  target: DragTarget | null
}

type Params = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  courts: CourtRow[]
  visibleSlots: string[]
  cells: Map<string, CellState>
  isSlotPast: (slotTime: string) => boolean
  /** Soltó sobre un hueco válido. El server decide si de verdad se puede. */
  onDrop: (booking: GridBooking, target: DragTarget) => void
}

/**
 * Arrastrar un turno de la grilla a otro hueco, con Pointer Events (sin
 * librería): HTML5 drag-and-drop no existe en touch y el mostrador usa tablet.
 *
 * - Mouse: arrastre al mover más de 4 px.
 * - Touch/lápiz: mantener apretado 350 ms; moverse antes es scroll y cancela.
 * - Esc o perder el puntero cancela. El destino se resuelve con
 *   `elementFromPoint` sobre las celdas (`data-col`/`data-row`).
 *
 * Soltar NO mueve nada: llama a `onDrop` y quien lo recibe confirma con el
 * diálogo (que muestra el precio de la franja destino).
 */
export function useGridDrag(params: Params) {
  const latest = useRef(params)
  useEffect(() => {
    latest.current = params
  })

  const [drag, setDrag] = useState<DragState | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Si la grilla se desmonta en pleno arrastre, se sueltan los listeners.
  useEffect(
    () => () => {
      cleanupRef.current?.()
    },
    [],
  )

  const onCardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, booking: GridBooking) => {
      if (!e.isPrimary) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      cleanupRef.current?.()

      const pointerId = e.pointerId
      const isMouse = e.pointerType === 'mouse'
      const startX = e.clientX
      const startY = e.clientY
      let lastX = startX
      let lastY = startY
      let active = false
      let target: DragTarget | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let raf = 0

      const resolveAt = (x: number, y: number): DragTarget | null => {
        const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-col][data-row]')
        if (!cell) return null
        const col = Number(cell.dataset.col)
        const row = Number(cell.dataset.row)
        if (Number.isNaN(col) || Number.isNaN(row)) return null
        const { courts, visibleSlots, cells, isSlotPast } = latest.current
        return resolveDropTarget({ col, row }, { courts, visibleSlots, cells, isSlotPast })
      }

      const update = () => {
        target = resolveAt(lastX, lastY)
        setDrag({ booking, x: lastX, y: lastY, target })
      }

      const edgeScroll = () => {
        const el = latest.current.scrollRef.current
        if (el) {
          const r = el.getBoundingClientRect()
          let dx = 0
          let dy = 0
          if (lastX < r.left + EDGE_PX) dx = -EDGE_SPEED_PX
          else if (lastX > r.right - EDGE_PX) dx = EDGE_SPEED_PX
          if (lastY < r.top + EDGE_PX) dy = -EDGE_SPEED_PX
          else if (lastY > r.bottom - EDGE_PX) dy = EDGE_SPEED_PX
          if (dx !== 0 || dy !== 0) {
            const { scrollLeft, scrollTop } = el
            el.scrollBy(dx, dy)
            // Solo se resuelve de nuevo si la grilla se movió de verdad.
            if (el.scrollLeft !== scrollLeft || el.scrollTop !== scrollTop) update()
          }
        }
        raf = requestAnimationFrame(edgeScroll)
      }

      const activate = () => {
        active = true
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
        update()
        raf = requestAnimationFrame(edgeScroll)
      }

      const cleanup = () => {
        clearTimeout(timer)
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('blur', cleanup)
        window.removeEventListener('touchmove', onTouchMove)
        window.removeEventListener('contextmenu', onContextMenu)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        setDrag(null)
        cleanupRef.current = null
      }

      // Un arrastre que termina sobre la propia tarjeta dispara un click: no
      // debe abrir el panel del turno.
      const swallowNextClick = () => {
        const stop = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', stop, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', stop, true), 60)
      }

      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return
        // Se perdió el pointerup (alt-tab, soltó fuera de la ventana): el mouse
        // ya no tiene el botón apretado, así que no hay arrastre que seguir.
        if (isMouse && ev.buttons === 0) {
          cleanup()
          return
        }
        lastX = ev.clientX
        lastY = ev.clientY
        if (!active) {
          const dist = Math.hypot(lastX - startX, lastY - startY)
          if (isMouse && dist > MOUSE_THRESHOLD_PX) activate()
          else if (!isMouse && dist > TOUCH_SLOP_PX) cleanup()
          return
        }
        update()
      }

      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return
        const dropped = active ? target : null
        const wasActive = active
        cleanup()
        if (wasActive) swallowNextClick()
        if (dropped?.valid) latest.current.onDrop(booking, dropped)
      }

      function onCancel(ev: PointerEvent) {
        if (ev.pointerId === pointerId) cleanup()
      }

      function onKey(ev: KeyboardEvent) {
        if (ev.key === 'Escape') {
          const wasActive = active
          cleanup()
          if (wasActive) swallowNextClick()
        }
      }

      // Con el arrastre táctil activo el navegador no tiene que scrollear.
      function onTouchMove(ev: TouchEvent) {
        if (active) ev.preventDefault()
      }

      function onContextMenu(ev: Event) {
        if (!isMouse) ev.preventDefault()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey)
      window.addEventListener('blur', cleanup)
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      window.addEventListener('contextmenu', onContextMenu)
      cleanupRef.current = cleanup

      if (!isMouse) timer = setTimeout(activate, LONG_PRESS_MS)
    },
    [],
  )

  return { drag, onCardPointerDown }
}
