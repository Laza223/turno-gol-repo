import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import RatingStars from './RatingStars'

const meta = {
  title: 'Public/RatingStars',
  component: RatingStars,
  parameters: { layout: 'centered' },
  args: { rating: 4.6, count: 28 },
} satisfies Meta<typeof RatingStars>

export default meta
type Story = StoryObj<typeof meta>

export const CompactoConCount: Story = {}

export const CompactoSinCount: Story = {
  args: { count: undefined },
}

export const CompletoEntero: Story = {
  args: { variant: 'full', rating: 5, count: 12 },
}

/** Media estrella: el relleno parcial se logra recortando el ancho del ícono. */
export const CompletoConMedia: Story = {
  args: { variant: 'full', rating: 3.5, count: 6 },
}

/** Complejo sin reseñas todavía — 0 de 5, sin contador. */
export const SinReviews: Story = {
  args: { variant: 'full', rating: 0, count: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: '0.0 de 5 estrellas' })).toBeInTheDocument()
  },
}
