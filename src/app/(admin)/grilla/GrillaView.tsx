'use client'

import type { ComponentProps } from 'react'
import dynamic from 'next/dynamic'
import { BookingGrid } from '@/components/booking/BookingGrid'
import type { ListCanteenCatalog, SellTicketForBooking } from './_components/BookingCanteenDialog'

/**
 * Capa mínima entre la página (server) y la grilla (client) cuya única razón de
 * existir es el diálogo de cantina.
 *
 * El diálogo reusa el `TicketPanel` de /caja/cantina, así que sólo puede vivir
 * bajo `@/app` — un componente de `@/components` que importa de `@/app` está en
 * el lugar equivocado. Y una Server Component no puede pasar un componente por
 * prop (sólo elementos y Server Actions), así que la fábrica se arma acá, del
 * lado del cliente, y baja como `renderCanteenDialog`.
 */

const BookingCanteenDialog = dynamic(
  () => import('./_components/BookingCanteenDialog').then((m) => m.BookingCanteenDialog),
  { ssr: false },
)

type Props = Omit<ComponentProps<typeof BookingGrid>, 'renderCanteenDialog'> & {
  /** Sin esto la grilla funciona igual, sólo que el panel no ofrece cantina. */
  canteen?: {
    listCatalogAction: ListCanteenCatalog
    sellTicketAction: SellTicketForBooking
  }
}

export function GrillaView({ canteen, ...gridProps }: Props) {
  return (
    <BookingGrid
      {...gridProps}
      renderCanteenDialog={
        canteen
          ? (args) => (
              <BookingCanteenDialog
                {...args}
                listCatalogAction={canteen.listCatalogAction}
                sellTicketAction={canteen.sellTicketAction}
              />
            )
          : undefined
      }
    />
  )
}
