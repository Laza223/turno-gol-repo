import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Test crypto key — must be set before any module imports encrypt().
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.MP_CLIENT_ID = 'test-client'
process.env.MP_CLIENT_SECRET = 'test-secret'

import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { encrypt } from '@/lib/crypto/encrypt'
import { refreshTenantMpToken } from '@/modules/payments/mp-oauth'
import { markMpDisconnected } from '@/modules/payments/mp-connection.service'
import { MpGatewayError, MpGrantRevokedError } from '@/modules/payments/payment.errors'
import { connectMercadoPago, disconnectMercadoPago } from '@/modules/tenants/tenant.service'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { runRefreshMpTokens } from '@/shared/jobs/workers/refresh-mp-tokens.worker'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * La marca `tenants.mp_disconnected_at` contra Postgres real.
 *
 * Lo que solo se ve con la base: el compare-and-set (marca una vez, no marca
 * si otro refresh ya rotó el token), el audit en la misma tx, y que todos los
 * caminos que prueban que el permiso está vivo (refresh, reconexión,
 * "Desconectar") limpian la marca. Spec:
 * `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.
 */

type Respuesta = { status: number; body: unknown }
let respuestaMp: Respuesta
const realFetch = global.fetch

function installFetchMock(): void {
  global.fetch = vi.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('mercadopago.com/oauth/token')) {
      return new Response(JSON.stringify(respuestaMp.body), {
        status: respuestaMp.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return realFetch(url as Parameters<typeof realFetch>[0])
  }) as typeof fetch
}

const REVOCADO: Respuesta = {
  status: 400,
  body: { error: 'invalid_grant', message: 'invalid_grant', status: 400 },
}
const RENOVADO: Respuesta = {
  status: 200,
  body: {
    access_token: 'fresh-access',
    refresh_token: 'fresh-refresh',
    user_id: 4242,
    public_key: 'PK',
    expires_in: 15552000,
  },
}

async function seedConnectedTenant(
  mpUserId = '4242',
  refreshPlano = 'initial-refresh',
): Promise<{ id: string; slug: string; refreshCifrado: string }> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const refreshCifrado = encrypt(refreshPlano)
  await sql`
    UPDATE tenants
    SET mp_access_token = ${encrypt('initial-access')},
        mp_refresh_token = ${refreshCifrado},
        mp_user_id = ${mpUserId},
        mp_connected_at = NOW()
    WHERE id = ${tenant.id}
  `
  return { id: tenant.id, slug: tenant.slug, refreshCifrado }
}

/** El instante de la marca como texto (el `getSql()` crudo no parsea timestamptz), o null. */
async function disconnectedAt(tenantId: string): Promise<string | null> {
  const rows = await getSql()<{ at: string | null }[]>`
    SELECT mp_disconnected_at::text AS at FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!.at
}

async function auditRows(tenantId: string) {
  return getSql()<{ actor_type: string; metadata: Record<string, unknown> }[]>`
    SELECT actor_type, metadata FROM audit_logs
    WHERE tenant_id = ${tenantId} AND action = 'tenant.mp_disconnected_detected'
  `
}

async function markDirectly(tenantId: string): Promise<void> {
  await getSql()`UPDATE tenants SET mp_disconnected_at = NOW() WHERE id = ${tenantId}`
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(async () => {
  await cleanupAll(getSql())
  respuestaMp = REVOCADO
  installFetchMock()
})

afterAll(async () => {
  global.fetch = realFetch
  await closeSql()
})

describe('marca de MercadoPago desconectado', () => {
  it('un refresh revocado marca una sola vez, con audit, y propaga el error', async () => {
    const { id, refreshCifrado } = await seedConnectedTenant()

    await expect(refreshTenantMpToken(id)).rejects.toBeInstanceOf(MpGrantRevokedError)
    const primera = await disconnectedAt(id)
    expect(primera).not.toBeNull()

    // Segunda detección (otro 401, el cron): ni re-marca ni vuelve a auditar.
    await expect(refreshTenantMpToken(id, 'cron')).rejects.toBeInstanceOf(MpGrantRevokedError)
    expect(await disconnectedAt(id)).toBe(primera)

    const audits = await auditRows(id)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.actor_type).toBe('system')
    expect(audits[0]!.metadata).toEqual({
      detected_by: 'refresh_on_401',
      mp_error: 'invalid_grant',
    })
    // Nunca tokens en el audit.
    const metadata = JSON.stringify(audits[0]!.metadata)
    expect(metadata).not.toContain(refreshCifrado)
    expect(metadata).not.toContain('initial-')
  })

  it('los tokens NO se borran: la marca es reversible', async () => {
    const { id, refreshCifrado } = await seedConnectedTenant()

    await expect(refreshTenantMpToken(id)).rejects.toBeInstanceOf(MpGrantRevokedError)

    const rows = await getSql()<{ mp_refresh_token: string | null; mp_user_id: string | null }[]>`
      SELECT mp_refresh_token, mp_user_id FROM tenants WHERE id = ${id}
    `
    expect(rows[0]!.mp_refresh_token).toBe(refreshCifrado)
    expect(rows[0]!.mp_user_id).toBe('4242')
  })

  it('si otro refresh ya rotó el token, el rechazo del viejo no marca', async () => {
    const { id, refreshCifrado } = await seedConnectedTenant()
    // Otro proceso ganó la carrera y persistió un par nuevo.
    await getSql()`UPDATE tenants SET mp_refresh_token = ${encrypt('rotado')} WHERE id = ${id}`

    const marcado = await markMpDisconnected({
      tenantId: id,
      usedRefreshToken: refreshCifrado,
      detectedBy: 'refresh_on_401',
      mpError: 'invalid_grant',
    })

    expect(marcado).toBe(false)
    expect(await disconnectedAt(id)).toBeNull()
    expect(await auditRows(id)).toHaveLength(0)
  })

  it('un error que no es de revocación no marca', async () => {
    const { id } = await seedConnectedTenant()
    respuestaMp = { status: 400, body: { error: 'invalid_client' } }

    const err = await refreshTenantMpToken(id).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(MpGatewayError)
    expect(err).not.toBeInstanceOf(MpGrantRevokedError)
    expect(await disconnectedAt(id)).toBeNull()
  })

  it('un refresh que anda limpia la marca', async () => {
    const { id } = await seedConnectedTenant()
    await markDirectly(id)
    respuestaMp = RENOVADO

    await refreshTenantMpToken(id)

    expect(await disconnectedAt(id)).toBeNull()
  })

  it('reconectar por OAuth limpia la marca', async () => {
    const { id } = await seedConnectedTenant()
    await markDirectly(id)

    await connectMercadoPago(id, {
      mpAccessToken: encrypt('new-access'),
      mpRefreshToken: encrypt('new-refresh'),
      mpUserId: '4242',
      mpPublicKey: 'PK',
    })

    expect(await disconnectedAt(id)).toBeNull()
  })

  it('"Desconectar" limpia la marca junto con los tokens', async () => {
    const { id } = await seedConnectedTenant()
    await markDirectly(id)

    await withTenantContext(id, (tx) => disconnectMercadoPago(id, tx))

    expect(await disconnectedAt(id)).toBeNull()
  })

  it('el cron marca al complejo revocado (detected_by=cron) sin frenar a los demás', async () => {
    // Una cuenta de MP cobra para un solo complejo (uq_tenants_mp_user_id).
    const revocado = await seedConnectedTenant('4242', 'initial-refresh-revocado')
    const sano = await seedConnectedTenant('5151')

    // MP responde según qué refresh token le llega: el del revocado muere.
    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('mercadopago.com/oauth/token')) {
        const body = JSON.parse(String(init?.body)) as { refresh_token: string }
        const esElRevocado = body.refresh_token === 'initial-refresh-revocado'
        const r: Respuesta = esElRevocado
          ? REVOCADO
          : { status: 200, body: { ...(RENOVADO.body as object), user_id: 5151 } }
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return realFetch(url as Parameters<typeof realFetch>[0])
    }) as typeof fetch

    await runRefreshMpTokens()

    expect(await disconnectedAt(revocado.id)).not.toBeNull()
    expect(await disconnectedAt(sano.id)).toBeNull()
    const audits = await auditRows(revocado.id)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.metadata).toEqual({ detected_by: 'cron', mp_error: 'invalid_grant' })
  })

  it('un invalid_grant de casi todo el barrido es configuración, no revocación: no marca a nadie', async () => {
    // P. ej. MP_CLIENT_ID repuntado: el refresh token está atado a la app vieja
    // y falla para todos, pero ningún dueño revocó y los access tokens cobran.
    const ids: string[] = []
    for (const cuenta of ['4242', '5151', '6161']) ids.push((await seedConnectedTenant(cuenta)).id)

    await runRefreshMpTokens()

    for (const id of ids) {
      expect(await disconnectedAt(id)).toBeNull()
      expect(await auditRows(id)).toHaveLength(0)
    }
  })

  it('los ya marcados no cuentan para el freno: un revocado nuevo igual se marca', async () => {
    // Tres marcados que nunca reconectaron dan invalid_grant en cada tick. Si
    // contaran, 4 de 5 revocados dispararían el freno y el nuevo no se marcaría.
    const marcados: string[] = []
    for (const cuenta of ['1111', '2222', '3333']) {
      const { id } = await seedConnectedTenant(cuenta, `refresh-marcado-${cuenta}`)
      await markDirectly(id)
      marcados.push(id)
    }
    const nuevo = await seedConnectedTenant('4242', 'refresh-nuevo-revocado')
    const sano = await seedConnectedTenant('5151', 'refresh-sano')

    global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('mercadopago.com/oauth/token')) {
        const body = JSON.parse(String(init?.body)) as { refresh_token: string }
        const r: Respuesta =
          body.refresh_token === 'refresh-sano'
            ? { status: 200, body: { ...(RENOVADO.body as object), user_id: 5151 } }
            : REVOCADO
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return realFetch(url as Parameters<typeof realFetch>[0])
    }) as typeof fetch

    await runRefreshMpTokens()

    expect(await disconnectedAt(nuevo.id)).not.toBeNull()
    expect(await auditRows(nuevo.id)).toHaveLength(1)
    expect(await disconnectedAt(sano.id)).toBeNull()
    for (const id of marcados) {
      expect(await disconnectedAt(id)).not.toBeNull()
      // Ya estaban marcados: no se vuelven a auditar.
      expect(await auditRows(id)).toHaveLength(0)
    }
  })

  it('el portal deja de anunciar la seña mientras dura la marca', async () => {
    const { id, slug } = await seedConnectedTenant()
    await getSql()`
      UPDATE tenants
      SET settings = settings || ${getSql().json({ requires_deposit: true, deposit_percentage: 30 })}
      WHERE id = ${id}
    `
    expect((await getPublicTenant(slug))!.requiresDeposit).toBe(true)

    await markDirectly(id)

    expect((await getPublicTenant(slug))!.requiresDeposit).toBe(false)
  })
})
