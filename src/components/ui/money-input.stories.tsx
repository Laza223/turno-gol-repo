import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { MoneyInput } from './money-input'

/**
 * Control de plata único (visión v2 §6.3). Dos modos de uso reales:
 * - Controlado (`valueCents`/`onValueChange`): la mayoría de los forms.
 * - No controlado con `name` (`defaultValueCents` + hidden input en centavos):
 *   forms que leen FormData directo (BookingFormModal).
 */
function ControlledDemo() {
  const [cents, setCents] = useState<number | null>(null)
  return (
    <div className="w-72 space-y-2">
      <MoneyInput id="monto" valueCents={cents} onValueChange={setCents} />
      <p className="text-xs text-muted-foreground">
        Centavos: <span className="font-mono">{cents ?? 'null'}</span>
      </p>
    </div>
  )
}

const meta = {
  title: 'Design System/MoneyInput',
  component: MoneyInput,
  parameters: { layout: 'centered' },
  args: { id: 'monto' },
  decorators: [(Story) => <div className="w-72"><Story /></div>],
} satisfies Meta<typeof MoneyInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ConValorInicial: Story = { args: { defaultValueCents: 1_600_000 } }

/** Tipear "25000" muestra "25.000" con separador de miles — nunca dígitos crudos. */
export const FormateaMientrasSeTipea: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, '25000')
    await expect(input).toHaveValue('25.000')
  },
}

/** $25.000 vs $25: el error de magnitud clásico (🔴 auditoría 2026-08-01 §4.4) queda imposible de tipear sin verlo. */
export const RelecturaEnPalabras: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, '25000')
    await expect(canvas.getByText(/veinticinco mil pesos/)).toBeInTheDocument()
  },
}

/** Bajo el umbral ($10.000) no hay relectura — evita ruido en montos chicos (una gaseosa, un vuelto). */
export const SinRelecturaBajoElUmbral: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, '2500')
    await expect(input).toHaveValue('2.500')
    await expect(canvas.queryByText(/pesos$/)).not.toBeInTheDocument()
  },
}

/** `onValueChange` entrega SIEMPRE centavos, nunca el string formateado. */
export const EntregaCentavos: Story = {
  render: () => <ControlledDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox')
    await userEvent.type(input, '25000')
    await expect(canvas.getByText('2500000')).toBeInTheDocument()
  },
}

/** Modo no controlado: `name` + `defaultValueCents` — el hidden input viaja en centavos, listo para FormData. */
export const NoControladoConHiddenInput: Story = {
  args: { name: 'amountPesos', defaultValueCents: 800_000 },
  play: async ({ canvasElement }) => {
    const hidden = canvasElement.querySelector('input[type="hidden"][name="amountPesos"]')
    await expect(hidden).toHaveValue('800000')
  },
}

export const Disabled: Story = { args: { disabled: true, defaultValueCents: 500_000 } }
