import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'
import {
  insertBooking,
  insertCourt,
  insertWhatsappChat,
  insertWhatsappMessage,
} from '../helpers/factories'
// Seed + counters compartidos con data-retention-worker-role.test.ts (rol real).
import { FULL, ZERO, countChildren, setupTenant } from '../helpers/retention'

import {
  runDataRetentionCleanup,
  wipeTenant,
} from '@/shared/jobs/workers/data-retention-cleanup.worker'

type OrphanedMpAuditRow = {
  tenant_id: string | null
  actor_id: string
  actor_type: string
  action: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown> | null
}

/**
 * Rastro durable (tenant_id NULL, sobrevive al wipe) del huérfano MP↔DB — ver
 * `recordOrphanedMpPreapproval` en el worker. Filtra por `mpSubscriptionId` en
 * vez de contar filas: el archivo no trunca `audit_logs` entre tests, así que
 * varias corridas de este describe pueden convivir.
 */
async function fetchOrphanedMpAudit(
  sql: ReturnType<typeof getSql>,
  mpSubscriptionId: string,
): Promise<OrphanedMpAuditRow[]> {
  const rows = await sql<OrphanedMpAuditRow[]>`
    SELECT tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata
    FROM audit_logs
    WHERE tenant_id IS NULL
      AND action = 'billing.mp_preapproval_orphaned'
      AND metadata ->> 'mpSubscriptionId' = ${mpSubscriptionId}
  `
  return rows.map((r) => ({
    ...r,
    metadata:
      typeof r.metadata === 'string'
        ? (JSON.parse(r.metadata) as Record<string, unknown>)
        : r.metadata,
  }))
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  // Cleanup leftover abonado (factory uses random day_of_week) so tests with
  // hard-coded day_of_week (e.g. race-abonado-vs-individual) aren't polluted.
  await cleanupAll(getSql())
  await closeSql()
})

afterEach(() => {
  // El worker llama getBillingGateway() internamente (B5 Fase 3); el override
  // es un singleton de módulo (mismo patrón que tests/integration/billing.test.ts)
  // y NO debe filtrar a otros tests/archivos de la misma corrida.
  setBillingGateway(null)
})

describe('data-retention-cleanup', () => {
  it('borra TODA fila hija y anonimiza el tenant cuando scheduled_deletion_at <= NOW()', async () => {
    const { tenantId, playerId } = await setupTenant({ scheduleDaysAgo: 1 })
    const sql = getSql()

    // Programa de referidos (migr. 094): sin setearlo acá, NULL→NULL no
    // probaría nada (setupTenant no lo puebla — mismo criterio que el resto
    // de esta seed, ver el comentario de setupTenant en retention.ts).
    await sql`UPDATE tenants SET referral_code = 'AH2K9MZP' WHERE id = ${tenantId}`

    expect(await countChildren(sql, tenantId)).toEqual(FULL)

    await runDataRetentionCleanup()

    // Every isolated child table — including tenant_subscriptions — emptied.
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)

    const [tenant] = await sql<
      Array<{
        status: string
        name: string
        email: string
        address: string
        phone: string
        description: string | null
        logo_url: string | null
        cover_url: string | null
        whatsapp: string | null
        latitude: string | null
        longitude: string | null
        mp_access_token: string | null
        mp_refresh_token: string | null
        mp_user_id: string | null
        mp_public_key: string | null
        mp_nickname: string | null
        mp_connected_at: Date | null
        scheduled_deletion_at: Date | null
        referral_code: string | null
      }>
    >`
      SELECT status, name, email, address, phone, description, logo_url, cover_url,
             whatsapp, latitude, longitude, mp_access_token, mp_refresh_token,
             mp_user_id, mp_public_key, mp_nickname, mp_connected_at, scheduled_deletion_at,
             referral_code
      FROM tenants WHERE id = ${tenantId}
    `
    expect(tenant.status).toBe('deleted')
    expect(tenant.name).toBe('[deleted]')
    expect(tenant.address).toBe('[deleted]')
    expect(tenant.phone).toBe('[deleted]')
    expect(tenant.email).toMatch(/^deleted-.*@anon\.local$/)
    expect(tenant.description).toBeNull()
    expect(tenant.logo_url).toBeNull()
    expect(tenant.cover_url).toBeNull()
    expect(tenant.whatsapp).toBeNull()
    expect(tenant.latitude).toBeNull()
    expect(tenant.longitude).toBeNull()
    expect(tenant.scheduled_deletion_at).toBeNull()
    // MP OAuth credentials are the highest-value secret on this row: every
    // token/identifier must be wiped or a "deleted" tenant can still cobrar.
    expect(tenant.mp_access_token).toBeNull()
    expect(tenant.mp_refresh_token).toBeNull()
    expect(tenant.mp_user_id).toBeNull()
    expect(tenant.mp_public_key).toBeNull()
    // AUD-09: `mp_nickname` es el nombre visible de la cuenta de MercadoPago, y
    // en un monotributista es el nombre de una PERSONA. Quedaba en la fila
    // después del borrado, que es justo lo que /terminos promete que no pasa.
    expect(tenant.mp_nickname).toBeNull()
    expect(tenant.mp_connected_at).toBeNull()
    // El código que este complejo repartía es suyo — se limpia igual que el
    // resto de sus datos públicos (referred_by_tenant_id/referral_reward_*
    // NO se tocan: son historia del referidor, no un dato de este tenant).
    expect(tenant.referral_code).toBeNull()

    // Player record itself NOT deleted (cross-tenant, Ley 25.326).
    const [playerRow] = await sql<{ id: string }[]>`
      SELECT id FROM players WHERE id = ${playerId}
    `
    expect(playerRow?.id).toBe(playerId)
  }, 60_000)

  it('NO toca un tenant sin scheduled_deletion_at', async () => {
    const { tenantId } = await setupTenant({ scheduleDaysAgo: null })
    const sql = getSql()

    await runDataRetentionCleanup()

    const [row] = await sql<{ status: string; name: string; mp_access_token: string | null }[]>`
      SELECT status, name, mp_access_token FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).not.toBe('deleted')
    expect(row.name).not.toBe('[deleted]')
    expect(row.mp_access_token).toBe('enc-token')
    expect(await countChildren(sql, tenantId)).toEqual(FULL)
  }, 30_000)

  it('NO borra un tenant cuyo scheduled_deletion_at está en el futuro', async () => {
    // Boundary del WHERE: scheduled_deletion_at <= NOW(). -5 ⇒ NOW() + 5 días.
    const { tenantId } = await setupTenant({ scheduleDaysAgo: -5 })
    const sql = getSql()

    await runDataRetentionCleanup()

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('churned')
    expect(await countChildren(sql, tenantId)).toEqual(FULL)
  }, 30_000)

  it('NO borra un tenant active/trialing aunque tenga scheduled_deletion_at vencido', async () => {
    // Safety guard: status NOT IN ('active','trialing'). Protege a un complejo
    // re-activado tras una baja programada.
    const active = await setupTenant({ scheduleDaysAgo: 3, status: 'active' })
    const trialing = await setupTenant({ scheduleDaysAgo: 3, status: 'trialing' })
    const sql = getSql()

    await runDataRetentionCleanup()

    for (const id of [active.tenantId, trialing.tenantId]) {
      const [row] = await sql<{ status: string }[]>`
        SELECT status FROM tenants WHERE id = ${id}
      `
      expect(row.status).not.toBe('deleted')
      expect(await countChildren(sql, id)).toEqual(FULL)
    }
  }, 60_000)

  it('SÍ borra un tenant blocked (baja voluntaria) con scheduled_deletion_at vencido', async () => {
    const { tenantId } = await setupTenant({ scheduleDaysAgo: 3, status: 'blocked' })
    const sql = getSql()

    await runDataRetentionCleanup()

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)
  }, 60_000)

  it('el wipe está acotado al tenant objetivo y no toca a un tercero sano', async () => {
    // Regresión catastrófica: si el worker perdiera `WHERE tenant_id = X`
    // (o reusara un id), borraría datos de OTROS complejos. Sin un bystander
    // presente, todos los demás tests pasarían igual.
    const target = await setupTenant({ scheduleDaysAgo: 1 })
    const bystander = await setupTenant({ scheduleDaysAgo: null, status: 'active' })
    const sql = getSql()

    await runDataRetentionCleanup()

    expect(await countChildren(sql, target.tenantId)).toEqual(ZERO)
    expect(await countChildren(sql, bystander.tenantId)).toEqual(FULL)

    const [row] = await sql<{ status: string; mp_access_token: string | null }[]>`
      SELECT status, mp_access_token FROM tenants WHERE id = ${bystander.tenantId}
    `
    expect(row.status).toBe('active')
    expect(row.mp_access_token).toBe('enc-token')
  }, 60_000)

  it('idempotente: correr 2x deja el tenant deleted, hijos en 0, sin error', async () => {
    const { tenantId } = await setupTenant({ scheduleDaysAgo: 2 })
    const sql = getSql()

    await runDataRetentionCleanup()
    await runDataRetentionCleanup() // segunda pasada: ya está fuera del target set.

    const [row] = await sql<{ status: string; name: string }[]>`
      SELECT status, name FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
    expect(row.name).toBe('[deleted]')
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)
  }, 60_000)

  // ─── B5 (Fase 3): cancelar el preapproval MP tras el wipe ──────────────────
  // Los tenants escalados por dunning (past_due→suspended→blocked→churned)
  // NUNCA cancelan MP en el camino, y `transitionCanceledToBlocked` ahora
  // preserva `mp_subscription_id` a propósito (ver lifecycle.service.ts) — así
  // que llegan acá con un preapproval potencialmente vivo. Sin este fix, el
  // DELETE de `tenant_subscriptions` borraba la única referencia a ese
  // preapproval y quedaba cobrando huérfano en MP.
  //
  // TG-P0-RETENTION-03 movió la cancelación de MP de ANTES a DESPUÉS del
  // commit del wipe (el id se sigue capturando ANTES del DELETE, bajo el
  // `FOR UPDATE` de `tenant_subscriptions` — ver `wipeTenant`); estos tests
  // no cambian de aserciones, solo el momento real en que ocurre la llamada.

  it('cancela el preapproval MP vivo tras completar el wipe (id capturado bajo lock antes del DELETE)', async () => {
    const gateway = new MockGateway()
    setBillingGateway(gateway)

    const { tenantId } = await setupTenant({
      scheduleDaysAgo: 3,
      status: 'blocked',
      mpSubscriptionId: 'mp-live-1',
    })
    const sql = getSql()

    await runDataRetentionCleanup()

    expect(gateway.cancelPreapprovalCalls).toContain('mp-live-1')

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)
    // Cancel exitoso: sin rastro huérfano — el trail durable es SOLO para el
    // camino de fallo (ver test de abajo).
    expect(await fetchOrphanedMpAudit(sql, 'mp-live-1')).toHaveLength(0)
  }, 60_000)

  it('si cancelar el preapproval MP ya estaba cancelado, el wipe completa y NO deja rastro huérfano', async () => {
    // Contraparte del test de fallo genérico de abajo: "ya cancelado" no es un
    // huérfano real (MP y DB terminan consistentes en 'cancelado'), así que NO
    // debe generar la fila de reconciliación — si el guard `isMpAlreadyCancel
    // ledPreapprovalError` se rompiera y todo error escribiera el trail, este
    // test caería mientras el de arriba seguiría en verde.
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new Error('Can not modify a cancelled preapproval')
    setBillingGateway(gateway)

    const { tenantId } = await setupTenant({
      scheduleDaysAgo: 3,
      status: 'blocked',
      mpSubscriptionId: 'mp-live-already-cancelled',
    })
    const sql = getSql()

    await expect(runDataRetentionCleanup()).resolves.toBeUndefined()

    expect(gateway.cancelPreapprovalCalls).toContain('mp-live-already-cancelled')

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)
    expect(await fetchOrphanedMpAudit(sql, 'mp-live-already-cancelled')).toHaveLength(0)
  }, 60_000)

  it('si cancelar el preapproval MP falla con un error que NO es "ya cancelado", el wipe igual completa Y deja un rastro durable en audit_logs (tenant_id NULL)', async () => {
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new Error('MP 500 — timeout inesperado')
    setBillingGateway(gateway)

    const { tenantId } = await setupTenant({
      scheduleDaysAgo: 3,
      status: 'blocked',
      mpSubscriptionId: 'mp-live-2',
    })
    const sql = getSql()

    await expect(runDataRetentionCleanup()).resolves.toBeUndefined()

    expect(gateway.cancelPreapprovalCalls).toContain('mp-live-2')

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('deleted')
    expect(await countChildren(sql, tenantId)).toEqual(ZERO)

    // El audit_logs tenant-scoped ya se borró (countChildren.auditLogs===0
    // arriba); el rastro del huérfano sobrevive porque vive con tenant_id
    // NULL — reconciliación manual: SELECT * FROM audit_logs WHERE
    // tenant_id IS NULL AND action='billing.mp_preapproval_orphaned'.
    const orphanRows = await fetchOrphanedMpAudit(sql, 'mp-live-2')
    expect(orphanRows).toHaveLength(1)
    const orphan = orphanRows[0]!
    expect(orphan.tenant_id).toBeNull()
    expect(orphan.actor_type).toBe('system')
    expect(orphan.resource_type).toBe('tenant_subscription')
    expect(orphan.resource_id).toBe(tenantId)
    expect(orphan.metadata).toMatchObject({
      deletedTenantId: tenantId,
      mpSubscriptionId: 'mp-live-2',
    })
    expect(typeof orphan.metadata?.error).toBe('string')
    expect(orphan.metadata?.error as string).toContain('MP 500')
  }, 60_000)

  // ─── TG-P0-RETENTION-03 (🔴 data-loss, hallado por verificación adversarial) ──
  // `targets` es un snapshot tomado al INICIO del job. Si entre ese snapshot y
  // el wipe de ESE tenant una reactivación se COMPLETA (webhook
  // `onPaymentApproved` → `transitionToActiveFromAny`, o un super-admin
  // `forceTenantStatus('active')`/`reactivateTenant`), un wipe incondicional
  // lo borraría igual: pérdida permanente de datos de un cliente
  // activo/pagando. `wipeTenant` revalida bajo el `FOR UPDATE` de
  // `tenant_subscriptions` (Orden A) justo antes de cualquier DELETE.
  //
  // Se llama a `wipeTenant` directamente (no `runDataRetentionCleanup`)
  // porque el `targets` query YA excluye `status='active'` — un tenant activo
  // nunca entra al loop del worker completo, así que la única forma
  // determinística de ejercitar el guard es invocar el helper extraído sobre
  // un tenant que "ganó la carrera" (activo con `scheduled_deletion_at`
  // vencido, tal como quedaría si la reactivación llegó justo antes del
  // wipe).
  it('SKIP: no borra un tenant que dejó de ser elegible (reactivación ganó la carrera) y no cancela MP', async () => {
    const gateway = new MockGateway()
    const { tenantId } = await setupTenant({
      scheduleDaysAgo: 3,
      status: 'blocked',
      mpSubscriptionId: 'mp-live-race',
    })
    const sql = getSql()

    // Simula la reactivación que se COMPLETÓ entre el snapshot de `targets` y
    // esta iteración: el tenant queda 'active' aunque `scheduled_deletion_at`
    // siga vencido (el guard debe saltear por el status, no por
    // `scheduled_deletion_at` — misma condición que el `targets` query).
    await sql`UPDATE tenants SET status = 'active'::tenant_status WHERE id = ${tenantId}`

    const result = await wipeTenant(tenantId, gateway)

    expect(result).toBe('skipped')
    expect(gateway.cancelPreapprovalCalls).not.toContain('mp-live-race')

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(row.status).toBe('active')
    expect(row.status).not.toBe('deleted')
    // tenant_subscriptions (con mp-live-race) y el resto de las filas hijas
    // siguen intactas — el DELETE nunca corrió.
    expect(await countChildren(sql, tenantId)).toEqual(FULL)
  }, 30_000)
})

// ─── Bot de WhatsApp (migr. 096): retención de 30 días ─────────────────────
// Mensajes y chats sin actividad se purgan semanalmente. El wipe de un complejo
// con estas tablas ya lo cubre el seed de `setupTenant` (FULL/ZERO traen chat,
// conexión y dos mensajes, uno de ellos un aviso que apunta a una reserva
// TERMINAL — el caso que fija el orden de los DELETE).
describe('data-retention-cleanup — WhatsApp (30 días)', () => {
  it('purga mensajes y chats de más de 30 días y conserva lo reciente', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const oldChat = await insertWhatsappChat(sql, { tenantId: tenant.id, lastInboundDaysAgo: 31 })
    await insertWhatsappMessage(sql, { tenantId: tenant.id, chatId: oldChat, createdDaysAgo: 31 })
    const liveChat = await insertWhatsappChat(sql, { tenantId: tenant.id, lastInboundDaysAgo: 1 })
    const oldMessageInLiveChat = await insertWhatsappMessage(sql, {
      tenantId: tenant.id,
      chatId: liveChat,
      createdDaysAgo: 31,
    })
    const freshMessage = await insertWhatsappMessage(sql, {
      tenantId: tenant.id,
      chatId: liveChat,
      createdDaysAgo: 1,
    })

    await runDataRetentionCleanup()

    const chats = await sql<{ id: string }[]>`
      SELECT id FROM whatsapp_chats WHERE tenant_id = ${tenant.id}
    `
    // El chat sin actividad cae y se lleva sus mensajes por CASCADE; el vivo se queda.
    expect(chats.map((c) => c.id)).toEqual([liveChat])
    const messages = await sql<{ id: string }[]>`
      SELECT id FROM whatsapp_messages WHERE tenant_id = ${tenant.id}
    `
    // El mensaje viejo de un chat vivo también se purga (se mide por created_at).
    expect(messages.map((m) => m.id)).toEqual([freshMessage])
    expect(messages.map((m) => m.id)).not.toContain(oldMessageInLiveChat)
  }, 60_000)

  it('un chat vencido con una reserva TERMINAL se purga igual y la reserva sobrevive intacta', async () => {
    // bookings.whatsapp_chat_id va SIN foreign key (migr. 096): con ON DELETE SET
    // NULL, el DELETE del chat haría un UPDATE sobre una reserva `completed`, que
    // `enforce_booking_invariants_fn` prohíbe, y la purga abortaría entera.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const chatId = await insertWhatsappChat(sql, { tenantId: tenant.id, lastInboundDaysAgo: 31 })
    const bookingId = await insertBooking(sql, { tenantId: tenant.id, courtId })
    await sql`
      UPDATE bookings
      SET whatsapp_chat_id = ${chatId}, status = 'completed'::booking_status
      WHERE id = ${bookingId}
    `

    await runDataRetentionCleanup()

    const chats = await sql<{ id: string }[]>`SELECT id FROM whatsapp_chats WHERE id = ${chatId}`
    expect(chats).toHaveLength(0)
    const [booking] = await sql<{ status: string; whatsapp_chat_id: string | null }[]>`
      SELECT status, whatsapp_chat_id FROM bookings WHERE id = ${bookingId}
    `
    expect(booking?.status).toBe('completed')
    // El id queda colgando a propósito: sigue marcando que la reserva vino del bot.
    expect(booking?.whatsapp_chat_id).toBe(chatId)
  }, 60_000)
})

// ─── RIVAL (migr. 099): contacto al llegar starts_at, partido a los 12 meses ───
// El wipe de un complejo (RIVAL antes que bookings) lo cubre el seed de
// `setupTenant`: FULL/ZERO traen partido, contacto, denuncia, suscripción y dedupe.
describe('data-retention-cleanup — RIVAL', () => {
  type SeededMatch = { id: string }

  /** Siembra por el pool admin (sin actor: los triggers de reglas de negocio se saltean). */
  async function seedMatch(
    tenantId: string,
    organizerId: string,
    startsAtSql: 'future' | 'past_1_day' | 'past_13_months',
  ): Promise<SeededMatch> {
    const sql = getSql()
    const interval =
      startsAtSql === 'future'
        ? "NOW() + INTERVAL '3 days'"
        : startsAtSql === 'past_1_day'
          ? "NOW() - INTERVAL '1 day'"
          : "NOW() - INTERVAL '13 months'"
    const [m] = await sql<{ id: string }[]>`
      INSERT INTO rival_matches (
        tenant_id, organizer_player_id, starts_at, format, capacity, level, court_declared
      )
      VALUES (${tenantId}, ${organizerId}, ${sql.unsafe(interval)}, 5, 10, 'parejo', true)
      RETURNING id
    `
    await sql`
      INSERT INTO rival_match_contacts (match_id, whatsapp_digits)
      VALUES (${m!.id}, '5491155551234')
    `
    await sql`
      INSERT INTO rival_reports (match_id, reporter_player_id, reason)
      VALUES (${m!.id}, ${organizerId}, 'spam')
    `
    return { id: m!.id }
  }

  it('borra el WhatsApp de un partido que ya empezó pero conserva el partido; el futuro no se toca', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const started = await seedMatch(tenant.id, player.id, 'past_1_day')
    const upcoming = await seedMatch(tenant.id, player.id, 'future')

    await runDataRetentionCleanup()

    const contacts = await sql<{ match_id: string }[]>`
      SELECT match_id FROM rival_match_contacts WHERE match_id IN (${started.id}, ${upcoming.id})
    `
    expect(contacts.map((c) => c.match_id)).toEqual([upcoming.id])
    // El partido vencido y sus participantes/denuncias siguen (la ventana es de 12 meses).
    const matches = await sql<{ id: string }[]>`
      SELECT id FROM rival_matches WHERE id IN (${started.id}, ${upcoming.id})
    `
    expect(matches).toHaveLength(2)
    const reports = await sql`SELECT 1 FROM rival_reports WHERE match_id = ${started.id}`
    expect(reports).toHaveLength(1)
  }, 60_000)

  it('borra el partido y todo lo que cuelga a los 12 meses de jugado, y conserva el de hace 1 día', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const old = await seedMatch(tenant.id, player.id, 'past_13_months')
    const recent = await seedMatch(tenant.id, player.id, 'past_1_day')
    await sql`
      INSERT INTO rival_alert_sends (match_id, player_id, sent_on)
      VALUES (${old.id}, ${player.id}, CURRENT_DATE)
    `
    await sql`
      INSERT INTO rival_alert_subscriptions (player_id, tenant_id) VALUES (${player.id}, ${tenant.id})
    `
    // El organizador entró como participante por el trigger de alta.
    expect(await sql`SELECT 1 FROM rival_participants WHERE match_id = ${old.id}`).toHaveLength(1)

    await runDataRetentionCleanup()

    for (const table of [
      'rival_participants',
      'rival_reports',
      'rival_match_contacts',
      'rival_alert_sends',
    ]) {
      const rows = await sql.unsafe(`SELECT 1 FROM ${table} WHERE match_id = $1`, [old.id])
      expect(rows, table).toHaveLength(0)
    }
    expect(await sql`SELECT 1 FROM rival_matches WHERE id = ${old.id}`).toHaveLength(0)
    expect(await sql`SELECT 1 FROM rival_matches WHERE id = ${recent.id}`).toHaveLength(1)
    // Las suscripciones no cuelgan de un partido: la purga por antigüedad no las toca.
    expect(
      await sql`SELECT 1 FROM rival_alert_subscriptions WHERE tenant_id = ${tenant.id}`,
    ).toHaveLength(1)
  }, 60_000)
})
