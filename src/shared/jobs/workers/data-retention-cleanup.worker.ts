import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerDb, getWorkerSql } from '@/shared/db/client'
import { QUEUE_DATA_RETENTION } from '../definitions'
import { logger } from '@/shared/lib/logger'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { isMpAlreadyCancelledPreapprovalError } from '@/modules/payments/mp-token-refresh'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

/**
 * Sentinel de actor de sistema (mismo valor que `SYSTEM_ACTOR_ID` en
 * `src/shared/db/audit.ts`, no exportado desde ahí — se duplica el literal en
 * vez de importar un módulo fuera del scope de este fix).
 */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Weekly Sun 07:00 ART. Hard-deletes child rows for tenants past their
 * `scheduled_deletion_at` and soft-anonymizes the tenants row (Ley 25.326
 * §16 right to erasure). Status transitions to `deleted`.
 *
 * Scope: any tenant with `scheduled_deletion_at IS NOT NULL AND <= NOW()`
 * regardless of source state (covers churned and voluntary canceled→blocked
 * paths). Already-deleted/active/trialing tenants are excluded.
 *
 * Order matters: the schema has a circular FK between bookings.payment_id and
 * payments.booking_id; bookings refer to courts/abonados; cash_flows refers
 * to bookings. Sequence is preserved per-tenant.
 *
 * Pool (TG-P0-RETENTION-02): several of the DELETEs below hit tables the
 * restricted app role (`turnogol_app`) cannot write to under RLS/GRANTs —
 * `feature_flags` has no write policy (015_feature_flags.sql, deliberate),
 * and `audit_logs`/`daily_cash_closes` have UPDATE/DELETE explicitly revoked
 * (037_turnogol_app_grants.sql, re-applying 008_revokes.sql). Under
 * `withTenantContext` (app pool) those statements throw, the whole per-tenant
 * transaction rolls back, and — before this fix — the per-tenant `catch` only
 * logged, so the weekly wipe silently did nothing since PR #30 restricted the
 * app pool. This worker is a cross-tenant sweep by nature (background job,
 * "Background jobs usan rol de servicio separado", CLAUDE.md) so it now runs
 * entirely on the service-role pool (`getWorkerDb`/`getWorkerSql`, bypasses
 * RLS by design). Every statement below still carries its own explicit
 * `WHERE tenant_id = ...` (or narrower) filter as defense in depth — RLS is
 * not the barrier here, the WHERE clause is.
 */

/**
 * TG-B5 (huérfano MP↔DB, Fase 3): cancela el preapproval en MP si el tenant
 * tenía uno vivo. Recibe el `mp_subscription_id` ya leído (bajo el lock de
 * `tenant_subscriptions` dentro de la tx de wipe, ver `wipeTenant`) — no lo
 * vuelve a leer, porque para cuando esta función corre la fila de
 * `tenant_subscriptions` ya fue borrada (el DELETE corrió dentro de la misma
 * tx, ya commiteada). TG-P0-RETENTION-03 movió esta llamada de ANTES de la tx
 * a DESPUÉS del commit — cancelar MP antes del wipe leyendo el id por cuenta
 * propia (código viejo) corría el riesgo de cancelar el preapproval de un
 * tenant que resultó reactivado/inelegible entre el snapshot de `targets` y
 * esta iteración (ver el guard de elegibilidad en `wipeTenant`). Corre FUERA
 * de la tx de wipe (no sostener la tx, que setea
 * `session_replication_role='replica'`, abierta durante un round-trip HTTP)
 * contra el gateway de PLATAFORMA (`getBillingGateway()`, la cuenta MP de
 * TurnoGol que cobra la suscripción SaaS — NO `resolveTenantGateway`, que es
 * el OAuth propio del tenant para cobrar señas a sus jugadores).
 *
 * Erasure (Ley 25.326) es una obligación legal y no debe bloquearse por un
 * hiccup de MP: cualquier error que no sea "ya estaba cancelado" se loguea
 * loud (picked up por Sentry/DLQ) para reconciliación manual — el wipe ya
 * ocurrió igual (esto corre post-commit, best-effort). Por eso esta función
 * nunca throwea — el llamador no debe sumar este error a `failures` (el wipe
 * en sí es el criterio de éxito del job).
 */
/**
 * Rastro durable del huérfano MP↔DB: el `audit_logs` del tenant ya se borró
 * (el wipe corrió antes, en la misma tx que esta función ve post-commit), así
 * que una fila tenant-scoped desaparecería de inmediato. Se inserta con
 * `tenant_id = NULL` (system-level, `insertSystemAuditLog` no acepta NULL —
 * de ahí el INSERT crudo) para que sobreviva y quede disponible para
 * reconciliación manual:
 *   SELECT * FROM audit_logs WHERE tenant_id IS NULL AND action = 'billing.mp_preapproval_orphaned'
 *
 * Best-effort: si el INSERT mismo falla, se loguea y se sigue — la erasure ya
 * ocurrió, este trail es secundario y nunca debe hacer que el job explote.
 */
async function recordOrphanedMpPreapproval(
  tenantId: string,
  mpSubscriptionId: string,
  errorMessage: string,
): Promise<void> {
  try {
    const db = getWorkerDb()
    // OJO doble-encode (variante del gotcha "jsonb doble-codificado" de
    // src/shared/db/jsonb.ts, pero por otra vía): `getWorkerDb()` restaura el
    // serializer del OID jsonb (3802) del cliente postgres-js compartido a
    // `JSON.stringify` (ver `restoreJsonSerializers` en client.ts). postgres-js
    // infiere ese OID del cast `::jsonb` pegado al placeholder — si acá se
    // pasara `JSON.stringify(metadata)` (un string), el serializer lo
    // volvería a stringify-ear (comillas escapadas adentro de comillas) y
    // `metadata ->> 'x'` en SQL devolvería NULL siempre. Pasar el OBJETO
    // crudo dentro del template: el serializer lo stringify-ea UNA sola vez.
    const metadata = { deletedTenantId: tenantId, mpSubscriptionId, error: errorMessage }
    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`
        INSERT INTO audit_logs (
          tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at
        ) VALUES (
          NULL,
          ${SYSTEM_ACTOR_ID}::uuid,
          'system',
          'billing.mp_preapproval_orphaned',
          'tenant_subscription',
          ${tenantId},
          ${metadata}::jsonb,
          NOW()
        )
      `)
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('failed to record durable audit trail for orphaned MP preapproval', {
      module: 'data-retention',
      tenantId,
      mpSubscriptionId,
      error: message,
    })
  }
}

async function cancelPendingMpSubscription(
  gateway: PaymentGateway,
  tenantId: string,
  mpSubscriptionId: string | null,
): Promise<void> {
  if (!mpSubscriptionId) return

  try {
    await gateway.cancelPreapproval(mpSubscriptionId)
  } catch (err) {
    if (isMpAlreadyCancelledPreapprovalError(err)) return
    const message = err instanceof Error ? err.message : String(err)
    logger.error('failed to cancel MP preapproval after wipe (erasure already happened)', {
      module: 'data-retention',
      tenantId,
      mpSubscriptionId,
      error: message,
    })
    await recordOrphanedMpPreapproval(tenantId, mpSubscriptionId, message)
  }
}

/**
 * TG-P0-RETENTION-03 (🔴 data-loss, hallado por verificación adversarial):
 * `runDataRetentionCleanup` arma `targets` con un SELECT sin lock al INICIO
 * del job y después itera esa lista ESTÁTICA. Si entre ese snapshot y esta
 * iteración una reactivación se COMPLETA para ESTE tenant —
 * `onPaymentApproved` (`transitionToActiveFromAny`), o un super-admin
 * `forceTenantStatus('active')`/`reactivateTenant` — el wipe incondicional
 * borraba igual un tenant que quedó activo/pagando: pérdida permanente de
 * datos de un cliente.
 *
 * Fix: revalidar elegibilidad BAJO LOCK, DENTRO de la misma tx que hace el
 * wipe, antes de cualquier DELETE destructivo. `SELECT ... FOR UPDATE` sobre
 * `tenant_subscriptions` se toma PRIMERO (Orden A — ver
 * B5_SYSTEMIC_SERIALIZATION_2026-07-16.md: todos los activadores
 * (`loadSubForUpdate`/`FOR UPDATE OF ts`) lockean esa misma fila ANTES de
 * tocar `tenants`), así que cualquier activación concurrente para este
 * tenant queda BLOQUEADA mientras el wipe sostiene el lock. Ya con ese lock
 * tomado, el SELECT de `tenants` que sigue ve el estado FRESCO: ningún
 * mutador que respete Orden A pudo cambiar `tenants.status` sin haber
 * esperado primero por este mismo lock. Si el tenant ya no cumple la MISMA
 * condición del `targets` query original, la tx hace `return` (commitea
 * vacía) y no se borra ni se cancela MP — no es un error, es un skip
 * correcto.
 *
 * Devuelve `'wiped'` o `'skipped'` para que sea testeable determinísticamente
 * (el caller original — el loop de `runDataRetentionCleanup` — no necesita
 * distinguir, solo captura excepciones).
 */
export async function wipeTenant(
  tenantId: string,
  gateway: PaymentGateway,
): Promise<'wiped' | 'skipped'> {
  const db = getWorkerDb()
  let mpSubscriptionId: string | null = null
  let wiped = false

  await db.transaction(async (tx) => {
    // Disable user-level triggers + FK enforcement for this tx so we can
    // wipe rows that are otherwise immutable (terminal bookings, daily
    // cash closes) and break the bookings ↔ payments circular FK.
    // `session_replication_role = replica` is the standard Postgres knob
    // for whole-tenant wipes and only affects this transaction.
    await tx.execute(drizzleSql`SET LOCAL session_replication_role = 'replica'`)

    // Orden A: lockear tenant_subscriptions ANTES de leer/tocar tenants.
    // Bloquea a cualquier activador concurrente (todos lockean esta misma
    // fila primero) hasta que esta tx commitee o haga rollback. También nos
    // da el mp_subscription_id fresco para cancelar MP después del commit.
    const subRows = await tx.execute(drizzleSql`
      SELECT mp_subscription_id FROM tenant_subscriptions
      WHERE tenant_id = ${tenantId}
      FOR UPDATE
    `)
    mpSubscriptionId =
      (subRows as unknown as Array<{ mp_subscription_id: string | null }>)[0]
        ?.mp_subscription_id ?? null

    // Ya con el lock de tenant_subscriptions tomado: releer el estado FRESCO
    // de tenants. Misma condición que el `targets` query original — el
    // booleano se calcula en SQL (evita el gotcha de parsear
    // scheduled_deletion_at como string en JS, ver raw-sql-execute-date-string).
    const tenantRows = await tx.execute(drizzleSql`
      SELECT (
        status NOT IN ('deleted', 'active', 'trialing')
        AND scheduled_deletion_at IS NOT NULL
        AND scheduled_deletion_at <= NOW()
      ) AS eligible
      FROM tenants
      WHERE id = ${tenantId}
    `)
    const eligible =
      (tenantRows as unknown as Array<{ eligible: boolean }>)[0]?.eligible ?? false

    if (!eligible) {
      logger.info('skipped wipe, tenant no longer eligible', {
        module: 'data-retention',
        tenantId,
      })
      return
    }

    await tx.execute(drizzleSql`DELETE FROM notifications WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM tenant_player_bans WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM tenant_staff_members WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM daily_cash_closes WHERE tenant_id = ${tenantId}`)
    // Apertura de caja (migr. 049): FK a tenants sin CASCADE + tenant
    // soft-anonimizado = limpieza manual obligatoria (gate de release lo cazó;
    // misma trampa documentada del wipe de retención).
    await tx.execute(drizzleSql`DELETE FROM daily_cash_opens WHERE tenant_id = ${tenantId}`)
    // Cantina (migr. 048): stock_movements referencia cash_flows, canteen_tabs
    // y canteen_products — borrar el ledger primero, después sus padres.
    await tx.execute(drizzleSql`DELETE FROM stock_movements WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM canteen_tabs WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM canteen_products WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM cash_flows WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM payments WHERE tenant_id = ${tenantId}`)
    // Tenant-scoped rows whose FK to tenants is ON DELETE CASCADE never
    // fires here (we soft-anonymize the tenants row instead of deleting it)
    // plus `reviews`, whose booking_id is a RESTRICT FK that the replica
    // role would otherwise leave dangling. Delete reviews before bookings.
    await tx.execute(drizzleSql`DELETE FROM reviews WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM push_subscriptions WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM player_favorites WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM feature_flags WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM bookings WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM abonados WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM courts WHERE tenant_id = ${tenantId}`)
    await tx.execute(drizzleSql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${tenantId}`)

    // Soft-anonymize tenants row. Preserves audit FKs in any external
    // tables (processed_webhooks has no tenant_id; not affected).
    await tx.execute(drizzleSql`
      UPDATE tenants
      SET status = 'deleted'::tenant_status,
          name = '[deleted]',
          description = NULL,
          logo_url = NULL,
          cover_url = NULL,
          address = '[deleted]',
          phone = '[deleted]',
          whatsapp = NULL,
          email = ('deleted-' || id::text || '@anon.local'),
          latitude = NULL,
          longitude = NULL,
          mp_access_token = NULL,
          mp_refresh_token = NULL,
          mp_user_id = NULL,
          mp_public_key = NULL,
          scheduled_deletion_at = NULL,
          updated_at = NOW()
      WHERE id = ${tenantId}
    `)

    wiped = true
  })

  if (!wiped) return 'skipped'

  logger.info('wiped tenant', { module: 'data-retention', tenantId })
  // Post-commit, best-effort: el wipe (la obligación legal) ya ocurrió; esto
  // nunca throwea (ver cancelPendingMpSubscription) así que no hace falta
  // try/catch acá.
  await cancelPendingMpSubscription(gateway, tenantId, mpSubscriptionId)
  return 'wiped'
}

export async function runDataRetentionCleanup(): Promise<void> {
  const sql = getWorkerSql()
  const gateway = getBillingGateway()

  const targets = await sql<{ id: string }[]>`
    SELECT id FROM tenants
    WHERE scheduled_deletion_at IS NOT NULL
      AND scheduled_deletion_at <= NOW()
      AND status NOT IN ('deleted', 'active', 'trialing')
  `
  const ids = targets.map((r) => r.id)
  if (ids.length === 0) return

  logger.info('wiping tenants', { module: 'data-retention', count: ids.length })

  const failures: Array<{ tenantId: string; error: string }> = []

  for (const tenantId of ids) {
    try {
      await wipeTenant(tenantId, gateway)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Loud on purpose (TG-P0-RETENTION-02): this used to be a silent
      // log-and-continue, so the weekly Ley 25.326 wipe could fail forever
      // with nothing surfacing it. logger.error is picked up by the DLQ/
      // Sentry pipeline (see attachFailureHandlers, doc17), and we also
      // accumulate the failure below so the job itself fails at the end —
      // per-tenant errors don't abort the remaining tenants mid-loop, but the
      // overall pg-boss job comes out red/retryable if any tenant failed.
      logger.error('failed wipe for tenant', {
        module: 'data-retention',
        tenantId,
        stage: 'tenant-wipe-transaction',
        error: message,
      })
      failures.push({ tenantId, error: message })
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `data-retention wipe failed for ${failures.length}/${ids.length} tenant(s): ` +
        failures.map((f) => `${f.tenantId}: ${f.error}`).join('; '),
    )
  }
}

export async function registerDataRetentionCleanupWorker(boss: PgBoss): Promise<void> {
  // 07:00 ART Sun = 10:00 UTC Sun.
  await boss.schedule(QUEUE_DATA_RETENTION, '0 10 * * 0', {})
  await boss.work(QUEUE_DATA_RETENTION, async () => {
    await runDataRetentionCleanup()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DATA_RETENTION })
}
