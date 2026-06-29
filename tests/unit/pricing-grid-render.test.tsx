// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  // Núcleo de #13: editar una celda re-emite reglas comprimidas con el nuevo
  // precio. Sin esto, los tests de render pasaban aunque el editor de celda
  // estuviera roto (toda la grilla de precios sería decorativa).
  it('editar una celda re-emite las reglas con el precio nuevo', () => {
    const onChange = vi.fn()
    render(<PricingGrid openingHours={OPENING} initialRules={RULES} onChange={onChange} />)
    onChange.mockClear() // descartar la emisión de montaje

    // Click abre el editor de la celda Lun 08:00; click puro (sin pointerdown)
    // no dispara la rama de arrastre → openEditor.
    fireEvent.click(screen.getByRole('button', { name: /Lun 08:00/ }))
    const input = screen.getByLabelText('Precio Lun 08:00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '20000' } }) // $20.000 → 2.000.000 centavos
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalled()
    const rules = onChange.mock.calls.at(-1)?.[0] as Array<{ price: number }>
    // La celda editada produce una regla nueva con el precio cargado.
    expect(rules.some((r) => r.price === 2000000)).toBe(true)
    // El resto sigue al precio original.
    expect(rules.some((r) => r.price === 1000000)).toBe(true)
  })
})
