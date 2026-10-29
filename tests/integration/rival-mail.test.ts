/**
 * Mails y alertas de RIVAL (fase 6) contra Postgres real: los hooks post-commit del service,
 * la revalidación al despertar del worker, el dedupe y la baja por token.
 *
 * DSN: superusuario (como el resto de la suite de integración). El worker real corre con un rol
 * BYPASSRLS, así que acá el pool worker == el DSN. Lo que se mide es lógica de SQL/dedupe, no RLS
 * (eso lo cubre rival-service-app-role). `adminSql()` se usa para sembrar y para leer
 * `notifications` / `rival_alert_sends` (la segunda es deny-all para la app: solo la ve el worker).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const bossSend = vi.hoisted(() => vi.fn())
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: async () => ({ send: (...a: unknown[]) => bossSend(...a) }),
}))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

import { closeSql } from '@/shared/db/client'
import { QUEUE_RIVAL_MAIL, QUEUE_SEND_EMAIL } from '@/shared/jobs/definitions'
import { anonymizePlayer } from '@/modules/players/player.anonymization'
import { RivalError } from '@/modules/rival/rival.errors'
import { createRivalMatchSchema, publishBoardSchema } from '@/modules/rival/rival.schema'
import {
  acceptRivalWelcome,
  cancelMatch,
  createMatch,
  decideRequest,
  joinByInvite,
  leaveMatch,
  publishToBoard,
  requestToJoin,
} from '@/modules/rival/rival.service'
import {
  listMyAlerts,
  peekAlertUnsub,
  subscribeAlert,
  unsubscribeAlert,
  unsubscribeByToken,
} from '@/modules/rival/rival-alerts.service'
import { processRivalMailJob } from '@/modules/rival/rival-mail.service'
import { signAlertUnsubToken } from '@/shared/security/rival-alert-token'
import { adminSql } from '../helpers/admin-db'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { insertBan } from '../helpers/factories'

const HOUR = 3_600_000
const WHATSAPP = '11 5555-1234'
const SECRET = 'test-secret-at-least-16-chars-long'

let tenant: { id: string; slug: string; name: string }

beforeAll(async () => {
  await ensureRoles()
  await cleanupAll()
}, 60_000)

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

beforeEach(async () => {
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', SECRET)
  bossSend.mockReset()
  bossSend.mockResolvedValue('job-id')
  // Complejo propio por test: las suscripciones son por complejo y no deben pisarse entre casos.
  tenant = await createTestTenant()
})

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Mediodía ART más próximo hacia adelante: fuera de la ventana silenciosa y antes que cualquier partido de los tests. */
function noonArt(): Date {
  const shifted = new Date(Date.now() - 3 * HOUR)
  let noon = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    15,
    0,
    0,
  )
  if (noon <= Date.now() + 60_000) noon += 24 * HOUR
  return new Date(noon)
}

const pastIso = () => new Date(noonArt().getTime() - HOUR).toISOString()

async function welcomed(firstName: string): Promise<string> {
  const id = (await createTestPlayer()).id
  await acceptRivalWelcome(id, { firstName, position: 'midfielder', zone: 'Luján' })
  return id
}

function startsAtIn(hoursAhead: number): string {
  return new Date(Math.ceil((Date.now() + hoursAhead * HOUR) / HOUR) * HOUR).toISOString()
}

type DraftOpts = {
  capacity?: number
  seeking?: 'players' | 'rival'
  position?: 'any' | 'goalkeeper'
}

function draft(o: DraftOpts) {
  return createRivalMatchSchema.parse({
    tenantId: tenant.id,
    startsAt: startsAtIn(48),
    format: 5,
    // "Mi equipo busca rival" fija los jugadores al formato (canSeekRival).
    capacity: o.capacity ?? (o.seeking === 'rival' ? 5 : undefined),
    level: 'parejo',
    courtDeclared: true,
  })
}

/** Arma el partido y, con `seeking`, lo publica: el tablón ya no se arma en `createMatch`. */
async function create(playerId: string, o: DraftOpts) {
  const created = await createMatch(playerId, draft(o))
  if (o.seeking) {
    await publishToBoard(
      playerId,
      created.id,
      publishBoardSchema.parse({
        seeking: o.seeking,
        ...(o.position ? { seekingPosition: o.position } : {}),
        whatsapp: WHATSAPP,
        whatsappConsent: true,
      }),
    )
  }
  return created
}

type NotifRow = {
  id: string
  recipient_id: string
  template_name: string
  trigger_event: string
  content: Record<string, unknown>
}

/** Excepción de adminSql(): las notificaciones son globales y las lee el assert, no la app. */
async function notifsFor(recipientIds: string[], event?: string): Promise<NotifRow[]> {
  const rows = await adminSql()<NotifRow[]>`
    SELECT id, recipient_id, template_name, trigger_event, content
    FROM notifications
    WHERE recipient_id = ANY(${recipientIds}::uuid[])
    ORDER BY queued_at, id
  `
  return event ? rows.filter((r) => r.trigger_event === event) : rows
}

/** Sin app.current_player_id los triggers de reglas por actor se saltean: sirve para forzar estados. */
async function setMatch(matchId: string, set: string): Promise<void> {
  await adminSql().unsafe(`UPDATE rival_matches SET ${set} WHERE id = '${matchId}'`)
}

// ─── 1. Hooks post-commit del service ────────────────────────────────────

describe('1. hooks de rival.service: encolan DESPUÉS del commit y nunca rompen la acción', () => {
  /** Qué ve una conexión APARTE en el instante exacto en que se llama a boss.send. */
  function probeOnSend(probe: (data: Record<string, unknown>) => Promise<boolean>) {
    const seen: Array<{ data: Record<string, unknown>; committed: boolean }> = []
    bossSend.mockImplementation(async (queue: string, data: Record<string, unknown>) => {
      if (queue === QUEUE_RIVAL_MAIL) seen.push({ data, committed: await probe(data) })
      return 'job-id'
    })
    return seen
  }

  it('1.1 requestToJoin -> join_request con participantId, ya commiteado', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId } = await create(A, { seeking: 'players' })
    bossSend.mockClear()
    const seen = probeOnSend(async (d) => {
      const rows = await adminSql()`
        SELECT 1 FROM rival_participants WHERE id = ${String(d.participantId)}::uuid`
      return rows.length === 1
    })

    const { participantId } = await requestToJoin(B, { matchId, tenantId: tenant.id })

    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({ type: 'join_request', matchId, participantId })
    expect(seen[0]!.committed).toBe(true)
  })

  it('1.2 decideRequest accept -> accepted; decline no manda nada', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const C = await welcomed('Caro')
    const { id: matchId } = await create(A, { seeking: 'players' })
    const reqB = await requestToJoin(B, { matchId, tenantId: tenant.id })
    const reqC = await requestToJoin(C, { matchId, tenantId: tenant.id })
    bossSend.mockClear()
    const seen = probeOnSend(async (d) => {
      const rows = await adminSql()`
        SELECT status FROM rival_participants WHERE id = ${String(d.participantId)}::uuid`
      return rows[0]?.status === 'confirmed'
    })

    await decideRequest(A, reqC.participantId, 'decline')
    expect(seen).toHaveLength(0)

    await decideRequest(A, reqB.participantId, 'accept')
    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({ type: 'accepted', matchId, participantId: reqB.participantId })
    expect(seen[0]!.committed).toBe(true)
  })

  it('1.3 cancelMatch -> canceled, con el partido ya cancelado en la base', async () => {
    const A = await welcomed('Ana')
    const { id: matchId } = await create(A, {})
    bossSend.mockClear()
    const seen = probeOnSend(async (d) => {
      const rows = await adminSql()`
        SELECT status FROM rival_matches WHERE id = ${String(d.matchId)}::uuid`
      return rows[0]?.status === 'canceled'
    })

    await cancelMatch(A, matchId)

    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({ type: 'canceled', matchId })
    expect(seen[0]!.committed).toBe(true)
  })

  it('1.4 createMatch: alert_publish solo si sale al tablón', async () => {
    const A = await welcomed('Ana')
    bossSend.mockClear()
    const seen = probeOnSend(async (d) => {
      const rows = await adminSql()`
        SELECT on_board FROM rival_matches WHERE id = ${String(d.matchId)}::uuid`
      return rows[0]?.on_board === true
    })

    await create(A, {})
    expect(seen).toHaveLength(0)

    const { id } = await create(A, { seeking: 'players' })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({ type: 'alert_publish', matchId: id })
    expect(seen[0]!.committed).toBe(true)
  })

  it('1.5 publishToBoard -> alert_publish', async () => {
    const A = await welcomed('Ana')
    const { id: matchId } = await create(A, {})
    bossSend.mockClear()
    const seen = probeOnSend(async (d) => {
      const rows = await adminSql()`
        SELECT on_board FROM rival_matches WHERE id = ${String(d.matchId)}::uuid`
      return rows[0]?.on_board === true
    })

    await publishToBoard(
      A,
      matchId,
      publishBoardSchema.parse({ seeking: 'players', whatsapp: WHATSAPP, whatsappConsent: true }),
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({ type: 'alert_publish', matchId })
    expect(seen[0]!.committed).toBe(true)
  })

  it('1.6 si pg-boss falla la acción igual termina bien', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId } = await create(A, { seeking: 'players' })
    bossSend.mockRejectedValue(new Error('pg-boss caído'))

    const { participantId } = await requestToJoin(B, { matchId, tenantId: tenant.id })
    await expect(decideRequest(A, participantId, 'accept')).resolves.toBeUndefined()
    await expect(cancelMatch(A, matchId)).resolves.toBeUndefined()
  })

  it('1.7 un rechazo de la base NO encola nada (la tx no commiteó)', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId } = await create(A, { seeking: 'players' })
    await requestToJoin(B, { matchId, tenantId: tenant.id })
    bossSend.mockClear()
    // Segundo pedido del mismo jugador: viola la unique del plantel.
    await expect(requestToJoin(B, { matchId, tenantId: tenant.id })).rejects.toBeInstanceOf(
      RivalError,
    )
    expect(bossSend).not.toHaveBeenCalled()
  })
})

// ─── 2. join_request ─────────────────────────────────────────────────────

describe('2. join_request: revalida al despertar', () => {
  async function setup() {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId } = await create(A, { seeking: 'players' })
    const { participantId } = await requestToJoin(B, { matchId, tenantId: tenant.id })
    return {
      A,
      B,
      matchId,
      participantId,
      job: { type: 'join_request', matchId, participantId } as const,
    }
  }
  type Ctx = Awaited<ReturnType<typeof setup>>

  it('2.1 pedido vigente: mail al organizador, sin datos de contacto, y un redelivery no duplica', async () => {
    const { A, B, matchId, participantId, job } = await setup()
    await processRivalMailJob(job, noonArt())
    await processRivalMailJob(job, noonArt())

    const rows = await notifsFor([A, B])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recipient_id: A,
      template_name: 'rival_join_request',
      trigger_event: 'rival_join_request',
    })
    expect(rows[0]!.content).toMatchObject({
      ref: participantId,
      requesterFirstName: 'Beto',
      requesterRole: 'player',
    })
    expect(JSON.stringify(rows[0]!.content)).not.toMatch(/5491155551234|whatsapp|@/i)
    // El organizador cae en /rival/partido/<id>, que lo redirige a su pantalla con Aceptar / Esta vez no.
    expect(String(rows[0]!.content.url)).toMatch(new RegExp(`/rival/partido/${matchId}$`))
  })

  it('2.1b pedido a un partido que busca rival: el mail dice capitán, aunque después se despublique', async () => {
    const A = await welcomed('Ana')
    const CAP = await welcomed('Cap')
    const { id: matchId } = await create(A, { seeking: 'rival' })
    const { participantId } = await requestToJoin(CAP, { matchId, tenantId: tenant.id })
    await setMatch(matchId, 'on_board = false, seeking = NULL, seeking_position = NULL')
    await processRivalMailJob({ type: 'join_request', matchId, participantId }, noonArt())
    const rows = await notifsFor([A], 'rival_join_request')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toMatchObject({ requesterFirstName: 'Cap', requesterRole: 'captain' })
  })

  it.each([
    ['pedido rechazado', (c: Ctx) => decideRequest(c.A, c.participantId, 'decline')],
    ['pedido retirado', (c: Ctx) => leaveMatch(c.B, c.matchId)],
    ['partido cancelado', (c: Ctx) => cancelMatch(c.A, c.matchId)],
    ['partido oculto', (c: Ctx) => setMatch(c.matchId, 'hidden_at = now()')],
    ['partido vencido', (c: Ctx) => setMatch(c.matchId, `starts_at = '${pastIso()}'`)],
    [
      'partido lleno (ya no busca jugadores)',
      (c: Ctx) => setMatch(c.matchId, 'confirmed_count = capacity, filled_at = now()'),
    ],
  ])('2.2 %s => 0 filas', async (_l, mutate) => {
    const ctx = await setup()
    await mutate(ctx)
    await processRivalMailJob(ctx.job, noonArt())
    expect(await notifsFor([ctx.A, ctx.B])).toHaveLength(0)
  })

  it('2.3 organizador baneado => 0 filas', async () => {
    const ctx = await setup()
    await adminSql()`UPDATE players SET status = 'banned' WHERE id = ${ctx.A}`
    await processRivalMailJob(ctx.job, noonArt())
    expect(await notifsFor([ctx.A])).toHaveLength(0)
  })
})

// ─── 3. accepted ─────────────────────────────────────────────────────────

describe('3. accepted', () => {
  async function setup() {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId } = await create(A, { seeking: 'players' })
    const { participantId } = await requestToJoin(B, { matchId, tenantId: tenant.id })
    await decideRequest(A, participantId, 'accept')
    return {
      A,
      B,
      matchId,
      participantId,
      job: { type: 'accepted', matchId, participantId } as const,
    }
  }
  type Ctx = Awaited<ReturnType<typeof setup>>

  it('3.1 aceptado vigente: mail al aceptado con link adentro de la app, sin teléfono', async () => {
    const { A, B, matchId, participantId, job } = await setup()
    await processRivalMailJob(job, noonArt())
    await processRivalMailJob(job, noonArt())

    const rows = await notifsFor([A, B])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ recipient_id: B, template_name: 'rival_accepted' })
    expect(rows[0]!.content).toMatchObject({ ref: participantId })
    expect(String(rows[0]!.content.url)).toContain(`/rival/partido/${matchId}`)
    expect(JSON.stringify(rows[0]!.content)).not.toMatch(/5491155551234|wa\.me/i)
  })

  it.each([
    ['se bajó', (c: Ctx) => leaveMatch(c.B, c.matchId)],
    ['partido cancelado', (c: Ctx) => cancelMatch(c.A, c.matchId)],
    ['partido vencido', (c: Ctx) => setMatch(c.matchId, `starts_at = '${pastIso()}'`)],
    ['partido oculto', (c: Ctx) => setMatch(c.matchId, 'hidden_at = now()')],
  ])('3.2 %s => 0 filas', async (_l, mutate) => {
    const ctx = await setup()
    await mutate(ctx)
    await processRivalMailJob(ctx.job, noonArt())
    expect(await notifsFor([ctx.B])).toHaveLength(0)
  })

  it('3.4 el capitán rival confirmado también recibe "te aceptaron"', async () => {
    const A = await welcomed('Ana')
    const CAP = await welcomed('Cap')
    const { id: matchId } = await create(A, { seeking: 'rival' })
    const [row] = await adminSql()`
      INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin, confirmed_at)
      VALUES (${tenant.id}, ${matchId}, ${CAP}, 'rival_captain', 'confirmed', 'board', now())
      RETURNING id`
    await processRivalMailJob(
      { type: 'accepted', matchId, participantId: String(row!.id) },
      noonArt(),
    )
    expect(await notifsFor([CAP], 'rival_accepted')).toHaveLength(1)
  })

  it('3.3 quien entró por link (origin invite) no recibe "te aceptaron"', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId, inviteCode } = await create(A, { capacity: 3 })
    const joined = await joinByInvite(B, inviteCode)
    await processRivalMailJob(
      { type: 'accepted', matchId, participantId: joined.participantId },
      noonArt(),
    )
    expect(await notifsFor([B])).toHaveLength(0)
  })
})

// ─── 4. canceled ─────────────────────────────────────────────────────────

describe('4. canceled', () => {
  async function setup() {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto') // confirmado
    const C = await welcomed('Caro') // banco
    const D = await welcomed('Dani') // se bajó
    const E = await welcomed('Eli') // pedido pendiente
    const { id: matchId, inviteCode } = await create(A, { capacity: 2, seeking: 'players' })
    // El pedido va primero: con el partido lleno la base ya no admite pedidos.
    await requestToJoin(E, { matchId, tenantId: tenant.id })
    await joinByInvite(B, inviteCode)
    await joinByInvite(C, inviteCode)
    await joinByInvite(D, inviteCode)
    await leaveMatch(D, matchId)
    return { A, B, C, D, E, matchId, job: { type: 'canceled', matchId } as const }
  }

  it('4.1 confirmados + banco reciben; organizador, bajas y pedidos no; redelivery no duplica', async () => {
    const { A, B, C, D, E, job, matchId } = await setup()
    await cancelMatch(A, matchId)
    await processRivalMailJob(job, noonArt())
    await processRivalMailJob(job, noonArt())

    const rows = await notifsFor([A, B, C, D, E], 'rival_canceled')
    expect(rows.map((r) => r.recipient_id).sort()).toEqual([B, C].sort())
    for (const r of rows) {
      expect(r.template_name).toBe('rival_canceled')
      expect(r.content).toMatchObject({ ref: matchId })
    }
  })

  it('4.4 el capitán rival confirmado también recibe "se canceló"', async () => {
    const A = await welcomed('Ana')
    const CAP = await welcomed('Cap')
    const { id: matchId } = await create(A, { seeking: 'rival' })
    await adminSql()`
      INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin, confirmed_at)
      VALUES (${tenant.id}, ${matchId}, ${CAP}, 'rival_captain', 'confirmed', 'board', now())`
    await cancelMatch(A, matchId)
    await processRivalMailJob({ type: 'canceled', matchId }, noonArt())
    expect((await notifsFor([A, CAP], 'rival_canceled')).map((r) => r.recipient_id)).toEqual([CAP])
  })

  it('4.2 si el partido NO está cancelado => 0 filas', async () => {
    const { A, B, C, job } = await setup()
    await processRivalMailJob(job, noonArt())
    expect(await notifsFor([A, B, C])).toHaveLength(0)
  })

  it('4.3 si ya empezó => 0 filas', async () => {
    const { A, B, C, matchId, job } = await setup()
    await cancelMatch(A, matchId)
    await setMatch(matchId, `starts_at = '${pastIso()}'`)
    await processRivalMailJob(job, noonArt())
    expect(await notifsFor([B, C])).toHaveLength(0)
  })
})

// ─── 5. alert_publish ────────────────────────────────────────────────────

describe('5. alert_publish', () => {
  async function publishedMatch(
    organizer: string,
    o: { seeking?: 'players' | 'rival'; position?: 'any' | 'goalkeeper'; capacity?: number } = {},
  ) {
    const { id } = await create(organizer, {
      seeking: o.seeking ?? 'players',
      position: o.position,
      capacity: o.seeking === 'rival' ? undefined : o.capacity,
    })
    return id
  }
  const sub = (playerId: string, onlyGoalkeeper = false) =>
    adminSql()`
      INSERT INTO rival_alert_subscriptions (player_id, tenant_id, only_goalkeeper)
      VALUES (${playerId}, ${tenant.id}, ${onlyGoalkeeper})`
  const inviteCodeOf = async (matchId: string) =>
    String(
      (await adminSql()`SELECT invite_code FROM rival_matches WHERE id = ${matchId}`)[0]!
        .invite_code,
    )

  it('5.1 suscriptos reciben UN mail con link de baja firmado y sin PII', async () => {
    const A = await welcomed('Ana')
    const P1 = await welcomed('Pablo')
    const P2 = await welcomed('Pedro')
    await sub(P1)
    await sub(P2)
    const matchId = await publishedMatch(A)
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())

    const rows = await notifsFor([P1, P2], 'rival_alert_publish')
    expect(rows.map((r) => r.recipient_id).sort()).toEqual([P1, P2].sort())
    const one = rows.find((r) => r.recipient_id === P1)!
    expect(one.template_name).toBe('rival_alert')
    const token = signAlertUnsubToken({ playerId: P1, tenantId: tenant.id })
    expect(String(one.content.unsubscribeUrl)).toContain(`/rival/baja?t=${token}`)
    expect(JSON.stringify(one.content)).not.toMatch(/5491155551234|wa\.me|@/i)
  })

  it('5.2 filtros: only_goalkeeper, organizador, plantel, baneados e inactivos', async () => {
    const A = await welcomed('Ana')
    const staff = await createTestStaffUser()
    const OK = await welcomed('Ok')
    const GK = await welcomed('Gk') // solo arquero
    const IN = await welcomed('In') // ya está en el partido
    const BANNED = await welcomed('Ban') // ban manual
    const AUTO = await welcomed('Auto') // softban automático: NO frena
    const GLOBAL = await welcomed('Glob') // ban global
    const ANON = await welcomed('Anon')
    for (const p of [A, OK, IN, BANNED, AUTO, GLOBAL, ANON]) await sub(p)
    await sub(GK, true)
    await insertBan(adminSql(), { tenantId: tenant.id, playerId: BANNED, bannedBy: staff.id })
    await insertBan(adminSql(), { tenantId: tenant.id, playerId: AUTO, bannedBy: null })
    await adminSql()`UPDATE players SET status = 'banned' WHERE id = ${GLOBAL}`
    await adminSql()`UPDATE players SET status = 'anonymized' WHERE id = ${ANON}`

    const matchId = await publishedMatch(A, { capacity: 10 })
    await joinByInvite(IN, await inviteCodeOf(matchId))
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())

    const got = (
      await notifsFor([A, OK, GK, IN, BANNED, AUTO, GLOBAL, ANON], 'rival_alert_publish')
    )
      .map((r) => r.recipient_id)
      .sort()
    expect(got).toEqual([OK, AUTO].sort())
  })

  it('5.3 buscando arquero: llega también al suscripto "solo arquero"', async () => {
    const A = await welcomed('Ana')
    const GK = await welcomed('Gk')
    const OK = await welcomed('Ok')
    await sub(GK, true)
    await sub(OK)
    const matchId = await publishedMatch(A, { position: 'goalkeeper' })
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())
    const got = (await notifsFor([GK, OK], 'rival_alert_publish')).map((r) => r.recipient_id).sort()
    expect(got).toEqual([GK, OK].sort())
  })

  it('5.4 dedupe: el mismo partido republicado dos veces => 1 mail; dos jugadores => 2', async () => {
    const A = await welcomed('Ana')
    const P1 = await welcomed('Pablo')
    const P2 = await welcomed('Pedro')
    await sub(P1)
    await sub(P2)
    const matchId = await publishedMatch(A)
    const job = { type: 'alert_publish', matchId } as const
    await processRivalMailJob(job, noonArt())
    await processRivalMailJob(job, noonArt())

    expect(await notifsFor([P1], 'rival_alert_publish')).toHaveLength(1)
    expect(await notifsFor([P2], 'rival_alert_publish')).toHaveLength(1)
    const sends = await adminSql()`SELECT 1 FROM rival_alert_sends WHERE match_id = ${matchId}`
    expect(sends).toHaveLength(2)
  })

  it('5.5 dedupe: dos partidos del mismo complejo el mismo día => 1 mail por jugador', async () => {
    const A = await welcomed('Ana')
    const A2 = await welcomed('Ana2')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const m1 = await publishedMatch(A)
    const m2 = await publishedMatch(A2)
    await processRivalMailJob({ type: 'alert_publish', matchId: m1 }, noonArt())
    await processRivalMailJob({ type: 'alert_publish', matchId: m2 }, noonArt())
    expect(await notifsFor([P1], 'rival_alert_publish')).toHaveLength(1)
  })

  it('5.6 otro día ART => vuelve a avisar', async () => {
    const A = await welcomed('Ana')
    const A2 = await welcomed('Ana2')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const m1 = await publishedMatch(A)
    const m2 = await publishedMatch(A2)
    await processRivalMailJob({ type: 'alert_publish', matchId: m1 }, noonArt())
    await processRivalMailJob(
      { type: 'alert_publish', matchId: m2 },
      new Date(noonArt().getTime() + 24 * HOUR),
    )
    expect(await notifsFor([P1], 'rival_alert_publish')).toHaveLength(2)
  })

  it.each([
    ['cancelado', (A: string, id: string) => cancelMatch(A, id)],
    ['oculto', (_A: string, id: string) => setMatch(id, 'hidden_at = now()')],
    ['vencido', (_A: string, id: string) => setMatch(id, `starts_at = '${pastIso()}'`)],
    [
      'sacado del tablón',
      (_A: string, id: string) =>
        setMatch(id, 'on_board = false, seeking = NULL, seeking_position = NULL'),
    ],
    [
      'lleno',
      (_A: string, id: string) => setMatch(id, 'confirmed_count = capacity, filled_at = now()'),
    ],
  ])('5.7 partido %s => 0 filas y sin claim', async (_l, mutate) => {
    const A = await welcomed('Ana')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const matchId = await publishedMatch(A, { capacity: 2 })
    await mutate(A, matchId)
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())
    expect(await notifsFor([P1])).toHaveLength(0)
    expect(
      await adminSql()`SELECT 1 FROM rival_alert_sends WHERE match_id = ${matchId}`,
    ).toHaveLength(0)
  })

  it('5.8 busca rival => no avisa (la alerta es solo para quien falta gente o arquero)', async () => {
    const A = await welcomed('Ana')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const matchId = await publishedMatch(A, { seeking: 'rival' })
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())
    expect(await notifsFor([P1])).toHaveLength(0)
    expect(
      await adminSql()`SELECT 1 FROM rival_alert_sends WHERE match_id = ${matchId}`,
    ).toHaveLength(0)
  })

  it('5.9 organizador inactivo => no avisa', async () => {
    const A = await welcomed('Ana')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const matchId = await publishedMatch(A)
    await adminSql()`UPDATE players SET status = 'banned' WHERE id = ${A}`
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())
    expect(await notifsFor([P1])).toHaveLength(0)
  })

  it('5.10 sent_on es día ART, no UTC: 20:00 y 22:00 ART (UTC cambia de día) => 1 mail', async () => {
    const A = await welcomed('Ana')
    const A2 = await welcomed('Ana2')
    const P1 = await welcomed('Pablo')
    await sub(P1)
    const m1 = await publishedMatch(A)
    const m2 = await publishedMatch(A2)
    // noonArt() es 12:00 ART: +8 h = 20:00 ART (23:00Z) y +10 h = 22:00 ART (01:00Z del día UTC siguiente).
    await processRivalMailJob(
      { type: 'alert_publish', matchId: m1 },
      new Date(noonArt().getTime() + 8 * HOUR),
    )
    await processRivalMailJob(
      { type: 'alert_publish', matchId: m2 },
      new Date(noonArt().getTime() + 10 * HOUR),
    )
    expect(await notifsFor([P1], 'rival_alert_publish')).toHaveLength(1)
  })
})

// ─── 6. Ventana y orden de efectos ───────────────────────────────────────

describe('6. ventana silenciosa y efectos externos', () => {
  it('6.1 despertado de madrugada: re-difiere y no inserta nada', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId, inviteCode } = await create(A, { capacity: 2 })
    await joinByInvite(B, inviteCode)
    await cancelMatch(A, matchId)
    bossSend.mockClear()
    // 03:00 ART del día siguiente a "mediodía ART".
    const night = new Date(noonArt().getTime() + 15 * HOUR)
    await processRivalMailJob({ type: 'canceled', matchId }, night)

    expect(await notifsFor([B])).toHaveLength(0)
    expect(bossSend).toHaveBeenCalledTimes(1)
    expect(bossSend.mock.calls[0]![0]).toBe(QUEUE_RIVAL_MAIL)
    expect(bossSend.mock.calls[0]![2]).toMatchObject({ startAfter: expect.any(Date) })
  })

  it('6.2 dispatchEmail corre DESPUÉS del commit: cada notificación ya es visible desde otra conexión', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const C = await welcomed('Caro')
    const { id: matchId, inviteCode } = await create(A, { capacity: 2 })
    await joinByInvite(B, inviteCode)
    await joinByInvite(C, inviteCode)
    await cancelMatch(A, matchId)
    bossSend.mockReset()
    const order: string[] = []
    const visible: boolean[] = []
    const openTx: number[] = []
    bossSend.mockImplementation(async (queue: string, data: { notification_id?: string }) => {
      order.push(queue)
      if (queue === QUEUE_SEND_EMAIL) {
        // Conexión aparte: solo ve filas commiteadas.
        const rows = await adminSql()`
          SELECT 1 FROM notifications WHERE id = ${data.notification_id!}::uuid`
        visible.push(rows.length === 1)
        // Y no queda ninguna transacción abierta mientras se llama a pg-boss.
        const open = await adminSql()`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database()
            AND state LIKE 'idle in transaction%'
            AND pid <> pg_backend_pid()`
        openTx.push(Number(open[0]!.n))
      }
      return 'job-id'
    })

    await processRivalMailJob({ type: 'canceled', matchId }, noonArt())

    expect(order).toEqual([QUEUE_SEND_EMAIL, QUEUE_SEND_EMAIL])
    expect(visible).toEqual([true, true])
    expect(openTx).toEqual([0, 0])
  })

  it('6.3 si dispatchEmail falla la fila queda queued (la agarra el barrido) y el job no se rompe', async () => {
    const A = await welcomed('Ana')
    const B = await welcomed('Beto')
    const { id: matchId, inviteCode } = await create(A, { capacity: 2 })
    await joinByInvite(B, inviteCode)
    await cancelMatch(A, matchId)
    bossSend.mockReset()
    bossSend.mockRejectedValue(new Error('pg-boss caído'))

    await expect(
      processRivalMailJob({ type: 'canceled', matchId }, noonArt()),
    ).resolves.toBeUndefined()

    const rows = await adminSql()`
      SELECT status FROM notifications WHERE recipient_id = ${B}::uuid`
    expect(rows.map((r) => r.status)).toEqual(['queued'])
  })
})

// ─── 7. Alta y baja de suscripciones ─────────────────────────────────────

describe('7. suscripción y baja', () => {
  it('7.1 subscribeAlert hace upsert por jugador+complejo y listMyAlerts lo muestra', async () => {
    const P = await welcomed('Pablo')
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false })
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: true })
    const mine = await listMyAlerts(P)
    expect(mine).toEqual([{ tenantId: tenant.id, tenantName: tenant.name, onlyGoalkeeper: true }])
  })

  it('7.6 unsubscribeAlert borra la propia, es idempotente y no toca la ajena', async () => {
    const P = await welcomed('Pablo')
    const Q = await welcomed('Quique')
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false })
    await subscribeAlert(Q, { tenantId: tenant.id, onlyGoalkeeper: false })

    await unsubscribeAlert(P, tenant.id)
    await unsubscribeAlert(P, tenant.id)

    expect(await listMyAlerts(P)).toEqual([])
    expect(await listMyAlerts(Q)).toHaveLength(1)
    // Mismo complejo, pero Q no puede dar de baja a P ni P a Q: el jugador sale de la sesión.
    await unsubscribeAlert(P, tenant.id)
    expect(await listMyAlerts(Q)).toHaveLength(1)
  })

  it('7.2 complejo no visible => rival_tenant_unavailable', async () => {
    const P = await welcomed('Pablo')
    await adminSql()`UPDATE tenants SET status = 'suspended' WHERE id = ${tenant.id}`
    const e = await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false }).then(
      () => null,
      (err: unknown) => err,
    )
    expect(e).toBeInstanceOf(RivalError)
    expect((e as RivalError).code).toBe('rival_tenant_unavailable')
    expect(await listMyAlerts(P)).toEqual([])
  })

  it('7.3 el GET (peek) no borra; devuelve el nombre del complejo', async () => {
    const P = await welcomed('Pablo')
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false })
    const token = signAlertUnsubToken({ playerId: P, tenantId: tenant.id })
    expect(await peekAlertUnsub(token)).toEqual({ tenantName: tenant.name })
    expect(await peekAlertUnsub(token)).toEqual({ tenantName: tenant.name })
    expect(await listMyAlerts(P)).toHaveLength(1)
  })

  it('7.4 baja con token válido borra; repetida es no-op con ok:true; el peek después da null', async () => {
    const P = await welcomed('Pablo')
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false })
    const token = signAlertUnsubToken({ playerId: P, tenantId: tenant.id })
    expect(await unsubscribeByToken(token)).toEqual({ ok: true })
    expect(await listMyAlerts(P)).toEqual([])
    expect(await unsubscribeByToken(token)).toEqual({ ok: true })
    expect(await peekAlertUnsub(token)).toBeNull()
  })

  it('7.5 token alterado o basura: ok:false y no borra; token ajeno no borra la mía', async () => {
    const P = await welcomed('Pablo')
    const Q = await welcomed('Quique')
    await subscribeAlert(P, { tenantId: tenant.id, onlyGoalkeeper: false })
    const mine = signAlertUnsubToken({ playerId: P, tenantId: tenant.id })
    const [payload, sig] = mine.split('.')
    const forged = `${payload}.${sig!.slice(0, -2)}${sig!.endsWith('A') ? 'BB' : 'AA'}`

    expect(await unsubscribeByToken(forged)).toEqual({ ok: false })
    expect(await unsubscribeByToken('basura')).toEqual({ ok: false })
    expect(await peekAlertUnsub(forged)).toBeNull()
    // El token de OTRA persona no toca mi suscripción.
    expect(
      await unsubscribeByToken(signAlertUnsubToken({ playerId: Q, tenantId: tenant.id })),
    ).toEqual({ ok: true })
    expect(await listMyAlerts(P)).toHaveLength(1)
  })
})

// ─── 8. ARCO ─────────────────────────────────────────────────────────────

describe('8. ARCO: rival_alert_sends no bloquea la anonimización', () => {
  it('8.1 anonimizar a un jugador con filas de dedupe no falla y no deja la suscripción', async () => {
    const A = await welcomed('Ana')
    const P = await welcomed('Pablo')
    await adminSql()`
      INSERT INTO rival_alert_subscriptions (player_id, tenant_id) VALUES (${P}, ${tenant.id})`
    const { id: matchId } = await create(A, { seeking: 'players' })
    await processRivalMailJob({ type: 'alert_publish', matchId }, noonArt())
    expect(await adminSql()`SELECT 1 FROM rival_alert_sends WHERE player_id = ${P}`).toHaveLength(1)

    await expect(anonymizePlayer(P)).resolves.toBeUndefined()

    // La suscripción se borra; el dedupe queda (apunta al jugador ya anonimizado, sin dato personal).
    expect(
      await adminSql()`SELECT 1 FROM rival_alert_subscriptions WHERE player_id = ${P}`,
    ).toHaveLength(0)
    expect(await adminSql()`SELECT 1 FROM rival_alert_sends WHERE player_id = ${P}`).toHaveLength(1)
  })
})
