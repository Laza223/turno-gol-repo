import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { uid } from '@/test/fixtures/ids'
import { reviewItem, reviews } from '@/test/fixtures/public'
import ReviewsSection from './ReviewsSection'

/** En el perfil vive dentro de la card blanca principal (`page.tsx`, `space-y-7`). */
const meta = {
  title: 'Player/TenantProfile/ReviewsSection',
  component: ReviewsSection,
  parameters: { layout: 'padded' },
  args: { tenantId: uid(1) },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReviewsSection>

export default meta
type Story = StoryObj<typeof meta>

/** Sin reseñas todavía: empty state con ícono. */
export const SinResenas: Story = {
  args: { initial: [], total: 0, average: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay reseñas de este complejo.')).toBeInTheDocument()
  },
}

/** Con reseñas y rating promedio, sin más páginas por cargar. */
export const ConResenas: Story = {
  args: { initial: reviews(), total: reviews().length, average: 4.3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Reseña verificada')).toHaveLength(3)
    await expect(canvas.queryByRole('button', { name: /ver más reseñas/i })).not.toBeInTheDocument()
  },
}

/** hasMore=true: aparece "Ver más reseñas" — clickearlo dispara loadMore (fetch mockeado). */
export const ConPaginacion: Story = {
  args: { initial: [reviewItem()], total: 5, average: 4.6 },
  parameters: {
    fetchMock: [
      {
        match: '/api/public/reviews/',
        json: {
          reviews: [
            reviewItem({ id: uid(804), rating: 5, comment: 'Volvemos siempre, cancha impecable.' }),
          ],
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /ver más reseñas/i })
    await userEvent.click(button)
    await expect(await canvas.findByText('Volvemos siempre, cancha impecable.')).toBeInTheDocument()
  },
}
