'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Ancla de la barra superior donde cada vista cuelga sus controles. */
export const ADMIN_HEADER_SLOT_ID = 'admin-header-slot'

/** El nodo no cambia durante la vida de la página: nada a lo que suscribirse. */
const subscribe = () => () => {}
/**
 * `getElementById` devuelve SIEMPRE el mismo objeto para el mismo nodo, así que
 * sirve de snapshot estable — si devolviera uno nuevo por llamada, React entraría
 * en un ciclo de renders.
 */
const getHost = () => document.getElementById(ADMIN_HEADER_SLOT_ID)
const getServerHost = () => null

/**
 * Cuelga controles de la vista en la barra superior del panel.
 *
 * El armazón envuelve a la página, así que una página no puede pasarle props
 * hacia arriba: lo que sube va por un portal a un nodo fijo del header. Es lo
 * que permite que la Grilla deje de tener encabezado propio — título, fecha,
 * pestañas y semana ocupaban cuatro filas arriba de la matriz y ahora son una
 * sola fila compartida con el resto del panel.
 *
 * `useSyncExternalStore` y no un efecto con `setState`: en el render del
 * servidor y durante la hidratación el nodo del header todavía no existe en
 * `document`, y esta es la forma que React da para leer algo que solo existe del
 * lado del cliente sin desincronizar el HTML (misma razón que `useIsDesktop`).
 */
export function AdminHeaderSlot({ children }: { children: ReactNode }) {
  const host = useSyncExternalStore(subscribe, getHost, getServerHost)
  return host ? createPortal(children, host) : null
}
