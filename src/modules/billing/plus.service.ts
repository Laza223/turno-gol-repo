import { isNotNull, sql } from 'drizzle-orm'
import { getWorkerDb, withTenantContext, type DbTx } from '@/shared/db/client'
import { insertAuditLog, insertSystemAuditLog } from '@/shared/db/audit'
import { formatArs } from '@/lib/format'
import { sendOpsAlerts, type OpsAlert } from '@/modules/super-admin/ops-alerts.service'
import type { MpPaymentStatus } from '@/modules/payments/payment.types'
import { featureFlags } from '@/shared/db/schema'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import {
  PlusFlagPendingError,
  PlusNotAllowedError,
  PlusQuoteNotPendingError,
  SubscriptionNotFoundError,
} from './billing.errors'
import {
  billingReason,
  computeNotificationUrl,
  computeReturnUrl,
  isQuoteCurrent,
  loadActivePlan,
  loadSub,
  loadSubForUpdate,
  pricingParamsOf,
  subscriptionAmount,
  type SubRow,
} from './billing.service'
import type { BillingCycle, SubscriptionStatus } from './billing.types'
import {
  PLUS_LIST_PER_COURT_CENTS,
  assertPlusSpecialPrice,
  effectivePlusPerCourtCents,
  plusProrateQuote,
} from './pricing'

/**
 * Interruptor y baja de TurnoGol Plus (Asistente de WhatsApp).
 * Decisión: `docs/decisions/2026-10-22-cobro-turnogol-plus.md`.
 *
 * Plus va en el MISMO débito del plan (P1): prenderlo, bajarlo o cambiarle el
 * precio cambia el monto del preapproval con `updatePreapprovalAmount`.
 *
 * REGLA ÚNICA del flag `whatsapp_bot` de un complejo (la del riesgo de #468,
 * donde el flag se escribía por otra conexión ANTES de cobrar): el override solo
 * lo escriben `ensurePlusFlagOn` y `expirePlusAccess`, siempre DESPUÉS del
 * commit del cobro o dentro de su propia tx con la fila de la suscripción
 * lockeada, y releyendo `plus_enabled` / `plus_access_until` bajo ese lock. Si
 * MP falla, la tx del cobro rollbackea entera y el flag nunca se llegó a tocar.
 *
 * Cada función abre su propia transacción (`withTenantContext`) justamente
 * porque el flag se escribe después del commit. `gateway` y `now` se inyectan
 * para los tests.
 */

/** Quién hace el cambio: el dueño (`staff`) o un super-admin (`system`, como `supportAudit`). */
export type PlusActor = { type: 'staff' | 'system'; id: string }

export type EnablePlusResult =
  | { kind: 'enabled' | 'price_changed' | 'unchanged' }
  | { kind: 'quote_pending'; months: number; amountCents: number }

export type DisablePlusResult =
  { kind: 'scheduled'; accessUntil: Date } | { kind: 'turned_off' | 'quote_cleared' | 'unchanged' }

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

function plusAudit(
  tx: DbTx,
  tenantId: string,
  actor: PlusActor,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  return insertAuditLog(tx, {
    tenantId,
    actorId: actor.id,
    actorType: actor.type,
    action,
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata,
  })
}

/** Upsert del override por complejo de `whatsapp_bot` (misma forma que escribía #468). */
async function writeBotOverride(tx: DbTx, tenantId: string, value: boolean): Promise<void> {
  await tx
    .insert(featureFlags)
    .values({ key: BOT_FEATURE_FLAG, value, tenantId })
    .onConflictDoUpdate({
      target: [featureFlags.key, featureFlags.tenantId],
      targetWhere: isNotNull(featureFlags.tenantId),
      set: { value },
    })
}

// ─── escritura del flag (las DOS únicas funciones que lo tocan) ─────────────

/**
 * Prende el bot SI la suscripción tiene `plus_enabled`. Releé bajo lock: si en
 * el medio alguien apagó Plus, no hace nada. `feature_flags` no tiene policy de
 * escritura para el rol de la app, así que va por el pool worker (BYPASSRLS).
 * Idempotente.
 */
export async function ensurePlusFlagOn(tenantId: string): Promise<void> {
  await getWorkerDb().transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT plus_enabled FROM tenant_subscriptions
      WHERE tenant_id = ${tenantId}
      FOR UPDATE
    `)) as unknown as Array<{ plus_enabled: boolean }>
    if (!rows[0]?.plus_enabled) return
    await writeBotOverride(tx, tenantId, true)
  })
  clearFeatureFlagCache()
}

/**
 * Apaga el bot cuando venció la baja agendada. SOLO si `plus_enabled = false` y
 * `plus_access_until <= now`: nunca toca el override de un complejo sin
 * `plus_access_until` (El Vagón: override cargado a mano por SQL, sin Plus en la
 * suscripción). Override, limpieza de la fecha y audit en la MISMA tx.
 * Devuelve true si apagó. Idempotente.
 */
export async function expirePlusAccess(tenantId: string, now: Date): Promise<boolean> {
  const expired = await getWorkerDb().transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT plus_enabled, plus_access_until FROM tenant_subscriptions
      WHERE tenant_id = ${tenantId}
      FOR UPDATE
    `)) as unknown as Array<{ plus_enabled: boolean; plus_access_until: Date | string | null }>
    const row = rows[0]
    if (!row || row.plus_enabled || !row.plus_access_until) return false
    const accessUntil = toDate(row.plus_access_until)
    if (accessUntil.getTime() > now.getTime()) return false

    await writeBotOverride(tx, tenantId, false)
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET plus_access_until = NULL, updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'plus.access_expired',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { accessUntil: accessUntil.toISOString() },
    })
    return true
  })
  clearFeatureFlagCache()
  return expired
}

// ─── alta ───────────────────────────────────────────────────────────────────

function samePrice(a: number | null, b: number | null): boolean {
  return a === b
}

/**
 * Monto del débito con el Plus que corresponde a `plusPerCourt`, más el `reason`
 * que ve el pagador. Un solo lugar para el alta y la baja.
 */
function debitFor(
  plan: Awaited<ReturnType<typeof loadActivePlan>>,
  sub: Pick<SubRow, 'billed_courts' | 'billing_cycle'>,
  plusPerCourt: number,
): { amount: number; reason: string } {
  return {
    amount: subscriptionAmount(plan, sub.billed_courts, sub.billing_cycle, plusPerCourt),
    reason: billingReason(sub.billed_courts, sub.billing_cycle, plusPerCourt),
  }
}

/**
 * Prende Plus (o cambia su precio especial). `pricePerCourtCents`: `null` =
 * lista; si no, entero > 0 (P10).
 *
 * - Solo `trialing` o `active` (P9).
 * - Anual ya pago con meses completos por delante (P7): NO prende ni toca MP.
 *   Congela una cotización que el dueño paga con un link; la acredita la Fase B.
 * - El resto (mensual, prueba, anual sin meses completos o con la baja todavía
 *   vigente): `plus_enabled = true` + monto nuevo en MP, MP ÚLTIMO dentro de la
 *   tx. Si MP falla rollbackea todo y no queda nada marcado.
 *
 * Idempotente: el `FOR UPDATE` serializa dos llamadas simultáneas y la segunda
 * ve `unchanged`. Nunca suma Plus como delta: el monto se recalcula entero.
 */
export async function enablePlus(
  tenantId: string,
  input: { pricePerCourtCents: number | null },
  actor: PlusActor,
  gateway: PaymentGateway,
  now: Date,
): Promise<EnablePlusResult> {
  const price = input.pricePerCourtCents
  assertPlusSpecialPrice(price)

  const result = await withTenantContext(tenantId, async (tx): Promise<EnablePlusResult> => {
    const sub = await loadSubForUpdate(tenantId, tx)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)
    if (sub.status !== 'trialing' && sub.status !== 'active') {
      throw new PlusNotAllowedError(tenantId, sub.status)
    }
    const plan = await loadActivePlan(tx)
    const plusPerCourt = effectivePlusPerCourtCents(true, price)

    // ── Anual ya pago: se cotizan los meses que faltan (P7) ──────────────────
    // La baja agendada vigente significa que el año en curso ya incluye Plus
    // pago: volver a prender no debe nada. Tiene que cubrir el período vigente
    // ENTERO (`plus_access_until >= current_period_end`): `cancel()` deja la
    // fecha en el fin del período viejo y `reactivate()` arranca un año nuevo
    // sin Plus; con solo `> now` ese año nuevo se regalaba.
    const paidThroughNow =
      sub.plus_access_until !== null &&
      toDate(sub.plus_access_until).getTime() > now.getTime() &&
      toDate(sub.plus_access_until).getTime() >= toDate(sub.current_period_end).getTime()
    if (
      sub.status === 'active' &&
      sub.billing_cycle === 'annual' &&
      !sub.plus_enabled &&
      !paidThroughNow
    ) {
      const quote = plusProrateQuote({
        now,
        periodEnd: toDate(sub.current_period_end),
        billedCourts: sub.billed_courts,
        plusPerCourtCents: plusPerCourt,
        annualDiscountBps: pricingParamsOf(plan).annualDiscountBps,
      })
      if (quote.months >= 1) {
        // Ya cotizado al mismo precio y en este mismo período: está congelada, no
        // se recalcula. Si el año renovó, la cotización venció y se recotiza.
        if (isQuoteCurrent(sub) && samePrice(sub.plus_price_per_court_cents, price)) {
          return { kind: 'unchanged' }
        }
        await tx.execute(sql`
          UPDATE tenant_subscriptions
          SET plus_price_per_court_cents = ${price}::int,
              plus_prorate_cents = ${quote.amountCents},
              plus_prorate_months = ${quote.months},
              plus_prorate_period_end = ${toDate(sub.current_period_end).toISOString()}::timestamptz,
              plus_prorate_quoted_at = ${now.toISOString()}::timestamptz,
              updated_at = NOW()
          WHERE tenant_id = ${tenantId}
        `)
        await plusAudit(tx, tenantId, actor, 'plus.quote_created', {
          pricePerCourtCents: price,
          effectivePerCourtCents: plusPerCourt,
          months: quote.months,
          amountCents: quote.amountCents,
          billedCourts: sub.billed_courts,
        })
        return { kind: 'quote_pending', months: quote.months, amountCents: quote.amountCents }
      }
      // 0 meses completos: sigue como mensual (se cobra en la renovación).
    }

    // ── Mensual / prueba / anual sin meses: Plus entra al débito ─────────────
    if (
      sub.plus_enabled &&
      samePrice(sub.plus_price_per_court_cents, price) &&
      sub.plus_access_until === null
    ) {
      return { kind: 'unchanged' }
    }

    const kind = sub.plus_enabled ? 'price_changed' : 'enabled'
    const { amount, reason } = debitFor(plan, sub, plusPerCourt)
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET plus_enabled = true,
          plus_price_per_court_cents = ${price}::int,
          plus_access_until = NULL,
          plus_prorate_cents = NULL,
          plus_prorate_months = NULL,
          plus_prorate_period_end = NULL,
          plus_prorate_quoted_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)
    await plusAudit(
      tx,
      tenantId,
      actor,
      kind === 'enabled' ? 'plus.enabled' : 'plus.price_changed',
      {
        pricePerCourtCents: price,
        effectivePerCourtCents: plusPerCourt,
        amountCents: amount,
        cycle: sub.billing_cycle,
      },
    )
    // MP último: si falla, la tx entera rollbackea (ni plus_enabled ni audit).
    if (sub.mp_subscription_id) {
      await gateway.updatePreapprovalAmount(sub.mp_subscription_id, amount, { reason })
    }
    return { kind }
  })

  if (result.kind === 'quote_pending') return result

  // El flag va DESPUÉS del commit. También en `unchanged`: un intento anterior
  // pudo haber cobrado y fallado al prender.
  try {
    await ensurePlusFlagOn(tenantId)
  } catch (err) {
    throw new PlusFlagPendingError(tenantId, err)
  }
  return result
}

// ─── baja ───────────────────────────────────────────────────────────────────

/**
 * Baja de Plus. Permitida en cualquier estado.
 *
 * - `end_of_period` (dueño o super-admin, P5): el débito siguiente ya no lo
 *   lleva, el bot sigue hasta `max(current_period_end, now)` y lo apaga el
 *   barrido diario. Si solo había una cotización anual pendiente, la descarta.
 * - `immediate` (solo super-admin: contracargo, o apagar un override manual sin
 *   cobro): apaga ya. El flag se apaga después del commit; si eso falla, el
 *   barrido diario lo termina.
 */
export async function disablePlus(
  tenantId: string,
  input: { mode: 'end_of_period' | 'immediate' },
  actor: PlusActor,
  gateway: PaymentGateway,
  now: Date,
): Promise<DisablePlusResult> {
  if (input.mode === 'immediate' && actor.type !== 'system') {
    throw new Error('La baja inmediata de Plus es solo del super-admin')
  }

  const result = await withTenantContext(tenantId, async (tx): Promise<DisablePlusResult> => {
    const sub = await loadSubForUpdate(tenantId, tx)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)
    const plan = await loadActivePlan(tx)

    if (input.mode === 'end_of_period') {
      if (sub.plus_enabled) {
        const periodEnd = toDate(sub.current_period_end)
        const accessUntil = periodEnd.getTime() > now.getTime() ? periodEnd : now
        await tx.execute(sql`
          UPDATE tenant_subscriptions
          SET plus_enabled = false,
              plus_access_until = ${accessUntil.toISOString()}::timestamptz,
              plus_prorate_cents = NULL,
              plus_prorate_months = NULL,
              plus_prorate_period_end = NULL,
              plus_prorate_quoted_at = NULL,
              updated_at = NOW()
          WHERE tenant_id = ${tenantId}
        `)
        await plusAudit(tx, tenantId, actor, 'plus.end_scheduled', {
          accessUntil: accessUntil.toISOString(),
        })
        // MP último: el débito baja YA; el bot sigue hasta `accessUntil`.
        if (sub.mp_subscription_id) {
          const { amount, reason } = debitFor(plan, sub, 0)
          await gateway.updatePreapprovalAmount(sub.mp_subscription_id, amount, { reason })
        }
        return { kind: 'scheduled', accessUntil }
      }
      if (sub.plus_prorate_cents !== null) {
        await tx.execute(sql`
          UPDATE tenant_subscriptions
          SET plus_price_per_court_cents = NULL,
              plus_prorate_cents = NULL,
              plus_prorate_months = NULL,
              plus_prorate_period_end = NULL,
              plus_prorate_quoted_at = NULL,
              updated_at = NOW()
          WHERE tenant_id = ${tenantId}
        `)
        await plusAudit(tx, tenantId, actor, 'plus.quote_cleared', {
          months: sub.plus_prorate_months,
          amountCents: sub.plus_prorate_cents,
        })
        return { kind: 'quote_cleared' }
      }
      return { kind: 'unchanged' }
    }

    // immediate: sin nada que apagar (ni Plus, ni baja agendada, ni cotización,
    // ni override del flag) no se crea un override de la nada.
    const flagRows = (await tx.execute(sql`
      SELECT value FROM feature_flags
      WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id = ${tenantId}
    `)) as unknown as Array<{ value: boolean }>
    const overrideOn = flagRows[0]?.value === true
    if (
      !sub.plus_enabled &&
      sub.plus_access_until === null &&
      sub.plus_prorate_cents === null &&
      !overrideOn
    ) {
      return { kind: 'unchanged' }
    }
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET plus_enabled = false,
          plus_access_until = ${now.toISOString()}::timestamptz,
          plus_prorate_cents = NULL,
          plus_prorate_months = NULL,
          plus_prorate_period_end = NULL,
          plus_prorate_quoted_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)
    await plusAudit(tx, tenantId, actor, 'plus.turned_off', {
      wasBilled: sub.plus_enabled,
      hadOverride: overrideOn,
    })
    if (sub.plus_enabled && sub.mp_subscription_id) {
      const { amount, reason } = debitFor(plan, sub, 0)
      await gateway.updatePreapprovalAmount(sub.mp_subscription_id, amount, { reason })
    }
    return { kind: 'turned_off' }
  })

  if (result.kind === 'turned_off') {
    try {
      await expirePlusAccess(tenantId, now)
    } catch (err) {
      logger.warn('plus: no se pudo apagar el bot tras la baja inmediata; lo termina el barrido', {
        module: 'plus',
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return result
}

// ─── pago de la cotización anual ────────────────────────────────────────────

/**
 * Link de MercadoPago (pago único, cuenta MASTER) por la cotización congelada
 * del alta de Plus en un anual (P7). Cada click crea una preferencia nueva con
 * el mismo monto; vence a las 24 h. Quien acredita el pago es la Fase B.
 *
 * La lectura va en una tx corta y la llamada a MP afuera: acá no hay nada que
 * escribir, así que no se sostiene una conexión durante el viaje a MP.
 */
export async function startPlusProratePayment(
  tenantId: string,
  gateway: PaymentGateway,
  now: Date,
): Promise<{ checkoutUrl: string }> {
  const sub = await withTenantContext(tenantId, (tx) => loadSub(tenantId, tx))
  if (!sub) throw new SubscriptionNotFoundError(tenantId)
  if (
    sub.status !== 'active' ||
    sub.plus_prorate_cents === null ||
    sub.plus_prorate_months === null ||
    !isQuoteCurrent(sub)
  ) {
    throw new PlusQuoteNotPendingError(tenantId)
  }
  const months = sub.plus_prorate_months
  const preference = await gateway.createSaasPlusPreference({
    tenantId,
    amount: sub.plus_prorate_cents,
    description: `TurnoGol Plus — Asistente de WhatsApp (${months} ${months === 1 ? 'mes' : 'meses'})`,
    returnUrl: computeReturnUrl(),
    notificationUrl: computeNotificationUrl(tenantId),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  })
  return { checkoutUrl: preference.initPoint }
}

// ─── acreditación del pago de la cotización anual ───────────────────────────

/** Clave por PAGO (no por notificación): webhook y rescate comparten esta misma fila. */
function buildPlusProrateKey(mpPaymentId: string): string {
  return `plus-prorate:${mpPaymentId}`
}

/** Reclama una clave en `processed_webhooks` (mismo mecanismo que `lockWebhook` de dunning). */
async function claimProcessedKey(
  tx: DbTx,
  key: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const rows = (await tx.execute(sql`
    INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
    VALUES (${key}, 'plus-prorate:payment', ${payload}::jsonb)
    ON CONFLICT (mp_event_id) DO NOTHING
    RETURNING id
  `)) as unknown as Array<{ id: string }>
  return rows.length > 0
}

/**
 * Mail al dueño de TurnoGol (P11) DENTRO de la tx del caller: si no sale, tira y
 * la tx rollbackea (se liberan el reclamo del evento y del pago) para que se
 * reintente. Si sale y después falla otra cosa, la clave de `ops_alerts` evita el
 * mail repetido. Sin datos personales: nombre del complejo, montos e ids de pago.
 */
async function sendPlusOpsAlert(
  tx: DbTx,
  tenantId: string,
  build: (tenantName: string) => OpsAlert,
): Promise<void> {
  const rows = (await tx.execute(sql`
    SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)) as unknown as Array<{ name: string }>
  const alert = build(rows[0]?.name ?? tenantId)
  const undelivered = await sendOpsAlerts(getWorkerDb(), [alert], {
    path: `/super-admin/tenants/${tenantId}`,
    label: 'Abrir el complejo en el panel',
  })
  if (undelivered.length > 0) throw new Error('ops mail not delivered, retrying')
}

/**
 * ¿El pago es anterior a la cotización? `true` = anterior, `false` = posterior o
 * igual, `null` = no se puede saber (sin fecha, ilegible o cotización sin
 * fecha). El que llama trata `null` como NO acreditable.
 */
function paymentPredatesQuote(
  dateCreated: string | undefined,
  quotedAt: Date | string | null,
): boolean | null {
  if (!dateCreated || quotedAt === null) return null
  const paidAt = new Date(dateCreated).getTime()
  if (Number.isNaN(paidAt)) return null
  return paidAt < toDate(quotedAt).getTime()
}

function monthsLabel(months: number): string {
  return `${months} ${months === 1 ? 'mes' : 'meses'}`
}

/**
 * Acredita (o no) un pago único de `saas-plus:<tenantId>` (P7). Corre DENTRO de la
 * tx del caller (el webhook o el rescate), que después de commitear llama a
 * `ensurePlusFlagOn` si `enableFlag` es true.
 *
 * - `approved`: la clave por PAGO `plus-prorate:<id>` se reclama primero; si ya
 *   estaba, es otra notificación del mismo pago (o el rescate vs. el webhook) y no
 *   hace nada. Con la suscripción lockeada, prende Plus SOLO si hay cotización
 *   pendiente, el monto es exactamente el cotizado y el complejo está `active` y
 *   `annual`. Si no, no prende nada, deja la cotización y avisa: la plata entró y
 *   reintentar no la arregla, así que no tira por eso.
 * - `refunded` / `charged_back`: avisa y deja Plus como está (lo decide el
 *   super-admin, P11).
 * - Cualquier otro estado: nada.
 *
 * `gateway` en `undefined` = modo mock: no se toca MP. NUNCA pasa por
 * `onPaymentApproved` (cancelaría el preapproval vigente).
 */
export async function applyPlusProratePayment(
  input: {
    tenantId: string
    mpPaymentId: string
    status: MpPaymentStatus
    amountCents: number
    /** `date_created` del pago en MP. Sin fecha (o ilegible) no se acredita nada. */
    dateCreated: string | undefined
  },
  gateway: Pick<PaymentGateway, 'updatePreapprovalAmount'> | undefined,
  tx: DbTx,
  now: Date,
): Promise<{ enableFlag: boolean }> {
  const { tenantId, mpPaymentId, status, amountCents, dateCreated } = input

  if (status === 'refunded' || status === 'charged_back') {
    // Una vez por (pago, estado): evita repetir audit si llegan dos notificaciones.
    const fresh = await claimProcessedKey(tx, `plus-prorate-reversal:${mpPaymentId}:${status}`, {
      mpPaymentId,
      status,
    })
    if (!fresh) return { enableFlag: false }
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'plus.prorate_payment_reversed',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { mpPaymentId, status, amountCents, at: now.toISOString() },
    })
    await sendPlusOpsAlert(tx, tenantId, (name) => ({
      key: `plus-prorate-refund:${mpPaymentId}:${status}`,
      subject: `${name}: devolución/contracargo del pago de TurnoGol Plus`,
      lines: [
        `El pago ${mpPaymentId} de ${formatArs(amountCents)} figura como ${status === 'refunded' ? 'devuelto' : 'contracargo'} en MercadoPago.`,
        'Plus sigue prendido: el sistema no apaga nada solo.',
        'Si corresponde, lo podés apagar desde el panel del complejo.',
      ],
    }))
    return { enableFlag: false }
  }

  if (status !== 'approved') return { enableFlag: false }

  const fresh = await claimProcessedKey(tx, buildPlusProrateKey(mpPaymentId), {
    mpPaymentId,
    tenantId,
  })
  if (!fresh) return { enableFlag: false }

  const sub = await loadSubForUpdate(tenantId, tx)
  const quoteCents = sub?.plus_prorate_cents ?? null
  const quoteMonths = sub?.plus_prorate_months ?? null

  const predatesQuote = sub ? paymentPredatesQuote(dateCreated, sub.plus_prorate_quoted_at) : null

  let unmatchedReason: string | null = null
  if (!sub) unmatchedReason = 'el complejo no tiene suscripción'
  else if (quoteCents === null || quoteMonths === null) {
    unmatchedReason = 'no hay una cotización pendiente (pago duplicado o de una cotización vieja)'
  } else if (!isQuoteCurrent(sub)) {
    unmatchedReason = 'cotización vencida (el año renovó después de cotizar)'
  } else if (amountCents !== quoteCents) {
    unmatchedReason = 'el monto no coincide con la cotización'
  } else if (predatesQuote !== false) {
    unmatchedReason =
      predatesQuote === true
        ? 'pago anterior a la cotización'
        : 'el pago no trae fecha: no se puede asociar a la cotización'
  } else if (sub.status !== 'active') {
    unmatchedReason = `el complejo está en estado ${sub.status}, no activo`
  } else if (sub.billing_cycle !== 'annual') {
    unmatchedReason = 'el complejo no está en plan anual'
  }

  if (!sub || unmatchedReason !== null || quoteCents === null || quoteMonths === null) {
    const reason = unmatchedReason ?? 'sin cotización'
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'plus.prorate_payment_unmatched',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { mpPaymentId, amountCents, expectedCents: quoteCents, reason },
    })
    await sendPlusOpsAlert(tx, tenantId, (name) => ({
      key: `plus-prorate-unmatched:${mpPaymentId}`,
      subject: `${name}: pago de TurnoGol Plus que no coincide`,
      lines: [
        quoteCents !== null && quoteMonths !== null
          ? `Se esperaba la cotización pendiente: ${formatArs(quoteCents)} por ${monthsLabel(quoteMonths)}.`
          : 'Se esperaba: ninguna cotización pendiente.',
        `Llegó el pago ${mpPaymentId} por ${formatArs(amountCents)}. Motivo: ${reason}.`,
        'No se prendió nada. Si corresponde devolverlo, la devolución se hace a mano en MercadoPago.',
      ],
    }))
    return { enableFlag: false }
  }

  // Coincide: Plus entra (el año ya está pago hasta current_period_end). El
  // período NO se extiende y el estado no cambia. El precio especial queda.
  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plus_enabled = true,
        plus_access_until = NULL,
        plus_prorate_cents = NULL,
        plus_prorate_months = NULL,
        plus_prorate_period_end = NULL,
        plus_prorate_quoted_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'plus.prorate_paid',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: { mpPaymentId, amountCents, months: quoteMonths },
  })
  // MP último: si falla, rollbackea todo (también el reclamo del pago) y el
  // reintento acredita. El débito anual pasa a (plan + Plus) × 0,9 × 12 (P6).
  if (gateway && sub.mp_subscription_id) {
    const plan = await loadActivePlan(tx)
    const { amount, reason } = debitFor(
      plan,
      sub,
      effectivePlusPerCourtCents(true, sub.plus_price_per_court_cents),
    )
    await gateway.updatePreapprovalAmount(sub.mp_subscription_id, amount, { reason })
  }
  return { enableFlag: true }
}

// ─── lectura para el panel ──────────────────────────────────────────────────

export type PlusAdminState = {
  kind: 'off' | 'billed' | 'ending' | 'quote_pending' | 'manual_override'
  /** Precio especial cargado, o null (= lista). */
  pricePerCourtCents: number | null
  /** El que se aplica: el especial si existe, si no la lista. */
  effectivePerCourtCents: number
  accessUntil: Date | null
  quote: { months: number; amountCents: number } | null
  /** El bot está prendido para el complejo (override por complejo, si no el global). */
  flagOn: boolean
  subscriptionStatus: SubscriptionStatus
  billingCycle: BillingCycle
  billedCourts: number
}

/**
 * Estado de Plus de un complejo para el panel de super-admin. Orden de `kind`:
 * `plus_enabled` → billed; cotización → quote_pending; `plus_access_until` →
 * ending; flag en true → manual_override (bot prendido sin Plus en la
 * suscripción, ej. El Vagón); si no, off.
 */
export async function getPlusAdminState(tenantId: string): Promise<PlusAdminState> {
  return withTenantContext(tenantId, async (tx) => {
    const sub = await loadSub(tenantId, tx)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)
    // Mismo criterio que el loader de `feature-flags.ts`: el override del
    // complejo gana al global. Sin cache: el panel tiene que mostrar la verdad.
    const flagRows = (await tx.execute(sql`
      SELECT value FROM feature_flags
      WHERE key = ${BOT_FEATURE_FLAG}
        AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
      ORDER BY tenant_id NULLS LAST
      LIMIT 1
    `)) as unknown as Array<{ value: boolean }>
    const flagOn = flagRows[0]?.value === true

    // Una cotización de un período que ya renovó está vencida: no es `quote_pending`.
    const quote =
      sub.plus_prorate_cents !== null && sub.plus_prorate_months !== null && isQuoteCurrent(sub)
        ? { months: sub.plus_prorate_months, amountCents: sub.plus_prorate_cents }
        : null
    const accessUntil = sub.plus_access_until ? toDate(sub.plus_access_until) : null

    const kind: PlusAdminState['kind'] = sub.plus_enabled
      ? 'billed'
      : quote
        ? 'quote_pending'
        : accessUntil
          ? 'ending'
          : flagOn
            ? 'manual_override'
            : 'off'

    return {
      kind,
      pricePerCourtCents: sub.plus_price_per_court_cents,
      effectivePerCourtCents: sub.plus_price_per_court_cents ?? PLUS_LIST_PER_COURT_CENTS,
      accessUntil,
      quote,
      flagOn,
      subscriptionStatus: sub.status,
      billingCycle: sub.billing_cycle,
      billedCourts: sub.billed_courts,
    }
  })
}
