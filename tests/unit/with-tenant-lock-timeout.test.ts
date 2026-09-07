/**
 * AUD-08 (mínima) de la auditoría integral del 2026-09-06.
 *
 * `billing.service.ts` habla con MercadoPago con el `FOR UPDATE` de la
 * suscripción ya tomado (hasta 8 s), y el rol web corta de esperar a los 3 s
 * (`lock_timeout`, migr. 055). Un doble click en "Activar plan" o dos pestañas
 * dejan a la segunda operación contra un `55P03`, que el wrapper devolvía como
 * 500 "Ocurrió un error inesperado" y además reportaba a Sentry.
 *
 * Acá se prueba el mapeo. Que el `55P03` REAL de Postgres llegue reconocible a
 * través del envoltorio de Drizzle lo prueba
 * `tests/integration/lock-timeout-mapping.test.ts` — un mock no puede.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  extractAuthUser: vi.fn(),
  getStaffRole: vi.fn(),
  withTenantContext: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: h.extractAuthUser,
  tagSession: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: h.getStaffRole }))
vi.mock('@/lib/sentry', () => ({ captureException: h.captureException }))
vi.mock('@/shared/db/client', () => ({
  // El wrapper consulta el estado del complejo antes de abrir la transacción.
  getSql: () => () => Promise.resolve([{ status: 'active' }]),
  withTenantContext: h.withTenantContext,
}))

import { withBillingTenant, withTenant } from '@/server/middleware/with-tenant'

/** La forma REAL: Drizzle 0.45 deja el `code` en `cause`, no arriba. */
function errorDeLockEnvuelto(): Error {
  const pg = Object.assign(new Error('canceling statement due to lock timeout'), {
    code: '55P03',
  })
  return Object.assign(new Error('Failed query'), { cause: pg })
}

function req(method = 'POST'): NextRequest {
  return new NextRequest('https://turnogol.app/api/billing/subscribe', { method })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.extractAuthUser.mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'admin@test.local',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    role: 'admin',
  })
  h.getStaffRole.mockResolvedValue('admin')
})

describe('withTenant traduce el timeout de lock', () => {
  it('devuelve 409 con un mensaje accionable en vez de 500', async () => {
    h.withTenantContext.mockRejectedValue(errorDeLockEnvuelto())

    const res = await withTenant(async () => NextResponse.json({ ok: true }))(req())

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('CONCURRENT_OPERATION')
    expect(body.error.message).toMatch(/otra operación en curso/i)
  })

  it('no lo reporta a Sentry: es concurrencia normal, no un bug', async () => {
    h.withTenantContext.mockRejectedValue(errorDeLockEnvuelto())

    await withTenant(async () => NextResponse.json({ ok: true }))(req())

    expect(h.captureException).not.toHaveBeenCalled()
  })

  it('cualquier otro error sigue saliendo 500 y SÍ va a Sentry', async () => {
    // Contraparte: sin esto, un mapeo que se tragara todo también pasaría.
    const otro = new Error('boom')
    h.withTenantContext.mockRejectedValue(otro)

    const res = await withTenant(async () => NextResponse.json({ ok: true }))(req())

    expect(res.status).toBe(500)
    expect(h.captureException).toHaveBeenCalledWith(otro)
  })

  it('withBillingTenant lo traduce igual: es el wrapper que sirve facturación', async () => {
    // Son dos copias del mismo bloque catch. Arreglar una sola no arregla el
    // caso del hallazgo: `/api/billing/reactivate` pasa por este.
    h.withTenantContext.mockRejectedValue(errorDeLockEnvuelto())

    const res = await withBillingTenant(async () => NextResponse.json({ ok: true }))(req())

    expect(res.status).toBe(409)
    expect(h.captureException).not.toHaveBeenCalled()
  })

  it('el camino feliz no cambia', async () => {
    h.withTenantContext.mockImplementation(
      async (_tenantId: string, cb: (tx: unknown) => unknown) => cb({}),
    )

    const res = await withTenant(async () => NextResponse.json({ ok: true }, { status: 201 }))(
      req(),
    )

    expect(res.status).toBe(201)
    expect(h.captureException).not.toHaveBeenCalled()
  })
})
