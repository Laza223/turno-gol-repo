import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { courtFutbol5, courtFutbol7 } from '@/test/fixtures/court'
import type { Draft } from './step-courts/constants'
import { GridPreview } from './GridPreview'

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    key: 1,
    name: 'Cancha 1',
    format: 5,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    priceCents: null,
    ...overrides,
  }
}

const meta = {
  title: 'Onboarding/GridPreview',
  component: GridPreview,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
  args: { existingCourts: [], drafts: [] },
} satisfies Meta<typeof GridPreview>

export default meta
type Story = StoryObj<typeof meta>

/** Ni canchas creadas ni borradores: no hay nada que dibujar todavía. */
export const SinCanchas: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Agregá una cancha para verla acá.')).toBeInTheDocument()
  },
}

/** Un borrador recién agregado, sin nombre ni precio todavía: columna punteada, "—". */
export const UnBorradorVacio: Story = {
  args: { drafts: [draft({ name: '' })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancha nueva')).toBeInTheDocument()
    await expect(canvas.getByText('—')).toBeInTheDocument()
  },
}

/**
 * Canchas ya creadas (revisita) + un borrador nuevo: la columna del borrador
 * queda punteada para diferenciarla de las que ya existen en DB.
 */
export const ExistentesMasBorrador: Story = {
  args: {
    existingCourts: [courtFutbol5(), courtFutbol7()],
    drafts: [draft({ key: 3, name: 'Cancha 3', priceCents: 1500000 })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cancha 1')).toBeInTheDocument()
    await expect(canvas.getByText('Cancha 2')).toBeInTheDocument()
    await expect(canvas.getByText('Cancha 3')).toBeInTheDocument()
    await expect(canvas.getByText('$ 15.000')).toBeInTheDocument()
  },
}
