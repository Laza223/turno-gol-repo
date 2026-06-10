import { describe, expect, it } from 'vitest'
import { isMemberTenant } from '@/app/select-tenant/select-tenant.utils'
import type { StaffTenantRow } from '@/modules/auth/auth.service'

/**
 * BLOCKER (triage_fixes #8): el staff con N>1 complejos era redirigido a
 * /select-tenant, que no existía (404). La ruta ahora existe; el guard de
 * autorización (isMemberTenant) asegura que un staff sólo pueda activar un
 * complejo al que efectivamente pertenece.
 */
function row(tenantId: string): StaffTenantRow {
  return { tenantId, tenantName: `Complejo ${tenantId}`, tenantSlug: tenantId, role: 'admin' }
}

const TENANTS = [
  row('11111111-1111-1111-1111-111111111111'),
  row('22222222-2222-2222-2222-222222222222'),
]

describe('isMemberTenant', () => {
  it('acepta un tenant al que el staff pertenece', () => {
    expect(isMemberTenant('11111111-1111-1111-1111-111111111111', TENANTS)).toBe(true)
    expect(isMemberTenant('22222222-2222-2222-2222-222222222222', TENANTS)).toBe(true)
  })

  it('rechaza un tenant ajeno (intento de escalada cross-tenant)', () => {
    expect(isMemberTenant('99999999-9999-9999-9999-999999999999', TENANTS)).toBe(false)
  })

  it('rechaza cuando el staff no tiene complejos', () => {
    expect(isMemberTenant('11111111-1111-1111-1111-111111111111', [])).toBe(false)
  })
})
