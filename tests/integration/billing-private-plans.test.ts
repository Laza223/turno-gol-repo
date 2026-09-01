/**
 * Planes privados (migr. 083) contra Postgres de verdad.
 *
 * El gemelo unit (`tests/unit/billing-private-plans-scoping.test.ts`) mira el
 * SQL que se emite y atrapa el filtro borrado en el commit que lo borra, sin
 * necesitar Docker. Este mira el RESULTADO: que un complejo ajeno reciba cero
 * filas de verdad, con RLS y el rol real de por medio.
 *
 * Hace falta que sean dos porque `plans` es una tabla GLOBAL y **sin RLS**: el
 * filtro de la consulta es la única barrera. No hay policy que ataje un plan
 * privado que se escape al catálogo de otro complejo, ni que impida contratarlo
 * pasando su id a mano.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { listActivePlans } from '@/modules/billing/billing.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * Las filas de `plans` se siembran en la migr. 007 y `cleanupAll` NO las toca
 * (la 083 deliberadamente no puso FK a `tenants`, justamente para que el
 * `TRUNCATE tenants CASCADE` del harness no se las lleve puestas). O sea que un
 * plan insertado acá sobrevive entre tests: se limpia a mano por slug.
 */
const SLUG_PRIVADO = 'test-plan-privado-083'

async function insertarPlanPrivado(ownerTenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO plans (slug, name, max_courts, price_monthly, price_annual, sort_order, owner_tenant_id)
    VALUES (${SLUG_PRIVADO}, 'Plan privado de prueba', 3, 10000, 96000, 99, ${ownerTenantId})
    RETURNING id
  `
  return rows[0]!.id
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(async () => {
  const sql = getSql()
  await sql`DELETE FROM plans WHERE slug = ${SLUG_PRIVADO}`
  await sql`TRUNCATE TABLE tenant_subscriptions, tenant_staff_members, courts, tenants, staff_users RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await closeSql()
})

describe('planes privados — catálogo por complejo', () => {
  it('el dueño ve su plan privado; un complejo ajeno NO', async () => {
    const dueno = await createTestTenant()
    const ajeno = await createTestTenant()
    const planId = await insertarPlanPrivado(dueno.id)

    const delDueno = await withTenantContext(dueno.id, (tx) => listActivePlans(dueno.id, tx))
    const delAjeno = await withTenantContext(ajeno.id, (tx) => listActivePlans(ajeno.id, tx))

    expect(delDueno.map((p) => p.id)).toContain(planId)
    expect(delAjeno.map((p) => p.id)).not.toContain(planId)
  })

  it('los planes públicos los siguen viendo los dos', async () => {
    // El riesgo del cambio no es sólo filtrar de menos: filtrar de MÁS dejaría
    // a todo complejo nuevo sin catálogo, que es una falla peor y más ruidosa.
    const dueno = await createTestTenant()
    const ajeno = await createTestTenant()
    await insertarPlanPrivado(dueno.id)

    const delDueno = await withTenantContext(dueno.id, (tx) => listActivePlans(dueno.id, tx))
    const delAjeno = await withTenantContext(ajeno.id, (tx) => listActivePlans(ajeno.id, tx))

    const publicos = (lista: { slug: string }[]) =>
      lista.filter((p) => p.slug !== SLUG_PRIVADO).map((p) => p.slug)

    // Los tres planes reales de la migr. 007.
    expect(publicos(delDueno)).toEqual(expect.arrayContaining(['predio', 'complejo', 'estadio']))
    expect(publicos(delAjeno)).toEqual(expect.arrayContaining(['predio', 'complejo', 'estadio']))
  })

  it('un plan privado APAGADO no lo ve ni su dueño', async () => {
    // `is_active` y `owner_tenant_id` son dos conceptos separados: el primero
    // sigue siendo el interruptor de encendido y esta columna no lo reemplaza.
    const dueno = await createTestTenant()
    const planId = await insertarPlanPrivado(dueno.id)
    const sql = getSql()
    await sql`UPDATE plans SET is_active = false WHERE id = ${planId}`

    const delDueno = await withTenantContext(dueno.id, (tx) => listActivePlans(dueno.id, tx))

    expect(delDueno.map((p) => p.id)).not.toContain(planId)
  })
})
