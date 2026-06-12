// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PaymentMethodSelector from '@/app/(public)/[slug]/reservar/components/PaymentMethodSelector'

afterEach(() => cleanup())

function radios(): HTMLInputElement[] {
  return screen.queryAllByRole('radio') as HTMLInputElement[]
}

describe('PaymentMethodSelector', () => {
  it('renderiza solo los métodos habilitados por el tenant (cash + transfer)', () => {
    render(<PaymentMethodSelector methods={['cash', 'transfer']} />)
    expect(screen.getByText('Efectivo')).toBeTruthy()
    expect(screen.getByText('Transferencia')).toBeTruthy()
    expect(screen.queryByText('MercadoPago')).toBeNull()
    expect(radios()).toHaveLength(2)
  })

  it('con solo efectivo habilitado no muestra transferencia', () => {
    render(<PaymentMethodSelector methods={['cash']} />)
    expect(screen.getByText('Efectivo')).toBeTruthy()
    expect(screen.queryByText('Transferencia')).toBeNull()
    expect(radios()).toHaveLength(1)
  })

  it('con solo transferencia habilitada no muestra efectivo', () => {
    render(<PaymentMethodSelector methods={['transfer']} />)
    expect(screen.getByText('Transferencia')).toBeTruthy()
    expect(screen.queryByText('Efectivo')).toBeNull()
  })

  it('los radios viajan como campo "pay" con el primer método pre-seleccionado', () => {
    render(<PaymentMethodSelector methods={['cash', 'transfer']} />)
    const inputs = radios()
    expect(inputs.map((r) => r.name)).toEqual(['pay', 'pay'])
    expect(inputs.map((r) => r.value)).toEqual(['cash', 'transfer'])
    expect(inputs[0]!.checked).toBe(true)
    expect(inputs[1]!.checked).toBe(false)
  })

  it('con seña (solo MercadoPago) muestra la card MP seleccionada y la nota de seña obligatoria', () => {
    render(<PaymentMethodSelector methods={['mercadopago']} />)
    expect(screen.getByText('MercadoPago')).toBeTruthy()
    expect(screen.queryByText('Efectivo')).toBeNull()
    expect(radios()[0]!.checked).toBe(true)
    expect(screen.getByText(/pide seña online/)).toBeTruthy()
  })

  it('sin métodos no renderiza nada', () => {
    const { container } = render(<PaymentMethodSelector methods={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('los iconos son SVGs inline, no imágenes externas', () => {
    const { container } = render(<PaymentMethodSelector methods={['cash', 'transfer']} />)
    expect(container.querySelectorAll('svg').length).toBe(2)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})
