import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCourt, getCourtCountAndLimit } from '@/modules/courts/court.service'
import type { CourtPricingData } from '@/modules/courts/court.types'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
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
      createCourt(
        tenant.id,
        { ...COURT_INPUT, isCovered: true, hasLighting: false },
        tx,
      ),
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

describe('plan limit enforcement', () => {
  it('en TRIAL el plan predio NO impone techo (el complejo puede cargar 3+ canchas)', async () => {
    // Regresión del muro de onboarding: createTenantWithTrial arranca a TODOS en
    // `predio` (max_courts=2), así que sin esta excepción un complejo con 3+
    // canchas se traba en el paso 3 del wizard — y como el upgrade self-service
    // está cerrado (501), queda sin salida in-app. Con registro público eso se
    // lleva puesto a la mayoría de los complejos, que tienen más de 2 canchas.
    const sql = getSql()
    const tenant = await createTestTenant(sql) // status default = 'trialing'
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId })

    for (let i = 1; i <= 3; i++) {
      await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
    }

    const { count, maxCourts } = await withTenantContext(tenant.id, (tx) =>
      getCourtCountAndLimit(tenant.id, tx),
    )

    expect(count).toBe(3)
    expect(maxCourts).toBeNull()
  })

  it('ya suscripto (active), el plan predio SÍ impone su techo', async () => {
    // Control positivo del test de arriba: el techo no desapareció, sólo no
    // aplica durante el trial. Si esto se pone verde con maxCourts null, la
    // excepción del trial se comió el límite para todos.
    //
    // El techo se LEE del plan en vez de hardcodearse: `getOrCreatePlanId`
    // devuelve el `predio` real de las migraciones, así que el número cambia
    // cada vez que se ajustan los planes (era 2, la migr. 071 lo puso en 3) y
    // el test se ponía rojo por un motivo que no es el que le importa. Lo que
    // este test tiene que probar es que el techo APLICA, no cuánto vale.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId })
    await sql`UPDATE tenants SET status = 'active' WHERE id = ${tenant.id}`

    const [plan] = await sql<{ max_courts: number | null }[]>`
      SELECT max_courts FROM plans WHERE id = ${planId}
    `
    const techo = plan!.max_courts
    expect(techo, 'el plan del fixture debe tener techo finito para que este control sirva').not.toBeNull()

    for (let i = 1; i <= techo!; i++) {
      await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
    }

    const { count, maxCourts } = await withTenantContext(tenant.id, (tx) =>
      getCourtCountAndLimit(tenant.id, tx),
    )

    expect(count).toBe(techo)
    expect(maxCourts).toBe(techo)
    // la siguiente quedaría bloqueada (count >= maxCourts)
    expect(count >= maxCourts!).toBe(true)
  })

  it('no subscription → maxCourts is null (unlimited)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await withTenantContext(tenant.id, (tx) =>
      createCourt(tenant.id, COURT_INPUT, tx),
    )

    const { count, maxCourts } = await withTenantContext(tenant.id, (tx) =>
      getCourtCountAndLimit(tenant.id, tx),
    )

    expect(count).toBe(1)
    expect(maxCourts).toBeNull()
  })
})
