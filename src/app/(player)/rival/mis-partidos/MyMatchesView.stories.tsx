import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { RivalMyMatch } from '@/modules/rival/rival.types'
import { MyMatchesView } from './MyMatchesView'

const NOW = new Date('2026-03-14T18:30:00Z')

const match = (o: Partial<RivalMyMatch> & { id: string }): RivalMyMatch => ({
  tenantId: 't1',
  tenantName: 'El Vagón',
  tenantSlug: 'el-vagon',
  startsAt: new Date('2026-03-15T23:00:00Z'),
  format: 5,
  capacity: 10,
  level: 'parejo',
  status: 'open',
  seeking: null,
  seekingPosition: null,
  confirmedCount: 6,
  filledAt: null,
  courtDeclared: true,
  hasStamp: false,
  isOrganizer: false,
  onBoard: false,
  inviteCode: null,
  isHidden: false,
  participantId: 'p1',
  myRole: 'player',
  myStatus: 'confirmed',
  myOrigin: 'invite',
  ...o,
})

const meta = {
  title: 'Player/Rival/MyMatchesView',
  component: MyMatchesView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rival/mis-partidos' } },
  },
  args: { now: NOW },
} satisfies Meta<typeof MyMatchesView>

export default meta
type Story = StoryObj<typeof meta>

export const Mixto: Story = {
  args: {
    matches: [
      match({
        id: 'org',
        isOrganizer: true,
        inviteCode: 'ABCDEFGHJK',
        myStatus: 'confirmed',
        hasStamp: true,
      }),
      match({ id: 'bench', startsAt: new Date('2026-03-16T23:00:00Z'), myStatus: 'bench' }),
      match({
        id: 'req',
        startsAt: new Date('2026-03-17T23:00:00Z'),
        myStatus: 'requested',
        myOrigin: 'board',
      }),
      match({ id: 'old', startsAt: new Date('2026-03-10T23:00:00Z') }),
      match({ id: 'fell', startsAt: new Date('2026-03-18T23:00:00Z'), status: 'canceled' }),
      match({ id: 'left', myStatus: 'left' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Organizás vos')).toBeInTheDocument()
    await expect(canvas.getByText('En el banco')).toBeInTheDocument()
    await expect(canvas.getByText('Pedido enviado')).toBeInTheDocument()
    await expect(canvas.getByText('Se cayó')).toBeInTheDocument()
    // "Ya pasaron" no repite "Jugado": el título de la sección ya lo dice.
    await expect(canvas.queryByText('Jugado')).toBeNull()
    // El cupo es una línea con el formato y el nivel, no tres píldoras iguales.
    await expect(canvas.getAllByText('Faltan 4').length).toBeGreaterThan(0)
    await expect(canvas.queryByText('Fútbol 5')).toBeNull()
    // Me bajé: ya no es "mío".
    await expect(canvas.getAllByRole('listitem')).toHaveLength(5)
    // El nombre accesible dice cuándo y cómo estoy; el que organizo linkea por código, los demás por id.
    const links = canvas.getAllByRole('link', { name: /^El Vagón, / })
    await expect(links).toHaveLength(5)
    await expect(links[0]).toHaveAccessibleName('El Vagón, Mañana 20:00, Organizás vos')
    await expect(links[0]).toHaveAttribute('href', '/rival/p/ABCDEFGHJK')
    await expect(links[1]).toHaveAttribute('href', '/rival/partido/bench')
    await expect(links[2]).toHaveAttribute('href', '/rival/partido/req')
  },
}

export const Vacio: Story = {
  args: { matches: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Acá van los partidos que armes y en los que te sumes.'),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Armar un partido' })).toHaveAttribute(
      'href',
      '/rival/nuevo',
    )
    // Quien llega para sumarse no queda sin salida: el tablón es la otra pestaña, pero también un link.
    await expect(canvas.getByRole('link', { name: 'Ver el tablón' })).toHaveAttribute(
      'href',
      '/rival',
    )
  },
}
