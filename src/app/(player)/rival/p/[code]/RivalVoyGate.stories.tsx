import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'
import { RivalVoyGate } from './RivalVoyGate'

/** Las actions entran por prop: `login-actions` es `'use server'` (ver RivalVoyGate). */
const idle = async (): Promise<GateState> => ({ status: 'idle' })

const meta = {
  title: 'Player/Rival/RivalVoyGate',
  component: RivalVoyGate,
  parameters: { layout: 'centered' },
  args: {
    code: 'ABCDEFGH23',
    sendMagicLink: fn(idle),
    startGoogle: fn(idle),
  },
  decorators: [
    (Story) => (
      <div className="w-80 bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RivalVoyGate>

export default meta
type Story = StoryObj<typeof meta>

/** El botón verde "Voy", de 52 px, en la barra fija de abajo y sin el ingreso abierto. */
export const Reposo: Story = {
  play: async ({ canvasElement }) => {
    const voy = within(canvasElement).getByRole('button', { name: 'Voy' })
    await expect(voy).toBeEnabled()
    await expect(voy.getBoundingClientRect().height).toBeGreaterThanOrEqual(52)
    await expect(voy.closest('[data-fixed-cta]')).not.toBeNull()
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

/** Tocar "Voy" abre el ingreso de RIVAL: título propio y el `next` apunta al mismo partido. */
export const AbreElIngreso: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Voy' }))
    const dialog = await screen.findByRole('dialog')
    // Radix lo monta con un fade-in: un `toBeVisible` durante la animación lee opacidad 0.
    await Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished))
    const modal = within(dialog)
    await expect(
      modal.getByRole('heading', { name: 'Entrá para sumarte al partido' }),
    ).toBeVisible()
    await expect(dialog.querySelector('input[name="next"]')).toHaveValue('/rival/p/ABCDEFGH23')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}
