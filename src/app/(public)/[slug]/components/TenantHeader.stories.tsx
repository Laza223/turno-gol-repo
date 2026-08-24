import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { publicTenant, publicTenantMinimal } from '@/test/fixtures/public'
import TenantHeader from './TenantHeader'

/** En el perfil vive dentro de la card blanca principal (`page.tsx`, `space-y-7`). */
const meta = {
  title: 'Player/TenantProfile/TenantHeader',
  component: TenantHeader,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TenantHeader>

export default meta
type Story = StoryObj<typeof meta>

/** Con logo, WhatsApp, amenities y reseñas — el complejo "completo". */
export const Default: Story = {
  args: {
    tenant: publicTenant({ logoUrl: '/bg-hero-desktop.png' }),
    avgRating: 4.6,
    reviewCount: 28,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Complejo Fénix' })).toBeInTheDocument()
    await expect(canvas.getByRole('img', { name: /logo de complejo fénix/i })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument()
    await expect(canvas.getByText('Techado')).toBeInTheDocument()
  },
}

/** Sin logo, sin WhatsApp, sin amenities y sin reseñas todavía — recién onboardeado. */
export const Minimal: Story = {
  args: {
    tenant: publicTenantMinimal(),
    avgRating: 0,
    reviewCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('img', { name: /logo/i })).not.toBeInTheDocument()
    // El chip de WhatsApp SÍ aparece aunque el complejo no haya cargado el
    // campo: cae al teléfono, que es NOT NULL. Antes de la cascada este assert
    // era `not.toBeInTheDocument()` — y como en la práctica nadie tenía el
    // campo cargado (no existía la pantalla para hacerlo), el chip no se
    // mostraba en NINGÚN complejo.
    await expect(canvas.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument()
    await expect(canvas.queryByRole('img', { name: /estrellas/i })).not.toBeInTheDocument()
  },
}

/** Un día cerrado en la semana: la grilla de horarios muestra "Cerrado". */
export const ConDiaCerrado: Story = {
  args: {
    tenant: publicTenant({
      openingHours: {
        ...publicTenant().openingHours,
        sun: { open: '00:00', close: '00:00', closed: true },
      },
    }),
    avgRating: 4.6,
    reviewCount: 28,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Cerrado')).toBeInTheDocument()
  },
}
