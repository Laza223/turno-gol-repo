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
      match({ id: 'left', myStatus: 'left' }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Organizás vos')).toBeInTheDocument()
    await expect(canvas.getByText('En el banco')).toBeInTheDocument()
    await expect(canvas.getByText('Pedido enviado')).toBeInTheDocument()
    await expect(canvas.getByText('Jugado')).toBeInTheDocument()
    // Me bajé: ya no es "mío".
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
    // Solo el partido que organizo linkea (los demás no tienen vista propia todavía).
    await expect(canvas.getAllByRole('link', { name: 'El Vagón' })).toHaveLength(1)
  },
}

export const Vacio: Story = {
  args: { matches: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Todavía no tenés partidos. Armá uno y pasale el link al grupo.',
      ),
    ).toBeInTheDocument()
  },
}
