// Las clases de los botones de RIVAL en vidrio. Viven fuera de MatchBits para que ese archivo exporte
// solo componentes (Fast Refresh).
//
// Son las variantes `pill*` de `Button` ya resueltas, para un `<Link>` o un `<a>`. En un `<Button>`,
// pasar la MISMA variante y talla (`variant="pill-link" size="pill-sm"`) y esta clase en `className`:
// con otra variante, `twMerge` deja colgadas las clases de esa (el `hover:` del fantasma, el verde
// del default).
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * La acción principal (Voy, Avisar al grupo, Armar otro, Me faltan jugadores): la píldora verde de
 * 52 px, a todo el ancho. Es el único verde de la vista (dirección §3.6). Variante `pill`/`pill`.
 */
export const RIVAL_ACTION = cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'w-full')

/**
 * La acción de al lado de la principal (Busco rival, Ver el tablón, Publicar en el tablón): la
 * píldora de vidrio de 52 px. Variante `pill-glass`/`pill`.
 */
export const RIVAL_SECONDARY = cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }), 'w-full')

/**
 * La acción chica (Aceptar, Esta vez no, Copiar link, Ahora no): el `.link` del mockup, 44 px, sin
 * ancho fijo. Variante `pill-link`/`pill-sm`.
 */
export const RIVAL_GHOST = buttonVariants({ variant: 'pill-link', size: 'pill-sm' })

/**
 * Salida de riesgo PROPIA (Cancelar el partido, Me bajo, Cancelar pedido): el link con el tinte de
 * riesgo, para que no se lea igual que "Ahora no". Variante `pill-link`/`pill-sm`.
 */
export const RIVAL_GHOST_DESTRUCTIVE = cn(
  RIVAL_GHOST,
  'border-portal-bad-line bg-portal-bad-bg text-portal-bad hover:bg-portal-bad-bg hover:brightness-105',
)

/**
 * La moderación (Denunciar): sin borde ni relleno, más chica y apagada que las acciones propias; el
 * alto sigue en 44 px. Variante `pill-link`/`pill-sm`.
 */
export const RIVAL_GHOST_QUIET = cn(
  RIVAL_GHOST,
  'border-transparent bg-transparent px-3 text-[13px] font-medium text-portal-soft hover:bg-portal-inner hover:text-portal-ink',
)

/**
 * Elegir de una lista (`.pickbtn` del mockup): el gatillo de `SelectMenu` en vidrio, por
 * `className`. Utilidades y no una clase de componentes: las del gatillo le ganarían. El borde es el
 * de `GLASS_INPUT` (3:1 sobre el panel).
 */
export const RIVAL_PICK =
  'h-14 rounded-[18px] border-portal-soft/70 bg-portal-inner text-base font-semibold text-portal-ink shadow-none hover:bg-portal-bar-on md:text-base focus-visible:border-portal-green focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-portal-green aria-invalid:border-portal-bad aria-invalid:focus-visible:border-portal-bad'

/** El menú que abre `RIVAL_PICK` (`contentClassName`): el relleno de la hoja de vidrio. */
export const RIVAL_PICK_MENU =
  'rounded-[20px] border-(--glass-line) bg-linear-to-b from-(--portal-sheet-a) to-(--portal-sheet-b) p-1.5 font-display text-portal-ink shadow-(--glass-shadow) [&_[role=menuitemradio]]:min-h-11 [&_[role=menuitemradio]]:rounded-xl [&_[role=menuitemradio]]:text-[15px] [&_[role=menuitemradio][data-highlighted]]:bg-portal-bar-on [&_[role=menuitemradio][data-highlighted]]:text-portal-ink'
