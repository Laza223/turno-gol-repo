/**
 * AUD-08 (mínima) de la auditoría integral del 2026-09-06.
 *
 * El rol web tiene `lock_timeout = '3s'` (migr. 055) y `billing.service.ts`
 * mantiene el `FOR UPDATE` de la suscripción tomado mientras la operación viaja
 * a MercadoPago (hasta 8 s). Dos pestañas sobre "Activar plan" dejan a la
 * segunda esperando una fila que no se libera a tiempo: Postgres tira
 * `55P03 lock_not_available` y el wrapper lo devolvía como 500 genérico, con
 * ruido en Sentry incluido.
 *
 * Este archivo prueba la parte que un unitario con mocks NO puede probar: que
 * `isLockTimeout` reconozca el error REAL, tal como llega envuelto por
 * postgres-js y por el `DrizzleQueryError` de Drizzle 0.45 — donde el `code`
 * viaja en `cause` y no arriba (ver la cabecera de `pg-errors.ts`).
 *
 * El mapeo a 409 lo cubre `tests/unit/with-tenant-lock-timeout.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { isLockTimeout, isUniqueViolation } from '@/shared/db/pg-errors'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

// El valor de este archivo depende de que las 2 tx corran en conexiones
// SEPARADAS y choquen en el `FOR UPDATE` a nivel DB. Con `DATABASE_POOL_MAX=1`
// se serializan en la cola del pool ANTES de tocar Postgres: el test seguiría
// verde sin ejercitar nada. Mismo patrón que billing-race-conditions.test.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

const PRICING = {
  rules: [{ days: ['mon'], from: '08:00', to: '23:00', price: 800000 }],
}

let tenantId: string
let courtId: string

beforeAll(async () => {
  if (EFFECTIVE_POOL_MAX < 2) {
    throw new Error(
      `Este archivo requiere DATABASE_POOL_MAX>=2 para que las dos transacciones ` +
        `choquen en el lock a nivel DB; valor efectivo=${EFFECTIVE_POOL_MAX}.`,
    )
  }
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)

  const tenant = await createTestTenant(s)
  tenantId = tenant.id
  const rows = await s<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha del lock'}, ${10}, ${s.json(PRICING)}, 'online')
    RETURNING id
  `
  courtId = rows[0]!.id
}, 60_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
}, 60_000)

describe('el timeout de lock llega reconocible hasta el wrapper', () => {
  it('un 55P03 real sobrevive al envoltorio de Drizzle y lo detecta isLockTimeout', async () => {
    let soltar: () => void = () => {}
    const bloqueoLevantado = new Promise<void>((resolve) => {
      soltar = resolve
    })

    // Transacción que se queda con la fila y no la suelta hasta que se lo pidan.
    const tomaLaFila = withTenantContext(tenantId, async (tx) => {
      await tx.execute(sql`SELECT id FROM courts WHERE id = ${courtId}::uuid FOR UPDATE`)
      await bloqueoLevantado
    })

    // Le da tiempo a la primera a tomar el lock antes de que la segunda pida.
    await new Promise((r) => setTimeout(r, 200))

    // El catch va AFUERA de `withTenantContext` a propósito: una sentencia que
    // falla aborta la transacción entera, así que el error sale por el borde del
    // wrapper. Es exactamente el punto donde lo ve `with-tenant.ts`.
    let error: unknown = null
    try {
      await withTenantContext(tenantId, async (tx) => {
        // 150 ms en vez de los 3 s del rol: misma condición, sin esperar 3 s.
        await tx.execute(sql`SET LOCAL lock_timeout = '150ms'`)
        await tx.execute(sql`SELECT id FROM courts WHERE id = ${courtId}::uuid FOR UPDATE`)
      })
    } catch (err) {
      error = err
    } finally {
      soltar()
      await tomaLaFila
    }

    expect(error).not.toBeNull()
    expect(isLockTimeout(error)).toBe(true)
    // Control negativo: no es que el predicado diga true para cualquier cosa.
    expect(isUniqueViolation(error, 'cualquiera')).toBe(false)
  }, 30_000)

  it('un error que no es de lock no se confunde con uno que sí', async () => {
    let error: unknown = null
    try {
      await withTenantContext(tenantId, async (tx) => {
        await tx.execute(sql`SELECT 1 / 0`)
      })
    } catch (err) {
      error = err
    }

    expect(error).not.toBeNull()
    expect(isLockTimeout(error)).toBe(false)
  })
})
