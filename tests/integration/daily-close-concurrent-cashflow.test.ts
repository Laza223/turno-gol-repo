import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { closeDailyRegister, getDailyClose } from '@/modules/cashflow/daily-close.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { todayART } from '@/shared/time/art-date'

// caza-bugs #14: closeDailyRegister no se serializaba contra altas de
// cash_flows concurrentes. Sin el advisory lock (pg_advisory_xact_lock keyed
// por tenant, compartido entre closeDailyRegister y assertDayOpen), un alta
// podía commitear DESPUÉS de que el cierre ya leyó los totales pero ANTES de
// que el cierre insertara su fila: el movimiento queda "huérfano" — existe,
// pero el total_income del cierre no lo incluye, y como el día ya está
// cerrado tampoco puede recuperarse reabriendo. El invariante que debe
// sostenerse SIEMPRE, sin importar el orden real en que Postgres serializa
// las dos transacciones: o el alta queda reflejada en el total del cierre, o
// el alta es rechazada por DayAlreadyClosedError — nunca las dos cosas a la
// vez (alta exitosa + cierre que no la cuenta).

let staffId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  staffId = staff.id
}, 30_000)

afterAll(async () => {
  await closeSql()
})

async function countCashFlows(tId: string, date: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM cash_flows
    WHERE tenant_id = ${tId}
      AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date
  `
  return Number(rows[0]!.c)
}

describe('closeDailyRegister vs createCashFlow — serialización por advisory lock', () => {
  const ROUNDS = 5

  it(`cierre y alta concurrentes sobre el mismo día nunca dejan un movimiento fuera del total (x${ROUNDS})`, async () => {
    const date = todayART()

    for (let i = 0; i < ROUNDS; i++) {
      const sql = getSql()
      // Tenant nuevo por ronda: evita que un daily_cash_close previo bloquee
      // rondas siguientes (closeDailyRegister es idempotente por día).
      const tenant = await createTestTenant(sql)
      await linkStaffToTenant(sql, tenant.id, staffId)

      const [cashFlowResult, closeResult] = await Promise.allSettled([
        withTenantContext(tenant.id, (tx) =>
          createCashFlow(
            tenant.id,
            staffId,
            {
              type: 'income',
              category: 'other',
              amount: 500000,
              method: 'cash',
              description: `ronda ${i}`,
            },
            tx,
          ),
        ),
        withTenantContext(tenant.id, (tx) =>
          closeDailyRegister(tenant.id, date, staffId, {}, 0, tx),
        ),
      ])

      const close = await withTenantContext(tenant.id, (tx) => getDailyClose(tenant.id, date, tx))
      const flowCount = await countCashFlows(tenant.id, date)

      if (cashFlowResult.status === 'fulfilled') {
        // El alta ganó (o corrió sin pisarse con el cierre): si HAY un cierre
        // para este día, tiene que incluir el monto del movimiento — nunca un
        // cierre en $0 con un movimiento real flotando afuera.
        expect(flowCount, `round ${i}: el movimiento existe`).toBe(1)
        if (close) {
          expect(close.totalIncome, `round ${i}: el cierre incluye el alta`).toBe(500000)
        }
      } else {
        // El alta perdió la carrera contra un cierre que ya había commiteado:
        // debe rechazarse explícitamente, nunca fallar en silencio ni colarse.
        expect(cashFlowResult.reason, `round ${i}`).toBeInstanceOf(DayAlreadyClosedError)
        expect(flowCount, `round ${i}: el alta rechazada no dejó fila`).toBe(0)
      }

      // El cierre en sí siempre debe terminar en un estado consistente: si
      // corrió, su total refleja exactamente lo que había commiteado cuando
      // tomó el lock (0 o el monto del alta, nunca un valor a medias).
      if (closeResult.status === 'fulfilled') {
        expect([0, 500000]).toContain(closeResult.value.totalIncome)
      }
    }
  }, 60_000)
})
