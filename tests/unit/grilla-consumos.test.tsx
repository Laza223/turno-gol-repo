// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GrillaView } from '@/app/(admin)/grilla/GrillaView'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { canteenProduct } from '@/test/fixtures/canteen'
import { court } from '@/test/fixtures/court'
import { openingHours } from '@/test/fixtures/tenant'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@/hooks/use-booking-realtime', () => ({
  useBookingRealtime: ({ initialBookings }: { initialBookings: GridBooking[] }) => ({
    bookings: initialBookings,
    status: 'SUBSCRIBED',
    refetch: vi.fn(),
  }),
}))

afterEach(cleanup)

describe('Grilla — consumos del turno', () => {
  it.each(['Día', 'Semana'] as const)(
    'anota y cobra junto con la cancha desde %s',
    async (view) => {
      const cancha = court()
      const turno = {
        ...toGridBooking(booking({ status: 'completed', guestName: 'Equipo prueba' })),
        pending: 1_500_000,
        totalPaid: 0,
      }
      const producto = canteenProduct()
      const consumo = {
        tabId: 'tab-1',
        totalAmount: producto.price,
        items: [{ name: producto.name, qty: 1 }],
      }
      const listBookingConsumosAction = vi
        .fn()
        .mockResolvedValueOnce({ success: true, consumos: [] })
        .mockResolvedValue({ success: true, consumos: [consumo] })
      const createTabAction = vi.fn(async () => ({
        success: true as const,
        debtorName: 'Consumo de turno',
        total: producto.price,
      }))
      const settleTabAction = vi.fn(async () => ({ success: true as const, total: producto.price }))
      const chargeDebtAction = vi.fn(async () => ({ success: true as const }))

      render(
        <GrillaView
          courts={[cancha]}
          initialBookings={[turno]}
          date={turno.date}
          tenantId={cancha.tenantId}
          openingHours={openingHours()}
          closedDates={[]}
          closesNextDay={false}
          cancellationPolicyHours={12}
          action={vi.fn()}
          createAbonadoAction={vi.fn()}
          slotPanelActions={{
            chargeDebtAction,
            addBookingChargeAction: vi.fn(),
            completeAndChargeBookingAction: vi.fn(),
            markNoShowAction: vi.fn(),
            listBookingConsumosAction,
            settleTabAction,
            cancelTabAction: vi.fn(),
          }}
          canteen={{
            listCatalogAction: async () => ({ success: true, products: [producto] }),
            sellTicketAction: vi.fn(),
            createTabAction,
          }}
          week={view === 'Semana' ? { court: cancha } : undefined}
        />,
      )

      const grilla = within(screen.getByTestId(view === 'Semana' ? 'week-grid' : 'booking-grid'))
      fireEvent.click(grilla.getByText('Equipo prueba'))
      fireEvent.click(await screen.findByRole('button', { name: 'Sumar cantina' }))
      fireEvent.click(await screen.findByRole('button', { name: /Agua mineral/ }))
      fireEvent.click(screen.getByRole('button', { name: /^Anotar al turno/ }))

      expect(createTabAction).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: turno.id,
          lines: [{ productId: producto.id, qty: 1 }],
        }),
      )
      expect(await screen.findByRole('group', { name: 'Consumos anotados' })).toHaveTextContent(
        producto.name,
      )
      fireEvent.click(screen.getByRole('button', { name: /^Cobrar .*16\.500/ }))

      await waitFor(() => expect(chargeDebtAction).toHaveBeenCalledTimes(1))
      expect(settleTabAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: consumo.tabId,
          charges: [{ amount: producto.price, method: 'cash' }],
        }),
      )
      expect(settleTabAction).toHaveBeenCalledBefore(chargeDebtAction)
      expect(chargeDebtAction).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: turno.id,
          charges: [{ amount: turno.pending, method: 'cash' }],
        }),
      )
    },
  )
})
