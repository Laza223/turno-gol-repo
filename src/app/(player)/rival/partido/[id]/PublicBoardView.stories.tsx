import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { GateState } from '@/app/(public)/[slug]/reservar/actions'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { PublicBoardView } from './PublicBoardView'

/** Las actions del ingreso entran por prop: `login-actions` es `'use server'`. */
const idle = async (): Promise<GateState> => ({ status: 'idle' })

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const NOW = new Date('2026-03-14T18:30:00Z')

const match = (o: Partial<RivalBoardItem> = {}): RivalBoardItem => ({
  id: 'm1',
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-15T00:00:00Z'), // sábado 21:00
  format: 5,
  capacity: 10,
  level: 'parejo',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 7,
  hasStamp: true,
  ...o,
})

const meta = {
  title: 'Player/Rival/PublicBoardView',
  component: PublicBoardView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival/partido/m1' } },
  },
  args: {
    match: match(),
    viewer: { kind: 'anon' },
    now: NOW,
    requestAction: fn(async (_id: string): Promise<ActionResult> => ({ success: true })),
    acceptAndRequestAction: fn(
      async (_prev: RivalFormResult, _fd: FormData): Promise<RivalFormResult> => ({
        success: true,
      }),
    ),
    reportMatchAction: fn(async () => ({ success: true as const })),
    sendMagicLink: fn(idle),
    startGoogle: fn(idle),
  },
} satisfies Meta<typeof PublicBoardView>

export default meta
type Story = StoryObj<typeof meta>

export const SinSesion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'El Vagón' })).toBeInTheDocument()
    await expect(canvas.getByText('Faltan 3')).toBeInTheDocument()
    await expect(canvas.getByText('Reservada en TurnoGol')).toBeInTheDocument()
    // Un solo verde, en la barra fija de abajo; sin personas ni denuncia.
    const pedir = canvas.getByRole('button', { name: 'Pedir sumarme' })
    await expect(pedir.closest('[data-fixed-cta]')).not.toBeNull()
    await expect(canvas.getAllByRole('button')).toHaveLength(1)
    await expect(canvas.queryByText('Quiénes van')).toBeNull()
  },
}

/** Sin sesión, "Pedir sumarme" abre el ingreso RIVAL (crea la cuenta) y vuelve a este partido. */
export const SinSesionAbreElIngreso: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Pedir sumarme' }))
    const dialog = await screen.findByRole('dialog')
    // Radix lo monta con un fade-in: un `toBeVisible` durante la animación lee opacidad 0.
    await Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished))
    await expect(
      within(dialog).getByRole('heading', { name: 'Entrá para pedir tu lugar' }),
    ).toBeVisible()
    await expect(dialog.querySelector('input[name="next"]')).toHaveValue('/rival/partido/m1')
    await expect(args.sendMagicLink).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
}

export const SeBuscaArquero: Story = {
  args: { match: match({ seekingPosition: 'goalkeeper' }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Se busca arquero')).toBeInTheDocument()
  },
}

export const BuscaRival: Story = {
  args: {
    match: match({ seeking: 'rival', seekingPosition: null, capacity: 5, confirmedCount: 5 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Un solo titular: con el equipo completo todavía no hay rival, no se juega.
    await expect(canvas.getAllByText('Busca rival')).toHaveLength(1)
    await expect(canvas.queryByText(/Se juega/)).toBeNull()
    await expect(canvas.getByText('5 de 5 confirmados')).toBeInTheDocument()
    // Quien pide es el capitán de otro equipo.
    await expect(
      canvas.getByRole('button', { name: 'Pedir jugar con mi equipo' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Pedir sumarme' })).toBeNull()
  },
}

export const ConSesionPide: Story = {
  args: { viewer: { kind: 'player', welcome: null } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await waitFor(() => expect(args.requestAction).toHaveBeenCalledWith('m1'))
  },
}

export const ConSesionSinBienvenida: Story = {
  args: {
    viewer: {
      kind: 'player',
      welcome: {
        firstName: 'Lazaro',
        position: null,
        zone: null,
        needs: { identity: true, profile: true, position: true },
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // El verde abre la bienvenida con el mismo label; su botón acepta y pide en un toque.
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await expect(canvas.getByText('Para pedir tu lugar, contanos quién sos.')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await waitFor(() => expect(args.acceptAndRequestAction).toHaveBeenCalled())
    await expect(args.requestAction).not.toHaveBeenCalled()
    const fd = args.acceptAndRequestAction.mock.calls[0]![1]
    await expect(fd.get('matchId')).toBe('m1')
  },
}

/** Ya aceptó las reglas pero le falta posición y zona: la tarjeta pide solo eso y se puede cerrar. */
export const ConSesionFaltaElPerfil: Story = {
  args: {
    viewer: {
      kind: 'player',
      welcome: {
        firstName: 'Lazaro',
        position: null,
        zone: null,
        needs: { identity: false, profile: true, position: true },
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await expect(
      canvas.getByRole('heading', { name: 'Un dato más para sumarte' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Tu nombre')).toBeNull()
    await expect(canvas.getByLabelText('Tu posición')).toBeInTheDocument()
    // "Ahora no" vuelve al botón, sin pedir nada.
    await userEvent.click(canvas.getByRole('button', { name: 'Ahora no' }))
    await expect(canvas.getByRole('button', { name: 'Pedir sumarme' })).toBeInTheDocument()
    await expect(args.acceptAndRequestAction).not.toHaveBeenCalled()
    await expect(args.requestAction).not.toHaveBeenCalled()
  },
}

export const PedidoConError: Story = {
  args: {
    viewer: { kind: 'player', welcome: null },
    requestAction: fn(async (_id: string): Promise<ActionResult> => ({
      success: false,
      error: 'Ya tenés 5 pedidos pendientes.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('5 pedidos pendientes')
  },
}

export const ConSesionDenuncia: Story = {
  args: { viewer: { kind: 'player', welcome: null } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Denunciar el partido' }))
    const dialogEl = await within(document.body).findByRole('dialog')
    await Promise.all(dialogEl.getAnimations({ subtree: true }).map((a) => a.finished))
    const dialog = within(dialogEl)
    await userEvent.click(dialog.getByRole('radio', { name: 'El partido no existe' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Enviar denuncia' }))
    await waitFor(() => expect(args.reportMatchAction).toHaveBeenCalledWith('m1', 'not_exists'))
    await expect(await canvas.findByText('Gracias. Lo vamos a revisar.')).toBeInTheDocument()
  },
}
