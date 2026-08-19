import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { disconnectMercadoPago } from '@/modules/tenants/tenant.service'

/**
 * Desconectar MercadoPago es un `UPDATE ... FROM tenants AS previo` que en el
 * MISMO statement limpia las credenciales y devuelve el `mp_user_id` que había
 * (lo necesita el audit log; `TenantRow` no expone esa columna). Ese self-join
 * depende de que Postgres le sirva al `FROM` el snapshot previo al UPDATE — es
 * correcto, pero es justo la clase de cosa que un mock no prueba: contra la DB
 * real o devuelve el valor viejo o no.
 */
describe('disconnectMercadoPago', () => {
  let tenantId: string

  beforeAll(async () => {
    await ensureRoles()
    const tenant = await createTestTenant(undefined, { name: 'Complejo Desconexion MP' })
    tenantId = tenant.id
    const sql = getSql()
    await sql`
      UPDATE tenants
      SET mp_access_token = 'cifrado-falso',
          mp_refresh_token = 'refresh-falso',
          mp_user_id = '1059888348',
          mp_public_key = 'APP_USR-public',
          mp_nickname = 'COMPLEJOTEST',
          mp_connected_at = NOW(),
          settings = settings || '{"requires_deposit": true, "deposit_percentage": 50}'::jsonb
      WHERE id = ${tenantId}
    `
  })

  afterAll(async () => {
    await cleanupAll()
    await closeSql()
  })

  it('limpia las credenciales, apaga la seña y devuelve el mp_user_id previo', async () => {
    const resultado = await withTenantContext(tenantId, (tx) => disconnectMercadoPago(tenantId, tx))

    // El valor VIEJO, no null: es lo que hace auditable a qué cuenta se estaba
    // cobrando. Si el self-join viera la fila ya actualizada, esto sería null.
    expect(resultado.mpUserId).toBe('1059888348')

    const sql = getSql()
    const [fila] = await sql<
      Array<{
        mp_access_token: string | null
        mp_refresh_token: string | null
        mp_user_id: string | null
        mp_public_key: string | null
        mp_nickname: string | null
        mp_connected_at: Date | null
        requires_deposit: boolean
        deposit_percentage: number
      }>
    >`
      SELECT mp_access_token, mp_refresh_token, mp_user_id, mp_public_key,
             mp_nickname, mp_connected_at,
             (settings->>'requires_deposit')::boolean AS requires_deposit,
             (settings->>'deposit_percentage')::int AS deposit_percentage
      FROM tenants WHERE id = ${tenantId}
    `

    expect(fila!.mp_access_token).toBeNull()
    expect(fila!.mp_refresh_token).toBeNull()
    expect(fila!.mp_user_id).toBeNull()
    expect(fila!.mp_public_key).toBeNull()
    expect(fila!.mp_nickname).toBeNull()
    expect(fila!.mp_connected_at).toBeNull()

    // Apagar la seña es parte del mismo statement a propósito: exigir seña sin
    // MercadoPago conectado deja al jugador colgado en el checkout (F-003 del
    // QA de producción 2026-08-17), y el guard de updateReservasPolicyAction
    // impide ENTRAR a ese estado — desconectar sin apagarla lo reconstruiría
    // por la puerta de atrás.
    expect(fila!.requires_deposit).toBe(false)

    // El PORCENTAJE se conserva: es la preferencia del complejo y sirve tal
    // cual cuando vuelva a conectar.
    expect(fila!.deposit_percentage).toBe(50)
  })
})
