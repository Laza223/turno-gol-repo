import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type {
  RivalMonitor,
  RivalReportedMatch,
  RivalWeek,
} from '@/modules/super-admin/rival-monitor.service'
import { RivalMonitorView } from './rival-monitor-view'

function week(overrides: Partial<RivalWeek> = {}): RivalWeek {
  return {
    week: '2026-10-19',
    matchesCreated: 12,
    matchesOnBoard: 8,
    peopleJoined: 31,
    matchesFilled: 5,
    medianMinutesToFill: 95,
    requestsAccepted: 14,
    requestsDeclined: 4,
    requestsUnanswered: 2,
    newAccounts: 9,
    alertsSent: 22,
    reports: 3,
    matchesHidden: 1,
    ...overrides,
  }
}

const monitor: RivalMonitor = {
  weeks: [week(), week({ week: '2026-10-12', matchesCreated: 7, medianMinutesToFill: null })],
  tenants: [
    {
      tenantId: 't1',
      name: 'El Vagón Deportivo',
      matchesCreated: 19,
      matchesOnBoard: 11,
      peopleJoined: 44,
      matchesFilled: 8,
      reports: 3,
      matchesHidden: 1,
    },
  ],
  activeAlertSubscriptions: 17,
}

const hiddenMatch: RivalReportedMatch = {
  matchId: 'm1',
  tenantName: 'El Vagón Deportivo',
  startsAt: new Date('2026-10-25T00:00:00Z'),
  format: 5,
  level: 'parejo',
  canceled: false,
  hiddenAt: new Date('2026-10-23T15:00:00Z'),
  countingReporters: 3,
  openReports: 3,
  reports: [
    {
      reason: 'spam',
      createdAt: new Date('2026-10-23T14:00:00Z'),
      reporterName: 'Ana G.',
      reportedName: null,
      reportedPlayerId: null,
      reportedHasAvatar: false,
      countsForAutohide: true,
      open: true,
    },
    {
      reason: 'offensive',
      createdAt: new Date('2026-10-23T14:30:00Z'),
      reporterName: 'Luis P.',
      reportedName: 'Juan R.',
      reportedPlayerId: 'p1',
      reportedHasAvatar: true,
      countsForAutohide: false,
      open: true,
    },
  ],
}

const visibleMatch: RivalReportedMatch = {
  ...hiddenMatch,
  matchId: 'm2',
  hiddenAt: null,
  countingReporters: 1,
  openReports: 1,
  reports: [{ ...hiddenMatch.reports[0]!, open: true }],
}

const meta = {
  title: 'SuperAdmin/Rival/MonitorView',
  component: RivalMonitorView,
  parameters: { layout: 'padded' },
  args: {
    monitor,
    reports: [hiddenMatch, visibleMatch],
    actions: {
      hide: fn(async () => ({ success: true as const })),
      restore: fn(async () => ({ success: true as const })),
      removeAvatar: fn(async () => ({ success: true as const })),
    },
  },
} satisfies Meta<typeof RivalMonitorView>

export default meta
type Story = StoryObj<typeof meta>

export const Normal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Oculto')).toBeInTheDocument()
    await expect(canvas.getByText('Restaurar partido')).toBeInTheDocument()
    await expect(canvas.getByText('Ocultar partido')).toBeInTheDocument()
    await expect(canvas.getByText('Suscripciones activas a alertas:')).toBeInTheDocument()
    // Nunca contacto de las personas.
    await expect(canvasElement.textContent).not.toMatch(/@|\+54|invite/i)
  },
}

export const Moderar: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Restaurar partido'))
    const dialog = within(await within(document.body).findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Restaurar' }))
    await expect(args.actions.restore).toHaveBeenCalledWith({ matchId: 'm1' })
  },
}

export const SinDenuncias: Story = {
  args: { reports: [], monitor: { ...monitor, tenants: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No hay partidos denunciados.')).toBeInTheDocument()
    await expect(canvas.getByText('Todavía no hay partidos de RIVAL.')).toBeInTheDocument()
  },
}
