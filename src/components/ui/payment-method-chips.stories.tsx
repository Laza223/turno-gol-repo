import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PaymentMethodChips } from './payment-method-chips'
import type { MethodKey } from '@/lib/payment-method'

/**
 * Chip único de método de pago (DESIGN.md §Chips). Reemplaza los `chipClass`
 * a mano de ChargeSection (alta de turno) y RegisterMovementModal (caja).
 */
function ControlledDemo({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<MethodKey>('cash')
  return (
    <div className="w-80 space-y-2">
      <PaymentMethodChips
        aria-label="Método de pago"
        value={value}
        onValueChange={setValue}
        disabled={disabled}
        className="grid grid-cols-4 gap-1.5"
      />
      <p className="text-xs text-muted-foreground">
        Elegido: <span className="font-mono">{value}</span>
      </p>
    </div>
  )
}

const meta = {
  title: 'Design System/PaymentMethodChips',
  component: PaymentMethodChips,
  parameters: { layout: 'centered' },
  // Cada story usa `render` con su propio wrapper controlado y no lee `args`;
  // este default solo satisface el tipo (todas las props son requeridas).
  args: {
    'aria-label': 'Método de pago',
    value: 'cash',
    onValueChange: () => {},
  },
} satisfies Meta<typeof PaymentMethodChips>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: () => <ControlledDemo /> }

export const Disabled: Story = { render: () => <ControlledDemo disabled /> }

/** Elegir "Transferencia" pasa el borde y el fondo a `primary`. */
export const SeleccionarCambiaElEstilo: Story = {
  render: () => <ControlledDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const transferencia = canvas.getByRole('radio', { name: 'Transferencia' })
    await userEvent.click(transferencia)
    await expect(transferencia).toHaveAttribute('data-state', 'checked')
    await expect(canvas.getByText('transfer')).toBeInTheDocument()
  },
}
