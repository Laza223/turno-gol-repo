import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import type { PayMethod } from '@/lib/booking/reserve-url'
import { RESERVAR_COLUMN } from '../CheckoutStates'
import PaymentMethodSelector from './PaymentMethodSelector'

/**
 * El estado vive en quien lo monta (`CheckoutFlow`), así que la story lo pone igual: con
 * `useState`, para que elegir se vea y se pueda probar.
 */
function Controlled({
  methods,
  hidePrices,
  note,
}: {
  methods: PayMethod[]
  hidePrices?: boolean
  note?: string
}) {
  const [value, setValue] = useState<PayMethod | null>(methods[0] ?? null)
  return (
    <PaymentMethodSelector
      methods={methods}
      value={value}
      onChange={setValue}
      hidePrices={hidePrices}
    >
      {note}
    </PaymentMethodSelector>
  )
}

const REGLA = 'Podés cancelar desde Mis reservas.'

const meta = {
  title: 'Player/Checkout/PaymentMethodSelector',
  component: PaymentMethodSelector,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <div className={RESERVAR_COLUMN}>
            <Story />
          </div>
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof PaymentMethodSelector>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña: la línea de MercadoPago y la promesa de la decisión v2 D1. Nada que elegir. */
export const ConSena: Story = {
  args: { methods: ['mercadopago'], value: 'mercadopago', onChange: () => {} },
  render: () => <Controlled methods={['mercadopago']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pagás la seña online con MercadoPago.')).toBeVisible()
    await expect(canvas.getByText('La cancha es tuya cuando empezás a señar.')).toBeVisible()
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument()
  },
}

/**
 * Con seña y precios ocultos el resumen no puede decir "el resto": lo dice esta sección, que es la
 * única que habla de cómo se paga.
 */
export const ConSenaPreciosOcultos: Story = {
  args: { methods: ['mercadopago'], value: 'mercadopago', onChange: () => {} },
  render: () => <Controlled methods={['mercadopago']} hidePrices />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.',
      ),
    ).toBeVisible()
    await expect(canvasElement.textContent).not.toContain('$')
  },
}

/** Sin seña y con efectivo Y transferencia: se elige entre los dos, con el teclado también. */
export const DosMetodos: Story = {
  args: { methods: ['cash', 'transfer'], value: 'cash', onChange: () => {} },
  render: () => <Controlled methods={['cash', 'transfer']} note={REGLA} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El ritmo: 12 px bajo el título de la sección y la regla de cancelación ADENTRO, a 8 px.
    const legend = canvasElement.querySelector('legend')!
    await expect(getComputedStyle(legend).marginBottom).toBe('12px')
    const regla = canvas.getByText(REGLA)
    await expect(regla.closest('fieldset')?.lastElementChild).toBe(regla)
    await expect(getComputedStyle(regla).marginTop).toBe('8px')
    await expect(canvas.getByRole('radio', { name: /efectivo/i })).toBeChecked()
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).not.toBeChecked()

    await userEvent.click(canvas.getByText('Transferencia'))
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).toBeChecked()
    await expect(canvas.getByRole('radio', { name: /efectivo/i })).not.toBeChecked()
  },
}

/** Con un solo método no hay nada que elegir: una línea, sin tarjetas. */
export const UnSoloMetodo: Story = {
  args: { methods: ['transfer'], value: 'transfer', onChange: () => {} },
  render: () => <Controlled methods={['transfer']} note={REGLA} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pagás en el complejo, por transferencia.')).toBeVisible()
    await expect(canvas.getByText(REGLA).closest('section')).not.toBeNull()
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument()
  },
}

/**
 * Sin métodos configurados (sin seña y sin efectivo ni transferencia): no hay qué elegir, pero la
 * sección dice igual cómo se paga, con la regla de cancelación adentro.
 */
export const SinMetodos: Story = {
  args: { methods: [], value: null, onChange: () => {} },
  render: () => <Controlled methods={[]} note={REGLA} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Cómo pagás' })).toBeVisible()
    await expect(canvas.getByText('Pagás en el complejo.')).toBeVisible()
    await expect(canvas.getByText(REGLA).closest('section')).not.toBeNull()
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument()
  },
}
