import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { daysFromNow } from '@/test/fixtures/clock'
import { StatusBanner } from './status-banner'

/**
 * `serviceDegraded` es un override SOLO para Storybook/tests (ver el
 * comentario en status-banner.tsx): en la app real nadie la pasa, el default
 * sigue leyendo `NEXT_PUBLIC_SERVICE_DEGRADED` — la única forma de forzar ese
 * estado sin una env var estática a nivel de build de Vite.
 */
const meta = {
  title: 'Admin/Layout/StatusBanner',
  component: StatusBanner,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StatusBanner>

export default meta
type Story = StoryObj<typeof meta>

export const ServicioDegradado: Story = {
  args: { tenantStatus: 'active', periodEnd: null, serviceDegraded: true },
}

export const PastDue: Story = {
  args: { tenantStatus: 'past_due', periodEnd: daysFromNow(2).toISOString() },
}

export const Suspended: Story = {
  args: { tenantStatus: 'suspended', periodEnd: null },
}

/**
 * `active` sin trial/past_due/suspended: no renderiza nada (`null`). Se
 * verifica sobre un wrapper propio (no `canvasElement` completo): el preview
 * global monta `<Toaster />` + el script de FOUC de next-themes como hermanos
 * de la story dentro del mismo root, así que `canvasElement` nunca está
 * realmente vacío aunque el componente lo esté.
 */
export const Activo: Story = {
  args: { tenantStatus: 'active', periodEnd: null },
  render: (args) => (
    <div data-testid="banner-slot">
      <StatusBanner {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('banner-slot')).toBeEmptyDOMElement()
  },
}
