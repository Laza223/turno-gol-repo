// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reserva/x/exito',
}))

import {
  BookingSuccessCard,
  type ConfirmedBooking,
} from '@/app/reserva/[bookingId]/exito/BookingSuccessCard'
import { PaymentStatusView } from '@/components/booking/PaymentStatusWatcher'

afterEach(() => cleanup())

// Cifras que no pueden aparecer por casualidad en una fecha, un id o un teléfono.
const PRICE = 1_234_500 // $ 12.345
const DEPOSIT = 345_600 // $ 3.456

const booking: ConfirmedBooking = {
  tenantName: 'Club Norte',
  tenantSlug: 'club-norte',
  courtName: 'Cancha 2',
  courtFormat: 7,
  address: 'Av. Siempreviva 742',
  city: 'Rosario',
  latitude: -32.9442,
  longitude: -60.6505,
  startsOn: '2030-06-17',
  timeStart: '20:00:00',
  timeEnd: '21:00:00',
  priceSnapshot: PRICE,
  depositAmount: DEPOSIT,
  depositStatus: 'paid',
  hidePrices: true,
}
const BOOKING_ID = '0b8f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
const COMPLEX_URL = 'https://turnogol.test/club-norte'

/** Todo lo que el navegador tiene de la pantalla: el HTML (texto y atributos) y el mensaje de WhatsApp decodificado. */
function everything(container: HTMLElement): string {
  const hrefs = [...container.querySelectorAll('a[href]')].map((a) =>
    decodeURIComponent(a.getAttribute('href')!),
  )
  return `${container.innerHTML}\n${hrefs.join('\n')}`
}

const MONTO = /\$|12\.?345|3\.?456|1234500|345600/

describe('reserva confirmada con los precios ocultos', () => {
  it.each([
    ['con seña', booking],
    ['sin seña', { ...booking, depositAmount: 0, depositStatus: 'not_required' }],
  ])(
    '%s: ningún monto en el texto, en los atributos ni en el mensaje de WhatsApp',
    (_name, data) => {
      const { container } = render(
        <BookingSuccessCard bookingId={BOOKING_ID} booking={data} complexUrl={COMPLEX_URL} />,
      )
      expect(everything(container)).not.toMatch(MONTO)
      // Y la pantalla igual dice cómo se paga.
      expect(
        screen.getByText(
          data.depositStatus === 'paid'
            ? 'Seña pagada, el resto en el complejo'
            : 'Pagás en el complejo',
        ),
      ).toBeTruthy()
    },
  )

  it('control: con los precios a la vista el resumen sí muestra los montos, pero el mensaje al grupo nunca', () => {
    const { container } = render(
      <BookingSuccessCard
        bookingId={BOOKING_ID}
        booking={{ ...booking, hidePrices: false }}
        complexUrl={COMPLEX_URL}
      />,
    )
    const summary = screen.getByRole('region', { name: 'Tu turno' })
    expect(summary.textContent).toContain('12.345')
    expect(summary.textContent).toContain('Seña pagada')
    const share = screen.getByRole('link', { name: 'Avisarle al grupo' })
    expect(decodeURIComponent(share.getAttribute('href')!)).not.toMatch(MONTO)
    expect(container.querySelectorAll('a[href^="https://wa.me/"]')).toHaveLength(1)
  })
})

describe('pendiente: nunca hay montos', () => {
  it.each([
    ['pending_payment', null],
    ['confirmed', null],
    ['expired', null],
    ['canceled_refunded', null],
    ['completed', null],
    ['pending_payment', 'expired'],
    ['pending_payment', 'error'],
  ] as const)('%s / stalled=%s', (status, stalled) => {
    const { container } = render(
      <PaymentStatusView
        status={status}
        stalled={stalled}
        showDelayNote
        tenantSlug="club-norte"
        date="2030-06-17"
      />,
    )
    expect(everything(container)).not.toMatch(/\$/)
  })
})
