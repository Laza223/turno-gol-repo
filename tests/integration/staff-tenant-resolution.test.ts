import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * AUD-01 — reproducción. El complejo activo de una sesión de staff se resuelve
 * por DOS fuentes que nadie compara: el claim `app_metadata.tenant_id` del JWT
 * (lo que el staff eligió en /select-tenant) y `getStaffTenant`, que devuelve la
 * membresía ACTIVA MÁS ANTIGUA ignorando el claim.
 *
 * El escenario usa TRES complejos y mueve el claim entre los tres a propósito.
 * Con dos alcanzaba para el rojo, pero no distinguía "honrar el claim" de
 * "devolver el más nuevo": dar vuelta el ORDER BY sin tocar el claim dejaba la
 * suite entera en verde sin arreglar nada.
 *
 * DB real: getStaffTenant y getStaffRole leen tenant_staff_members de verdad.
 * Solo se mockea el boundary de auth y el redirect de Next, igual que
 * staff-guards.test.ts.
 */
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { requireAdminStaff, requireOperatorStaff } from '@/modules/staff/guards'
import { GET as oauthStart } from '@/app/api/mp/oauth-start/route'
import { GET as mpCallback } from '@/app/api/mp/callback/route'
import { getStaffTenant } from '@/modules/tenants/tenant.service'

/** Sesión de staff con el claim tenant_id apuntando a `claimTenantId`. */
function sesionStaff(claimTenantId: string, staffUserId: string) {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'staff@test.local',
    staffUserId,
    tenantId: claimTenantId,
    role: 'admin',
  })
}

/**
 * Staff admin activo en tres complejos, vinculados en ese orden.
 * Las fechas se fijan a mano: `defaultNow()` es el reloj de la transacción y el
 * ORDER BY de getStaffTenant no tiene desempate por id.
 */
async function staffEnTresComplejos() {
  const sql = getSql()
  const viejo = await createTestTenant(sql)
  const medio = await createTestTenant(sql)
  const nuevo = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  const antiguedad: [{ id: string }, string][] = [
    [viejo, '30 days'],
    [medio, '15 days'],
    [nuevo, '1 day'],
  ]
  for (const [complejo, hace] of antiguedad) {
    await linkStaffToTenant(sql, complejo.id, staff.id, 'admin')
    await sql`
      UPDATE tenant_staff_members
      SET created_at = now() - ${hace}::interval
      WHERE staff_user_id = ${staff.id} AND tenant_id = ${complejo.id}
    `
  }
  return { viejo, medio, nuevo, staff }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await ensureRoles()
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('AUD-01 · el complejo que abre el panel es el que el staff eligió', () => {
  it('requireAdminStaff abre el complejo del claim cuando es el del medio', async () => {
    const { medio, staff } = await staffEnTresComplejos()
    sesionStaff(medio.id, staff.id)

    const resultado = await requireAdminStaff()

    expect(resultado.tenant.id).toBe(medio.id)
  })

  it('requireAdminStaff abre el complejo del claim cuando es el más nuevo', async () => {
    const { nuevo, staff } = await staffEnTresComplejos()
    sesionStaff(nuevo.id, staff.id)

    const resultado = await requireAdminStaff()

    expect(resultado.tenant.id).toBe(nuevo.id)
  })

  it('requireAdminStaff abre el complejo del claim cuando es el más viejo', async () => {
    // Verde hoy por casualidad: el claim coincide con la membresía más antigua.
    // Está para que dar vuelta el ORDER BY no cuente como arreglo.
    const { viejo, staff } = await staffEnTresComplejos()
    sesionStaff(viejo.id, staff.id)

    const resultado = await requireAdminStaff()

    expect(resultado.tenant.id).toBe(viejo.id)
  })

  it('requireOperatorStaff abre el complejo del claim, no la membresía más antigua', async () => {
    const { medio, staff } = await staffEnTresComplejos()
    sesionStaff(medio.id, staff.id)

    const resultado = await requireOperatorStaff()

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.tenant.id).toBe(medio.id)
  })

  it('con un solo complejo sigue entrando igual (regresión)', async () => {
    const sql = getSql()
    const unico = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, unico.id, staff.id, 'admin')
    sesionStaff(unico.id, staff.id)

    const resultado = await requireAdminStaff()

    expect(resultado.tenant.id).toBe(unico.id)
  })

  it('un claim hacia un complejo SIN membresía activa nunca abre ese complejo', async () => {
    const sql = getSql()
    const propio = await createTestTenant(sql)
    const ajeno = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, propio.id, staff.id, 'admin')
    sesionStaff(ajeno.id, staff.id)

    // El arreglo no puede ser "honrar el claim y listo": nadie revalida el claim
    // al escribirlo, y (admin)/layout.tsx pinta nombre y estado del complejo que
    // devuelve getStaffTenant sin mirar el rol. Honrarlo a ciegas mostraría el
    // complejo ajeno en el header. Rebotar es aceptable; abrirlo no.
    const abierto = await requireAdminStaff().then(
      (r) => r.tenant.id,
      () => null,
    )
    expect(abierto).not.toBe(ajeno.id)
  })
})

describe('AUD-01 · consecuencia de plata: conectar MercadoPago', () => {
  /**
   * `oauth-start` firma el `state` con getStaffTenant (membresía más antigua) y
   * `callback` exige que el claim del JWT sea igual a ese tenant. Para un staff
   * multi-complejo que eligió otro, la igualdad es falsa y el flujo muere en un
   * redirect mudo a /login, antes de canjear el code.
   */
  function stubEntorno() {
    vi.stubEnv('MP_CLIENT_ID', 'client-de-prueba')
    vi.stubEnv('MP_CLIENT_SECRET', 'secreto-de-prueba')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    // El canje del code no es parte de lo que se mide: se corta acá para que la
    // prueba no salga a la red. Llegar a ese punto ya significa que el guard de
    // identidad dejó pasar.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'stub' }),
    )
  }

  /** Corre oauth-start y devuelve el `state` firmado que emitió. */
  async function stateDeOauthStart(): Promise<string> {
    const res = await oauthStart(new NextRequest('http://localhost:3000/api/mp/oauth-start'))
    const destino = new URL(res.headers.get('location') ?? '')
    const state = destino.searchParams.get('state')
    expect(state, `oauth-start no emitió state, redirigió a ${destino.href}`).toBeTruthy()
    return state as string
  }

  async function destinoDelCallback(state: string): Promise<URL> {
    const res = await mpCallback(
      new NextRequest(
        `http://localhost:3000/api/mp/callback?code=code-de-prueba&state=${encodeURIComponent(state)}`,
      ),
    )
    return new URL(res.headers.get('location') ?? '')
  }

  it('el staff multi-complejo puede completar el OAuth del complejo que eligió', async () => {
    stubEntorno()
    const { medio, staff } = await staffEnTresComplejos()
    sesionStaff(medio.id, staff.id)

    const destino = await destinoDelCallback(await stateDeOauthStart())

    expect(destino.pathname).not.toBe('/login')
    expect(destino.searchParams.get('error')).toBe('mp_token_failed')
  })

  it('control: con un solo complejo el OAuth pasa el guard de identidad', async () => {
    stubEntorno()
    const sql = getSql()
    const unico = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, unico.id, staff.id, 'admin')
    sesionStaff(unico.id, staff.id)

    const destino = await destinoDelCallback(await stateDeOauthStart())

    expect(destino.pathname).not.toBe('/login')
    expect(destino.searchParams.get('error')).toBe('mp_token_failed')
  })
})

describe('AUD-01 · el resolvedor mismo, sin pasar por ningún guard', () => {
  /**
   * Estos casos llaman a getStaffTenant directo. Los de arriba pasan por
   * requireAdminStaff, que después de resolver el complejo chequea el rol y
   * rebota — así que un resolvedor que honrara el claim a ciegas quedaba
   * tapado por ese segundo chequeo y la suite seguía en verde. Acá no hay red.
   */
  it('un claim hacia un complejo sin membresía no lo devuelve', async () => {
    const sql = getSql()
    const propio = await createTestTenant(sql)
    const ajeno = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, propio.id, staff.id, 'admin')

    const resuelto = await getStaffTenant(staff.id, ajeno.id)

    expect(resuelto?.id).toBe(propio.id)
  })

  it('un claim hacia un complejo con la membresía dada de baja no lo devuelve', async () => {
    const sql = getSql()
    const activo = await createTestTenant(sql)
    const dadoDeBaja = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, activo.id, staff.id, 'admin')
    await linkStaffToTenant(sql, dadoDeBaja.id, staff.id, 'admin')
    await sql`
      UPDATE tenant_staff_members SET is_active = false
      WHERE staff_user_id = ${staff.id} AND tenant_id = ${dadoDeBaja.id}
    `

    const resuelto = await getStaffTenant(staff.id, dadoDeBaja.id)

    expect(resuelto?.id).toBe(activo.id)
  })

  it('sin claim cae a la membresía activa más antigua', async () => {
    // El único caso que ejercita el fallback puro con más de un candidato:
    // es el que impide que dar vuelta el ORDER BY pase por arreglo.
    const { viejo, staff } = await staffEnTresComplejos()

    const resuelto = await getStaffTenant(staff.id, null)

    expect(resuelto?.id).toBe(viejo.id)
  })

  it('con un claim que no le corresponde a ninguna membresía, cae a la más antigua', async () => {
    const { viejo, staff } = await staffEnTresComplejos()
    const ajeno = await createTestTenant(getSql())

    const resuelto = await getStaffTenant(staff.id, ajeno.id)

    expect(resuelto?.id).toBe(viejo.id)
  })
})
