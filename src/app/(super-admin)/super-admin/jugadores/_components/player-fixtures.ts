import type {
  PlayerBookingRow,
  PlayerDetail,
  PlayerListRow,
  PlayerStats,
  PlayerTenantLink,
} from '@/modules/super-admin/players.service'

/** Fixtures de las stories del panel Jugadores: jugadores de El Vagón, datos inventados. */

/** Fijo para que "hace 3 h" no cambie entre corridas: vie 16 oct 2026, 15:00 ART. */
export const NOW_MS = Date.parse('2026-10-16T18:00:00Z')

export function playerListRows(): PlayerListRow[] {
  return [
    {
      id: '3f1c2a10-1111-4a1b-8c11-000000000001',
      name: 'Mateo Fernández',
      email: 'mateo.fernandez@gmail.com',
      phone: '+54 9 11 5555-0101',
      status: 'active',
      createdAt: new Date('2026-10-16T14:20:00Z'),
      lastLoginAt: new Date('2026-10-16T15:00:00Z'),
      tenantsCount: 1,
      bookingsCount: 2,
    },
    {
      id: '3f1c2a10-1111-4a1b-8c11-000000000002',
      name: 'Lucía Benítez',
      email: 'lucia.benitez@hotmail.com',
      phone: null,
      status: 'active',
      createdAt: new Date('2026-10-15T22:05:00Z'),
      lastLoginAt: null,
      tenantsCount: 0,
      bookingsCount: 0,
    },
    {
      id: '3f1c2a10-1111-4a1b-8c11-000000000003',
      name: 'Joaquín Ríos',
      email: 'joaquin.rios@gmail.com',
      phone: '+54 9 11 5555-0103',
      status: 'banned',
      createdAt: new Date('2026-10-10T19:40:00Z'),
      lastLoginAt: new Date('2026-10-12T01:10:00Z'),
      tenantsCount: 1,
      bookingsCount: 3,
    },
    {
      id: '3f1c2a10-1111-4a1b-8c11-000000000004',
      name: 'Jugador anonimizado',
      email: null,
      phone: null,
      status: 'anonymized',
      createdAt: new Date('2026-09-02T12:00:00Z'),
      lastLoginAt: new Date('2026-09-20T12:00:00Z'),
      tenantsCount: 1,
      bookingsCount: 1,
    },
  ]
}

export function playerStats(): PlayerStats {
  const altas = [2, 0, 1, 4, 3]
  const series = Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 8, 17 + i, 15)).toISOString().slice(0, 10),
    newPlayers: altas[i - 25] ?? 0,
    onlineBookings: 0,
  }))
  return { total: 10, newToday: 3, new7d: 10, new30d: 10, active7d: 8, series }
}

export function playerTenantLinks(): PlayerTenantLink[] {
  return [
    {
      tenantId: '9a0b7c20-2222-4b2c-9d22-0000000000a1',
      tenantName: 'El Vagón',
      firstSeenAt: new Date('2026-10-10T19:45:00Z'),
      lastBookingAt: new Date('2026-10-14T23:00:00Z'),
      bookingsCount: 3,
      noshowCount: 2,
      relationshipStatus: 'blocked',
      tags: ['no_credit', 'difficult'],
      bannedUntil: new Date('2026-11-10T03:00:00Z'),
      isBanned: true,
    },
    {
      tenantId: '9a0b7c20-2222-4b2c-9d22-0000000000a2',
      tenantName: 'Cancha Los Pinos',
      firstSeenAt: new Date('2026-10-12T20:00:00Z'),
      lastBookingAt: null,
      bookingsCount: 0,
      noshowCount: 0,
      relationshipStatus: 'active',
      tags: [],
      bannedUntil: null,
      isBanned: false,
    },
  ]
}

export function playerBookingRows(): PlayerBookingRow[] {
  return [
    {
      id: 'b0000000-0000-4000-8000-000000000001',
      tenantName: 'El Vagón',
      courtName: 'Cancha 1',
      date: '2026-10-14',
      timeStart: '20:00:00',
      timeEnd: '21:00:00',
      status: 'no_show',
      type: 'spontaneous',
      depositStatus: 'paid',
      online: true,
      priceSnapshot: 2800000,
      createdAt: new Date('2026-10-12T13:00:00Z'),
    },
    {
      id: 'b0000000-0000-4000-8000-000000000002',
      tenantName: 'El Vagón',
      courtName: 'Cancha 2',
      date: '2026-10-11',
      timeStart: '19:00:00',
      timeEnd: '20:00:00',
      status: 'completed',
      type: 'spontaneous',
      depositStatus: 'paid',
      online: false,
      priceSnapshot: 2800000,
      createdAt: new Date('2026-10-10T19:50:00Z'),
    },
    {
      id: 'b0000000-0000-4000-8000-000000000003',
      tenantName: 'El Vagón',
      courtName: null,
      date: '2026-10-10',
      timeStart: '21:00:00',
      timeEnd: '22:00:00',
      status: 'canceled_no_refund',
      type: 'spontaneous',
      depositStatus: null,
      online: true,
      priceSnapshot: 0,
      createdAt: new Date('2026-10-10T19:45:00Z'),
    },
  ]
}

export function playerDetail(
  kind: 'activo' | 'bloqueado' | 'anonimizado' | 'sinComplejos',
): PlayerDetail {
  const base = {
    id: '3f1c2a10-1111-4a1b-8c11-000000000003',
    name: 'Joaquín Ríos',
    email: 'joaquin.rios@gmail.com' as string | null,
    phone: '+54 9 11 5555-0103' as string | null,
    status: 'active' as PlayerDetail['player']['status'],
    createdAt: new Date('2026-10-10T19:40:00Z'),
    lastLoginAt: new Date('2026-10-16T15:00:00Z') as Date | null,
    agreedToTermsAt: new Date('2026-10-10T19:41:00Z') as Date | null,
    termsVersion: '2026-09' as string | null,
    banUntil: null as Date | null,
  }
  const bookings = playerBookingRows()
  const common = {
    bookings,
    bookingsTotal: bookings.length,
    bookingsPage: 0,
    bookingsPageSize: 20,
  }
  if (kind === 'bloqueado') {
    return {
      player: {
        ...base,
        status: 'banned',
        banUntil: new Date('2026-11-30T03:00:00Z'),
      },
      tenants: playerTenantLinks(),
      ...common,
    }
  }
  if (kind === 'anonimizado') {
    return {
      player: {
        ...base,
        name: 'Jugador anonimizado',
        email: null,
        phone: null,
        status: 'anonymized',
        agreedToTermsAt: null,
        termsVersion: null,
      },
      tenants: [],
      ...common,
    }
  }
  if (kind === 'sinComplejos') {
    return {
      player: { ...base, lastLoginAt: null, agreedToTermsAt: null, termsVersion: null },
      tenants: [],
      bookings: [],
      bookingsTotal: 0,
      bookingsPage: 0,
      bookingsPageSize: 20,
    }
  }
  return { player: base, tenants: playerTenantLinks().slice(1, 2), ...common }
}
