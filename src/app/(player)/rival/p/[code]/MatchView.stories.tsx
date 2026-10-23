import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { RivalPublicMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import { buildShareHref } from '@/modules/rival/rival-share'
import type { RivalFormResult } from '../../actions'
import { MatchView } from './MatchView'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const NOW = new Date('2026-03-14T18:30:00Z')

const match = (o: Partial<RivalPublicMatch> = {}): RivalPublicMatch => ({
  id: 'm1',
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  tenantCity: 'Luján',
  startsAt: new Date('2026-03-15T00:00:00Z'), // sábado 21:00
  format: 5,
  capacity: 10,
  level: 'parejo',
  status: 'open',
  seeking: null,
  seekingPosition: null,
  confirmedCount: 7,
  filledAt: null,
  courtDeclared: false,
  hasStamp: true,
  isOrganizer: false,
  ...o,
})

const person = (
  o: Partial<RivalRosterEntry> & { participantId: string; shortName: string },
): RivalRosterEntry => ({
  playerId: `pl-${o.participantId}`,
  role: 'player',
  status: 'confirmed',
  origin: 'invite',
  isMe: false,
  avatarUrl: null,
  confirmedAt: new Date('2026-03-13T12:00:00Z'),
  position: null,
  zone: null,
  gamesPlayed: null,
  memberSince: null,
  ...o,
})

const roster = [
  person({ participantId: 'a', shortName: 'Ana P.' }),
  person({ participantId: 'b', shortName: 'Beto R.' }),
]

const meta = {
  title: 'Player/Rival/MatchView',
  component: MatchView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival/p/ABCDEFGHJK' } },
  },
  args: {
    code: 'ABCDEFGHJK',
    match: match(),
    signedIn: false,
    roster: [],
    shareUrl: '/rival/p/ABCDEFGHJK',
    shareHref: '#avisar-al-grupo',
    justCreated: false,
    now: NOW,
    welcome: null,
    autoJoin: false,
    openWelcome: false,
    intentParam: 'rival_intent',
    cancelAction: fn(async () => ({ success: true as const })),
    joinAction: fn(async () => ({ success: true as const })),
    acceptAndJoinAction: fn(async (): Promise<RivalFormResult> => ({ success: true })),
    leaveAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof MatchView>

export default meta
type Story = StoryObj<typeof meta>

export const SinSesion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'El Vagón' })).toBeInTheDocument()
    await expect(canvas.getByText('Faltan 3')).toBeInTheDocument()
    await expect(canvas.getByText('Reservada en TurnoGol')).toBeInTheDocument()
    // Ninguna persona, y ningún botón muerto (el "Voy" sin sesión lo pone la page con el login).
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.queryByText('Quiénes van')).toBeNull()
  },
}

export const ConSesionVeNombres: Story = {
  args: { signedIn: true, roster },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Quiénes van')).toBeInTheDocument()
    await expect(canvas.getByText('Ana P.')).toBeInTheDocument()
  },
}

export const ParticipanteEnElBanco: Story = {
  args: {
    signedIn: true,
    match: match({ confirmedCount: 10 }),
    roster: [
      ...roster,
      person({ participantId: 'me', shortName: 'Vos V.', status: 'bench', isMe: true }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'Quedaste en el banco. Si alguien se baja, entrás vos y te avisamos por mail.',
      ),
    ).toBeInTheDocument()
    // Ya está adentro: no hay "Voy", sí "Me bajo".
    await expect(canvas.queryByRole('button', { name: 'Voy' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Me bajo' })).toBeInTheDocument()
  },
}

export const InvitadoConSesion: Story = {
  args: { signedIn: true, roster },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Voy' }))
    await waitFor(() => expect(args.joinAction).toHaveBeenCalledWith('ABCDEFGHJK'))
  },
}

export const InvitadoSinBienvenida: Story = {
  args: {
    signedIn: true,
    roster,
    welcome: { firstName: 'Lazaro', position: null, zone: null },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // "Voy" no suma: abre la tarjeta, y su botón acepta y suma en un toque.
    await userEvent.click(canvas.getByRole('button', { name: 'Voy' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Estoy adentro' }))
    await waitFor(() => expect(args.acceptAndJoinAction).toHaveBeenCalled())
    await expect(args.joinAction).not.toHaveBeenCalled()
  },
}

export const BienvenidaAbierta: Story = {
  args: {
    signedIn: true,
    roster,
    openWelcome: true,
    welcome: { firstName: 'Lazaro', position: null, zone: null },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Vuelta del login: la tarjeta sale abierta y NO hay autoenvío.
    await expect(canvas.getByRole('button', { name: 'Estoy adentro' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Tu nombre')).toHaveValue('Lazaro')
    await expect(args.joinAction).not.toHaveBeenCalled()
    await expect(args.acceptAndJoinAction).not.toHaveBeenCalled()
  },
}

export const ConfirmadoSeBaja: Story = {
  args: {
    signedIn: true,
    roster: [...roster, person({ participantId: 'me', shortName: 'Vos V.', isMe: true })],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Listo, estás adentro. Nos vemos en la cancha.'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText('Si no podés ir, bajate a tiempo: alguien del banco ocupa tu lugar.'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Me bajo' }))
    const dialog = within(await within(document.body).findByRole('dialog'))
    await expect(args.leaveAction).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, me bajo' }))
    await waitFor(() => expect(args.leaveAction).toHaveBeenCalledWith('m1'))
  },
}

export const Organizador: Story = {
  args: {
    signedIn: true,
    justCreated: true,
    match: match({ isOrganizer: true }),
    roster: [
      person({
        participantId: 'org',
        shortName: 'Yo O.',
        isMe: true,
        position: 'midfielder',
        zone: 'Luján',
        gamesPlayed: 12,
        memberSince: new Date('2025-10-05T12:00:00Z'),
      }),
      person({
        participantId: 'b',
        shortName: 'Beto R.',
        status: 'bench',
        position: 'goalkeeper',
        zone: 'Pilar',
        gamesPlayed: 1,
        memberSince: new Date('2026-01-10T12:00:00Z'),
      }),
      person({
        participantId: 'c',
        shortName: 'Caro D.',
        status: 'requested',
        origin: 'board',
        position: 'any',
        zone: 'Moreno',
        gamesPlayed: 0,
        memberSince: new Date('2026-03-01T12:00:00Z'),
      }),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Listo. Ahora pasale el link al grupo.')).toBeInTheDocument()
    // El único verde del organizador: un link, no un botón.
    await expect(canvas.getByRole('link', { name: 'Avisar al grupo' })).toHaveAttribute(
      'href',
      '#avisar-al-grupo',
    )
    await expect(canvas.queryByRole('button', { name: 'Voy' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Me bajo' })).toBeNull()
    // Confirmado en su propio partido, pero no "va": sin la línea del invitado.
    await expect(canvas.queryByText(/estás adentro/)).toBeNull()
    await expect(canvas.getByText('El banco')).toBeInTheDocument()
    await expect(canvas.getByText('Pedidos')).toBeInTheDocument()
    await expect(canvas.getByText(/En TurnoGol desde octubre de 2025/)).toBeInTheDocument()
    await expect(canvas.getByText(/12 partidos jugados/)).toBeInTheDocument()

    // Cancelar pide confirmación y recién ahí llama a la action.
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar el partido' }))
    const dialog = within(await within(document.body).findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, cancelar el partido' }))
    await waitFor(() => expect(args.cancelAction).toHaveBeenCalledWith('m1'))
  },
}

export const OrganizadorLleno: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true, confirmedCount: 10 }),
    shareHref: buildShareHref(
      { startsAt: match().startsAt, tenantName: 'El Vagón', capacity: 10, confirmedCount: 10 },
      '/rival/p/ABCDEFGHJK',
    ),
    roster: [person({ participantId: 'org', shortName: 'Yo O.', isMe: true })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Estamos los 10! Se juega.')).toBeInTheDocument()
    const href = canvas.getByRole('link', { name: 'Avisar al grupo' }).getAttribute('href') ?? ''
    await expect(decodeURIComponent(href)).toContain(
      '/?text=¡Estamos los 10! Se juega el sábado 21:00 en El Vagón.',
    )
  },
}

export const Completo: Story = {
  args: { match: match({ confirmedCount: 10 }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('¡Estamos los 10! Se juega.')).toBeInTheDocument()
  },
}

export const Cancelado: Story = {
  args: { match: match({ status: 'canceled' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Este partido se cayó.')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Armar otro' })).toHaveAttribute(
      'href',
      '/rival/nuevo',
    )
  },
}

export const Vencido: Story = {
  args: {
    match: match({ startsAt: new Date('2026-03-13T00:00:00Z'), isOrganizer: true }),
    signedIn: true,
    roster: [person({ participantId: 'org', shortName: 'Yo O.', isMe: true })],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugado')).toBeInTheDocument()
    // Un partido jugado no dice cuántos faltan.
    await expect(canvas.queryByText(/^Faltan/)).toBeNull()
    await expect(canvas.getByText('7 de 10 confirmados')).toBeInTheDocument()
    // Sin acciones: no se copia ni se cancela un partido que ya se jugó; se repite.
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.queryByRole('link', { name: 'Avisar al grupo' })).toBeNull()
    await expect(
      canvas.getByRole('link', { name: 'Armar el del jueves que viene' }),
    ).toHaveAttribute('href', '/rival/nuevo?desde=m1')
  },
}
