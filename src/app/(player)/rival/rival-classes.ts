// Las clases de los botones de RIVAL. Viven fuera de MatchBits para que ese archivo exporte solo
// componentes (Fast Refresh).
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/lib/status-tone'

/**
 * CTA primario de las PÁGINAS DE LISTA (el tablón y el vacío de Mis partidos): 44 px, el único
 * verde de la vista. Dentro de la vista de un partido la acción primaria es `RIVAL_ACTION`.
 */
export const RIVAL_CTA =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-[color,background-color,border-color,opacity,translate,scale] duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25'

/**
 * La acción primaria DENTRO de la vista de un partido (Voy, Avisar al grupo, Armar otro…): el
 * rectángulo plano de 48 px del portal, a todo el ancho. Ícono (`size-4`) + texto, con su hueco.
 * Se usa como `className` de un `<Link>`, un `<a>` o un `<Button>`.
 */
export const RIVAL_ACTION = cn(buttonVariants(), PORTAL_BUTTON, 'gap-2')

/**
 * El botón fantasma de RIVAL (11 de alto, 14 px medium): sin ancho ni padding, que pone quien lo
 * usa (`cn(RIVAL_GHOST, 'w-full')`, `'px-3'`). El `ring-offset-background` evita la banda blanca
 * del foco en oscuro; se usa con `variant="ghost"` u `"outline"`.
 */
export const RIVAL_GHOST = 'h-11 md:h-11 text-sm font-medium focus-visible:ring-offset-background'

/**
 * Salida destructiva PROPIA (Cancelar el partido, Me bajo, Cancelar pedido): el fantasma con el texto
 * en tono destructive, para que no se lea igual que "Ahora no" (que queda neutro).
 */
export const RIVAL_GHOST_DESTRUCTIVE = cn(
  RIVAL_GHOST,
  TONE_TEXT.destructive,
  'hover:bg-destructive/10 hover:text-red-700 dark:hover:text-red-300',
)

/** La moderación (Denunciar): más chica y apagada que las acciones propias; el alto sigue en 44 px. */
export const RIVAL_GHOST_QUIET = cn(
  RIVAL_GHOST,
  'text-[13px] font-normal text-muted-foreground hover:text-foreground',
)
