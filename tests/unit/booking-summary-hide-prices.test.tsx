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
  // El resumen no dice cómo se paga: lo dice la sección de pago, que siempre está debajo
  // (ver checkout-flow.test.tsx). Acá solo importa que no haya ni un monto.
  it('con seña: ningún monto en el texto ni en un atributo, y tampoco cómo se paga', () => {
    const { container } = render(<BookingSummary data={{ ...data, hidePrices: true }} />)
    expect(container.innerHTML).not.toContain('$')
    expect(container.textContent).not.toMatch(/pag[aá]s|MercadoPago|se[ñn]a/i)
  })

  it('sin seña: ningún monto en el texto ni en un atributo, y tampoco cómo se paga', () => {
    const { container } = render(
      <BookingSummary data={{ ...data, depositAmount: 0, hidePrices: true }} />,
    )
    expect(container.innerHTML).not.toContain('$')
    expect(container.textContent).not.toMatch(/pag[aá]s|complejo\./i)
    // Lo del turno sí está: quién, cuándo y dónde.
    expect(screen.getByText('El Potrero')).toBeTruthy()
    expect(screen.getByText('Cancha 1')).toBeTruthy()
  })

  it('control: con precios visibles muestra el precio y la seña', () => {
    const { container } = render(<BookingSummary data={data} />)
    expect(container.textContent).toContain('$')
    expect(screen.getByText('Precio del turno')).toBeTruthy()
  })
})
