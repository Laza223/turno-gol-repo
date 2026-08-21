import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId } from '../helpers/factories'

/**
 * El portal público durante la baja voluntaria (doc4 §2: `canceled` = "acceso
 * jugador completo hasta fin período").
 *
 * Medido en producción el 2026-08-20: un complejo se dio de baja con
 * `current_period_end` a casi dos meses y su perfil público quedó en "no
 * disponible" en el acto — la reserva online, que es lo que había comprado,
 * muerta desde el minuto uno del período que ya había pagado. La causa era un
 * `Set` literal con `canceled` adentro, copiado en las cinco páginas de
 * `(public)/[slug]/*` y en la Server Action del checkout, decidiendo por
 * `tenants.status` sin mirar nunca `tenant_subscriptions.current_period_end`.
 *
 * Estos casos corren contra la DB real porque el dato que decide vive en
 * `tenant_subscriptions`, que está aislada por RLS: el bug no se reproduce con
 * el status a mano, hace falta que `getPublicTenant` sepa ir a buscar el
 * período dentro del contexto de tenant correcto.
 *
 * El tope de fecha (`bookingAdvanceDays` recortado) va acá y no en unit por lo
 * mismo: lo que se verifica es que el recorte SOBREVIVA el viaje por la query
 * real, que es donde se perdía.
 */

type SubStatus = 'active' | 'canceled'

async function seedTenant(opts: {
  tenantStatus: string
  subStatus: SubStatus
  periodEndSql: string
}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const planId = await getOrCreatePlanId(sql)
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end
    ) VALUES (
      ${tenant.id},
      ${planId},
      'monthly'::billing_cycle,
      ${sql.unsafe(`'${opts.subStatus}'::subscription_status`)},
      NOW() - INTERVAL '5 days',
      ${sql.unsafe(opts.periodEndSql)}
    )
  `
  await sql`
    UPDATE tenants SET status = ${sql.unsafe(`'${opts.tenantStatus}'::tenant_status`)}
    WHERE id = ${tenant.id}
  `
  return tenant
}

beforeAll(async () => {
  await ensureRoles()
  await cleanupAll()
}, 30_000)

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('portal público de un complejo dado de baja', () => {
  it('canceled con el período todavía corriendo: el portal sigue ABIERTO', async () => {
    const t = await seedTenant({
      tenantStatus: 'canceled',
      subStatus: 'canceled',
      periodEndSql: "NOW() + INTERVAL '59 days'",
    })

    const tenant = await getPublicTenant(t.slug)
    expect(tenant).not.toBeNull()
    expect(tenant!.status).toBe('canceled')
    // El caso de producción: dos meses pagos por delante.
    expect(tenant!.canceledPeriodEnd).not.toBeNull()
    expect(isPublicPortalOpen(tenant!.status, tenant!.canceledPeriodEnd)).toBe(true)
    // 59 días de período > 6 de anticipación: la ventana configurada no se toca.
    expect(tenant!.bookingAdvanceDays).toBe(6)
  }, 30_000)

  it('canceled a 2 días del corte: abierto, pero la anticipación se recorta a esos 2 días', async () => {
    const t = await seedTenant({
      tenantStatus: 'canceled',
      subStatus: 'canceled',
      periodEndSql: "NOW() + INTERVAL '2 days'",
    })

    const tenant = await getPublicTenant(t.slug)
    expect(isPublicPortalOpen(tenant!.status, tenant!.canceledPeriodEnd)).toBe(true)
    // Sin el recorte serían 6: se podrían vender 4 turnos posteriores al corte,
    // con la seña ya cobrada y el complejo `blocked` sin poder atenderlos.
    expect(tenant!.bookingAdvanceDays).toBe(2)
  }, 30_000)

  it('canceled con el período ya vencido: el portal está CERRADO aunque el sweep todavía no haya corrido', async () => {
    const t = await seedTenant({
      tenantStatus: 'canceled',
      subStatus: 'canceled',
      periodEndSql: "NOW() - INTERVAL '1 day'",
    })

    const tenant = await getPublicTenant(t.slug)
    expect(tenant!.canceledPeriodEnd).not.toBeNull()
    // El sweep `canceled → blocked` corre una vez por día (13:00 ART): entre el
    // vencimiento y el barrido el status sigue siendo `canceled`, y el gate NO
    // puede depender de que ya haya pasado.
    expect(isPublicPortalOpen(tenant!.status, tenant!.canceledPeriodEnd)).toBe(false)
  }, 30_000)

  it('blocked: cerrado (control negativo — la baja voluntaria no aflojó el bloqueo por mora)', async () => {
    const t = await seedTenant({
      tenantStatus: 'blocked',
      subStatus: 'canceled',
      periodEndSql: "NOW() + INTERVAL '59 days'",
    })

    const tenant = await getPublicTenant(t.slug)
    expect(isPublicPortalOpen(tenant!.status, tenant!.canceledPeriodEnd)).toBe(false)
  }, 30_000)

  it('active: abierto, ventana intacta y SIN pagar la query del período', async () => {
    const t = await seedTenant({
      tenantStatus: 'active',
      subStatus: 'active',
      periodEndSql: "NOW() + INTERVAL '20 days'",
    })

    const tenant = await getPublicTenant(t.slug)
    expect(isPublicPortalOpen(tenant!.status, tenant!.canceledPeriodEnd)).toBe(true)
    expect(tenant!.bookingAdvanceDays).toBe(6)
    // Contrato de `getPublicTenant`: el período solo se lee cuando el estado lo
    // pide. `null` acá es la prueba de que la visita pública normal no paga una
    // segunda transacción.
    expect(tenant!.canceledPeriodEnd).toBeNull()
  }, 30_000)
})
