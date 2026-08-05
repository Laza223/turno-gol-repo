import type { KeyboardEvent } from 'react'

/**
 * Navegación con flechas entre celdas de la grilla.
 *
 * Cada botón lleva `data-col`/`data-row` sobre las filas VISIBLES (colapso de la
 * madrugada incluido). El `while` salta las filas que no tienen celda propia —
 * cubiertas por una reserva de 120 min, pasadas, o de una cancha pausada — hasta
 * encontrar la siguiente enfocable. Sin ese salto, una flecha se comía el foco
 * contra un hueco y la navegación por teclado quedaba trabada.
 */
export function moveGridFocus(
  e: KeyboardEvent<HTMLDivElement>,
  bounds: { cols: number; rows: number },
): void {
  const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
  if (dCol === 0 && dRow === 0) return

  const target = e.target as HTMLElement
  const col = Number(target.dataset['col'])
  const row = Number(target.dataset['row'])
  if (Number.isNaN(col) || Number.isNaN(row)) return

  e.preventDefault()
  let c = col + dCol
  let r = row + dRow
  while (c >= 0 && c < bounds.cols && r >= 0 && r < bounds.rows) {
    const next = e.currentTarget.querySelector<HTMLElement>(`[data-col="${c}"][data-row="${r}"]`)
    if (next) {
      next.focus()
      next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      return
    }
    c += dCol
    r += dRow
  }
}
