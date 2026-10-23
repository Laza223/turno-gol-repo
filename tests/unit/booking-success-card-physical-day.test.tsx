// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('BookingSuccessCard — "Armar el partido" (RIVAL)', () => {
  const renderWith = (rivalEnabled?: boolean) =>
    render(
      <BookingSuccessCard
        bookingId={BOOKING_ID}
        booking={booking({})}
        complexUrl="https://t.test/el-vagon"
        rivalEnabled={rivalEnabled}
      />,
    )

  it('con el flag prendido suma el link a /rival/nuevo?reserva=<id> y conserva "Avisarle al grupo"', () => {
    const { container } = renderWith(true)
    const link = [...container.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Armar el partido',
    )
    expect(link?.getAttribute('href')).toBe(`/rival/nuevo?reserva=${BOOKING_ID}`)
    expect(container.textContent).toContain('Avisarle al grupo')
  })

  it('solo hasta hoy+7 (ART): +7 lo ofrece, +8 no', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-22T15:00:00Z')) // 12:00 ART del 22/10
      const armar = (startsOn: string) =>
        render(
          <BookingSuccessCard
            bookingId={BOOKING_ID}
            booking={booking({ startsOn })}
            complexUrl="https://t.test/el-vagon"
            rivalEnabled
          />,
        ).container.textContent?.includes('Armar el partido')
      expect(armar('2026-10-29')).toBe(true)
      cleanup()
      expect(armar('2026-10-30')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([false, undefined])('con el flag en %s no renderiza nada de RIVAL', (flag) => {
    const { container } = renderWith(flag)
    expect(container.textContent).not.toContain('Armar el partido')
    expect(container.querySelector('a[href^="/rival"]')).toBeNull()
  })
})
