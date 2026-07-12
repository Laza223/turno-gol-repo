import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import PlanSelector from './PlanSelector'

/** Vive en la sección "Planes" de /precios, sobre el fondo oscuro fijo (`(business)/layout.tsx`). */
const meta = {
  title: 'Public/Precios/PlanSelector',
  component: PlanSelector,
  parameters: { layout: 'padded', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1240px] text-slate-300" style={{ background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlanSelector>

export default meta
type Story = StoryObj<typeof meta>

/** Estado inicial: 3 canchas → plan Complejo activo, ciclo mensual. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: '3', checked: true })).toBeInTheDocument()
    await expect(canvas.getByText('Para tus canchas')).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { name: 'Complejo' })).toBeInTheDocument()
  },
}

/** 1-2 canchas → Predio. */
export const PlanPredio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '1' }))
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Predio')
  },
}

/** 8+ canchas → Estadio (canchas ilimitadas). */
export const PlanEstadio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '8+' }))
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('Estadio')
  },
}

/** Ciclo anual: precio tachado + "Ahorrás $X al año" en la card activa. */
export const CicloAnual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /anual/i }))
    await expect(canvas.getByText(/ahorrás \$204\.000 al año/i)).toBeInTheDocument()
  },
}
