// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PriceBreakdown } from '@/app/(admin)/settings/facturacion/PriceBreakdown'
import { PlusSection } from '@/app/(admin)/settings/facturacion/PlusSection'
import { InvoiceHistorySection } from '@/app/(admin)/settings/facturacion/InvoiceHistorySection'
import { buildPriceBreakdown } from '@/modules/billing/pricing'

const pricing = {
  priceFirstCourtCents: 3_000_000,
  priceExtraCourtCents: 3_000_000,
  annualDiscountBps: 1000,
}

describe('PriceBreakdown con Plus', () => {
  it('sin Plus no muestra la fila del Asistente', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'monthly',
      plusPerCourtCents: 0,
      ...pricing,
    })
    render(<PriceBreakdown breakdown={b} />)
    expect(screen.queryByText(/Asistente de WhatsApp/)).toBeNull()
    expect(screen.getAllByText(/150\.000/).length).toBeGreaterThan(0)
  })

  it('con Plus suma la fila "N canchas × $X" y el total sube', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'monthly',
      plusPerCourtCents: 2_000_000,
      ...pricing,
    })
    render(<PriceBreakdown breakdown={b} />)
    expect(screen.getByText(/Asistente de WhatsApp \(Plus\) · 5 canchas × .*20\.000/)).toBeTruthy()
    expect(screen.getAllByText(/250\.000/).length).toBeGreaterThan(0)
  })

  it('anual: el descuento va sobre la suma plan + Plus', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'annual',
      plusPerCourtCents: 2_000_000,
      ...pricing,
    })
    render(<PriceBreakdown breakdown={b} />)
    expect(screen.getAllByText(/225\.000/).length).toBeGreaterThan(0)
  })
})

describe('PlusSection', () => {
  const actions = { disableAction: vi.fn(), payAction: vi.fn() }
  const base = { enabled: false, perCourtCents: 2_000_000, accessUntil: null, quote: null }

  it('sin Plus, sin baja agendada y sin cotización no renderiza nada', () => {
    const { container } = render(
      <PlusSection plus={base} periodEnd="2027-03-15T12:00:00.000Z" {...actions} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('facturado: precio por cancha y botón de baja', () => {
    render(
      <PlusSection
        plus={{ ...base, enabled: true }}
        periodEnd="2027-03-15T12:00:00.000Z"
        {...actions}
      />,
    )
    expect(screen.getByText(/Incluido en tu cuota: .*20\.000 por cancha/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dar de baja el Asistente' })).toBeTruthy()
  })

  it('baja agendada: fecha en ART y sin botones', () => {
    render(
      <PlusSection
        plus={{ ...base, accessUntil: '2027-03-15T12:00:00.000Z' }}
        periodEnd="2027-03-15T12:00:00.000Z"
        {...actions}
      />,
    )
    expect(
      screen.getByText('Activo hasta el 15/03. El próximo débito ya no lo incluye.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('cotización pendiente: botón primario con el monto y aviso de acreditación', () => {
    render(
      <PlusSection
        plus={{ ...base, quote: { months: 5, amountCents: 18_000_000 } }}
        periodEnd="2027-03-15T12:00:00.000Z"
        {...actions}
      />,
    )
    expect(screen.getByText(/pagá los 5 meses que faltan/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pagar .*180\.000/ })).toBeTruthy()
    expect(
      screen.getByText('Cuando se acredite el pago, el Asistente se prende solo.'),
    ).toBeTruthy()
  })
})

describe('InvoiceHistorySection', () => {
  it('etiqueta solo el pago de Plus del anual', () => {
    render(
      <InvoiceHistorySection
        invoices={[
          {
            mpPaymentId: 'p-1',
            status: 'approved',
            amount: 18_000_000,
            date: new Date('2027-03-01T12:00:00Z'),
            kind: 'plus_prorate',
          },
          {
            mpPaymentId: 'd-1',
            status: 'approved',
            amount: 15_000_000,
            date: new Date('2027-02-01T12:00:00Z'),
            kind: 'subscription',
          },
        ]}
      />,
    )
    expect(
      screen.getAllByText('Asistente de WhatsApp · meses restantes del plan anual'),
    ).toHaveLength(1)
  })
})
