import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  publicTenantCard,
  publicTenantCardSinReservaOnline,
  publicTenantCardSinResenas,
} from '@/test/fixtures/tenant'
import FeaturedComplexCard from './FeaturedComplexCard'

/** `.card-premium` es una superficie opaca propia — se reproduce el grid de 3
 * columnas de la landing (`FeaturedComplexes`) para el ancho real de la card. */
const meta = {
  title: 'Public/FeaturedComplexCard',
  component: FeaturedComplexCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeaturedComplexCard>

export default meta
type Story = StoryObj<typeof meta>

/** Con foto de portada, reserva online y reseñas. */
export const Default: Story = {
  args: { tenant: publicTenantCard({ coverUrl: '/bg-hero.png' }) },
}

/** Sin `coverUrl` (default de la fixture): iniciales fantasma sobre la retícula decorativa. */
export const SinFoto: Story = {
  args: { tenant: publicTenantCard() },
}

/** Sin reserva online: no muestra el badge "Reserva online" ni precio "Desde". */
export const SinReservaOnline: Story = {
  args: { tenant: publicTenantCardSinReservaOnline() },
}

/** Sin reseñas todavía (reviewCount=0): sin badge de rating. */
export const SinReviews: Story = {
  args: { tenant: publicTenantCardSinResenas() },
}

/** 4+ amenities: se recortan a 4 chips. */
export const ConMuchosAmenities: Story = {
  args: {
    tenant: publicTenantCard({
      amenities: {
        techado: true,
        iluminacion: true,
        estacionamiento: true,
        duchas: true,
        vestuario: true,
        parrilla: true,
        bar: true,
        wifi: true,
      },
    }),
  },
}

/** Sin amenities activas: la fila de chips no se renderiza. */
export const SinAmenities: Story = {
  args: { tenant: publicTenantCard({ amenities: {} }) },
}
