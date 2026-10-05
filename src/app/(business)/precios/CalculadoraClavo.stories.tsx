import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import CalculadoraClavo from './CalculadoraClavo'

// `formatArs` (Intl.NumberFormat es-AR) separa "$" del monto con un espacio
// NO-BREAK (U+00A0). El nombre accesible del <button> (getByRole) preserva
// ese NBSP tal cual, pero `getByText` normaliza el textContent con el
// normalizador default de testing-library (colapsa \s+ a un espacio comun, y
// \s matchea NBSP) - el texto visible queda con espacio comun. Por eso los
// `getByRole(..., { name })` usan `nbsp` y los `getByText(...)` un espacio comun.
const nbsp = ' '

const money = (s: string) => s.replace(/ /g, ' ')

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
    await expect(
      canvas.getByRole('button', { name: `$${nbsp}30.000`, pressed: true }),
    ).toBeInTheDocument()
    await expect(canvas.getByText(money(`$${nbsp}240.000`))).toBeInTheDocument()
    await expect(
      canvas.getByText(/menos que lo que te llevan los turnos colgados/i),
    ).toBeInTheDocument()
  },
}

/** Turno personalizado (fuera de los presets): el input libre queda como fuente del cálculo. */
export const TurnoPersonalizado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText(/a cuánto está tu turno/i)
    await userEvent.clear(input)
    await userEvent.type(input, '18000')
    await expect(canvas.getByText(money(`$${nbsp}144.000`))).toBeInTheDocument()
  },
}

/** Cero clavos: mensaje de felicitación, sin la cuenta de pérdida. */
export const CeroClavos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Un ausente menos por semana' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Un ausente menos por semana' }))
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
    await userEvent.click(canvas.getByRole('button', { name: 'Un ausente menos por semana' }))
    // "$ 40.000" también es uno de los presets de turno: acotamos al resultado (role "status" del <output>).
    const resultado = within(canvas.getByRole('status'))
    await expect(resultado.getByText(money(`$${nbsp}40.000`))).toBeInTheDocument()
    await expect(
      canvas.queryByText(/menos que lo que te llevan los turnos colgados/i),
    ).not.toBeInTheDocument()
  },
}
