import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'
import { RivalEntryGate } from './RivalEntryGate'

/** Las actions entran por prop: `login-actions` es `'use server'` (ver RivalEntryGate). */
const idle = async (): Promise<GateState> => ({ status: 'idle' })

const meta = {
  title: 'Player/Rival/RivalEntryGate',
  component: RivalEntryGate,
  parameters: { layout: 'centered' },
  args: {
    next: '/rival/nuevo',
    label: 'Armar un partido',
    purpose: 'armar',
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
} satisfies Meta<typeof RivalEntryGate>

export default meta
type Story = StoryObj<typeof meta>

async function openGate(canvasElement: HTMLElement, name: string) {
  await userEvent.click(within(canvasElement).getByRole('button', { name }))
  const dialog = await screen.findByRole('dialog')
  // Radix lo monta con un fade-in: un `toBeVisible` durante la animación lee opacidad 0.
  await Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished))
  return dialog
}

/** "Armar un partido" sin sesión: el ingreso promete volver a armarlo y el `next` es el form. */
export const Armar: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openGate(canvasElement, 'Armar un partido')
    const modal = within(dialog)
    await expect(modal.getByRole('heading', { name: 'Entrá para armar tu partido' })).toBeVisible()
    await expect(modal.getByText('Entrás y volvés a armarlo.')).toBeVisible()
    await expect(dialog.querySelector('input[name="next"]')).toHaveValue('/rival/nuevo')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

/** "Pedir sumarme" sin sesión: vuelve al mismo partido del tablón. */
export const Pedir: Story = {
  args: {
    next: '/rival/partido/3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b',
    label: 'Pedir sumarme',
    purpose: 'pedir',
  },
  play: async ({ canvasElement }) => {
    const dialog = await openGate(canvasElement, 'Pedir sumarme')
    const modal = within(dialog)
    await expect(modal.getByRole('heading', { name: 'Entrá para pedir tu lugar' })).toBeVisible()
    await expect(modal.getByText('Entrás y volvés a este partido.')).toBeVisible()
    await expect(dialog.querySelector('input[name="next"]')).toHaveValue(
      '/rival/partido/3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b',
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}
