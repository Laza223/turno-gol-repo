/**
 * Las clases de las pantallas de ingreso y del portal (títulos, botones, links, campos). Viven en un
 * módulo sin imports a propósito: las importan la ficha, Rival, confirmar el turno y más, y si
 * vivieran junto al marco (`PortalAuthFrame`) arrastrarían su CSS y su cromo a todas esas páginas.
 */

/**
 * Título de las pantallas de ingreso: Archivo 800 recta, 28 px. El tracking es de -0,01 em y no
 * `tracking-tight`: en Archivo 800 ese achica los espacios entre palabras hasta pegarlas.
 */
export const PORTAL_TITLE =
  'font-display text-[28px] font-extrabold leading-9 tracking-[-0.01em] text-foreground'

/** Título de sección de las páginas del portal (Fotos, Horarios, Reseñas…): el mismo Archivo 800, a 20 px. */
export const PORTAL_SECTION_TITLE =
  'font-display text-xl font-extrabold leading-7 tracking-[-0.01em] text-foreground'

/** La columna de las pantallas de una sola tarea (confirmar, la vuelta de la reserva): ~560 px, igual en el celular y en escritorio. */
export const PORTAL_COLUMN = 'mx-auto w-full max-w-[35rem] px-4 pt-4'

/**
 * Botón de las pantallas de ingreso: 48 px a todo el ancho, plano (sin sombra ni levante al
 * hover ni al apretar) y con el foco separado por el color del fondo, sin la banda blanca del
 * `ring-offset` por defecto en oscuro. Se pasa por `className` al `Button` / `buttonVariants`
 * del panel, que no se toca (tailwind-merge deja ganar estas clases).
 *
 * Deshabilitado o pendiente NO se desvanece (`disabled:opacity-100`): con el 50 % del panel
 * "Enviando…" medía 2,2:1 y es la única señal de que el toque entró. El primario pendiente
 * conserva su relleno y su etiqueta; el outline usa PORTAL_BUTTON_OUTLINE.
 */
export const PORTAL_BUTTON =
  'h-auto min-h-12 md:h-auto w-full whitespace-normal px-4 py-3 text-base shadow-none hover:shadow-none hover:translate-y-0 active:scale-100 focus-visible:ring-offset-background disabled:opacity-100'

/**
 * Los botones outline cuando no se pueden tocar ("Reenviar en N s", "Abriendo Google…"): sin la
 * opacidad que los apagaba, se atenúan con texto y borde de los tokens. No va en PORTAL_BUTTON:
 * en un primario dejaría texto gris sobre el verde.
 */
export const PORTAL_BUTTON_OUTLINE = `${PORTAL_BUTTON} disabled:border-border disabled:text-muted-foreground`

/**
 * El foco de un link del portal: el anillo del mundo (2 px en `ring`, separado 2 px con el color
 * del fondo) en lugar del contorno por defecto del navegador. Solo el foco: el color, el subrayado
 * y el blanco táctil de 44 px los pone cada link. `/ingresar` conserva el suyo (decisión del 2.1).
 */
export const PORTAL_LINK =
  'rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * Campo de texto de las pantallas de ingreso: 48 px, y `text-base` en mobile porque < 16 px dispara
 * el zoom de iOS al enfocar (MASTER §3.x). El placeholder va con el color pleno del token: el `/60`
 * de ui/input.tsx medía 2,87:1 en claro y 3,35:1 en oscuro, y es el ejemplo del formato del email.
 * Se pasa por `className` al `Input`, que no se toca (tailwind-merge deja ganar esta clase).
 */
const PORTAL_INPUT =
  'h-12 md:h-12 text-base md:text-sm placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive'

/**
 * Campo de texto del portal de vidrio (`.inputf`; F5 en confirmar el turno, F6 en ingresar y la
 * cuenta). Utilidades y no una clase de componentes: las de `Input` (capa de utilidades) le ganarían.
 * 52 px y 16 px también desde md (la base de `Input` baja a `md:text-sm`). El borde llega a 3:1
 * sobre el panel (WCAG 1.4.11): medido sobre el píxel da 3,39:1 en claro y 5,47:1 en oscuro; la
 * línea interior del vidrio (`portal-inner-line`) daba 1,2:1 y el campo se perdía.
 */
export const GLASS_INPUT =
  'h-13 rounded-[18px] border-portal-soft/70 bg-portal-inner hover:border-portal-soft/70 px-4 text-base text-portal-ink shadow-none placeholder:text-portal-soft focus-visible:border-portal-green focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-portal-green md:h-13 md:text-base'

/**
 * Título de las pantallas de ingreso en La Previa: Archivo negra itálica, 30 px, siempre blanco
 * (el marco es siempre oscuro). Los PORTAL_TITLE de arriba siguen siendo los de las otras pantallas.
 */
export const AUTH_TITLE =
  'font-display text-3xl font-black italic leading-tight tracking-tight text-white'

/** Tramo del título que lleva el degradé esmeralda ("cuenta"). */
export const AUTH_ACCENT_STYLE = {
  background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  // Como `.hero-accent-text`: la itálica sobresale de la caja y `background-clip: text` la recorta.
  paddingRight: '0.15em',
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
} as const

/**
 * Campo de las pantallas de ingreso: PORTAL_INPUT (48 px, 16 px en mobile, placeholder pleno) con el
 * vidrio de La Previa. El borde queda en `border-input` (3:1) y el foco en `ring-ring`/`border-primary`
 * del primitivo: el `border-white/10` y el `ring-emerald-500` de la versión vieja no pasaban AA.
 */
export const AUTH_INPUT = `${PORTAL_INPUT} bg-white/4 text-white`

/** El vidrio de la card de ingreso (el de `cardStyle` de La Previa); también el del modal de confirmar. */
export const AUTH_CARD_STYLE = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const
