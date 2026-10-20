// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PlanSelector from '@/app/(business)/precios/PlanSelector'
import CalculadoraClavo from '@/app/(business)/precios/CalculadoraClavo'
import { metadata } from '@/app/(business)/precios/page'

describe('/precios: precio exacto por cancha', () => {
  it('abre en mensual con tres canchas a $90.000', () => {
    render(<PlanSelector />)
    expect(screen.getByRole('radio', { name: 'Mensual', checked: true })).toBeInTheDocument()
    expect(screen.getByText(/\$\s90\.000$/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /empezar 30 días gratis/i })).toHaveLength(1)
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

  it('ofrece $30.000 de base también en la calculadora y metadata', () => {
    render(<CalculadoraClavo />)
    expect(screen.getByText(/\$\s30\.000\/mes/)).toBeInTheDocument()
    expect(metadata.description).toMatch(/\$\s30\.000/)
  })
})
