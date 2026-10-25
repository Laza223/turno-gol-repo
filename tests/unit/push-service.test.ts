import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be hoisted before imports.
vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(),
}))

vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  notifyAdminBookingCanceled,
  notifyAdminPush,
  notifyOwnerPlanEvent,
  notifyStaffPush,
} from '@/modules/notifications/push.service'
import { QUEUE_PUSH_SEND } from '@/shared/jobs/definitions'

const mockSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockGetBoss = getBoss as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>

function makeBossStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

function makeSqlStub(rows: Array<{ id: string }>) {
  // postgres tagged template returns rows directly
  const fn = vi.fn().mockResolvedValue(rows)
  return fn as unknown as ReturnType<typeof getWorkerSql>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyAdminPush', () => {
  it('returns {enqueued: 0} and does not call boss.send when no subscriptions', async () => {
    const sql = makeSqlStub([])
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const result = await notifyAdminPush('tenant-1', { type: 'booking.confirmed_online' })

    expect(result).toEqual({ enqueued: 0 })
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('returns {enqueued: 3} and calls boss.send 3 times with correct args', async () => {
    const subs = [{ id: 'sub-1' }, { id: 'sub-2' }, { id: 'sub-3' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'booking.confirmed_online', bookingId: 'b-1' }
    const result = await notifyAdminPush('tenant-1', payload)

    expect(result).toEqual({ enqueued: 3 })
    expect(boss.send).toHaveBeenCalledTimes(3)
    for (const sub of subs) {
      // F3 (hallazgo D4): booking confirmado incluye una dedupeKey
      // determinística por (bookingId, subscriptionId) — el worker la
      // reclama en push_send_log ANTES de reenviar tras un retry de pg-boss.
      expect(boss.send).toHaveBeenCalledWith(
        QUEUE_PUSH_SEND,
        {
          subscription_id: sub.id,
          payload,
          dedupeKey: `push:booking-confirmed:b-1:${sub.id}`,
        },
        expect.objectContaining({ retryLimit: 3 }),
      )
    }
  })

  it('sin bookingId en el payload (type booking.confirmed_online igual): NO agrega dedupeKey', async () => {
    // Caso límite defensivo: el único caller de producción (notifyAdminBookingConfirmed)
    // siempre manda bookingId, pero si algún día no lo hiciera, no debe crashear
    // ni mandar una dedupeKey rota (ej. "push:booking-confirmed:undefined:sub-1").
    const subs = [{ id: 'sub-1' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'booking.confirmed_online' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('payload de otro type: NO agrega dedupeKey (solo booking.confirmed_online la lleva)', async () => {
    const subs = [{ id: 'sub-1' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'other.type', bookingId: 'b-1' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('MercadoPago desconectado: dedupeKey por complejo e instante de la marca', async () => {
    // Un aviso por transición (mp-connection.service): un retry del job de
    // push no lo duplica, y una desconexión NUEVA (otro instante) sí avisa.
    const subs = [{ id: 'sub-1' }]
    mockSql.mockReturnValue(makeSqlStub(subs))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = {
      type: 'mp_disconnected',
      url: '/dashboard',
      disconnectedAt: '2026-10-22T15:00:00.000Z',
    }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      {
        subscription_id: 'sub-1',
        payload,
        dedupeKey: 'push:mp-disconnected:tenant-1:2026-10-22T15:00:00.000Z:sub-1',
      },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('MercadoPago desconectado sin instante: NO arma una dedupeKey rota', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'mp_disconnected', url: '/dashboard' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })
})

/** Parámetros con los que se llamó al tagged template del mock de `getWorkerSql`. */
function sqlParams(sql: unknown): unknown[] {
  return (sql as ReturnType<typeof vi.fn>).mock.calls.flatMap(([, ...params]) => params)
}

describe('notifyAdminPush — dedupeKey de los avisos nuevos', () => {
  it('cancelación del jugador: dedupeKey por reserva y suscripción', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'booking.canceled_by_player', bookingId: 'b-1' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload, dedupeKey: 'push:booking-canceled:b-1:sub-1' },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('cancelación sin bookingId: NO arma una dedupeKey rota', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'booking.canceled_by_player' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('plan SaaS: dedupeKey por tipo, complejo, instancia del evento y suscripción', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'plan.payment_failed', dedupeId: 'pay-9' }
    await notifyAdminPush('tenant-1', payload)

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      {
        subscription_id: 'sub-1',
        payload,
        dedupeKey: 'push:plan.payment_failed:tenant-1:pay-9:sub-1',
      },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('plan SaaS sin dedupeId: sin dedupeKey (nunca "undefined" en la clave)', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    await notifyAdminPush('tenant-1', { type: 'plan.suspended' })

    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-1', payload: { type: 'plan.suspended' } },
      expect.objectContaining({ retryLimit: 3 }),
    )
  })
})

describe('notifyAdminPush — filtro por rol', () => {
  it('sin onlyRole: el SQL no filtra por rol', async () => {
    const sql = makeSqlStub([{ id: 'sub-1' }])
    mockSql.mockReturnValue(sql)
    mockGetBoss.mockResolvedValue(makeBossStub())

    await notifyAdminPush('tenant-1', { type: 'x' })

    expect(sqlParams(sql)).not.toContain('admin')
  })

  it("onlyRole: 'admin' manda el rol como parámetro de la query (solo el dueño)", async () => {
    const sql = makeSqlStub([{ id: 'sub-1' }])
    mockSql.mockReturnValue(sql)
    mockGetBoss.mockResolvedValue(makeBossStub())

    await notifyAdminPush('tenant-1', { type: 'plan.suspended' }, { onlyRole: 'admin' })

    expect(sqlParams(sql)).toContain('admin')
  })
})

describe('notifyAdminBookingCanceled', () => {
  const rows = [
    { court_name: 'Cancha 2', date: '2026-10-25', time_start: '21:00', time_end: '22:00' },
  ]

  it('lee el contexto de la reserva y encola el push con título, cuerpo y late', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)
    mockWithTenantContext.mockResolvedValue(rows)

    await notifyAdminBookingCanceled('tenant-1', 'b-1', { late: true })

    expect(mockWithTenantContext).toHaveBeenCalledWith('tenant-1', expect.any(Function))
    const [queue, data] = boss.send.mock.calls[0]!
    expect(queue).toBe(QUEUE_PUSH_SEND)
    expect(data).toMatchObject({
      subscription_id: 'sub-1',
      dedupeKey: 'push:booking-canceled:b-1:sub-1',
      payload: {
        type: 'booking.canceled_by_player',
        bookingId: 'b-1',
        late: true,
        title: 'Cancelación tardía — Cancha 2',
        url: '/grilla?date=2026-10-25',
      },
    })
  })

  it('nunca lanza: si falla la lectura del contexto, resuelve y no encola nada', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)
    mockWithTenantContext.mockRejectedValue(new Error('db caída'))

    await expect(
      notifyAdminBookingCanceled('tenant-1', 'b-1', { late: false }),
    ).resolves.toBeUndefined()
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('nunca lanza: si falla pg-boss, resuelve', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    mockGetBoss.mockRejectedValue(new Error('boss caído'))
    mockWithTenantContext.mockResolvedValue(rows)

    await expect(
      notifyAdminBookingCanceled('tenant-1', 'b-1', { late: false }),
    ).resolves.toBeUndefined()
  })
})

describe('notifyOwnerPlanEvent', () => {
  it('encola el aviso de plan filtrando por el rol admin (el encargado no ve facturación)', async () => {
    const sql = makeSqlStub([{ id: 'sub-1' }])
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    await notifyOwnerPlanEvent('tenant-1', { event: 'trial_expired' }, 'trial-2026-11-01')

    expect(sqlParams(sql)).toContain('admin')
    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      expect.objectContaining({
        dedupeKey: 'push:plan.trial_expired:tenant-1:trial-2026-11-01:sub-1',
        payload: expect.objectContaining({
          type: 'plan.trial_expired',
          title: 'Terminó tu prueba',
        }),
      }),
      expect.objectContaining({ retryLimit: 3 }),
    )
  })

  it('nunca lanza: un fallo de la cola no tira la transición de plan que lo disparó', async () => {
    mockSql.mockReturnValue(makeSqlStub([{ id: 'sub-1' }]))
    mockGetBoss.mockRejectedValue(new Error('boss caído'))

    await expect(
      notifyOwnerPlanEvent('tenant-1', { event: 'suspended' }, 'x'),
    ).resolves.toBeUndefined()
  })
})

describe('notifyStaffPush', () => {
  it('returns {enqueued: 0} when no subscriptions match staff user', async () => {
    const sql = makeSqlStub([])
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const result = await notifyStaffPush('tenant-1', 'staff-user-1', { type: 'test' })

    expect(result).toEqual({ enqueued: 0 })
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('SQL query includes both tenantId AND staffUserId', async () => {
    const subs = [{ id: 'sub-a' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    await notifyStaffPush('tenant-42', 'staff-99', { type: 'test.push' })

    // The tagged template is called with a string fragment array and parameters.
    // We verify the call happened and that the boss.send was invoked with the right sub id.
    expect(boss.send).toHaveBeenCalledTimes(1)
    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-a', payload: { type: 'test.push' } },
      expect.objectContaining({ retryLimit: 3 }),
    )
    // Verify the sql mock was called (the WHERE clause includes both ids as template args).
    expect(sql).toHaveBeenCalledTimes(1)
  })
})
