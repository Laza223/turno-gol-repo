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
    whatsappPrefill: '1123456789',
    publishAction: fn(async (_prev: RivalFormResult, _fd: FormData): Promise<RivalFormResult> => ({
      success: true,
    })),
    unpublishAction: fn(async () => ({ success: true as const })),
    decideAction: fn(async () => ({ success: true as const })),
    removeAction: fn(async () => ({ success: true as const })),
    reportMatchAction: fn(async () => ({ success: true as const })),
    reportPlayerAction: fn(async () => ({ success: true as const })),
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

export const PedidoPendienteSinTextoDelBanco: Story = {
  args: {
    signedIn: true,
    roster: [
      ...roster,
      person({ participantId: 'me', shortName: 'Vos V.', isMe: true, status: 'requested' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Pedido enviado. Te avisamos por mail si te aceptan.'),
    ).toBeInTheDocument()
    // Puede bajarse del pedido, pero todavía no hay lugar que ocupe el banco.
    await expect(canvas.getByRole('button', { name: 'Me bajo' })).toBeInTheDocument()
    await expect(canvas.queryByText(/alguien del banco ocupa tu lugar/)).toBeNull()
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

/** Un diálogo de Radix entra con fade-in: se espera a que termine antes de mirarlo. */
async function openDialog() {
  const dialog = await within(document.body).findByRole('dialog')
  await Promise.all(dialog.getAnimations({ subtree: true }).map((a) => a.finished))
  return within(dialog)
}

const organizerRoster = [
  person({ participantId: 'org', shortName: 'Yo O.', isMe: true }),
  person({ participantId: 'b', shortName: 'Beto R.', status: 'bench' }),
  person({ participantId: 'c', shortName: 'Caro D.', status: 'requested', origin: 'board' }),
  person({
    participantId: 'r',
    shortName: 'Rival R.',
    status: 'requested',
    origin: 'board',
    role: 'rival_captain',
  }),
]

export const OrganizadorDecidePedidos: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true }),
    roster: organizerRoster,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Hay lugar: "Aceptar" sale en las dos filas (jugador y capitán rival).
    await expect(canvas.getAllByRole('button', { name: 'Aceptar' })).toHaveLength(2)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Esta vez no' })[0]!)
    await waitFor(() => expect(args.decideAction).toHaveBeenCalledWith('c', 'decline'))
    await userEvent.click(canvas.getAllByRole('button', { name: 'Aceptar' })[0]!)
    await waitFor(() => expect(args.decideAction).toHaveBeenCalledWith('c', 'accept'))
    // Sacar del banco pide confirmación.
    await userEvent.click(canvas.getByRole('button', { name: 'Sacar a Beto R.' }))
    const dialog = await openDialog()
    await expect(args.removeAction).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, sacar' }))
    await waitFor(() => expect(args.removeAction).toHaveBeenCalledWith('b'))
  },
}

export const OrganizadorLlenoNoAcepta: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true, confirmedCount: 10 }),
    roster: organizerRoster,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Lleno: el jugador que pidió ya no se puede aceptar; el capitán rival no cuenta para el cupo.
    await expect(canvas.getAllByRole('button', { name: 'Aceptar' })).toHaveLength(1)
    await expect(canvas.getAllByRole('button', { name: 'Esta vez no' })).toHaveLength(2)
  },
}

export const OrganizadorConCapitanConfirmado: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true }),
    roster: [
      ...organizerRoster,
      person({ participantId: 'r2', shortName: 'Otro O.', role: 'rival_captain' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Ya hay capitán confirmado: el pedido del segundo no se acepta (pero sí el del jugador).
    await expect(canvas.getAllByRole('button', { name: 'Aceptar' })).toHaveLength(1)
  },
}

export const OrganizadorPublicaEnElTablon: Story = {
  args: {
    signedIn: true,
    // Cupo = formato: "Buscamos rival" está disponible.
    match: match({ isOrganizer: true, capacity: 5 }),
    roster: organizerRoster.slice(0, 1),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar en el tablón' }))
    // WhatsApp precargado, teclado numérico y la casilla de consentimiento sin tildar.
    const whatsapp = canvas.getByLabelText('Tu WhatsApp')
    await expect(whatsapp).toHaveValue('1123456789')
    await expect(whatsapp).toHaveAttribute('type', 'tel')
    await expect(whatsapp).toHaveAttribute('inputmode', 'tel')
    const consent = canvas.getByRole('checkbox', {
      name: 'Lo ve solo a quien aceptes en este partido',
    })
    await expect(consent).not.toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'Arquero' }))
    await userEvent.click(consent)
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(args.publishAction).toHaveBeenCalled())
    const fd = args.publishAction.mock.calls[0]![1]
    await expect(fd.get('matchId')).toBe('m1')
    await expect(fd.get('seeking')).toBe('players')
    await expect(fd.get('seekingPosition')).toBe('goalkeeper')
    await expect(fd.get('whatsappConsent')).toBe('on')
    // "Buscamos rival" no lleva posición.
    await userEvent.click(canvas.getByRole('radio', { name: 'Buscamos rival' }))
    await expect(canvas.queryByRole('radio', { name: 'Arquero' })).toBeNull()
  },
}

export const OrganizadorSinBuscarRivalPorCupo: Story = {
  args: {
    signedIn: true,
    // F5 con cupo 10: "Busca rival" exige cupo = formato y la capacidad no se edita.
    match: match({ isOrganizer: true }),
    roster: organizerRoster.slice(0, 1),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar en el tablón' }))
    await expect(canvas.getByRole('radio', { name: 'Buscamos jugadores' })).toBeInTheDocument()
    await expect(canvas.queryByRole('radio', { name: 'Buscamos rival' })).toBeNull()
  },
}

export const OrganizadorSinBuscarRivalConCapitan: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true, capacity: 5 }),
    roster: [
      ...organizerRoster.slice(0, 1),
      person({ participantId: 'r1', shortName: 'Rival R.', role: 'rival_captain' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar en el tablón' }))
    await expect(canvas.getByRole('radio', { name: 'Buscamos jugadores' })).toBeInTheDocument()
    await expect(canvas.queryByRole('radio', { name: 'Buscamos rival' })).toBeNull()
  },
}

export const PublicarConErrores: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true }),
    roster: organizerRoster.slice(0, 1),
    whatsappPrefill: null,
    publishAction: fn(async (_prev: RivalFormResult, _fd: FormData): Promise<RivalFormResult> => ({
      success: false,
      error: 'Ingresá un WhatsApp argentino válido.',
      field: 'whatsapp',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar en el tablón' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Publicar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('WhatsApp argentino válido')
    await expect(canvas.getByLabelText('Tu WhatsApp')).toHaveAttribute('aria-invalid', 'true')
  },
}

export const OrganizadorEnElTablon: Story = {
  args: {
    signedIn: true,
    match: match({ isOrganizer: true, seeking: 'players', seekingPosition: 'goalkeeper' }),
    roster: organizerRoster.slice(0, 1),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('En el tablón: Se busca arquero')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Publicar en el tablón' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Sacar del tablón' }))
    await waitFor(() => expect(args.unpublishAction).toHaveBeenCalledWith('m1'))
  },
}

export const InvitadoDenunciaElPartido: Story = {
  args: { signedIn: true, roster },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Denunciar el partido' }))
    const dialog = await openDialog()
    // Los 4 motivos cerrados, y sin motivo no se envía.
    await expect(dialog.getAllByRole('radio')).toHaveLength(4)
    await userEvent.click(dialog.getByRole('button', { name: 'Enviar denuncia' }))
    await expect(await dialog.findByRole('alert')).toHaveTextContent('Elegí el motivo')
    await expect(args.reportMatchAction).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('radio', { name: 'Es spam o publicidad' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Enviar denuncia' }))
    await waitFor(() => expect(args.reportMatchAction).toHaveBeenCalledWith('m1', 'spam'))
    await expect(await canvas.findByText('Gracias. Lo vamos a revisar.')).toBeInTheDocument()
  },
}

export const InvitadoDenunciaAUnaPersona: Story = {
  args: { signedIn: true, roster },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Denunciar' })[0]!)
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('radio', { name: 'Nombre o foto ofensivos' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Enviar denuncia' }))
    await waitFor(() =>
      expect(args.reportPlayerAction).toHaveBeenCalledWith('m1', 'pl-a', 'offensive'),
    )
  },
}

export const SinSesionNoDenuncia: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /Denunciar/ })).toBeNull()
  },
}
