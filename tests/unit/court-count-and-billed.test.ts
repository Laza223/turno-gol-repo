import { describe, expect, it } from 'vitest'
import { getCourtCountAndBilled } from '@/modules/courts/court.service'
import type { DbTx } from '@/shared/db/client'

/**
 * `getCourtCountAndBilled` reemplaza a `getCourtCountAndLimit`: con precio
 * lineal por cancha (decisión 2026-09-17, P3) NO hay techo de plan que
 * comparar — agregar una cancha no se bloquea, cuesta $30.000 más por mes. Lo
 * que la UI necesita saber ahora es otra cosa: cuántas canchas hay PRENDIDAS y
 * por cuántas se está facturando, para poder avisar "esto te sube la cuota"
 * antes de tocar nada.
 *
 * Hace 2 queries secuenciales vía el query builder de drizzle (no
 * `tx.execute(sql)` crudo, a diferencia de billing.service):
 *   1) select({count}).from(courts).where(tenant + status='online')  → awaited directo
 *   2) select({billedCourts,status}).from(tenantSubscriptions).where(tenant).limit(1)
 *
 * Mockear la RESPUESTA de la query 1 no probaría nada (un mock siempre
 * devuelve lo que se le pide) — lo que hay que verificar es que el WHERE de
 * esa query efectivamente filtra `status = 'online'`. Por eso este fake
 * CAPTURA la condición que le pasa a `.where(...)` y la serializa: los objetos
 * `eq()`/`and()` de drizzle-orm exponen el nombre de columna y el valor en
 * `queryChunks`, así que `JSON.stringify` alcanza para inspeccionarlos sin
 * tocar una DB real.
 */
function makeTx(
  responses: [unknown[], unknown[]],
  captureWhere: (condition: unknown) => void = () => {},
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

/** Fila de `tenant_subscriptions` tal como la proyecta la query 2. */
function sub(status: string, billedCourts = 3, pendingBilledCourts: number | null = null) {
  return { billedCourts, pendingBilledCourts, status }
}

describe('getCourtCountAndBilled — cuenta solo canchas online', () => {
  it('el WHERE del conteo filtra status = online (no todas las canchas)', async () => {
    let capturedWhere: unknown
    const tx = makeTx([[{ count: 2 }], [sub('active')]], (c) => {
      capturedWhere = c
    })

    await getCourtCountAndBilled('tenant-1', tx)

    const text = whereConditionText(capturedWhere)
    // Una cancha apagada no genera reservas ni ingresos: no puede empujar la
    // cuota. Es a propósito el MISMO criterio que `countOnlineCourts`
    // (billing.service.ts) — el aviso de /canchas y el piso de facturación
    // tienen que medir lo mismo, o el complejo queda atrapado entre dos
    // números que no coinciden.
    expect(text).toContain('"name":"status"')
    expect(text).toContain('"online"')
  })

  it('3 canchas, 1 apagada → onlineCourts es 2 (el que ya filtró Postgres)', async () => {
    const tx = makeTx([[{ count: 2 }], [sub('active', 3)]])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result.onlineCourts).toBe(2)
  })
})

describe('getCourtCountAndBilled — canchas facturadas vs. canchas prendidas', () => {
  it('suscripción activa: devuelve billed_courts, que puede NO coincidir con las prendidas', async () => {
    // El caso que motiva toda la función: 5 prendidas pero el cobro vigente es
    // por 3 → prender la sexta tiene que avisar antes de mover plata.
    const tx = makeTx([[{ count: 5 }], [sub('active', 3)]])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result).toEqual({ onlineCourts: 5, billedCourts: 3, isTrialing: false })
  })

  it('con una baja agendada, compara contra lo agendado: prender de nuevo tiene que avisar', async () => {
    // Cobra 5, agendó bajar a 3 y hoy tiene 3 prendidas. Volver a prender la
    // 4ª sube el PRÓXIMO cobro de 3 a 4: contra billed_courts (5) no avisaba
    // nada, la baja seguía en pie y el sweep cobraba 3 con 5 prendidas.
    const tx = makeTx([[{ count: 3 }], [sub('active', 5, 3)]])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result).toEqual({ onlineCourts: 3, billedCourts: 3, isTrialing: false })
  })

  it('en prueba gratis: marca isTrialing — ahí el cambio se aplica en el acto y no se cobró nada', async () => {
    const tx = makeTx([[{ count: 2 }], [sub('trialing', 2)]])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result).toEqual({ onlineCourts: 2, billedCourts: 2, isTrialing: true })
  })

  it.each(['past_due', 'suspended', 'blocked', 'canceled', 'churned'])(
    '%s: billedCourts null — mover el cobro no significa nada en ese estado',
    async (status) => {
      const tx = makeTx([[{ count: 4 }], [sub(status, 4)]])

      const result = await getCourtCountAndBilled('tenant-1', tx)

      // `null` es lo que hace que crear o prender una cancha pase sin ruido:
      // no hay nada que confirmar ni que agendar.
      expect(result.billedCourts).toBeNull()
      expect(result.isTrialing).toBe(false)
    },
  )

  it('sin fila de suscripción: billedCourts null y no rompe', async () => {
    const tx = makeTx([[{ count: 4 }], []])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result).toEqual({ onlineCourts: 4, billedCourts: null, isTrialing: false })
  })

  it('complejo sin ninguna cancha: onlineCourts 0, no undefined', async () => {
    const tx = makeTx([[], [sub('active', 1)]])

    const result = await getCourtCountAndBilled('tenant-1', tx)

    expect(result.onlineCourts).toBe(0)
  })
})
