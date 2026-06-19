// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PricingGrid } from '@/app/(admin)/canchas/components/PricingGrid'
import type { PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

afterEach(cleanup)

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

// Ventana chica (08:00–12:00) para una grilla compacta.
const OPENING: OpeningHours = Object.fromEntries(
  DAYS.map((d) => [d, { open: '08:00', close: '12:00', closed: false }]),
) as OpeningHours

const RULES: PricingRule[] = [
  { days: [...DAYS], from: '08:00', to: '12:00', price: 1000000 },
]

describe('PricingGrid render', () => {
  it('dibuja encabezados de días, filas de horas y precios formateados', () => {
    render(<PricingGrid openingHours={OPENING} initialRules={RULES} onChange={() => {}} />)

    expect(screen.getByRole('columnheader', { name: 'Lun' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Dom' })).toBeTruthy()
    // Filas: 08:00 y la última operativa 11:00.
    expect(screen.getByRole('rowheader', { name: '08:00' })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: '11:00' })).toBeTruthy()
    // Celda con precio formateado en pesos.
    expect(screen.getAllByText('$10.000').length).toBeGreaterThan(0)
  })

  it('emite las reglas comprimidas al montar', () => {
    const onChange = vi.fn()
    render(<PricingGrid openingHours={OPENING} initialRules={RULES} onChange={onChange} />)

    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall).toEqual([
      { days: [...DAYS], from: '08:00', to: '12:00', price: 1000000 },
    ])
  })
})
