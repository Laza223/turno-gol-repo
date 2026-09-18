import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCourt, getCourtCountAndBilled, toggleStatus } from '@/modules/courts/court.service'
import type { CourtPricingData } from '@/modules/courts/court.types'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId, insertSubscription } from '../helpers/factories'

const DEFAULT_PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      price: 800000,
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      price: 1200000,
    },
    {
      days: ['fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1500000,
    },
  ],
}

const COURT_INPUT = {
  name: 'Cancha Test',
  surfaceType: 'synthetic_grass' as const,
  format: 5 as const, // Fútbol 5 → capacity derivado = 10
  pricing: DEFAULT_PRICING,
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('createCourt', () => {
  it('inserts court with status online', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const court = await withTenantContext(tenant.id, (tx) =>
      createCourt(tenant.id, COURT_INPUT, tx),
    )

    expect(court.id).toBeTruthy()
    expect(court.tenantId).toBe(tenant.id)
    expect(court.status).toBe('online')
    expect(court.name).toBe('Cancha Test')
    expect(court.surfaceType).toBe('synthetic_grass')
    expect(court.format).toBe(5)
    expect(court.capacity).toBe(10) // derivado = format × 2
    // Cambio #16: atributos por cancha con sus defaults (techada=false, luz=true).
    expect(court.isCovered).toBe(false)
    expect(court.hasLighting).toBe(true)
  })

  it('persiste is_covered/has_lighting cuando se pasan explícitos (cambio #16)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const court = await withTenantContext(tenant.id, (tx) =>
      createCourt(tenant.id, { ...COURT_INPUT, isCovered: true, hasLighting: false }, tx),
    )

    expect(court.isCovered).toBe(true)
    expect(court.hasLighting).toBe(false)

    // Durable en la fila, no solo en el objeto retornado.
    const rows = await sql<{ is_covered: boolean; has_lighting: boolean }[]>`
      SELECT is_covered, has_lighting FROM courts WHERE id = ${court.id}
    `
    expect(rows[0]).toEqual({ is_covered: true, has_lighting: false })
  })
})
describe('canchas prendidas vs. canchas facturadas', () => {
  // Reemplaza al bloque "plan limit enforcement". El techo de canchas por plan
  // desapareció con el precio lineal (decisión 2026-09-17, P3): agregar una
  // cancha ya no se bloquea, cuesta $30.000 más por mes. Lo que /canchas
  // necesita saber ahora es cuántas hay PRENDIDAS y por cuántas se factura,
  // para avisar antes de mover plata.
  //
  // La lógica de la función está cubierta con mocks en
  // `tests/unit/court-count-and-billed.test.ts`. Acá se ejercita contra la DB
  // real, que es lo que el mock no puede probar: que el SQL cuente lo que dice
  // contar y que `billed_courts` salga de la columna y no de un plan.

  it('el techo se fue del catálogo: la fila de precio activa tiene max_courts NULL', async () => {
    // Control de premisa de todo este bloque. Si alguien revive un max_courts
    // finito en la fila activa, los tests de abajo siguen verdes (ya no lo
    // miran) y el gate volvería por la ventana sin que nadie lo note.
    const sql = getSql()
    const rows = await sql<{ max_courts: number | null }[]>`
      SELECT max_courts FROM plans WHERE is_active = true ORDER BY sort_order
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.max_courts).toBeNull()
  })

  it('en TRIAL se pueden cargar más canchas de las que se factura, sin bloqueo', async () => {
    // Regresión del muro de onboarding, con el motivo nuevo: el trial nace
    // facturando 1 cancha (`createTenantWithTrial`) y el complejo carga las 3
    // que tiene en el paso 3 del wizard. Antes eso chocaba contra el techo del
    // plan `predio` y dejaba al complejo sin salida in-app.
    const sql = getSql()
    const tenant = await createTestTenant(sql) // status default = 'trialing'
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId, billedCourts: 1 })

    for (let i = 1; i <= 3; i++) {
      await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
    }

    const result = await withTenantContext(tenant.id, (tx) => getCourtCountAndBilled(tenant.id, tx))

    expect(result).toEqual({ onlineCourts: 3, billedCourts: 1, isTrialing: true })
  })

  it('ya suscripto (active), billedCourts es lo que dice la columna, no lo que hay prendido', async () => {
    // El caso que motiva la función: 4 prendidas y el cobro vigente por 2.
    // Prender la quinta tiene que avisar que la cuota sube, no bloquear.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, {
      tenantId: tenant.id,
      planId,
      status: 'active',
      billedCourts: 2,
    })
    await sql`UPDATE tenants SET status = 'active' WHERE id = ${tenant.id}`

    for (let i = 1; i <= 4; i++) {
      await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
    }

    const result = await withTenantContext(tenant.id, (tx) => getCourtCountAndBilled(tenant.id, tx))

    expect(result).toEqual({ onlineCourts: 4, billedCourts: 2, isTrialing: false })
  })

  it('una cancha apagada deja de contar como prendida (mismo criterio que el piso de facturación)', async () => {
    // Lo que el unit test no puede probar: que el `status = online` del WHERE
    // se corresponda con lo que `toggleStatus` efectivamente escribe. Si los
    // dos criterios se separan, apagar una cancha bajaría el aviso de /canchas
    // sin bajar el piso de `countOnlineCourts` (billing.service) y el complejo
    // queda atrapado entre dos números que no coinciden.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, {
      tenantId: tenant.id,
      planId,
      status: 'active',
      billedCourts: 3,
    })

    const ids: string[] = []
    for (let i = 1; i <= 3; i++) {
      const court = await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
      ids.push(court.id)
    }

    await withTenantContext(tenant.id, (tx) => toggleStatus(ids[0]!, tenant.id, 'offline', tx))

    const result = await withTenantContext(tenant.id, (tx) => getCourtCountAndBilled(tenant.id, tx))

    expect(result.onlineCourts).toBe(2)
    // Apagar NO baja la cuota sola: bajarla es una acción deliberada del dueño
    // en Facturación (decisión 2026-09-17, P3).
    expect(result.billedCourts).toBe(3)
  })

  it('sin suscripción → billedCourts null (no hay cobro que mover, la cancha pasa sin ruido)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await withTenantContext(tenant.id, (tx) => createCourt(tenant.id, COURT_INPUT, tx))

    const result = await withTenantContext(tenant.id, (tx) => getCourtCountAndBilled(tenant.id, tx))

    expect(result).toEqual({ onlineCourts: 1, billedCourts: null, isTrialing: false })
  })
})
