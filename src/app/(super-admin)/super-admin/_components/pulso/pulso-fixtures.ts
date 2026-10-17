import type { PlatformActivity } from '@/modules/super-admin/activity.service'
import type { DashboardData } from '@/modules/super-admin/dashboard.service'
import { dashboardData as baseDashboard, dashboardDataEmpty } from '@/test/fixtures/super-admin'

/** Datos de mentira para las stories del Pulso (no se usan en producción). */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

function ymd(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const SERIES_PLAYERS = [0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 10]
const SERIES_ONLINE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 9]

export const pulsoActivity = (overrides: Partial<PlatformActivity> = {}): PlatformActivity => ({
  window: 'hoy',
  current: { newPlayers: 10, onlineBookings: 9, staffBookings: 14, activeTenants: 3 },
  previous: { newPlayers: 3, onlineBookings: 0, staffBookings: 11, activeTenants: 2 },
  series: SERIES_PLAYERS.map((newPlayers, i) => ({
    day: ymd(13 - i),
    newPlayers,
    onlineBookings: SERIES_ONLINE[i] ?? 0,
  })),
  recentOnlineBookings: [
    ['Mateo Fernández', 'Cancha 1', 'confirmed', 'paid', 18],
    ['Lucía Gómez', 'Cancha 2', 'pending_payment', 'pending', 40],
    ['Tomás Ruiz', 'Cancha 1', 'confirmed', 'paid', 95],
    ['Camila Díaz', 'Cancha 3', 'canceled_no_refund', null, 180],
  ].map(([playerName, courtName, status, depositStatus, ago], i) => ({
    id: uid(100 + i),
    createdAt: minutesAgo(ago as number),
    tenantId: uid(1),
    tenantName: 'El Vagón',
    courtName: courtName as string,
    date: ymd(-1),
    timeStart: `${18 + i}:00:00`,
    timeEnd: `${19 + i}:00:00`,
    status: status as string,
    depositStatus: depositStatus as string | null,
    playerId: uid(200 + i),
    playerName: playerName as string,
  })),
  recentPlayers: [
    ['Mateo Fernández', 'El Vagón', 20],
    ['Lucía Gómez', 'El Vagón', 42],
    ['Sofía Pereyra', null, 130],
  ].map(([name, tenant, ago], i) => ({
    id: uid(200 + i),
    name: name as string,
    status: 'active' as const,
    createdAt: minutesAgo(ago as number),
    firstTenantName: tenant as string | null,
  })),
  ...overrides,
})

export const pulsoActivityEmpty = (): PlatformActivity =>
  pulsoActivity({
    current: { newPlayers: 0, onlineBookings: 0, staffBookings: 0, activeTenants: 0 },
    previous: { newPlayers: 0, onlineBookings: 0, staffBookings: 0, activeTenants: 0 },
    series: SERIES_PLAYERS.map((_, i) => ({ day: ymd(13 - i), newPlayers: 0, onlineBookings: 0 })),
    recentOnlineBookings: [],
    recentPlayers: [],
  })

export const pulsoDashboard = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  ...baseDashboard(),
  troubledTenants: [{ id: uid(7010), name: 'Canchas del Norte', status: 'past_due' }],
  failedJobs24h: [{ queue: 'send-email', failed: 2 }],
  ...overrides,
})

export const pulsoDashboardEmpty = (): DashboardData => ({
  ...dashboardDataEmpty(),
  troubledTenants: [],
  failedJobs24h: [],
})
