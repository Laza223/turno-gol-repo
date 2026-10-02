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

/** Estado inicial: tres canchas, mensual a $90.000. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: '3', checked: true })).toBeInTheDocument()
    await expect(canvas.getByText('Para tus canchas')).toBeInTheDocument()
    await expect(canvas.getByRole('radio', { name: 'Mensual', checked: true })).toBeInTheDocument()
    await expect(canvas.getByText(/\$\s90\.000$/)).toBeInTheDocument()
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('TurnoGol')
  },
}

/** Cuatro canchas: $120.000, sin bandas. */
export const CuatroCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '4' }))
    await expect(canvas.getByText(/\$\s120\.000$/)).toBeInTheDocument()
  },
}

/** Una cancha: $30.000. */
export const UnaCancha: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '1' }))
    await expect(canvas.getByText(/\$\s30\.000$/)).toBeInTheDocument()
    await expect(canvas.getByText(/tu plan es/i)).toHaveTextContent('TurnoGol')
  },
}

/** Ocho canchas exactas: $240.000. */
export const OchoCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: '8' }))
    await expect(canvas.getByText(/\$\s240\.000$/)).toBeInTheDocument()
  },
}

/** Tres canchas en anual: $81.000 por mes, ahorro de $108.000 al año. */
export const CicloAnual: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: /anual/i }))
    await expect(canvas.getByText(/ahorrás \$\s?108\.000 al año/i)).toBeInTheDocument()
  },
}

export const DoceCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('spinbutton', { name: /cantidad exacta de canchas/i })
    await userEvent.clear(input)
    await userEvent.type(input, '12')
    await expect(canvas.getByText(/\$\s360\.000$/)).toBeInTheDocument()
  },
}
