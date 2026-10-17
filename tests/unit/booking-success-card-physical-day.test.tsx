// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  BookingSuccessCard,
  type ConfirmedBooking,
} from '@/app/reserva/[bookingId]/exito/BookingSuccessCard'

afterEach(() => cleanup())

const BOOKING_ID = '0b8f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'

const booking = (over: Partial<ConfirmedBooking>): ConfirmedBooking => ({
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  courtName: 'Cancha 1',
  courtFormat: 5,
  address: 'Calle 1',
  city: 'Rosario',
  latitude: null,
  longitude: null,
  startsOn: '2026-10-18',
  timeStart: '00:00:00',
  timeEnd: '01:00:00',
  priceSnapshot: 1_000_000,
  depositAmount: 300_000,
  depositStatus: 'paid',
  hidePrices: true,
  ...over,
})

function renderCard(b: ConfirmedBooking) {
  const { container } = render(
    <BookingSuccessCard bookingId={BOOKING_ID} booking={b} complexUrl="https://t.test/el-vagon" />,
  )
  const href = container.querySelector('a[href^="https://wa.me/"]')!.getAttribute('href')!
  const shareText = decodeURIComponent(href.split('?text=')[1]!)
  return {
    container,
    shareText,
    receipt: container.querySelector('#booking-receipt')!.textContent!,
  }
}

// El operativo es el sáb 17/10; el turno de 00:00 se juega el dom 18/10. La card recibe el día
// físico (`startsOn`) y es el único día que el jugador lee: resumen, WhatsApp y comprobante.
describe('BookingSuccessCard — día físico', () => {
  it('turno de 00:00 de closes_next_day → domingo 18 en el resumen, el WhatsApp y el comprobante', () => {
    const { container, shareText, receipt } = renderCard(booking({}))
    expect(shareText).toContain('domingo 18 de octubre')
    expect(shareText).not.toContain('17 de octubre')
    expect(receipt).toContain('18/10/2026')
    expect(receipt).not.toContain('17/10/2026')
    expect(container.textContent).toContain('18 de octubre')
    expect(container.textContent).not.toContain('17 de octubre')
  })

  it('control negativo: turno de 20:00 del sábado → sábado 17 en todos lados', () => {
    const { container, shareText, receipt } = renderCard(
      booking({ startsOn: '2026-10-17', timeStart: '20:00:00', timeEnd: '21:00:00' }),
    )
    expect(shareText).toContain('sábado 17 de octubre')
    expect(receipt).toContain('17/10/2026')
    expect(container.textContent).not.toContain('18 de octubre')
  })
})
