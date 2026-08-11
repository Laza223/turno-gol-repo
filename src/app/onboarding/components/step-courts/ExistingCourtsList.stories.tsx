import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { courtFutbol5, courtFutbol7, courtFutbol11 } from '@/test/fixtures/court'
import { ExistingCourtsList } from './ExistingCourtsList'

const meta = {
  title: 'Onboarding/StepCourts/ExistingCourtsList',
  component: ExistingCourtsList,
  parameters: { layout: 'padded' },
  // Vive dentro del <form> del paso 3, a su vez dentro de `.card-premium` (ver
  // page.tsx del wizard) — reproducirlo importa para el contraste real.
  decorators: [
    (Story) => (
      <div className="card-premium max-w-lg rounded-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExistingCourtsList>

export default meta
type Story = StoryObj<typeof meta>

/** Cancha ya creada con precio cargado — muestra "Fútbol N · $ precio". */
export const ConPrecio: Story = {
  args: { courts: [courtFutbol5()] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancha 1')).toBeInTheDocument()
    await expect(canvas.getByText(/Fútbol 5/)).toHaveTextContent('$')
  },
}

/** Cancha sin ninguna regla de precio cargada: el "desde" no se muestra. */
export const SinPrecio: Story = {
  args: {
    courts: [{ ...courtFutbol7(), pricing: { rules: [] } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByText(/Fútbol 7/)
    await expect(row).not.toHaveTextContent('$')
  },
}

export const VariasCanchas: Story = {
  args: {
    courts: [courtFutbol5(), courtFutbol7(), { ...courtFutbol11(), pricing: { rules: [] } }],
  },
}
