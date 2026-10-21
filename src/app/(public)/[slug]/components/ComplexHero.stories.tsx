import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { publicTenant } from '@/test/fixtures/public'
import ComplexHero from './ComplexHero'

/** Cabecera de la ficha, a 390 px. El reloj congelado es sábado 15:30 ART: el complejo está abierto. */
const meta = {
  title: 'Player/TenantProfile/ComplexHero',
  component: ComplexHero,
  parameters: { layout: 'fullscreen' },
  args: {
    tenant: publicTenant({ coverUrl: '/bg-hero-desktop.png' }),
    courtCount: 5,
    formats: [5, 7],
    avgRating: 4.6,
    reviewCount: 18,
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[390px] bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComplexHero>

export default meta
type Story = StoryObj<typeof meta>

export const ConPortada: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1, name: 'Complejo Fénix' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Portada de Complejo Fénix' })).toBeVisible()
    await expect(await canvas.findByText('Abierto · hasta las 00:00')).toBeVisible()
    // Los datos son una línea apagada, no chips que parezcan botones; y no hay chip de horario.
    await expect(canvas.getByText('5 canchas · Fútbol 5 y 7')).toBeVisible()
    await expect(canvas.queryByText(/^Hasta /)).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    )
    await expect(canvas.getByRole('link', { name: 'WhatsApp' })).toBeVisible()
    // Compartir y guardar: solo ícono, de 44×44, con nombre accesible.
    for (const name of ['Compartir', 'Guardar en favoritos']) {
      const button = canvas.getByRole('button', { name })
      const box = button.getBoundingClientRect()
      await expect(box.width).toBeGreaterThanOrEqual(44)
      await expect(box.height).toBeGreaterThanOrEqual(44)
    }
  },
}

export const SinPortada: Story = {
  args: { tenant: publicTenant({ coverUrl: null }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('img', { name: /Portada/ }),
    ).not.toBeInTheDocument()
  },
}

/** Pasados ~28 caracteres el nombre baja a 24 px; si aun así llega a tres líneas, se corta ahí, sin desbordar. */
export const NombreLargo: Story = {
  args: {
    tenant: publicTenant({
      name: 'Complejo Deportivo Club Atlético y Social Los Amigos del Barrio Norte de Villa Ballester',
      coverUrl: '/bg-hero-desktop.png',
    }),
  },
  play: async ({ canvasElement }) => {
    // Nombre largo: baja a 24 px y, como último recurso, se corta en la tercera línea.
    const h1 = within(canvasElement).getByRole('heading', { level: 1 })
    const style = getComputedStyle(h1)
    await expect(style.fontSize).toBe('24px')
    await expect(style.webkitLineClamp).toBe('3')
    await expect(h1.getBoundingClientRect().height).toBeLessThanOrEqual(3 * 32 + 1)
  },
}

/** Complejo guardado: el corazón conserva su rojo (claro y oscuro); Compartir sigue neutro. */
export const Guardado: Story = {
  decorators: [
    (Story, { args }) => (
      <PortalSessionProvider
        initialValue={{
          session: null,
          favoriteTenantIds: new Set([args.tenant.id]),
          staffPanelPath: null,
        }}
      >
        <Story />
      </PortalSessionProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const saved = canvas.getByRole('button', { name: 'Quitar de favoritos' })
    await expect(saved).toHaveAttribute('aria-pressed', 'true')
    await expect(getComputedStyle(saved).color).not.toBe(
      getComputedStyle(canvas.getByRole('button', { name: 'Compartir' })).color,
    )
  },
}

/** Sin un número que sirva para WhatsApp queda "Llamar". */
export const SinWhatsapp: Story = {
  args: { tenant: publicTenant({ whatsapp: null, phone: '4567-8900' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Llamar' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^tel:/),
    )
  },
}

/** Sin reseñas no hay calificación; con una sola cancha y un formato, la línea lo dice en singular. */
export const SinResenasUnaCancha: Story = {
  args: { avgRating: 0, reviewCount: 0, courtCount: 1, formats: [5] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('img', { name: /de 5 estrellas/ })).not.toBeInTheDocument()
    await expect(canvas.getByText('1 cancha · Fútbol 5')).toBeVisible()
  },
}
