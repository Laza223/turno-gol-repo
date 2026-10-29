import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { RivalMyMatch, RivalRosterEntry } from '@/modules/rival/rival.types'
import { ParticipantMatchView } from './ParticipantMatchView'

// Reloj congelado de las stories: sábado 2026-03-14, 15:30 ART.
const NOW = new Date('2026-03-14T18:30:00Z')

const mine = (o: Partial<RivalMyMatch> = {}): RivalMyMatch => ({
  id: 'm1',
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-15T00:00:00Z'), // sábado 21:00
  format: 5,
  capacity: 10,
  level: 'parejo',
  status: 'open',
  seeking: 'players',
  seekingPosition: 'any',
  confirmedCount: 7,
  filledAt: null,
  courtDeclared: false,
  hasStamp: true,
  isOrganizer: false,
  onBoard: true,
  inviteCode: null,
  isHidden: false,
  participantId: 'me',
  myRole: 'player',
  myStatus: 'requested',
  myOrigin: 'board',
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
  person({ participantId: 'me', shortName: 'Vos V.', isMe: true, origin: 'board' }),
]

// Inerte a propósito: un `wa.me/<dígitos>` literal en src/ lo vetan contact-whatsapp y
// stories-no-live-network. La story solo mira que el href llegue tal cual.
const CONTACT_LINK = '#whatsapp-del-organizador'

const meta = {
  title: 'Player/Rival/ParticipantMatchView',
  component: ParticipantMatchView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival/partido/m1' } },
  },
  args: {
    match: mine(),
    roster: [],
    contactLink: null,
    now: NOW,
    leaveAction: fn(async () => ({ success: true as const })),
    reportMatchAction: fn(async () => ({ success: true as const })),
    reportPlayerAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof ParticipantMatchView>

export default meta
type Story = StoryObj<typeof meta>

export const PedidoEnviado: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Pedido enviado. Te avisamos por mail si te aceptan.'),
    ).toBeInTheDocument()
    // Sin personas ni WhatsApp todavía; se puede cancelar el pedido.
    await expect(canvas.queryByText('Quiénes van')).toBeNull()
    await expect(canvas.queryByRole('link', { name: 'Escribile por WhatsApp' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Cancelar pedido' }))
    const dialog = within(await within(document.body).findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sí, cancelar' }))
    await waitFor(() => expect(args.leaveAction).toHaveBeenCalledWith('m1'))
  },
}

export const NoHuboLugar: Story = {
  args: { match: mine({ myStatus: 'declined' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Esta vez no hubo lugar.')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Me bajo' })).toBeNull()
    await expect(canvas.getByRole('link', { name: 'Ver el tablón' })).toHaveAttribute(
      'href',
      '/rival',
    )
  },
}

export const AceptadoDelTablon: Story = {
  args: {
    match: mine({ myStatus: 'confirmed' }),
    roster,
    contactLink: CONTACT_LINK,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Listo, estás adentro. Nos vemos en la cancha.'),
    ).toBeInTheDocument()
    await expect(canvas.getByText('Quiénes van')).toBeInTheDocument()
    await expect(canvas.getByText('Ana P.')).toBeInTheDocument()
    await expect(canvas.getByText('Al escribirle, va a ver tu número.')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Escribile por WhatsApp' })).toHaveAttribute(
      'href',
      CONTACT_LINK,
    )
    await expect(canvas.getByRole('button', { name: 'Me bajo' })).toBeInTheDocument()
    // El verde va justo debajo del cupo, antes de la lista de personas.
    const verde = canvas.getByRole('link', { name: 'Escribile por WhatsApp' })
    await expect(
      verde.compareDocumentPosition(canvas.getByText('Quiénes van')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  },
}

export const AceptadoPorElLinkNoVeWhatsapp: Story = {
  args: {
    match: mine({ myStatus: 'confirmed', myOrigin: 'invite' }),
    roster,
    contactLink: null,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('link', { name: 'Escribile por WhatsApp' }),
    ).toBeNull()
  },
}

export const CapitanRival: Story = {
  args: {
    match: mine({ myStatus: 'confirmed', myRole: 'rival_captain', seeking: 'rival' }),
    roster,
    contactLink: CONTACT_LINK,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Listo: tu equipo es el rival de este partido.'),
    ).toBeInTheDocument()
  },
}

/** Busca rival con el equipo completo: el titular es solo "Busca rival", no "Se juega". */
export const BuscaRivalEquipoCompleto: Story = {
  args: {
    match: mine({ seeking: 'rival', seekingPosition: null, capacity: 5, confirmedCount: 5 }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Busca rival')).toHaveLength(1)
    await expect(canvas.queryByText(/Se juega/)).toBeNull()
    await expect(canvas.getByText('5 de 5 confirmados')).toBeInTheDocument()
  },
}

export const EnElBanco: Story = {
  args: { match: mine({ myStatus: 'bench', confirmedCount: 10 }), roster },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Quedaste en el banco. Si alguien se baja, entrás vos y te avisamos por mail.',
      ),
    ).toBeInTheDocument()
  },
}

export const Bajado: Story = {
  args: { match: mine({ myStatus: 'left' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Te bajaste de este partido.')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Me bajo' })).toBeNull()
  },
}

export const Sacado: Story = {
  args: { match: mine({ myStatus: 'removed' }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Ya no estás en este partido.'),
    ).toBeInTheDocument()
  },
}

export const Cancelado: Story = {
  args: { match: mine({ status: 'canceled', myStatus: 'confirmed' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Este partido se cayó.')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Me bajo' })).toBeNull()
  },
}

export const Vencido: Story = {
  args: {
    match: mine({ startsAt: new Date('2026-03-13T00:00:00Z'), myStatus: 'confirmed' }),
    roster,
    contactLink: CONTACT_LINK,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jugado')).toBeInTheDocument()
    await expect(canvas.queryByText(/^Faltan/)).toBeNull()
    // Sin acciones de un partido que ya se jugó: ni bajarse ni escribir.
    await expect(canvas.queryByRole('button', { name: 'Me bajo' })).toBeNull()
    await expect(canvas.queryByRole('link', { name: 'Escribile por WhatsApp' })).toBeNull()
  },
}
