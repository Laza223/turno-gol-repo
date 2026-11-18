import { ViewTransition, type ReactNode } from 'react'

/**
 * Clase de la transición según el tipo que trae el `<Link>` (dirección §4.5, Navegación): entrar a
 * un detalle (`nav-forward`) entra 24 px desde la derecha, volver (`nav-back`) desde la izquierda,
 * y el resto (incluido el Atrás del navegador, que no trae tipo) es un fundido cruzado. El CSS de
 * cada clase está en globals.css, junto a la raíz.
 */
const NAV = {
  'nav-forward': 'portal-adelante',
  'nav-back': 'portal-atras',
  default: 'portal-fundido',
}

/**
 * La pantalla del portal entrando y saliendo al navegar. Va en un `template.tsx` (que se vuelve a
 * montar en cada navegación) o en la página, nunca en un layout: el layout persiste y ahí no hay
 * entrada ni salida. `default="none"`: un `router.refresh()` o un cambio de tema no la animan.
 *
 * El `div` es lo que se captura: la transición se pone en el primer nodo con caja, y varias
 * pantallas empiezan con un `display: contents` (`PortalWorld` en la ficha), que no se puede capturar.
 */
export function PortalTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={NAV} exit={NAV} default="none">
      <div>{children}</div>
    </ViewTransition>
  )
}
