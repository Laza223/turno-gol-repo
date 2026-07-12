import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { player } from '@/test/fixtures/player'
import { ConfiguracionView } from './ConfiguracionView'

/**
 * El contenedor reproduce `.player-shell-bg` (PortalFrame, fondo del portal
 * del jugador): la clase vive en globals.css (ya cargado por el preview), así
 * que no hace falta importar PortalShell/PortalFrame — que arrastrarían
 * signOutAction ('use server') y romperían el bundle de browser igual que
 * cualquier otra Server Action importada como valor.
 */
const meta = {
  title: 'Player/Configuracion/ConfiguracionView',
  component: ConfiguracionView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfiguracionView>

export default meta
type Story = StoryObj<typeof meta>

export const ConNombre: Story = {
  args: { firstName: player().firstName },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/hola tomás, gestioná/i)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /iniciar eliminación/i })).toHaveAttribute(
      'href',
      '/eliminar-cuenta',
    )
  },
}

/** `firstName` null: el player se dio de alta sin nombre — copy genérico sin saludo. */
export const SinNombre: Story = {
  args: { firstName: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^gestioná tu perfil y tus datos\.$/i)).toBeInTheDocument()
  },
}
