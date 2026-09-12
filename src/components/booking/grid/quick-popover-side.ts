/**
 * Lado de la celda donde se abre el popover de alta rápida.
 *
 * El popover prefiere la derecha para no tapar la columna de la cancha. Radix
 * sólo sabe dar vuelta al lado opuesto: si tampoco entra a la izquierda, lo deja
 * ahí igual y el formulario queda cortado fuera de la pantalla. Pasa con una
 * sola cancha, donde la celda ocupa casi todo el ancho y no sobra lugar a
 * ningún costado: el nombre del jugador y "Más opciones" quedaban inalcanzables
 * (visto en CI de main, 1280×720). En ese caso se abre abajo, donde Radix sí
 * puede correrlo en horizontal y darlo vuelta arriba si hace falta.
 */

/**
 * Lo que ocupa el popover al costado de la celda: el formulario (`w-[19rem]`),
 * el `p-3` y el borde del contenido, más `sideOffset` y `collisionPadding`,
 * con margen.
 */
const QUICK_POPOVER_SPACE_PX = 360

export type QuickPopoverSide = 'right' | 'left' | 'bottom'

export function quickPopoverSide(
  cell: { left: number; right: number },
  viewportWidth: number,
): QuickPopoverSide {
  if (viewportWidth - cell.right >= QUICK_POPOVER_SPACE_PX) return 'right'
  if (cell.left >= QUICK_POPOVER_SPACE_PX) return 'left'
  return 'bottom'
}
