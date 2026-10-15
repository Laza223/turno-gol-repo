// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BookingSummary, {
  type BookingSummaryData,
} from '@/app/(public)/[slug]/reservar/components/BookingSummary'

afterEach(() => cleanup())

const data: BookingSummaryData = {
  tenantName: 'El Potrero',
  city: 'Rosario',
  courtName: 'Cancha 1',
  date: '2026-06-15',
  timeStart: '18:00',
  timeEnd: '19:00',
  price: 2_000_000,
  depositAmount: 600_000,
}

describe('BookingSummary — precios ocultos (settings.hide_public_prices)', () => {
  it('con seña: dice que se paga una seña online, sin ningún monto', () => {
    const { container } = render(<BookingSummary data={{ ...data, hidePrices: true }} />)
    expect(container.textContent).not.toContain('$')
    expect(screen.getByText(/pagás una seña online con MercadoPago/)).toBeTruthy()
  })

  it('sin seña: dice que se paga en el complejo, sin ningún monto', () => {
    const { container } = render(
      <BookingSummary data={{ ...data, depositAmount: 0, hidePrices: true }} />,
    )
    expect(container.textContent).not.toContain('$')
    expect(screen.getByText('Pagás en el complejo.')).toBeTruthy()
  })

  it('control: con precios visibles muestra el precio y la seña', () => {
    const { container } = render(<BookingSummary data={data} />)
    expect(container.textContent).toContain('$')
    expect(screen.getByText('Precio del turno')).toBeTruthy()
  })
})
