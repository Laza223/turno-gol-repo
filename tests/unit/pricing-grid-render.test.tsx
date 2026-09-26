// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PricingGrid } from '@/app/(admin)/canchas/components/PricingGrid'
import { PriceSetup } from '@/app/(admin)/canchas/components/price-setup/PriceSetup'
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

const RULES: PricingRule[] = [{ days: [...DAYS], from: '08:00', to: '12:00', price: 1000000 }]

// La grilla es controlada (spec §3.3): el harness cumple el rol de PriceSetup.
function GridHarness({
  rules,
  onRules,
}: {
  rules: PricingRule[]
  onRules?: (rules: PricingRule[]) => void
}) {
  const [grid, setGrid] = useState<PriceGrid>(() => expandRulesToGrid(rules, OPENING, false))
  return (
    <PricingGrid
      openingHours={OPENING}
      closesNextDay={false}
      grid={grid}
      onGridChange={(next) => {
        setGrid(next)
        onRules?.(compressGridToRules(next, OPENING, false))
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

// Bug real "El Vagón Deportivo": la grilla mostraba precios SOLO en Sábado y
// lun-vie aparecían como puntos inertes ("·", sin editor) porque
// activeHoursForDay/getOperativeHours no conocían closesNextDay. Este test
// reproduce el layout real (lun-vie 08:00→01:00, closesNextDay) contra el
// componente completo, no solo la función pura.
describe('PricingGrid render — closesNextDay (madrugada)', () => {
  const NEXT_DAY_OPENING: OpeningHours = {
    mon: { open: '08:00', close: '01:00', closed: false },
    tue: { open: '08:00', close: '01:00', closed: false },
    wed: { open: '08:00', close: '01:00', closed: false },
    thu: { open: '08:00', close: '01:00', closed: false },
    fri: { open: '08:00', close: '01:00', closed: false },
    sat: { open: '08:00', close: '22:00', closed: false },
    sun: { open: '08:00', close: '22:00', closed: true },
  }

  function NextDayHarness() {
    const [grid, setGrid] = useState<PriceGrid>({} as PriceGrid)
    return (
      <PricingGrid
        openingHours={NEXT_DAY_OPENING}
        closesNextDay
        grid={grid}
        onGridChange={setGrid}
      />
    )
  }

  it('dibuja la fila de madrugada (00:00) como celda editable de lunes, no como punto inerte', () => {
    render(<NextDayHarness />)
    // Antes del fix esta fila ni se dibujaba: getOperativeHours devolvía
    // como máximo 23 (sat cerraba antes) y activeHoursForDay('mon') era [].
    expect(screen.getByRole('rowheader', { name: '00:00' })).toBeTruthy()
    // Celda de lunes 00:00 (post-medianoche, mismo día operativo): activa y
    // clickeable — ANTES del fix era un "·" sin aria-label, imposible de
    // editar, exactamente el síntoma reportado.
    expect(screen.getByRole('button', { name: 'Lun 00:00 sin precio' })).toBeTruthy()
  })

  it('domingo (cerrado) sigue sin fila editable a las 00:00: la fila nueva no infla días que no operan', () => {
    render(<NextDayHarness />)
    expect(screen.queryByRole('button', { name: /^Dom 00:00/ })).not.toBeInTheDocument()
  })
})

describe('PriceSetup — precio del turno', () => {
  function renderSetup(
    props: Partial<{
      initialRules: PricingRule[]
      otherCourts: { id: string; name: string; rules: PricingRule[] }[]
      openingHours: OpeningHours
    }> = {},
  ) {
    const onRulesChange = vi.fn()
    render(
      <PriceSetup
        openingHours={props.openingHours ?? OPENING}
        closesNextDay={false}
        initialRules={props.initialRules ?? []}
        otherCourts={props.otherCourts ?? []}
        onRulesChange={onRulesChange}
      />,
    )
    const last = () => onRulesChange.mock.calls.at(-1)! as [PricingRule[], { emptyCount: number }]
    return { onRulesChange, last }
  }

  const answer = (question: string, value: 'Sí' | 'No') =>
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: question })).getByRole('radio', {
        name: value,
      }),
    )

  it('al montar emite las reglas iniciales y las horas sin precio', () => {
    const { onRulesChange, last } = renderSetup()
    expect(onRulesChange).toHaveBeenCalled()
    const [rules, meta] = last()
    expect(rules).toEqual([])
    expect(meta.emptyCount).toBe(4 * 7) // 4 turnos × 7 días, todo vacío
  })

  // Lo que pedía la plantilla vieja ("Aplicar a toda la semana") era el paso
  // que nadie entendía: acá lo que se tipea ya queda cargado.
  it('un solo precio llena toda la semana al tipearlo, sin botón de aplicar', () => {
    const { last } = renderSetup()

    fireEvent.change(screen.getByLabelText('Precio del turno'), { target: { value: '20.000' } })

    const [rules, meta] = last()
    expect(rules).toEqual([{ days: [...DAYS], from: '08:00', to: '12:00', price: 2000000 }])
    expect(meta.emptyCount).toBe(0)
    expect(screen.queryByRole('button', { name: /Aplicar/ })).toBeNull()
  })

  it('"¿Cobrás distinto a la noche?" separa el día de la noche con un corte', () => {
    const { last } = renderSetup()
    answer('¿Cobrás distinto a la noche?', 'Sí')

    // Con 08–12 el corte por defecto cae en el medio: 10:00.
    fireEvent.change(screen.getByLabelText('Precio hasta las 10:00'), {
      target: { value: '16000' },
    })
    // Falta la noche: esas horas siguen sin precio y el guardado se frenaría.
    expect(last()[1].emptyCount).toBe(2 * 7)

    fireEvent.change(screen.getByLabelText('Precio desde las 10:00'), {
      target: { value: '22000' },
    })
    const [rules, meta] = last()
    expect(meta.emptyCount).toBe(0)
    expect(rules).toEqual([
      { days: [...DAYS], from: '08:00', to: '10:00', price: 1600000 },
      { days: [...DAYS], from: '10:00', to: '12:00', price: 2200000 },
    ])
  })

  it('"¿Algún día cobrás distinto?" propone viernes a domingo y cobra aparte esos días', () => {
    const { last } = renderSetup()
    answer('¿Algún día cobrás distinto?', 'Sí')

    fireEvent.change(screen.getByLabelText('Precio Lun a Jue'), { target: { value: '16000' } })
    fireEvent.change(screen.getByLabelText('Precio Vie a Dom'), { target: { value: '22000' } })

    expect(last()[0]).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '12:00', price: 1600000 },
      { days: ['fri', 'sat', 'sun'], from: '08:00', to: '12:00', price: 2200000 },
    ])
  })

  it('"Igual que Cancha 1" copia sus precios de un toque y queda marcado', () => {
    const { last } = renderSetup({ otherCourts: [{ id: 'c1', name: 'Cancha 1', rules: RULES }] })

    const same = screen.getByRole('button', { name: /Igual que Cancha 1/ })
    expect(same.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(same)

    const [rules, meta] = last()
    expect(rules).toEqual(RULES)
    expect(meta.emptyCount).toBe(0)
    expect(same.getAttribute('aria-pressed')).toBe('true')
    // El precio copiado se ve en el campo, para cambiarlo si hace falta.
    expect((screen.getByLabelText('Precio del turno') as HTMLInputElement).value).toMatch(/10\.000/)
  })

  it('canchas con el mismo precio salen como una sola opción', () => {
    renderSetup({
      otherCourts: [
        { id: 'c1', name: 'Cancha 1', rules: RULES },
        { id: 'c2', name: 'Cancha 2', rules: RULES },
      ],
    })
    expect(screen.getAllByRole('button', { name: /Igual que/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Igual que Cancha 1 y Cancha 2/ })).toBeTruthy()
  })

  // Auto-relleno al abrir el editor (decisión del dueño): una cancha vieja
  // con huecos —o un horario recién ampliado— no debe mostrar horas vacías
  // apenas se abre. Reproduce el caso real: precio cargado SOLO en sábado.
  it('auto-completa las horas vacías al montar y avisa cuántas', () => {
    const { last } = renderSetup({
      initialRules: [{ days: ['sat'], from: '08:00', to: '12:00', price: 500000 }],
    })

    const [rules, meta] = last()
    expect(meta.emptyCount).toBe(0)
    expect(rules.every((r) => r.price === 500000)).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/Completamos 24 horas/)
  })

  it('sin huecos que rellenar, no muestra ningún aviso de auto-relleno', () => {
    renderSetup({ initialRules: RULES })
    expect(screen.queryByText(/Completamos/)).toBeNull()
  })

  it('"Ajustar hora por hora" está plegado y expande la grilla', () => {
    renderSetup({ initialRules: RULES })

    expect(screen.queryByRole('columnheader', { name: 'Lun' })).toBeNull()
    const toggle = screen.getByRole('button', { name: /Ajustar hora por hora/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('columnheader', { name: 'Lun' })).toBeTruthy()
  })

  // Tres franjas no entran en las dos preguntas: las preguntas se esconden en
  // vez de pisar lo cargado, y volver a lo simple es una decisión explícita.
  it('precios que no entran en las dos preguntas no se pisan: quedan hora por hora', () => {
    const threeBands: PricingRule[] = [
      { days: [...DAYS], from: '08:00', to: '09:00', price: 900000 },
      { days: [...DAYS], from: '09:00', to: '11:00', price: 1100000 },
      { days: [...DAYS], from: '11:00', to: '12:00', price: 1300000 },
    ]
    const { last } = renderSetup({ initialRules: threeBands })

    expect(screen.queryByRole('radiogroup', { name: '¿Cobrás distinto a la noche?' })).toBeNull()
    expect(last()[0]).toEqual(threeBands)

    fireEvent.click(screen.getByRole('button', { name: 'Pasar a un precio simple' }))
    expect(screen.getByRole('radiogroup', { name: '¿Cobrás distinto a la noche?' })).toBeTruthy()
    expect(last()[1].emptyCount).toBe(0)

    // Nada se guardó todavía, pero la vuelta atrás no puede ser cancelar todo el form.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(last()[0]).toEqual(threeBands)
    expect(screen.getByRole('button', { name: 'Pasar a un precio simple' })).toBeTruthy()
  })

  // Un complejo que abre solo el fin de semana: "Sí" no puede dejar a todos los
  // días como "distintos" (quedaba un campo "Precio" sin días).
  it('"¿Algún día cobrás distinto?" siempre deja al menos un día con el precio de siempre', () => {
    const closed = { open: '08:00', close: '12:00', closed: true }
    const weekendOnly: OpeningHours = {
      ...OPENING,
      mon: closed,
      tue: closed,
      wed: closed,
      thu: closed,
      fri: closed,
    }
    renderSetup({ openingHours: weekendOnly })
    answer('¿Algún día cobrás distinto?', 'Sí')

    expect(screen.getByLabelText('Precio Sáb')).toBeTruthy()
    expect(screen.getByLabelText('Precio Dom')).toBeTruthy()
    expect(screen.queryByLabelText('Precio')).toBeNull()
  })

  it('con un solo día abierto no pregunta por "otro día"', () => {
    const closed = { open: '08:00', close: '12:00', closed: true }
    renderSetup({
      openingHours: {
        mon: OPENING.mon,
        tue: closed,
        wed: closed,
        thu: closed,
        fri: closed,
        sat: closed,
        sun: closed,
      },
    })
    expect(screen.queryByRole('radiogroup', { name: '¿Algún día cobrás distinto?' })).toBeNull()
    expect(screen.getByLabelText('Precio del turno')).toBeTruthy()
  })

  it('editar una hora que rompe el precio simple pasa a hora por hora', () => {
    const { last } = renderSetup({ initialRules: RULES })
    fireEvent.click(screen.getByRole('button', { name: /Ajustar hora por hora/ }))

    fireEvent.click(screen.getByRole('button', { name: /Mar 09:00/ }))
    const input = screen.getByLabelText('Precio Mar 09:00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '30000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(last()[0].some((r) => r.price === 3000000)).toBe(true)
    expect(screen.getByRole('button', { name: 'Pasar a un precio simple' })).toBeTruthy()
  })
})
