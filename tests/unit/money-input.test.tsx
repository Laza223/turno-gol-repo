// @vitest-environment happy-dom
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { MoneyInput } from '@/components/ui/money-input'

afterEach(() => cleanup())

function Controlled() {
  const [cents, setCents] = useState<number | null>(null)
  return (
    <div>
      <MoneyInput id="monto" valueCents={cents} onValueChange={setCents} />
      <output data-testid="cents">{cents ?? 'null'}</output>
    </div>
  )
}

describe('MoneyInput', () => {
  it('formatea con separador de miles mientras se tipea', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25000' } })
    expect(input.value).toBe('25.000')
  })

  it('entrega centavos por onValueChange, nunca el string formateado', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(screen.getByTestId('cents').textContent).toBe('2500000')
  })

  it('$25 vs $25.000: el error de magnitud clásico no puede pasar sin verse', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '25' } })
    expect(input.value).toBe('25')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(input.value).toBe('25.000')
    expect(input.value).not.toBe('25')
  })

  it('relee el monto en palabras arriba del umbral ($10.000)', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '25000' } })
    expect(screen.getByText(/veinticinco mil pesos/)).toBeTruthy()
  })

  it('no relee en palabras bajo el umbral', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '2500' } })
    expect(screen.queryByText(/pesos$/)).toBeNull()
  })

  it('modo no controlado: name + defaultValueCents renderiza hidden input en centavos', () => {
    const { container } = render(<MoneyInput name="amountPesos" defaultValueCents={800_000} />)
    const hidden = container.querySelector(
      'input[type="hidden"][name="amountPesos"]',
    ) as HTMLInputElement
    expect(hidden).toBeTruthy()
    expect(hidden.value).toBe('800000')
  })

  it('modo no controlado: tipear actualiza el hidden input', () => {
    const { container } = render(<MoneyInput name="amountPesos" />)
    const visible = screen.getByRole('textbox')
    fireEvent.change(visible, { target: { value: '15000' } })
    const hidden = container.querySelector(
      'input[type="hidden"][name="amountPesos"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('1500000')
  })

  it('clampea a maxCents recién al perder el foco, no en cada tecla', () => {
    render(<MoneyInput id="monto" maxCents={1_000_000} defaultValueCents={0} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '15000' } })
    expect(input.value).toBe('15.000') // sin clampear todavía
    fireEvent.blur(input)
    expect(input.value).toBe('10.000') // clampeado a maxCents=1_000_000 (=$10.000)
  })
})

/**
 * F-020 (QA de producción 2026-08-17): "el campo de precio corrige el número en
 * silencio" — se reportó que tipear `-500` guardaba $500 sin que el dueño lo
 * viera. La corrección existe (el signo no es un dígito), pero NO es silenciosa:
 * el display se reescribe normalizado en la misma tecla, así que lo que se ve es
 * lo que se guarda. Estos casos fijan esa propiedad para que siga siendo cierta.
 */
describe('MoneyInput — entrada inválida normalizada a la vista', () => {
  it('el signo menos no llega al campo: lo que se ve es lo que se guarda', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '-500' } })
    expect(input.value).toBe('500')
    expect(screen.getByTestId('cents').textContent).toBe('50000')
  })

  it('descarta cualquier basura tipeada y muestra el número resultante', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1a2b3c' } })
    expect(input.value).toBe('123')
    expect(screen.getByTestId('cents').textContent).toBe('12300')
  })

  it('un campo con solo caracteres inválidos queda vacío, no en cero', () => {
    render(<Controlled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '---' } })
    expect(input.value).toBe('')
    expect(screen.getByTestId('cents').textContent).toBe('null')
  })
})
