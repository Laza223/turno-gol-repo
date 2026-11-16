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
const PORTAL_BUTTON =
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
 * Campo de texto del portal de vidrio (`.inputf`; F5 en confirmar el turno, F6 en ingresar y la
 * cuenta). Utilidades y no una clase de componentes: las de `Input` (capa de utilidades) le ganarían.
 * 52 px y 16 px también desde md (la base de `Input` baja a `md:text-sm`). El borde llega a 3:1
 * sobre el panel (WCAG 1.4.11): medido sobre el píxel da 3,39:1 en claro y 5,47:1 en oscuro; la
 * línea interior del vidrio (`portal-inner-line`) daba 1,2:1 y el campo se perdía.
 */
export const GLASS_INPUT =
  'h-13 rounded-[18px] border-portal-soft/70 bg-portal-inner hover:border-portal-soft/70 px-4 text-base text-portal-ink shadow-none placeholder:text-portal-soft focus-visible:border-portal-green focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-portal-green md:h-13 md:text-base'
