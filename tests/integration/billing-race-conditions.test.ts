import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { onPaymentApproved } from '@/modules/billing/dunning.service'
import { cancel, reactivate, subscribe } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestTenant,
  createTestStaffUser,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// El valor de las pruebas de carrera de este archivo depende de que las tx
// corran en conexiones SEPARADAS y choquen en el `FOR UPDATE` a nivel DB. Con
// un pool chico (DATABASE_POOL_MAX=1) se serializan en la cola del pool ANTES
// de tocar la DB: el test seguiría verde pero ya no ejercitaría el lock.
// Espejo de resolvePoolMax() en src/shared/db/client.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

function requirePoolMaxAtLeast2(testName: string): void {
  if (EFFECTIVE_POOL_MAX < 2) {
    throw new Error(
      `${testName} requiere DATABASE_POOL_MAX>=2 para ejercitar la serialización ` +
        `por FOR UPDATE entre 2 tx concurrentes; valor efectivo=${EFFECTIVE_POOL_MAX}. ` +
        `Con menos conexiones las transacciones se serializan en la cola del pool.`,
    )
  }
}

/**
 * Siembra un tenant propio (staff activo con email real + suscripción) para
 * una prueba de carrera puntual, sin pisar el tenant compartido de arriba.
 * `status` se usa tal cual para AMBOS enums (`subscription_status` y
 * `tenant_status`); solo se llama con valores que existen en los dos
 * (`trialing`, `suspended`).
 */
async function seedRaceSubscription(opts: {
  status: 'trialing' | 'suspended'
  mpSubscriptionId: string | null
}): Promise<{ tenantId: string; planId: string }> {
  const s = getSql()
  const raceTenant = await createTestTenant(s)
  const staff = await createTestStaffUser(s)
  await linkStaffToTenant(s, raceTenant.id, staff.id, 'admin')

  const planRows = await s<{ id: string }[]>`
    SELECT id FROM plans WHERE slug = 'predio' LIMIT 1
  `
  const planId = planRows[0].id

  await s`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      mp_subscription_id
    ) VALUES (
      ${raceTenant.id},
      ${planId},
      'monthly'::billing_cycle,
      ${opts.status}::subscription_status,
      NOW(), NOW() + INTERVAL '7 days',
      ${opts.mpSubscriptionId}
    )
  `
  await s`UPDATE tenants SET status = ${opts.status}::tenant_status WHERE id = ${raceTenant.id}`

  return { tenantId: raceTenant.id, planId }
}

/**
 * Fix B5 (Fase 1, 🔴 huérfano MP↔DB — causa raíz, no solo subscribe×subscribe):
 * `cancel()` × `subscribe()`/`reactivate()` sobre el MISMO tenant. Sin el fix
 * (`cancel()` con `loadSub`, SIN lock), la lectura de `mp_subscription_id`
 * queda STALE mientras el UPDATE de limpieza de `cancel()`
 * (`transitionToCanceled`) ESPERA el `FOR UPDATE` que sostiene el
 * subscribe()/reactivate() concurrente; al desbloquearse, `cancel()` usa el
 * valor viejo para decidir si hay algo que limpiar, y su cleanup
 * (`SET mp_subscription_id = NULL WHERE status = 'canceled'`, SIN condicionar
 * al id capturado) pisa SIN condición el id NUEVO que la otra tx acaba de
 * escribir — el preapproval nuevo queda vivo en MP, sin referencia en la DB
 * y sin que nadie lo haya mandado a cancelar. Con el fix (`cancel()` también
 * con `loadSubForUpdate`), ambas tx se serializan por el mismo lock: la que
 * corre segunda siempre lee el estado fresco.
 *
 * Invariante anti-huérfano: todo preapproval que existió durante la carrera
 * (el id sembrado + el id nuevo que devuelve el subscribe/reactivate que
 * efectivamente corrió) que NO termine siendo el `mp_subscription_id` final
 * persistido debe aparecer en `gateway.cancelPreapprovalCalls`. Si algo
 * queda afuera de las dos categorías, es un preapproval vivo en MP sin
 * referencia en la DB.
 */
function assertNoOrphanPreapproval(args: {
  seedMpSubscriptionId: string
  createdIds: string[]
  finalPersistedId: string | null
  cancelPreapprovalCalls: string[]
}): void {
  const candidates = [args.seedMpSubscriptionId, ...args.createdIds]
  for (const id of candidates) {
    if (id !== args.finalPersistedId) {
      expect(
        args.cancelPreapprovalCalls,
        `preapproval ${id} no es el mp_subscription_id final persistido ` +
          `(${args.finalPersistedId}) y no aparece en cancelPreapprovalCalls — ` +
          `queda vivo en MP sin referencia en la DB`,
      ).toContain(id)
    }
  }
}

const RACE_ROUNDS = 5

let tenant: { id: string }

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenant = await createTestTenant(s)

  await s`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      mp_subscription_id
    ) VALUES (
      ${tenant.id},
      (SELECT id FROM plans WHERE slug = 'predio' LIMIT 1),
      'monthly'::billing_cycle,
      'trialing'::subscription_status,
      NOW(), NOW() + INTERVAL '7 days',
      'preapp-test-1'
    )
  `
}, 30_000)

afterAll(async () => closeSql())

describe('billing race conditions', () => {
  it('two concurrent onPaymentApproved with DIFFERENT mpEventIds → state still consistent', async () => {
    const evt1 = `evt-billing-${Date.now()}-1`
    const evt2 = `evt-billing-${Date.now()}-2`

    const results = await Promise.allSettled([
      withTenantContext(tenant.id, (tx) =>
        onPaymentApproved(tenant.id, evt1, 'payment', { id: evt1 }, new Date(), tx),
      ),
      withTenantContext(tenant.id, (tx) =>
        onPaymentApproved(tenant.id, evt2, 'payment', { id: evt2 }, new Date(), tx),
      ),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    // Acceptable outcomes:
    // - Both fulfilled (one transitions, other extends period because status='active' branch)
    // - One fulfilled + one rejected (loser hit InvalidTransitionError on tx commit race)
    expect(fulfilled + rejected).toBe(2)

    // Final state MUST be active (not trialing).
    const s = getSql()
    const rows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0].status).toBe('active')

    // processed_webhooks should have BOTH events recorded.
    const wh = await s<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks
      WHERE mp_event_id IN (${evt1}, ${evt2})
    `
    expect(wh[0].c).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('SAME mpEventId N=10 concurrent → exactly 1 fresh, rest alreadyProcessed', async () => {
    // Reset to trialing for second test
    const s = getSql()
    await s`UPDATE tenant_subscriptions SET status = 'trialing'::subscription_status WHERE tenant_id = ${tenant.id}`
    await s`UPDATE tenants SET status = 'trialing'::tenant_status WHERE id = ${tenant.id}`

    const evt = `evt-billing-same-${Date.now()}`
    const attempts = Array.from({ length: 10 }, () =>
      withTenantContext(tenant.id, async (tx) => {
        try {
          return await onPaymentApproved(tenant.id, evt, 'payment', { id: evt }, new Date(), tx)
        } catch {
          return { alreadyProcessed: true }
        }
      }),
    )
    const results = await Promise.all(attempts)
    const fresh = results.filter((r) => !r.alreadyProcessed).length
    expect(fresh).toBe(1)
  }, 30_000)

  // Fix B5 (🔴 huérfano MP↔DB): dos `subscribe()` concurrentes sobre el
  // mismo tenant sin lock crean CADA UNO un preapproval en MP; el UPDATE
  // local solo guarda el último id — el otro queda huérfano en MP, cobrando
  // sin que la DB lo referencie. `loadSubForUpdate` (`FOR UPDATE`) serializa
  // las dos tx; la que corre segunda ve el `mp_subscription_id` que dejó la
  // primera y lo cancela antes de pedir uno nuevo (mismo bloque que
  // `reactivate()`). Invariante anti-huérfano: todo preapproval creado
  // EXCEPTO el que queda persistido en `mp_subscription_id` debe aparecer en
  // `gateway.cancelPreapprovalCalls`.
  it('two concurrent subscribe() on the SAME tenant → no orphaned MP preapproval (B5)', async () => {
    // 🟡 abierto en la fase B5 (docs/audit/FIX_BILLING_ATOMICITY_REFUND_2026-07-16.md):
    // este it no tenía el guard de pool que sí tienen race-admin-vs-online /
    // concurrent-cancellation. Con DATABASE_POOL_MAX=1 quedaba verde sin
    // ejercitar el lock real (las 2 tx se serializan en la cola del pool).
    requirePoolMaxAtLeast2('two concurrent subscribe()')

    const s = getSql()

    // Tenant propio (no el compartido de arriba) para no pisar los otros
    // `it` de este archivo, con un owner real (subscribe() exige
    // owner.ownerEmail) y una suscripción trialing sin mp_subscription_id.
    const raceTenant = await createTestTenant(s)
    const staff = await createTestStaffUser(s)
    await linkStaffToTenant(s, raceTenant.id, staff.id, 'admin')

    const planRows = await s<{ id: string }[]>`
      SELECT id FROM plans WHERE slug = 'predio' LIMIT 1
    `
    const planId = planRows[0].id

    await s`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, billing_cycle, status,
        current_period_start, current_period_end,
        mp_subscription_id
      ) VALUES (
        ${raceTenant.id},
        ${planId},
        'monthly'::billing_cycle,
        'trialing'::subscription_status,
        NOW(), NOW() + INTERVAL '7 days',
        NULL
      )
    `

    const gateway = new MockGateway()

    const results = await Promise.allSettled([
      withTenantContext(raceTenant.id, (tx) =>
        subscribe(raceTenant.id, planId, 'monthly', gateway, tx),
      ),
      withTenantContext(raceTenant.id, (tx) =>
        subscribe(raceTenant.id, planId, 'monthly', gateway, tx),
      ),
    ])

    // Ambas deberían completar: la segunda, serializada por el lock, ve
    // status todavía 'trialing' (subscribe no lo cambia) así que no choca
    // contra el guard de estado.
    const fulfilledResults = results.filter(
      (r): r is PromiseFulfilledResult<{ checkoutUrl: string; preapprovalId: string }> =>
        r.status === 'fulfilled',
    )
    expect(fulfilledResults.length).toBe(2)

    const finalRows = await s<{ mp_subscription_id: string | null }[]>`
      SELECT mp_subscription_id FROM tenant_subscriptions WHERE tenant_id = ${raceTenant.id}
    `
    const persistedId = finalRows[0].mp_subscription_id
    expect(persistedId).not.toBeNull()

    // Ids REALES devueltos por cada subscribe() (fuente de verdad — no se
    // reconstruye el formato del mock).
    const createdIds = fulfilledResults.map((r) => r.value.preapprovalId)
    expect(new Set(createdIds).size).toBe(2) // dos preapprovals distintos, ninguno reusado

    const orphanedIds = createdIds.filter((id) => id !== persistedId)
    expect(orphanedIds.length).toBe(1) // el que perdió la carrera del UPDATE final

    for (const orphanId of orphanedIds) {
      expect(gateway.cancelPreapprovalCalls).toContain(orphanId)
    }
  }, 30_000)

  it(`cancel() concurrente con subscribe() sobre el MISMO tenant (trialing) → sin preapproval huérfano (x${RACE_ROUNDS})`, async () => {
    requirePoolMaxAtLeast2('cancel() vs subscribe()')

    for (let i = 0; i < RACE_ROUNDS; i++) {
      const seedId = `preapp-seed-cancel-subscribe-${i}-${Date.now()}`
      const { tenantId, planId } = await seedRaceSubscription({
        status: 'trialing',
        mpSubscriptionId: seedId,
      })
      const gateway = new MockGateway()

      const [cancelRes, subscribeRes] = await Promise.allSettled([
        withTenantContext(tenantId, (tx) => cancel(tenantId, 'race test', gateway, tx)),
        withTenantContext(tenantId, (tx) => subscribe(tenantId, planId, 'monthly', gateway, tx)),
      ])

      // cancel() nunca debería fallar acá: ni subscribe() ni reactivate() tocan
      // `status`, así que el WHERE de `transitionToCanceled` sigue matcheando
      // gane quien gane la carrera del lock.
      expect(cancelRes.status, `round ${i}: cancel() debe completar`).toBe('fulfilled')

      // subscribe() SÍ puede rechazar (ReactivateNotAllowedError) si cancel()
      // ya movió el status a 'canceled' antes de que subscribe() leyera —
      // resultado legítimo, sin preapproval creado en ese caso.
      const createdIds =
        subscribeRes.status === 'fulfilled' ? [subscribeRes.value.preapprovalId] : []

      const s = getSql()
      const finalRows = await s<{ mp_subscription_id: string | null }[]>`
        SELECT mp_subscription_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `
      assertNoOrphanPreapproval({
        seedMpSubscriptionId: seedId,
        createdIds,
        finalPersistedId: finalRows[0].mp_subscription_id,
        cancelPreapprovalCalls: gateway.cancelPreapprovalCalls,
      })
    }
  }, 60_000)

  it(`cancel() concurrente con reactivate() sobre el MISMO tenant (suspended) → sin preapproval huérfano (x${RACE_ROUNDS})`, async () => {
    requirePoolMaxAtLeast2('cancel() vs reactivate()')

    for (let i = 0; i < RACE_ROUNDS; i++) {
      const seedId = `preapp-seed-cancel-reactivate-${i}-${Date.now()}`
      const { tenantId, planId } = await seedRaceSubscription({
        status: 'suspended',
        mpSubscriptionId: seedId,
      })
      const gateway = new MockGateway()

      const [cancelRes, reactivateRes] = await Promise.allSettled([
        withTenantContext(tenantId, (tx) => cancel(tenantId, 'race test', gateway, tx)),
        withTenantContext(tenantId, (tx) =>
          reactivate(tenantId, planId, 'monthly', gateway, tx),
        ),
      ])

      expect(cancelRes.status, `round ${i}: cancel() debe completar`).toBe('fulfilled')
      // reactivate() acepta 'canceled' como estado de partida (además de
      // suspended/churned/blocked, ver comentario ENS-20 en billing.service.ts),
      // así que NUNCA debería rechazar acá, gane quien gane la carrera.
      expect(reactivateRes.status, `round ${i}: reactivate() debe completar`).toBe('fulfilled')

      const createdIds =
        reactivateRes.status === 'fulfilled' ? [reactivateRes.value.preapprovalId] : []

      const s = getSql()
      const finalRows = await s<{ mp_subscription_id: string | null }[]>`
        SELECT mp_subscription_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `
      assertNoOrphanPreapproval({
        seedMpSubscriptionId: seedId,
        createdIds,
        finalPersistedId: finalRows[0].mp_subscription_id,
        cancelPreapprovalCalls: gateway.cancelPreapprovalCalls,
      })
    }
  }, 60_000)

  /**
   * Fase 2 (🔴 TOCTOU webhook↔reactivate, docs/audit/FIX_BILLING_ATOMICITY_REFUND_2026-07-16.md):
   * `loadSub` (dunning.service.ts) SIN lock podía leer el `mp_subscription_id`
   * VIEJO mientras un `reactivate()` concurrente (que sí lockea con
   * `loadSubForUpdate`, billing.service.ts) estaba a mitad de camino de
   * reemplazarlo por uno NUEVO — un pago "en vuelo" del preapproval viejo
   * (`onPaymentApproved` con `preapprovalId=OLD`) matcheaba esa lectura stale
   * y activaba el tenant sobre un pago que nunca correspondió al preapproval
   * vigente.
   *
   * Determinismo del interleaving: en vez de confiar en el scheduler del
   * event loop, se fuerza el orden con un barrier en
   * `gateway.cancelPreapproval` — `reactivate()` lo llama INMEDIATAMENTE
   * DESPUÉS de `loadSubForUpdate` (mismo bloque, antes de pedir el
   * preapproval nuevo), o sea, con el `FOR UPDATE` ya tomado. Recién ahí se
   * lanza `onPaymentApproved`.
   *
   * Honestidad sobre el `Promise.race` de abajo: confirma que `approvedPromise`
   * sigue pendiente mientras `reactivate()` sostiene el barrier — prueba que
   * hay concurrencia REAL a nivel Postgres (no una carrera de scheduler que
   * resuelve sola), pero NO aísla en qué punto exacto bloquea. Verificado a
   * mano revirtiendo el fix (`loadSub` sin `FOR UPDATE OF ts`): el bloqueo
   * sigue apareciendo igual, porque el UPDATE de `transitionToActiveFromAny`
   * (ejecutado bajo el mismatch stale) también espera el mismo lock de fila
   * que sostiene `reactivate()` — así que este `Promise.race` NO discrimina
   * fixed vs. buggy por sí solo. La prueba real del fix son las aserciones de
   * estado final de abajo (`finalMpId`/`finalStatus`): sin el fix, el tenant
   * termina `active` a pesar de que el preapproval vigente ya es el NUEVO
   * (ver prueba de honestidad en el reporte de este cambio).
   */
  it('reactivate() concurrente con onPaymentApproved(preapprovalId=OLD) → no activa sobre un pago del preapproval viejo (TOCTOU Fase 2)', async () => {
    requirePoolMaxAtLeast2('reactivate() vs onPaymentApproved(OLD)')

    const s = getSql()
    const seedId = `preapp-seed-toctou-${Date.now()}`
    const { tenantId, planId } = await seedRaceSubscription({
      status: 'suspended',
      mpSubscriptionId: seedId,
    })
    // current_period_end vencido: refleja un tenant real en dunning (no
    // afecta el guard de reactivate(), que solo mira scheduled_deletion_at,
    // pero deja el seed fiel al escenario descripto en el contrato).
    await s`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 day'
      WHERE tenant_id = ${tenantId}
    `

    const gateway = new MockGateway()

    let resolveLockAcquired!: () => void
    const lockAcquired = new Promise<void>((resolve) => {
      resolveLockAcquired = resolve
    })
    let releaseReactivate!: () => void
    const canProceed = new Promise<void>((resolve) => {
      releaseReactivate = resolve
    })

    // reactivate() llama a `gateway.cancelPreapproval(sub.mp_subscription_id)`
    // inmediatamente después de `loadSubForUpdate` (mismo bloque, antes de
    // pedir el preapproval nuevo) — para cuando este hook corre, el `FOR
    // UPDATE` ya está tomado sobre la fila.
    const originalCancel = gateway.cancelPreapproval.bind(gateway)
    gateway.cancelPreapproval = async (id: string) => {
      const result = await originalCancel(id)
      resolveLockAcquired()
      await canProceed
      return result
    }

    const reactivatePromise = withTenantContext(tenantId, (tx) =>
      reactivate(tenantId, planId, 'monthly', gateway, tx),
    )

    await lockAcquired // reactivate() sostiene el FOR UPDATE, esperando en el barrier

    const evt = `evt-toctou-${Date.now()}`
    const approvedPromise = withTenantContext(tenantId, (tx) =>
      onPaymentApproved(
        tenantId,
        evt,
        'subscription_authorized_payment',
        { id: evt },
        new Date(),
        tx,
        'mp-pay-toctou',
        seedId, // pago del preapproval VIEJO, "en vuelo"
      ),
    )

    // Sanity check de concurrencia REAL (no discrimina fixed vs. buggy — ver
    // el comentario del bloque de arriba): mientras reactivate() sostiene el
    // barrier, onPaymentApproved no debería resolver solo por scheduling del
    // event loop.
    const TIMEOUT = Symbol('timeout')
    const race = await Promise.race([
      approvedPromise.then((v) => ({ tag: 'resolved' as const, value: v })),
      new Promise<{ tag: typeof TIMEOUT }>((resolve) =>
        setTimeout(() => resolve({ tag: TIMEOUT }), 500),
      ),
    ])
    expect(
      race.tag,
      'onPaymentApproved no debería resolver mientras reactivate() sostiene el barrier ' +
        '(sin esto, el test no estaría ejercitando concurrencia real)',
    ).toBe(TIMEOUT)

    releaseReactivate()

    const [reactivateResult, approvedResult] = await Promise.all([
      reactivatePromise,
      approvedPromise,
    ])

    expect(approvedResult.alreadyProcessed).toBe(false)

    const finalRows = await s<{ mp_subscription_id: string | null; status: string }[]>`
      SELECT mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    const finalMpId = finalRows[0]!.mp_subscription_id
    const finalStatus = finalRows[0]!.status

    // reactivate() es el único que escribe mp_subscription_id acá — su
    // resultado real (no una reconstrucción del formato del mock) debe ser
    // el vigente persistido, y nunca el seed viejo.
    expect(finalMpId).toBe(reactivateResult.preapprovalId)
    expect(finalMpId).not.toBe(seedId)

    // Invariante central: el pago era del preapproval VIEJO (seedId); como
    // el vigente terminó siendo otro, NO debe haber activado el tenant.
    expect(finalStatus).not.toBe('active')
    expect(finalStatus).toBe('suspended')
  }, 30_000)
})
