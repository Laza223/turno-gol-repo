'use client'

import type { ComponentProps } from 'react'
import dynamic from 'next/dynamic'
import { BookingGrid } from '@/components/booking/BookingGrid'
import type { ListCanteenCatalog, SellTicketForBooking } from './_components/BookingCanteenDialog'

/**
 * Capa mínima entre la página (server) y la grilla (client) cuya razón de
 * existir es inyectar lo que sólo puede vivir bajo `@/app`.
 *
 * El diálogo de cantina reusa el `TicketPanel` de /caja/cantina, y desde el
 * paso 3 (docs/decisions/2026-09-24-navegacion-panel.md) tocar un turno abre
 * el MISMO modal de cobro de Hoy — los dos siguen viviendo donde ya vivían
 * (`app/(admin)/grilla/_components` y `app/(admin)/dashboard/_components`): un
 * componente de `@/components` que importa de `@/app` está en el lugar
 * equivocado. Y una Server Component no puede pasar un componente por prop
 * (sólo elementos y Server Actions), así que las dos fábricas se arman acá,
 * del lado del cliente, y bajan como `renderCanteenDialog`/`renderChargeModal`.
 */

const BookingCanteenDialog = dynamic(
  () => import('./_components/BookingCanteenDialog').then((m) => m.BookingCanteenDialog),
  { ssr: false },
)

const HoyChargeModal = dynamic(
  () => import('@/app/(admin)/dashboard/_components/HoyChargeModal').then((m) => m.HoyChargeModal),
  { ssr: false },
)

type Props = Omit<
  ComponentProps<typeof BookingGrid>,
  'renderCanteenDialog' | 'renderChargeModal'
> & {
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
      renderChargeModal={(args) =>
        // Sin acciones (stories/tests que no las cablean) el modal no puede
        // ofrecer nada de todos modos: mismo criterio que `slotPanelActions`
        // opcional en BookingGrid — no se ofrece detalle, no se rompe nada.
        args.actions && (
          <HoyChargeModal
            booking={args.booking}
            courtName={args.courtName}
            courts={args.courts}
            dayBookings={args.dayBookings}
            daySlots={args.daySlots}
            nowMs={args.nowMs}
            isRefreshing={args.isRefreshing}
            hasEnded={args.hasEnded}
            actions={args.actions}
            renderCanteenDialog={args.renderCanteenDialog}
            onClose={args.onClose}
            onMutated={args.onMutated}
          />
        )
      }
    />
  )
}
