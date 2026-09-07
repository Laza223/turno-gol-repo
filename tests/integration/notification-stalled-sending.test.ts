/**
 * AUD-15 de la auditoría integral del 2026-09-06.
 *
 * `claimNotificationForSend` pasa la fila a 'sending' y las tres salidas de ese
 * estado (sent / failed / vuelta a queued) viven en la misma invocación de
 * `processSingleNotification`. Si el proceso muere en el medio — deploy de
 * Railway, OOM, kill — la fila se queda en 'sending' y el barrido, que sólo
 * mira `status = 'queued'`, no la vuelve a ver nunca: el mail no sale y nadie
 * se entera.
 *
 * Los casos 1 y 2 estuvieron ROJOS antes del arreglo: la fila seguía en
 * 'sending' después de barrer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

const sendMock = vi.fn(async (_: { to: string; subject: string; html: string }) => {})

vi.mock('@/modules/notifications/email.provider', () => ({
  getEmailProvider: () => ({ send: sendMock }),
}))

vi.mock('@/modules/notifications/templates', () => ({
  isTemplateName: (_n: string) => true,
  renderTemplate: (_n: string, _c: unknown) => ({ subject: 'Test', html: '<p>Test</p>' }),
}))

import { processQueuedNotifications } from '@/shared/jobs/workers/send-email.worker'
import { SENDING_STALE_AFTER_MINUTES } from '@/modules/notifications/notification.service'

type Fila = { status: string; attempt: number; sendingSince: Date | null }

/**
 * Siembra una notificación clavada en 'sending' desde hace `hace` (intervalo de
 * Postgres). `sendingSinceNull` reproduce las filas que ya estaban colgadas
 * antes de la migración 086, que no tienen la marca nueva.
 */
async function sembrarClavada(opts: {
  hace: string
  attempt: number
  sendingSinceNull?: boolean
}): Promise<string> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql, {
    email: `p-${Math.random().toString(36).slice(2, 10)}@test.local`,
  })
  await linkPlayerToTenant(sql, tenant.id, player.id)

  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO notifications (
      tenant_id, recipient_type, recipient_id, channel,
      trigger_event, template_name, content, status, attempt_count,
      queued_at, sending_since
    ) VALUES (
      ${tenant.id}, 'player', ${player.id}, 'email',
      'booking.confirmed', 'booking_confirmation_player',
      ${sql.json({ playerName: 'Test', date: '01/06/2027' })},
      'sending', ${opts.attempt},
      now() - ${opts.hace}::interval,
      ${opts.sendingSinceNull ? null : sql`now() - ${opts.hace}::interval`}
    )
    RETURNING id
  `
  return id
}

async function leer(id: string): Promise<Fila> {
  const sql = getSql()
  const [row] = await sql<{ status: string; attempt: number; sending_since: Date | null }[]>`
    SELECT status, attempt_count AS attempt, sending_since
    FROM notifications WHERE id = ${id}
  `
  return { status: row.status, attempt: row.attempt, sendingSince: row.sending_since }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(() => sendMock.mockClear())
afterEach(async () => cleanupAll(getSql()))
afterAll(async () => closeSql())

describe('AUD-15 · la notificación que quedó a medias vuelve a la cola', () => {
  it('una fila vieja en sending vuelve a queued y se manda en el MISMO barrido', async () => {
    const id = await sembrarClavada({ hace: '30 minutes', attempt: 1 })

    await processQueuedNotifications()

    // No alcanza con que vuelva a 'queued': el rescate corre ANTES del barrido
    // justamente para que el mail salga en este tick y no un minuto después.
    expect(sendMock).toHaveBeenCalledTimes(1)
    const fila = await leer(id)
    expect(fila.status).toBe('sent')
    expect(fila.sendingSince).toBeNull()
  }, 30_000)

  it('si ya agotó los intentos se cierra como fallida en vez de quedar colgada', async () => {
    const id = await sembrarClavada({ hace: '30 minutes', attempt: 3 })

    await processQueuedNotifications()

    expect(sendMock).not.toHaveBeenCalled()
    const fila = await leer(id)
    expect(fila.status).toBe('failed')
    expect(fila.sendingSince).toBeNull()
  }, 30_000)

  it('una fila colgada ANTES de la migración (sin la marca nueva) también se rescata', async () => {
    // `coalesce(sending_since, queued_at)`: sin la marca, el alta en la cola es
    // una cota inferior buena. Sin el coalesce estas filas quedaban afuera para
    // siempre, que son justo las que motivaron el hallazgo.
    const id = await sembrarClavada({ hace: '2 hours', attempt: 1, sendingSinceNull: true })

    await processQueuedNotifications()

    expect((await leer(id)).status).toBe('sent')
  }, 30_000)

  it('una fila tomada recién NO se toca: su envío puede seguir en vuelo', async () => {
    // Contraparte crítica. Reclamar un envío todavía en vuelo manda el mismo
    // mail dos veces, que es peor que el bug original.
    const id = await sembrarClavada({ hace: '30 seconds', attempt: 1 })

    await processQueuedNotifications()

    expect(sendMock).not.toHaveBeenCalled()
    const fila = await leer(id)
    expect(fila.status).toBe('sending')
    expect(fila.sendingSince).not.toBeNull()
  }, 30_000)

  it(`el umbral es de ${SENDING_STALE_AFTER_MINUTES} minutos, no un valor cualquiera`, async () => {
    // Justo por debajo del umbral no se toca; justo por encima sí. Sin este par,
    // un umbral de 1 minuto o de 10 horas pasaría los casos de arriba igual.
    const justoAntes = await sembrarClavada({
      hace: `${SENDING_STALE_AFTER_MINUTES - 1} minutes`,
      attempt: 1,
    })
    const justoDespues = await sembrarClavada({
      hace: `${SENDING_STALE_AFTER_MINUTES + 1} minutes`,
      attempt: 1,
    })

    await processQueuedNotifications()

    expect((await leer(justoAntes)).status).toBe('sending')
    expect((await leer(justoDespues)).status).toBe('sent')
  }, 30_000)
})

describe('AUD-15 · el claim deja la marca de tiempo que hace posible el rescate', () => {
  it('una notificación en cola pasa por sending con sending_since escrito', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql, {
      email: `p-${Math.random().toString(36).slice(2, 10)}@test.local`,
    })
    await linkPlayerToTenant(sql, tenant.id, player.id)

    const [{ id }] = await sql<{ id: string }[]>`
      INSERT INTO notifications (
        tenant_id, recipient_type, recipient_id, channel,
        trigger_event, template_name, content, status, attempt_count
      ) VALUES (
        ${tenant.id}, 'player', ${player.id}, 'email',
        'booking.confirmed', 'booking_confirmation_player',
        ${sql.json({ playerName: 'Test', date: '01/06/2027' })},
        'queued', 0
      )
      RETURNING id
    `

    // El envío falla para que la fila NO llegue a 'sent' y se pueda observar
    // que la salida de 'sending' limpia la marca.
    sendMock.mockRejectedValueOnce(new Error('Resend caído'))
    await processQueuedNotifications()

    const fila = await leer(id)
    expect(fila.status).toBe('queued')
    expect(fila.attempt).toBe(1)
    expect(fila.sendingSince).toBeNull()
  }, 30_000)
})
