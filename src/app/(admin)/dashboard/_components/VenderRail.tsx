'use client'

import { TicketPanel } from '@/app/(admin)/caja/cantina/TicketPanel'
import { useVender } from './VenderProvider'

/**
 * La columna de venta de Hoy: fija a la derecha desde `xl` (1280 px). Debajo de
 * `xl` se oculta por CSS (`hidden xl:block`) y la venta pasa al botón "Vender" de
 * la barra superior — por CSS y no con `useIsDesktop`, que responde `true` en el
 * servidor y en toda la hidratación y haría nacer la columna en el teléfono.
 *
 * Sin card alrededor: el catálogo y el ticket ya traen sus propios filetes, y una
 * card más los dejaría con doble borde. No se renderiza mientras el diálogo de
 * venta está abierto (ver `VenderProvider`).
 *
 * `top-20` y no `top-4`: la barra superior es `fixed` y mide 3,75 rem, y con 1 rem
 * el título y el buscador quedaban tapados al scrollear. El tope de alto (con
 * scroll propio) evita que en una notebook baja el botón "Cobrar" quede fuera de
 * pantalla mientras la columna está pegada.
 */
export function VenderRail() {
  const { open, products, sellTicketAction, createTabAction } = useVender()
  if (open) return null

  return (
    <aside
      aria-labelledby="vender-titulo"
      className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto"
    >
      <h2 id="vender-titulo" className="mb-3 text-base font-semibold text-foreground">
        Vender
      </h2>
      <TicketPanel
        layout="rail"
        products={products}
        sellTicketAction={sellTicketAction}
        createTabAction={createTabAction}
      />
    </aside>
  )
}
