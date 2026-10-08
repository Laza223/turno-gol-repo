/**
 * Ensayo del débito automático con plata chica: deja a "complejo titi" igual que
 * El Vagón (en prueba, con el fin de período guardado viejo) pero con un débito
 * de $100/mes con el primer cobro en `--first-charge`.
 *
 * Crea el preapproval con el MISMO código que usa "Activar plan"
 * (`getBillingGateway().createPreapproval`), así que prueba de verdad cómo le
 * mandamos `start_date` a MercadoPago.
 *
 * Correr desde la raíz del repo con el env de producción inyectado (el token
 * nunca se imprime):
 *   railway run --service turno-gol-repo -- pnpm tsx <este archivo> --first-charge=2026-10-01T17:00:00Z
 *   (sin --apply es simulacro: solo muestra qué haría)
 */
import postgres from 'postgres'
import { getBillingGateway } from '@/modules/billing/billing.gateway'

const TITI = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'
const PLAN_PRUEBA = '643562bd-08cc-4d0e-a8b3-331580e2f81e' // "Prueba interna — NO OFRECER"
const AMOUNT_CENTS = 10_000 // $100
// El fin de período "del alta" de titi: lo mismo que le pasa a El Vagón
// (fin guardado viejo + prueba más larga), para ejercitar el arreglo 2.
const STALE_PERIOD_END = '2026-09-18T13:58:57.276Z'

const apply = process.argv.includes('--apply')
const firstArg = process.argv.find((a) => a.startsWith('--first-charge='))
if (!firstArg) throw new Error('falta --first-charge=<ISO UTC>')
const firstChargeAt = new Date(firstArg.split('=')[1]!)
if (Number.isNaN(firstChargeAt.getTime())) throw new Error('--first-charge inválido')
if (firstChargeAt.getTime() < Date.now() + 2 * 60 * 60 * 1000) {
  throw new Error('--first-charge tiene que estar al menos 2 h en el futuro')
}

const appUrl = process.env.APP_URL
if (!appUrl?.startsWith('https://')) throw new Error('APP_URL de producción no disponible')
const dbUrl = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL
if (!dbUrl) throw new Error('sin URL de base')

const sql = postgres(dbUrl, { max: 1, prepare: false })

async function main(): Promise<void> {
  const [row] = await sql<
    { status: string; mp_subscription_id: string | null; payer: string | null }[]
  >`
    SELECT ts.status, ts.mp_subscription_id,
           COALESCE(ts.mp_payer_email, (
             SELECT su.email FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = ts.tenant_id AND tsm.is_active = true AND tsm.role = 'admin'
             LIMIT 1
           )) AS payer
    FROM tenant_subscriptions ts WHERE ts.tenant_id = ${TITI}
  `
  if (!row?.payer) throw new Error('titi sin email pagador')
  console.log('titi hoy:', { status: row.status, mpSubscriptionId: row.mp_subscription_id })
  console.log('primer cobro:', firstChargeAt.toISOString(), '· monto: $', AMOUNT_CENTS / 100)

  if (!apply) {
    console.log('SIMULACRO: no se creó nada. Repetir con --apply.')
    return
  }

  // MP primero, afuera de toda transacción (Saga). Si la escritura local
  // falla después, se imprime el id para cancelarlo a mano.
  const pre = await getBillingGateway().createPreapproval({
    tenantId: TITI,
    payerEmail: row.payer,
    amount: AMOUNT_CENTS,
    frequency: 'monthly',
    planId: PLAN_PRUEBA,
    reason: 'TurnoGol — Prueba interna — NO OFRECER (ensayo débito)',
    returnUrl: `${appUrl}/settings/facturacion`,
    notificationUrl: `${appUrl}/api/webhooks/mercadopago?tenant=${TITI}&source=saas`,
    firstChargeAt,
  })
  console.log('preapproval creado:', pre.preapprovalId)

  try {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE tenant_subscriptions
        SET status = 'trialing', plan_id = ${PLAN_PRUEBA}, billing_cycle = 'monthly',
            mp_subscription_id = ${pre.preapprovalId},
            current_period_end = ${STALE_PERIOD_END}::timestamptz,
            canceled_at = NULL, cancellation_reason = NULL, scheduled_deletion_at = NULL,
            dunning_started_at = NULL, last_payment_failed_at = NULL,
            pending_billed_courts = NULL, pending_change_at = NULL, updated_at = NOW()
        WHERE tenant_id = ${TITI}
      `
      await tx`
        UPDATE tenants
        SET status = 'trialing', trial_ends_at = ${firstChargeAt.toISOString()}::timestamptz,
            trial_warning_days_sent = 1, scheduled_deletion_at = NULL, updated_at = NOW()
        WHERE id = ${TITI}
      `
      await tx`
        INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
        VALUES (${TITI}, '00000000-0000-0000-0000-000000000000', 'system',
                'subscription.subscribe_initiated', 'tenant_subscription', ${TITI},
                ${tx.json({
                  ensayo: 'debito-100',
                  mpSubscriptionId: pre.preapprovalId,
                  firstChargeAt: firstChargeAt.toISOString(),
                  previousMpSubscriptionId: row.mp_subscription_id,
                })})
      `
    })
  } catch (err) {
    console.error('FALLÓ la escritura local. Cancelar a mano el preapproval', pre.preapprovalId)
    throw err
  }

  console.log('LISTO. Link para que Tiziana cargue la tarjeta:')
  console.log(pre.initPoint)
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
  .finally(() => sql.end())
