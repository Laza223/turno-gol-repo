// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PaymentMethodSelector from '@/app/(public)/[slug]/reservar/components/PaymentMethodSelector'
import type { PayMethod } from '@/lib/booking/reserve-url'

afterEach(() => cleanup())

const noop = () => {}
const renderSelector = (methods: PayMethod[], value: PayMethod | null = methods[0] ?? null) =>
  render(<PaymentMethodSelector methods={methods} value={value} onChange={noop} />)

const radios = () => screen.queryAllByRole('radio') as HTMLInputElement[]

describe('PaymentMethodSelector — sin seña', () => {
  it('solo si el complejo acepta efectivo Y transferencia se elige entre los dos', () => {
    renderSelector(['cash', 'transfer'])

    expect(screen.getByRole('group', { name: 'Cómo pagás en el complejo' })).toBeTruthy()
    expect(radios().map((r) => r.value)).toEqual(['cash', 'transfer'])
    expect(radios().map((r) => r.name)).toEqual(['pay', 'pay'])
    expect(screen.getByRole('radio', { name: /Efectivo/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Transferencia/ })).toBeTruthy()
  })

  it('el radio marcado es el del estado de quien lo monta, no una copia propia', () => {
    const { rerender } = renderSelector(['cash', 'transfer'], 'transfer')
    expect(radios().map((r) => r.checked)).toEqual([false, true])

    rerender(<PaymentMethodSelector methods={['cash', 'transfer']} value="cash" onChange={noop} />)
    expect(radios().map((r) => r.checked)).toEqual([true, false])
  })

  it('elegir el otro avisa cuál es', () => {
    const onChange = vi.fn()
    render(
      <PaymentMethodSelector methods={['cash', 'transfer']} value="cash" onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('radio', { name: /Transferencia/ }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('transfer')
  })

  it.each([
    ['cash', 'Pagás en el complejo, en efectivo.'],
    ['transfer', 'Pagás en el complejo, por transferencia.'],
  ] as const)('con un solo método (%s) es una línea, sin tarjetas ni radios', (method, line) => {
    const { container } = renderSelector([method])

    expect(screen.getByText(line)).toBeTruthy()
    expect(radios()).toHaveLength(0)
    expect(container.querySelector('fieldset')).toBeNull()
  })

  it('sin métodos (ni efectivo ni transferencia) es una línea que dice dónde se paga, sin elegir', () => {
    const { container } = renderSelector([])

    expect(screen.getByText('Pagás en el complejo.')).toBeTruthy()
    expect(radios()).toHaveLength(0)
    expect(container.querySelector('fieldset')).toBeNull()
  })
})

describe('PaymentMethodSelector — con seña', () => {
  it('es la línea de MercadoPago y la promesa de la decisión v2 D1, sin nada que elegir', () => {
    renderSelector(['mercadopago'])

    expect(screen.getByText('Pagás la seña online con MercadoPago.')).toBeTruthy()
    expect(screen.getByText('La cancha es tuya cuando empezás a señar.')).toBeTruthy()
    expect(radios()).toHaveLength(0)
  })
})

describe('PaymentMethodSelector — lo que sigue a cómo se paga', () => {
  it('la regla va adentro de la sección, al final, en las cuatro formas de la sección', () => {
    const nota = 'Podés cancelar desde Mis reservas.'
    for (const methods of [['cash', 'transfer'], ['cash'], ['mercadopago'], []] as PayMethod[][]) {
      const { unmount } = render(
        <PaymentMethodSelector methods={methods} value={methods[0] ?? null} onChange={noop}>
          {nota}
        </PaymentMethodSelector>,
      )
      const seccion = screen.getByText(nota).closest('section, fieldset')!
      expect(seccion.lastElementChild).toBe(screen.getByText(nota))
      unmount()
    }
  })

  it('sin métodos dice igual "Pagás en el complejo.", sin elegir, y la regla sigue adentro', () => {
    render(
      <PaymentMethodSelector methods={[]} value={null} onChange={noop}>
        Podés cancelar desde Mis reservas.
      </PaymentMethodSelector>,
    )
    expect(screen.getByRole('heading', { name: 'Cómo pagás' })).toBeTruthy()
    expect(screen.getByText('Pagás en el complejo.')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText('Podés cancelar desde Mis reservas.')).toBeTruthy()
  })

  it('con seña y precios ocultos la línea dice también que el resto es en el complejo', () => {
    render(
      <PaymentMethodSelector
        methods={['mercadopago']}
        value="mercadopago"
        onChange={noop}
        hidePrices
      />,
    )
    expect(
      screen.getByText(
        'Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Pagás la seña online con MercadoPago.')).toBeNull()
  })
})
