import type { ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { PortalWorld } from './PortalWorld'

/**
 * Título de las pantallas de ingreso: Archivo 800 recta, 28 px. El tracking es de -0,01 em y no
 * `tracking-tight`: en Archivo 800 ese achica los espacios entre palabras hasta pegarlas.
 */
export const PORTAL_TITLE =
  'font-display text-[28px] font-extrabold leading-9 tracking-[-0.01em] text-foreground'

/** Título de sección de las páginas del portal (Fotos, Horarios, Reseñas…): el mismo Archivo 800, a 20 px. */
export const PORTAL_SECTION_TITLE =
  'font-display text-xl font-extrabold leading-7 tracking-[-0.01em] text-foreground'

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
export const PORTAL_INPUT =
  'h-12 md:h-12 text-base md:text-sm placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive'

/** Marco de /ingresar, /aceptar-terminos y los estados de jugador de /verify: una columna con el logo arriba. */
export function PortalAuthFrame({ children }: { children: ReactNode }) {
  return (
    <PortalWorld>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto w-full max-w-sm px-4 pb-12">
          <div className="flex h-14 items-center">
            <Link
              href="/"
              className="-mx-2 flex min-h-11 items-center rounded-md px-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Logo variant="horizontal" />
            </Link>
          </div>
          <div className="pt-6 sm:pt-12">{children}</div>
        </div>
      </div>
    </PortalWorld>
  )
}
