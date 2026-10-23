import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { ActionResult } from '@/shared/types/action-result'
import type { RivalFormResult } from '../../actions'
import { PublicBoardView } from './PublicBoardView'

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
    // Un solo verde y es un link al login que vuelve acá; sin personas ni denuncia.
    await expect(canvas.getByRole('link', { name: 'Pedir sumarme' })).toHaveAttribute(
      'href',
      '/ingresar?next=%2Frival%2Fpartido%2Fm1',
    )
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.queryByText('Quiénes van')).toBeNull()
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
    await expect(canvas.getByText('Busca rival')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Pedir sumarme' })).toBeInTheDocument()
    await expect(canvas.queryByRole('link', { name: 'Pedir el partido' })).toBeNull()
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
    viewer: { kind: 'player', welcome: { firstName: 'Lazaro', position: null, zone: null } },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // El verde abre la bienvenida con el mismo label; su botón acepta y pide en un toque.
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await userEvent.click(canvas.getByRole('button', { name: 'Pedir sumarme' }))
    await waitFor(() => expect(args.acceptAndRequestAction).toHaveBeenCalled())
    await expect(args.requestAction).not.toHaveBeenCalled()
    const fd = args.acceptAndRequestAction.mock.calls[0]![1]
    await expect(fd.get('matchId')).toBe('m1')
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
