import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Las salidas de `PortalResult`, aparte del componente para que Fast Refresh no recargue la página
// entera al editarlo (`only-export-components`). En un `Button` van como `variant`/`size`, no por
// `className`: el variant `default` dejaría su alto y su sombra debajo.

/** La salida principal: la píldora verde de 52 px, a todo el ancho. */
export const RESULT_GO = cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'w-full')
/**
 * La otra salida: la píldora de vidrio del mockup, pintada (sin desenfoque): detrás solo está la
 * luz de fondo, y el vidrio real queda para la cabecera y la barra (dirección §3.3).
 */
export const RESULT_ALT = cn(
  buttonVariants({ variant: 'pill-glass', size: 'pill' }),
  'w-full backdrop-filter-none',
)
