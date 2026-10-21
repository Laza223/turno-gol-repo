import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type {
  WhatsappMonitor,
  WhatsappTenantHealth,
} from '@/modules/super-admin/whatsapp-monitor.service'
import { WhatsappMonitorView } from './whatsapp-monitor-view'

const NOW = new Date('2026-10-21T15:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

function tenant(overrides: Partial<WhatsappTenantHealth> = {}): WhatsappTenantHealth {
  return {
    tenantId: 'tenant-1',
    name: 'El Vagón Deportivo',
    slug: 'el-vagon',
    displayPhoneNumber: '+54 11 5555-0001',
    status: 'connected',
    enabled: true,
    lastInboundAt: minutesAgo(12),
    lastOutboundAt: minutesAgo(11),
    backlog: 0,
    pausedByReason: {},
    monthMessages: 420,
    monthUsd: 0.18,
    botBookings: 9,
    botBookingsDepositPaid: 6,
    ...overrides,
  }
}

function monitor(overrides: Partial<WhatsappMonitor> = {}): WhatsappMonitor {
  return {
    month: '2026-10',
    kapso: {
      total: 700,
      byDirection: { inbound: 300, outbound: 350, owner: 50 },
      limit: 2000,
      pct: 35,
      projected: 1000,
      crossingDay: null,
      daysInMonth: 31,
    },
    anthropic: {
      tokens: { input: 1_200_000, cached: 3_400_000, output: 180_000 },
      costUsd: 0.244,
      projectedUsd: 0.35,
    },
    tenants: [
      tenant(),
      tenant({
        tenantId: 'tenant-2',
        name: 'Complejo La Quinta',
        slug: 'la-quinta',
        displayPhoneNumber: null,
        enabled: false,
        monthMessages: 280,
        monthUsd: 0.06,
        botBookings: 0,
        botBookingsDepositPaid: 0,
      }),
    ],
    ...overrides,
  }
}

const meta = {
  title: 'SuperAdmin/WhatsApp/MonitorView',
  component: WhatsappMonitorView,
  parameters: { layout: 'padded' },
  args: { data: monitor() },
} satisfies Meta<typeof WhatsappMonitorView>

export default meta
type Story = StoryObj<typeof meta>

export const Normal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Kapso este mes')).toBeInTheDocument()
    await expect(canvas.getByText(/35%/)).toBeInTheDocument()
    await expect(
      within(canvas.getByRole('table')).getByText('Complejo La Quinta'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText(/Se pasaría del límite/)).not.toBeInTheDocument()
  },
}

/** Más del 80%, la proyección pasa el límite, cola trabada y un chat pausado por error del bot. */
export const Alerta: Story = {
  args: {
    data: monitor({
      kapso: {
        total: 1700,
        byDirection: { inbound: 700, outbound: 900, owner: 100 },
        limit: 2000,
        pct: 85,
        projected: 2600,
        crossingDay: 26,
        daysInMonth: 31,
      },
      tenants: [
        tenant({
          backlog: 4,
          pausedByReason: { bot_error: 1, owner_replied: 2 },
          monthMessages: 1700,
        }),
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/85%/)).toBeInTheDocument()
    await expect(canvas.getByText(/Se pasaría del límite/)).toBeInTheDocument()
    const table = within(canvas.getByRole('table'))
    await expect(table.getByText('Mensajes sin contestar')).toBeInTheDocument()
    await expect(table.getByText(/1 error del bot/)).toBeInTheDocument()
  },
}

export const SinComplejos: Story = {
  args: {
    data: monitor({
      kapso: {
        total: 0,
        byDirection: { inbound: 0, outbound: 0, owner: 0 },
        limit: 2000,
        pct: 0,
        projected: 0,
        crossingDay: null,
        daysInMonth: 31,
      },
      anthropic: { tokens: { input: 0, cached: 0, output: 0 }, costUsd: 0, projectedUsd: 0 },
      tenants: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Todavía no hay ningún complejo con el bot conectado.'),
    ).toBeInTheDocument()
  },
}
