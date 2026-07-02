// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PricingGrid } from '@/app/(admin)/canchas/components/PricingGrid'
import { PricingSection } from '@/app/(admin)/canchas/components/PricingSection'
import {
  compressGridToRules,
  expandRulesToGrid,
  type PriceGrid,
} from '@/modules/courts/pricing-grid'
import { formatArs } from '@/lib/format'
import type { PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

afterEach(cleanup)

// Intl es-AR usa espacio no separable tras "$"; el normalizador de
// testing-library lo colapsa a espacio común — igualar para el matcheo.
const money = (cents: number) => formatArs(cents).replace(/ /g, ' ')

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

// Ventana chica (08:00–12:00) para una grilla compacta.
const OPENING: OpeningHours = Object.fromEntries(
  DAYS.map((d) => [d, { open: '08:00', close: '12:00', closed: false }]),
) as OpeningHours

const RULES: PricingRule[] = [
  { days: [...DAYS], from: '08:00', to: '12:00', price: 1000000 },
]

// La grilla es controlada (spec §3.3): el harness cumple el rol de PricingSection.
function GridHarness({
  rules,
  onRules,
}: {
  rules: PricingRule[]
  onRules?: (rules: PricingRule[]) => void
}) {
  const [grid, setGrid] = useState<PriceGrid>(() => expandRulesToGrid(rules, OPENING))
  return (
    <PricingGrid
      openingHours={OPENING}
      grid={grid}
      onGridChange={(next) => {
        setGrid(next)
        onRules?.(compressGridToRules(next, OPENING))
      }}
    />
  )
}

describe('PricingGrid render (controlada)', () => {
  it('dibuja encabezados de días, filas de horas y precios formateados', () => {
    render(<GridHarness rules={RULES} />)

    expect(screen.getByRole('columnheader', { name: 'Lun' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Dom' })).toBeTruthy()
    // Filas: 08:00 y la última operativa 11:00.
    expect(screen.getByRole('rowheader', { name: '08:00' })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: '11:00' })).toBeTruthy()
    // Celda con precio en el formato único de lib/format ("$ 10.000", §8.2).
    expect(screen.getAllByText(money(1000000)).length).toBeGreaterThan(0)
  })

  // Núcleo de #13: editar una celda re-emite reglas comprimidas con el nuevo
  // precio. Sin esto, los tests de render pasaban aunque el editor de celda
  // estuviera roto (toda la grilla de precios sería decorativa).
  it('editar una celda emite la grilla nueva (comprimida con el precio nuevo)', () => {
    const onRules = vi.fn()
    render(<GridHarness rules={RULES} onRules={onRules} />)

    // Click abre el editor de la celda Lun 08:00; click puro (sin pointerdown)
    // no dispara la rama de arrastre → openEditor.
    fireEvent.click(screen.getByRole('button', { name: /Lun 08:00/ }))
    const input = screen.getByLabelText('Precio Lun 08:00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '20000' } }) // $20.000 → 2.000.000 centavos
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRules).toHaveBeenCalled()
    const rules = onRules.mock.calls.at(-1)?.[0] as Array<{ price: number }>
    // La celda editada produce una regla nueva con el precio cargado.
    expect(rules.some((r) => r.price === 2000000)).toBe(true)
    // El resto sigue al precio original.
    expect(rules.some((r) => r.price === 1000000)).toBe(true)
  })
})

describe('PricingSection — plantilla rápida y copiar', () => {
  it('al montar emite las reglas iniciales y las celdas sin precio', () => {
    const onRulesChange = vi.fn()
    render(
      <PricingSection
        openingHours={OPENING}
        initialRules={[]}
        otherCourts={[]}
        onRulesChange={onRulesChange}
      />,
    )
    expect(onRulesChange).toHaveBeenCalled()
    const [rules, meta] = onRulesChange.mock.calls.at(-1)!
    expect(rules).toEqual([])
    expect(meta.emptyCount).toBe(4 * 7) // 4 slots × 7 días, todo vacío
    expect(screen.getByText(/Sin precios todavía/)).toBeTruthy()
  })

  it('"Un precio" + Aplicar llena toda la semana con una sola regla', () => {
    const onRulesChange = vi.fn()
    render(
      <PricingSection
        openingHours={OPENING}
        initialRules={[]}
        otherCourts={[]}
        onRulesChange={onRulesChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Precio por turno'), { target: { value: '20.000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a toda la semana' }))

    const [rules, meta] = onRulesChange.mock.calls.at(-1)!
    expect(rules).toEqual([{ days: [...DAYS], from: '08:00', to: '12:00', price: 2000000 }])
    expect(meta.emptyCount).toBe(0)
    // El resumen legible refleja la regla.
    expect(screen.getByText('Todos los días')).toBeTruthy()
    expect(screen.getByText(money(2000000))).toBeTruthy()
  })

  it('"Lun a Jue / Vie a Dom" aplica el split de semana y finde', () => {
    const onRulesChange = vi.fn()
    render(
      <PricingSection
        openingHours={OPENING}
        initialRules={[]}
        otherCourts={[]}
        onRulesChange={onRulesChange}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Lun a Jue / Vie a Dom' }))
    fireEvent.change(screen.getByLabelText('Lun a Jue'), { target: { value: '16000' } })
    fireEvent.change(screen.getByLabelText('Vie a Dom'), { target: { value: '22000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a toda la semana' }))

    const [rules] = onRulesChange.mock.calls.at(-1)!
    expect(rules).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '12:00', price: 1600000 },
      { days: ['fri', 'sat', 'sun'], from: '08:00', to: '12:00', price: 2200000 },
    ])
  })

  it('copiar precios de otra cancha replica sus reglas', () => {
    const onRulesChange = vi.fn()
    render(
      <PricingSection
        openingHours={OPENING}
        initialRules={[]}
        otherCourts={[{ id: 'c1', name: 'Cancha 1', rules: RULES }]}
        onRulesChange={onRulesChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))

    const [rules, meta] = onRulesChange.mock.calls.at(-1)!
    expect(rules).toEqual(RULES)
    expect(meta.emptyCount).toBe(0)
  })

  it('"Ajustar por hora" está plegado y expande la matriz', () => {
    render(
      <PricingSection
        openingHours={OPENING}
        initialRules={RULES}
        otherCourts={[]}
        onRulesChange={() => {}}
      />,
    )

    expect(screen.queryByRole('columnheader', { name: 'Lun' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Ajustar por hora' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('columnheader', { name: 'Lun' })).toBeTruthy()
  })
})
