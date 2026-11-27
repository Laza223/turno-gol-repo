// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PlanSelector from '@/app/(business)/precios/PlanSelector'
import CalculadoraClavo from '@/app/(business)/precios/CalculadoraClavo'
import { catalogPricing, COURT_COUNT_PRICE_SLUG } from '@/modules/billing/pricing'
import { metadata } from '@/app/(business)/precios/page'

describe('/precios: precio exacto por cancha', () => {
  it('abre en mensual con tres canchas a $90.000', () => {
    render(<PlanSelector />)
    expect(screen.getByRole('radio', { name: 'Mensual', checked: true })).toBeInTheDocument()
    expect(screen.getByText(/\$\s90\.000$/)).toBeInTheDocument()
    // La prueba de 30 días arranca desde Completo (decisión 2026-11-27).
    const ctas = screen.getAllByRole('link', { name: /probar 30 días gratis/i })
    expect(ctas).toHaveLength(1)
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/register')
  })

  it.each([
    {
      courts: 1,
      monthly: /\$\s30\.000$/,
      annual: /\$\s27\.000$/,
      total: /\$\s324\.000$/,
      saving: /ahorrás \$\s36\.000 al año/i,
    },
    {
      courts: 3,
      monthly: /\$\s90\.000$/,
      annual: /\$\s81\.000$/,
      total: /\$\s972\.000$/,
      saving: /ahorrás \$\s108\.000 al año/i,
    },
    {
      courts: 8,
      monthly: /\$\s240\.000$/,
      annual: /\$\s216\.000$/,
      total: /\$\s2\.592\.000$/,
      saving: /ahorrás \$\s288\.000 al año/i,
    },
    {
      courts: 12,
      monthly: /\$\s360\.000$/,
      annual: /\$\s324\.000$/,
      total: /\$\s3\.888\.000$/,
      saving: /ahorrás \$\s432\.000 al año/i,
    },
  ])(
    '$courts canchas: mensual exacto y anual con 10% de descuento',
    ({ courts, monthly, annual, total, saving }) => {
      render(<PlanSelector />)
      if (courts <= 8) {
        fireEvent.click(screen.getByRole('radio', { name: String(courts) }))
      } else {
        const input = screen.getByRole('spinbutton', { name: /cantidad exacta de canchas/i })
        fireEvent.change(input, { target: { value: '' } })
        expect(input).toHaveValue(null)
        fireEvent.change(input, { target: { value: String(courts) } })
      }
      expect(screen.getByText(monthly)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: /anual/i }))
      expect(screen.getByText(annual)).toBeInTheDocument()
      expect(screen.getByText(total)).toBeInTheDocument()
      expect(screen.getByText(saving)).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /anual/i })).toHaveTextContent('−10%')
      fireEvent.click(screen.getByRole('radio', { name: 'Mensual' }))
      expect(screen.getByText(monthly)).toBeInTheDocument()
      expect(screen.queryByText(saving)).not.toBeInTheDocument()
    },
  )

  it('muestra la base histórica en la calculadora y deja la metadata sin un importe fijo', () => {
    render(<CalculadoraClavo />)
    expect(screen.getByText(/\$\s30\.000\/mes/)).toBeInTheDocument()
    expect(metadata.description).toMatch(/según la cantidad de canchas/i)
  })
})

it('muestra la tabla publicada, el anual prepago y la cotización sin importe para 8+', () => {
  const pricing = catalogPricing({
    slug: COURT_COUNT_PRICE_SLUG,
    priceFirstCourtCents: null,
    priceExtraCourtCents: null,
    annualDiscountBps: null,
  })!
  render(<PlanSelector pricing={pricing} />)
  expect(screen.getByText(/45\.000 por mes/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^5$/ }))
  expect(screen.getByText(/110\.000 por mes/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: /anual/i }))
  expect(screen.getByText(/1\.056\.000 por año/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '8+' }))
  expect(screen.getByRole('link', { name: 'Pedir cotización' })).toHaveAttribute(
    'href',
    expect.stringContaining('8%20canchas'),
  )
  expect(screen.queryByText(/1\.056\.000/)).not.toBeInTheDocument()
})
