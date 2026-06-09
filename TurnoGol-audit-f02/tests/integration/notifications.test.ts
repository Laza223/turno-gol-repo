import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  closeSql,
  getDb,
  getSql,
  withTenantContext,
} from '@/shared/db/client'
import {
  enqueueNotification,
} from '@/modules/notifications/notification.service'
import { processQueuedNotifications as sweepNotifications } from '@/shared/jobs/workers/send-email.worker'
import {
  setEmailProvider,
  resetEmailProvider,
  type EmailProvider,
} from '@/modules/notifications/email.provider'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

afterEach(async () => {
  resetEmailProvider()
  const sql = getSql()
  await sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`
})

describe('notification pipeline', () => {
  it('enqueue → sweep → provider called → status=sent, sent_at populated', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)

    const calls: Array<{ to: string; subject: string }> = []
    const mockProvider: EmailProvider = {
      send: async ({ to, subject }) => {
        calls.push({ to, subject })
      },
    }
    setEmailProvider(mockProvider)

    let notifId: string | undefined
    await withTenantContext(tenant.id, async (tx) => {
      notifId = await enqueueNotification(
        {
          tenantId: tenant.id,
          recipientType: 'player',
          recipientId: player.id,
          templateName: 'booking_confirmed',
          content: {
            playerFirstName: 'Tomás',
            courtName: 'Cancha 1',
            date: '26/04/2027',
            timeStart: '10:00',
            timeEnd: '11:00',
            tenantName: tenant.name,
            tenantAddress: 'Av. Siempreviva 742',
          },
          triggerEvent: 'booking.confirmed',
        },
        tx,
      )
    })

    expect(notifId).toBeDefined()

    await sweepNotifications()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.to).toBe(player.email)
    expect(calls[0]!.subject).toContain('Cancha 1')

    const rows = await sql<{ status: string; sent_at: Date | null }[]>`
      SELECT status, sent_at FROM notifications WHERE id = ${notifId!}
    `
    expect(rows[0]!.status).toBe('sent')
    expect(rows[0]!.sent_at).not.toBeNull()
  })

  it('provider fails 3× → status=failed, last_error set', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)

    const mockProvider: EmailProvider = {
      send: async () => {
        throw new Error('Resend down')
      },
    }
    setEmailProvider(mockProvider)

    let notifId: string | undefined
    await withTenantContext(tenant.id, async (tx) => {
      notifId = await enqueueNotification(
        {
          tenantId: tenant.id,
          recipientType: 'player',
          recipientId: player.id,
          templateName: 'booking_confirmed',
          content: {
            playerFirstName: 'Tomás',
            courtName: 'Cancha 1',
            date: '26/04/2027',
            timeStart: '10:00',
            timeEnd: '11:00',
            tenantName: tenant.name,
            tenantAddress: 'Av. Siempreviva 742',
          },
          triggerEvent: 'booking.confirmed',
        },
        tx,
      )
    })

    // 3 sweep runs — each processes one failed attempt
    await sweepNotifications()
    await sweepNotifications()
    await sweepNotifications()

    const rows = await sql<{ status: string; last_error: string | null; attempt_count: number }[]>`
      SELECT status, last_error, attempt_count FROM notifications WHERE id = ${notifId!}
    `
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.last_error).toContain('Resend down')
  })

  it('wrong recipient type → DB trigger raises foreign_key_violation', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)

    // Use staff user's ID as recipientId with recipientType='player' — trigger must reject
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await enqueueNotification(
          {
            tenantId: tenant.id,
            recipientType: 'player',
            recipientId: staff.id, // staff ID passed as player → trigger rejects
            templateName: 'booking_confirmed',
            content: {
              playerFirstName: 'X',
              courtName: 'Y',
              date: '01/01/2027',
              timeStart: '10:00',
              timeEnd: '11:00',
              tenantName: 'Z',
              tenantAddress: 'W',
            },
            triggerEvent: 'test',
          },
          tx,
        )
      }),
    ).rejects.toThrow(/foreign_key_violation|recipient_id/i)
  })
})
