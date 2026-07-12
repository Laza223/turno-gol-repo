import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import CalculadoraClavo from './CalculadoraClavo'

// `formatArs` (Intl.NumberFormat es-AR) separa "$" del monto con un espacio
// NO-BREAK (U+00A0), no un espacio común — un literal '$30.000' o '$ 30.000'
// (space normal) nunca matchea el DOM real.
const nbsp = ' '

/** Vive en la sección "Hacé tu cuenta" de /precios, sobre el fondo oscuro fijo (`(business)/layout.tsx`). */
const meta = {
  title: 'Public/Precios/CalculadoraClavo',
  component: CalculadoraClavo,
  parameters: { layout: 'padded', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1080px] text-slate-300" style={{ background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalculadoraClavo>

export default meta
type Story = StoryObj<typeof meta>

/** Estado inicial: preset $30.000 × 2 clavos/semana → pérdida mensual > precio del plan más barato. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: `$${nbsp}30.000`, pressed: true })).toBeInTheDocument()
    await expect(canvas.getByText(`$${nbsp}240.000`)).toBeInTheDocument()
    await expect(canvas.getByText(/menos que lo que te llevan los clavos/i)).toBeInTheDocument()
  },
}

/** Turno personalizado (fuera de los presets): el input libre queda como fuente del cálculo. */
export const TurnoPersonalizado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText(/a cuánto está tu turno/i)
    await userEvent.clear(input)
    await userEvent.type(input, '18000')
    await expect(canvas.getByText(`$${nbsp}144.000`)).toBeInTheDocument()
  },
}

/** Cero clavos: mensaje de felicitación, sin la cuenta de pérdida. */
export const CeroClavos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Un clavo menos por semana' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Un clavo menos por semana' }))
    await expect(canvas.getByText(/enhorabuena — sos la excepción/i)).toBeInTheDocument()
  },
}

/** Pérdida mensual por debajo del precio del plan: sin el remate "menos que los clavos". */
export const PerdidaMenorAlPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText(/a cuánto está tu turno/i)
    await userEvent.clear(input)
    await userEvent.type(input, '10000')
    await userEvent.click(canvas.getByRole('button', { name: 'Un clavo menos por semana' }))
    await expect(canvas.getByText(`$${nbsp}40.000`)).toBeInTheDocument()
    await expect(canvas.queryByText(/menos que lo que te llevan los clavos/i)).not.toBeInTheDocument()
  },
}
