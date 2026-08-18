import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { expectGone } from '@/test/expect-gone'
import type { BanCheckResult } from '@/modules/bans/ban.service'
import { uid } from '@/test/fixtures/ids'
import { daysFromNow } from '@/test/fixtures/clock'
import { BanPlayerControls } from './BanPlayerControls'

const PLAYER_ID = uid(551)

const NOT_BANNED: BanCheckResult = { banned: false }
const MANUAL_BAN: BanCheckResult = {
  banned: true,
  bannedGlobal: false,
  reason: 'Rotura de vidrios en el vestuario',
  until: daysFromNow(7),
}
const GLOBAL_BAN: BanCheckResult = {
  banned: true,
  bannedGlobal: true,
  reason: 'Jugador suspendido globalmente.',
  until: null,
}

const meta = {
  title: 'Admin/Jugadores/BanPlayerControls',
  component: BanPlayerControls,
  parameters: { layout: 'padded' },
  args: {
    playerId: PLAYER_ID,
    ban: NOT_BANNED,
    banPlayerAction: fn(async () => ({ success: true as const })),
    liftPlayerBanAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof BanPlayerControls>

export default meta
type Story = StoryObj<typeof meta>

/** Jugador sin bloqueo: solo aparece "Bloquear jugador". */
export const SinBloqueo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Bloquear jugador' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Levantar bloqueo' })).toBeNull()
  },
}

/** Ban manual vigente: solo aparece "Levantar bloqueo". */
export const ConBloqueoManual: Story = {
  args: { ban: MANUAL_BAN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Levantar bloqueo' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Bloquear jugador' })).toBeNull()
  },
}

/** Ban global del sistema (players.status='banned'): no se gestiona acá, sin botones. */
export const ConBanGlobalSinControles: Story = {
  args: { ban: GLOBAL_BAN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Bloquear sin motivo: el cliente lo rechaza antes de llamar al servidor. */
export const BloquearValidaMotivo: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Bloquear jugador' }))

    const dialog = within(await body.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Bloquear jugador' }))

    await expect(await dialog.findByRole('alert')).toHaveTextContent('Ingresá un motivo.')
    await expect(args.banPlayerAction).not.toHaveBeenCalled()
  },
}

/** Bloqueo completo: elige duración, escribe motivo, confirma. */
export const BloquearJugadorCompleto: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Bloquear jugador' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await userEvent.click(dialog.getByRole('radio', { name: '30 días' }))
    await userEvent.type(
      dialog.getByLabelText('Motivo (obligatorio)'),
      'Discusión con otro jugador',
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Bloquear jugador' }))

    await waitFor(() =>
      expect(args.banPlayerAction).toHaveBeenCalledWith(
        PLAYER_ID,
        'Discusión con otro jugador',
        '30d',
      ),
    )
    await expectGone(dialogEl)
    await expect(await body.findByText('Jugador bloqueado')).toBeVisible()
  },
}

/** Levantar bloqueo: confirma y llama a la action con el playerId. */
export const LevantarBloqueo: Story = {
  args: { ban: MANUAL_BAN },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Levantar bloqueo' }))

    const dialogEl = await body.findByRole('dialog')
    const dialog = within(dialogEl)
    await userEvent.click(dialog.getByRole('button', { name: 'Levantar bloqueo' }))

    await waitFor(() => expect(args.liftPlayerBanAction).toHaveBeenCalledWith(PLAYER_ID))
    await expectGone(dialogEl)
    await expect(await body.findByText('Bloqueo levantado')).toBeVisible()
  },
}
