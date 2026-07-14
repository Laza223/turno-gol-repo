import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { publicTenantCard, publicTenantCards } from '@/test/fixtures/tenant'
import { FeaturedComplexes } from './FeaturedComplexes'

/** `page.tsx` solo la monta si `complexes.length > 0` — no hay estado vacío real que storyar. */
const meta = {
  title: 'Public/Landing/FeaturedComplexes',
  component: FeaturedComplexes,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="landing-hero min-h-dvh text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeaturedComplexes>

export default meta
type Story = StoryObj<typeof meta>

/** Los 6 destacados reales (`limit: 6`), mezclando con/sin reseñas y con/sin reserva online. */
export const Default: Story = {
  args: { complexes: publicTenantCards() },
}

/** Un solo resultado — el grid de 3 columnas no debe romperse ni estirar la card. */
export const UnComplejo: Story = {
  args: { complexes: [publicTenantCard()] },
}
