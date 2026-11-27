import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  canTakeOnlineBookings,
  effectiveAllowOnlineBooking,
  isExpiredStatus,
  isPublicPortalIndexable,
  isPublicProfileVisible,
} from '@/modules/tenants/tenant.lifecycle'
import { visibleNavItems } from '@/components/layout/admin-sidebar'
import { expiredLastSql, VISIBLE_TENANT_STATUSES } from '@/modules/tenants/search.service'

// Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md): `trial_expired`
// (y su alias `free`) deja la ficha visible, sin horarios ni reserva online.

describe('isExpiredStatus', () => {
  it('trial_expired y su alias free; ningún otro estado', () => {
    expect(isExpiredStatus('trial_expired')).toBe(true)
    expect(isExpiredStatus('free')).toBe(true)
    for (const s of ['trialing', 'active', 'past_due', 'suspended', 'blocked', 'canceled']) {
      expect(isExpiredStatus(s)).toBe(false)
    }
  })
})

describe('isPublicProfileVisible vs canTakeOnlineBookings', () => {
  it.each(['trial_expired', 'free'])('%s: la ficha se ve, pero no toma reservas online', (s) => {
    expect(isPublicProfileVisible(s, null)).toBe(true)
    expect(canTakeOnlineBookings(s, null)).toBe(false)
  })

  it.each(['active', 'trialing', 'past_due'])('%s: se ve y toma reservas', (s) => {
    expect(isPublicProfileVisible(s, null)).toBe(true)
    expect(canTakeOnlineBookings(s, null)).toBe(true)
  })

  it.each(['suspended', 'blocked', 'churned', 'deleted'])('%s: ni se ve ni toma reservas', (s) => {
    expect(isPublicProfileVisible(s, null)).toBe(false)
    expect(canTakeOnlineBookings(s, null)).toBe(false)
  })

  it('canceled: depende del período pago, igual para las dos preguntas', () => {
    const now = new Date('2026-12-01T12:00:00Z')
    const future = new Date('2026-12-10T12:00:00Z')
    const past = new Date('2026-11-20T12:00:00Z')
    expect(canTakeOnlineBookings('canceled', future, now)).toBe(true)
    expect(canTakeOnlineBookings('canceled', past, now)).toBe(false)
    expect(canTakeOnlineBookings('canceled', null, now)).toBe(false)
    expect(isPublicProfileVisible('canceled', future, now)).toBe(true)
  })

  it('la ficha de un complejo vencido se indexa', () => {
    expect(isPublicPortalIndexable('trial_expired')).toBe(true)
  })
})

describe('effectiveAllowOnlineBooking', () => {
  it('el setting del dueño manda en un complejo que paga', () => {
    expect(effectiveAllowOnlineBooking({ status: 'active', allowOnlineBookingSetting: true })).toBe(
      true,
    )
    expect(
      effectiveAllowOnlineBooking({ status: 'active', allowOnlineBookingSetting: false }),
    ).toBe(false)
  })

  it('un complejo vencido nunca ofrece reserva online, aunque el setting esté prendido', () => {
    expect(
      effectiveAllowOnlineBooking({ status: 'trial_expired', allowOnlineBookingSetting: true }),
    ).toBe(false)
    expect(effectiveAllowOnlineBooking({ status: 'free', allowOnlineBookingSetting: true })).toBe(
      false,
    )
  })
})

describe('buscador', () => {
  it('lista a los vencidos (y su alias) entre los estados visibles', () => {
    expect(VISIBLE_TENANT_STATUSES).toContain('trial_expired')
    expect(VISIBLE_TENANT_STATUSES).toContain('free')
  })

  it('el orden manda a los vencidos al final, delante de cualquier otro criterio', () => {
    const { sql: text } = new PgDialect().sqlToQuery(expiredLastSql)
    expect(text).toMatch(
      /CASE WHEN .*status.* IN \('trial_expired', 'free'\) THEN 1 ELSE 0 END ASC/,
    )
  })
})

describe('menú del panel con el plan no activo', () => {
  it('no cambia: Caja sigue a la vista para operar lo ya cobrable', () => {
    const items = visibleNavItems({ staffRole: 'admin' })
    expect(items.map((i) => i.label)).toContain('Caja')
    expect(items.every((i) => i.href !== '/reactivar')).toBe(true)
  })
})
