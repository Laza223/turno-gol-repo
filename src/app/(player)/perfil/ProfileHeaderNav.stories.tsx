import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { player, playerLongName } from '@/test/fixtures/player'
import { ProfileHeaderNav } from './ProfileHeaderNav'

/** Reproduce `.player-shell-bg` (fondo del portal, ver ConfiguracionView.stories.tsx). */
const meta = {
  title: 'Player/Perfil/ProfileHeaderNav',
  component: ProfileHeaderNav,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh px-4 py-6">
        <div className="mx-auto max-w-lg space-y-5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileHeaderNav>

export default meta
type Story = StoryObj<typeof meta>

const base = player()

/** Sin avatarUrl: fallback de iniciales. */
export const IniciasFallback: Story = {
  args: {
    firstName: base.firstName,
    lastName: base.lastName,
    email: base.email,
    avatarUrl: null,
    tab: 'datos',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('TI')).toBeInTheDocument() // Tomás Ibáñez
    await expect(canvas.getByRole('link', { name: 'Datos' })).toHaveAttribute('aria-current', 'page')
  },
}

export const ConAvatar: Story = {
  args: {
    firstName: base.firstName,
    lastName: base.lastName,
    email: base.email,
    // Antes pedía una foto real a images.unsplash.com — un tercero real desde
    // el runner de CI. El test solo verifica que el <img role="Avatar"> exista
    // (línea de abajo), no que la foto cargue: una data URI embebida alcanza.
    avatarUrl:
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
    tab: 'favoritos',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Favoritos' })).toHaveAttribute('aria-current', 'page')
  },
}

/** Nombre compuesto largo: el `truncate` del header no corta la palabra a la mitad. */
export const NombreLargo: Story = {
  args: {
    firstName: playerLongName().firstName,
    lastName: playerLongName().lastName,
    email: playerLongName().email,
    avatarUrl: null,
    tab: 'actividad',
  },
}

export const TabNotificaciones: Story = {
  args: {
    firstName: base.firstName,
    lastName: base.lastName,
    email: base.email,
    avatarUrl: null,
    tab: 'notificaciones',
  },
}
