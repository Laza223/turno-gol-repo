import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import {
  insertBooking,
  insertCashFlow,
  insertCourt,
  insertNotification,
  insertPayment,
  insertAuditLog,
  insertAbonado,
  insertProduct,
  insertBan,
  insertDailyCashClose,
  insertSubscription,
  getOrCreatePlanId,
} from '../helpers/factories'

import {
  runDataRetentionCleanup,
  wipeTenant,
} from '@/shared/jobs/workers/data-retention-cleanup.worker'

type TenantBundle = {
  tenantId: string
  playerId: string
  staffId: string
  bookingId: string
}

/**
 * Creates a tenant with one row in every isolated child table plus a full set
 * of PII / MP-credential fields populated (so anonymization asserts something
 * real: NULL→NULL would prove nothing).
 *
 * - `scheduleDaysAgo`: number → `scheduled_deletion_at = NOW() - INTERVAL n days`
 *   (negative ⇒ future). `null`/omitted ⇒ leave NULL (not a deletion target).
 * - `status`: tenant_status to force. Defaults to `'churned'` when a past
 *   deletion is scheduled, otherwise the table default (`'trialing'`).
 */
async function setupTenant(
  opts: {
    scheduleDaysAgo?: number | null
    status?: string
    mpSubscriptionId?: string
  } = {},
): Promise<TenantBundle> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  const courtId = await insertCourt(sql, tenant.id)
  const bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: player.id,
  })
  await insertPayment(sql, { tenantId: tenant.id, bookingId, playerId: player.id })
  await insertCashFlow(sql, { tenantId: tenant.id, registeredBy: staff.id, bookingId })
  await insertNotification(sql, {
    tenantId: tenant.id,
    recipientType: 'player',
    recipientId: player.id,
  })
  await insertAuditLog(sql, {
    tenantId: tenant.id,
    actorId: staff.id,
    actorType: 'staff',
    resourceId: bookingId,
  })
  await insertAbonado(sql, tenant.id, courtId)
  await insertProduct(sql, tenant.id)
  await insertBan(sql, { tenantId: tenant.id, playerId: player.id, bannedBy: staff.id })
  await insertDailyCashClose(sql, { tenantId: tenant.id, closedBy: staff.id })
  const planId = await getOrCreatePlanId(sql)
  await insertSubscription(sql, { tenantId: tenant.id, planId })
  if (opts.mpSubscriptionId) {
    await sql`
      UPDATE tenant_subscriptions
      SET mp_subscription_id = ${opts.mpSubscriptionId}
      WHERE tenant_id = ${tenant.id}
    `
  }

  // Hybrid / operational tenant-scoped rows the wipe must also clear.
  // reviews.booking_id is RESTRICT-FK to bookings: the wipe runs under
  // session_replication_role='replica', so deleting bookings would otherwise
  // leave these dangling instead of cascading.
  await sql`
    INSERT INTO reviews (tenant_id, player_id, booking_id, rating, comment)
    VALUES (${tenant.id}, ${player.id}, ${bookingId}, ${5}, ${'buena cancha'})
  `
  await sql`
    INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
    VALUES (${tenant.id}, ${staff.id}, ${'https://push.example/' + tenant.id}, ${'p256'}, ${'auth'})
  `
  await sql`
    INSERT INTO player_favorites (player_id, tenant_id)
    VALUES (${player.id}, ${tenant.id})
  `
  await sql`
    INSERT INTO feature_flags (key, value, tenant_id)
    VALUES (${'kill_switch'}, ${true}, ${tenant.id})
  `

  // Seed every anonymizable PII / MP-credential field with a non-null value so
  // the worker's UPDATE has something to actually scrub.
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc-token'},
        mp_refresh_token = ${'enc-refresh'},
        mp_user_id = ${'mp-user-123'},
        mp_public_key = ${'mp-pub-key'},
        description = ${'Complejo de prueba'},
        logo_url = ${'https://cdn.example/logo.png'},
        cover_url = ${'https://cdn.example/cover.png'},
        whatsapp = ${'+5491122223333'},
        latitude = ${-34.6},
        longitude = ${-58.4}
    WHERE id = ${tenant.id}
  `

  if (opts.scheduleDaysAgo !== null && opts.scheduleDaysAgo !== undefined) {
    const status = opts.status ?? 'churned'
    await sql`
      UPDATE tenants
      SET scheduled_deletion_at = NOW() - INTERVAL '${sql.unsafe(String(opts.scheduleDaysAgo))} days',
          status = ${status}::tenant_status
      WHERE id = ${tenant.id}
    `
  } else if (opts.status) {
    await sql`
      UPDATE tenants SET status = ${opts.status}::tenant_status WHERE id = ${tenant.id}
    `
  }

  return { tenantId: tenant.id, playerId: player.id, staffId: staff.id, bookingId }
}

type ChildCounts = {
  bookings: number
  payments: number
  cashFlows: number
  notifications: number
  auditLogs: number
  abonados: number
  products: number
  bans: number
  closes: number
  courts: number
  staffMembers: number
  playerRels: number
  subscriptions: number
  reviews: number
  pushSubs: number
  favorites: number
  flags: number
}

async function countChildren(
  sql: ReturnType<typeof getSql>,
  tenantId: string,
): Promise<ChildCounts> {
  const [r] = await sql<
    Array<Record<keyof ChildCounts, string>>
  >`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE tenant_id = ${tenantId})::text AS bookings,
      (SELECT COUNT(*) FROM payments WHERE tenant_id = ${tenantId})::text AS payments,
      (SELECT COUNT(*) FROM cash_flows WHERE tenant_id = ${tenantId})::text AS "cashFlows",
      (SELECT COUNT(*) FROM notifications WHERE tenant_id = ${tenantId})::text AS notifications,
      (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = ${tenantId})::text AS "auditLogs",
      (SELECT COUNT(*) FROM abonados WHERE tenant_id = ${tenantId})::text AS abonados,
      (SELECT COUNT(*) FROM products WHERE tenant_id = ${tenantId})::text AS products,
      (SELECT COUNT(*) FROM tenant_player_bans WHERE tenant_id = ${tenantId})::text AS bans,
      (SELECT COUNT(*) FROM daily_cash_closes WHERE tenant_id = ${tenantId})::text AS closes,
      (SELECT COUNT(*) FROM courts WHERE tenant_id = ${tenantId})::text AS courts,
      (SELECT COUNT(*) FROM tenant_staff_members WHERE tenant_id = ${tenantId})::text AS "staffMembers",
      (SELECT COUNT(*) FROM player_tenant_relationships WHERE tenant_id = ${tenantId})::text AS "playerRels",
      (SELECT COUNT(*) FROM tenant_subscriptions WHERE tenant_id = ${tenantId})::text AS subscriptions,
      (SELECT COUNT(*) FROM reviews WHERE tenant_id = ${tenantId})::text AS reviews,
      (SELECT COUNT(*) FROM push_subscriptions WHERE tenant_id = ${tenantId})::text AS "pushSubs",
      (SELECT COUNT(*) FROM player_favorites WHERE tenant_id = ${tenantId})::text AS favorites,
      (SELECT COUNT(*) FROM feature_flags WHERE tenant_id = ${tenantId})::text AS flags
  `
  return {
    bookings: Number(r.bookings),
    payments: Number(r.payments),
    cashFlows: Number(r.cashFlows),
    notifications: Number(r.notifications),
    auditLogs: Number(r.auditLogs),
    abonados: Number(r.abonados),
    products: Number(r.products),
    bans: Number(r.bans),
    closes: Number(r.closes),
    courts: Number(r.courts),
    staffMembers: Number(r.staffMembers),
    playerRels: Number(r.playerRels),
    subscriptions: Number(r.subscriptions),
    reviews: Number(r.reviews),
    pushSubs: Number(r.pushSubs),
    favorites: Number(r.favorites),
    flags: Number(r.flags),
  }
}

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
    metadata: typeof r.metadata === 'string' ? (JSON.parse(r.metadata) as Record<string, unknown>) : r.metadata,
  }))
}

const ZERO: ChildCounts = {
  bookings: 0,
  payments: 0,
  cashFlows: 0,
  notifications: 0,
  auditLogs: 0,
  abonados: 0,
  products: 0,
  bans: 0,
  closes: 0,
  courts: 0,
  staffMembers: 0,
  playerRels: 0,
  subscriptions: 0,
  reviews: 0,
  pushSubs: 0,
  favorites: 0,
  flags: 0,
}

const FULL: ChildCounts = {
  bookings: 1,
  payments: 1,
  cashFlows: 1,
  notifications: 1,
  auditLogs: 1,
  abonados: 1,
  products: 1,
  bans: 1,
  closes: 1,
  courts: 1,
  staffMembers: 1,
  playerRels: 1,
  subscriptions: 1,
  reviews: 1,
  pushSubs: 1,
  favorites: 1,
  flags: 1,
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
        scheduled_deletion_at: Date | null
      }>
    >`
      SELECT status, name, email, address, phone, description, logo_url, cover_url,
             whatsapp, latitude, longitude, mp_access_token, mp_refresh_token,
             mp_user_id, mp_public_key, scheduled_deletion_at
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
