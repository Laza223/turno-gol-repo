import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { publicTenantCard, publicTenantCardSinReservaOnline, publicTenantCardSinResenas } from '@/test/fixtures/tenant'
import { slotPill } from '@/test/fixtures/public'
import TenantCard from './TenantCard'

/** En /explorar vive dentro de la grilla `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. */
const meta = {
  title: 'Player/Explorar/TenantCard',
  component: TenantCard,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof TenantCard>

export default meta
type Story = StoryObj<typeof meta>

/** Grid: con fotos, amenities, rating, precio "desde" y badge "Reservá online". */
export const Grid: Story = {
  args: { tenant: publicTenantCard({ coverUrl: '/bg-hero.png' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Complejo Fénix' })).toBeInTheDocument()
    await expect(canvas.getByText(/reservá online/i)).toBeInTheDocument()
    await expect(canvas.getByText('desde')).toBeInTheDocument()
  },
}

/** Sin fotos: placeholder con degradé + iniciales (default del fixture: `coverUrl: null`). */
export const GridSinFotos: Story = {
  args: { tenant: publicTenantCardSinResenas() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('CA')).toBeInTheDocument()
  },
}

/** Con turnos libres del día (slotPills): pastillas de horario que llevan directo al checkout. */
export const GridConSlotPills: Story = {
  args: {
    tenant: publicTenantCard({ coverUrl: '/bg-hero.png' }),
    slotPills: { date: '2026-03-14', slots: [slotPill({ time: '18:00' }), slotPill({ time: '19:00' })] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /reservar a las 18:00/i })).toBeInTheDocument()
  },
}

/** allowOnlineBooking=false: sin badge "Reservá online", sin precio "desde". */
export const GridSinReservaOnline: Story = {
  args: { tenant: publicTenantCardSinReservaOnline() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/reservá online/i)).not.toBeInTheDocument()
    await expect(canvas.queryByText('desde')).not.toBeInTheDocument()
  },
}

/** variant=compact: usada en el split view lista+mapa, fila angosta con miniatura. */
export const Compact: Story = {
  args: { tenant: publicTenantCard({ coverUrl: '/bg-hero.png' }), variant: 'compact' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Complejo Fénix' })).toBeInTheDocument()
  },
}
