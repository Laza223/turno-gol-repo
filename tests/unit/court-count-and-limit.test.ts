import { describe, expect, it } from 'vitest'
import { getCourtCountAndLimit } from '@/modules/courts/court.service'
import type { DbTx } from '@/shared/db/client'

/**
 * getCourtCountAndLimit hace 3 queries secuenciales vía el query builder de
 * drizzle (no `tx.execute(sql)` crudo, a diferencia de billing.service):
 *   1) select({count}).from(courts).where(...)                    → awaited directo (sin .limit)
 *   2) select({...}).from(tenantSubscriptions).innerJoin(plans,...).where(...).limit(1)
 *   3) select({status}).from(tenants).where(...).limit(1)
 *
 * Mockear la RESPUESTA de la query 1 no probaría nada (un mock siempre
 * devuelve lo que se le pide, con o sin el fix) — lo que hay que verificar es
 * que el WHERE de esa query efectivamente filtra `status = 'online'`. Por eso
 * este fake CAPTURA la condición que `getCourtCountAndLimit` le pasa a
 * `.where(...)` y la serializa: los objetos `eq()`/`and()` de drizzle-orm
 * exponen el nombre de columna y el valor en `queryChunks`, así que
 * `JSON.stringify` alcanza para inspeccionarlos sin tocar una DB real.
 */
function makeTx(
  responses: [unknown[], unknown[], unknown[]],
  captureWhere: (condition: unknown) => void,
): DbTx {
  let i = 0
  let callIndex = 0
  function nextThenable() {
    const result = responses[i++] ?? []
    return {
      limit: () => Promise.resolve(result),
      then: (resolve: (v: unknown) => void) => resolve(result),
    }
  }
  const tx = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          if (callIndex === 0) captureWhere(condition)
          callIndex += 1
          return nextThenable()
        },
        innerJoin: () => ({
          where: () => {
            callIndex += 1
            return nextThenable()
          },
        }),
      }),
    }),
  }
  return tx as unknown as DbTx
}

function whereConditionText(condition: unknown): string {
  // Las columnas reales de drizzle-orm son `PgColumn` con una referencia
  // circular a su `PgTable` (`column.table.columns[...] === column`) — se
  // omite esa key para poder serializar sin tocar una DB real.
  return JSON.stringify(condition, (k, v) => {
    if (k === 'table') return undefined
    return typeof v === 'bigint' ? v.toString() : v
  })
}

describe('getCourtCountAndLimit — cuenta solo canchas online', () => {
  it('a) el WHERE del conteo filtra status = online (no todas las canchas)', async () => {
    let capturedWhere: unknown
    const tx = makeTx(
      [[{ count: 2 }], [{ maxCourts: 3, planSlug: 'predio' }], [{ status: 'active' }]],
      (c) => {
        capturedWhere = c
      },
    )

    await getCourtCountAndLimit('tenant-1', tx)

    const text = whereConditionText(capturedWhere)
    // Una cancha apagada no genera reservas ni ingresos: no debe consumir
    // cupo del plan. El WHERE tiene que llevar la condición de status.
    expect(text).toContain('"name":"status"')
    expect(text).toContain('"online"')
  })

  it('a) 3 canchas, 1 apagada → count devuelto es 2 (el que ya filtró Postgres)', async () => {
    const tx = makeTx(
      [[{ count: 2 }], [{ maxCourts: 3, planSlug: 'predio' }], [{ status: 'active' }]],
      () => {},
    )

    const result = await getCourtCountAndLimit('tenant-1', tx)

    expect(result.count).toBe(2)
    expect(result.maxCourts).toBe(3)
  })

  it('b) plan soporta 3, complejo tiene 2 online → el gate deja crear una cancha más', async () => {
    const tx = makeTx(
      [[{ count: 2 }], [{ maxCourts: 3, planSlug: 'predio' }], [{ status: 'active' }]],
      () => {},
    )

    const { count, maxCourts } = await getCourtCountAndLimit('tenant-1', tx)

    // Mismo cálculo que usan las Server Actions de canchas (settings/canchas,
    // onboarding): maxCourts !== null && count + 1 > maxCourts → bloquea.
    // Antes del fix, count incluía la apagada y esto daba 3 > 3 (bloqueado).
    expect(maxCourts !== null && count + 1 > maxCourts).toBe(false)
  })

  it('d) en trial: sin techo, sin importar cuántas canchas online tenga', async () => {
    const tx = makeTx(
      [[{ count: 10 }], [{ maxCourts: 3, planSlug: 'predio' }], [{ status: 'trialing' }]],
      () => {},
    )

    const result = await getCourtCountAndLimit('tenant-1', tx)

    expect(result.maxCourts).toBeNull()
  })
})
