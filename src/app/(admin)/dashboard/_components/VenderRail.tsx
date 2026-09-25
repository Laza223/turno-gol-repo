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
 * el título y el buscador quedaban tapados al scrollear.
 *
 * La columna es flex con tope de alto: el que cede lugar es el CATÁLOGO, no el
 * ticket (`layout="rail"` en `TicketPanel`). Con un scroll de la columna entera, a
 * 1366×650 —el piso del mostrador— "Cobrar $ 6.000" quedaba 76 px debajo del
 * borde con dos productos en el ticket. El scroll de la columna queda de red por
 * si un ticket muy largo no entra ni con el catálogo al mínimo.
 */
export function VenderRail() {
  const { open, products, sellTicketAction, createTabAction } = useVender()
  if (open) return null

  return (
    <aside
      aria-labelledby="vender-titulo"
      className="hidden xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100dvh-6rem)] xl:flex-col xl:overflow-y-auto"
    >
      <h2 id="vender-titulo" className="mb-3 shrink-0 text-base font-semibold text-foreground">
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
