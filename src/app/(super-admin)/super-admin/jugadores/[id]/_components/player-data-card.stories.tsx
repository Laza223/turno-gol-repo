import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NOW_MS, playerDetail } from '../../_components/player-fixtures'
import { PlayerDataCard } from './player-data-card'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayerDataCard',
  component: PlayerDataCard,
  parameters: { layout: 'padded' },
  args: { player: playerDetail('activo').player, now: NOW_MS },
} satisfies Meta<typeof PlayerDataCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: /5555-0103/ })
    await expect(link).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/5491155550103$/),
    )
    await expect(link).toHaveAttribute('target', '_blank')
  },
}

/** Sin fecha de fin y sin motivo: el motivo nunca sale en el panel. */
export const Bloqueado: Story = {
  args: { player: playerDetail('bloqueado').player },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Bloqueado en toda la plataforma hasta/),
    ).toBeInTheDocument()
  },
}

export const Anonimizado: Story = {
  args: { player: playerDetail('anonimizado').player },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Ley 25.326/)).toBeInTheDocument()
    await expect(canvas.queryByText('Email')).toBeNull()
    await expect(canvas.queryByText('Teléfono')).toBeNull()
  },
}

export const SinTelefonoNiIngreso: Story = {
  args: { player: { ...playerDetail('sinComplejos').player, phone: null } },
}
