import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-20: resolveStaffTenants excluía tenants suspended/blocked/churned/deleted
// del login del staff — un dueño moroso ni siquiera podía entrar a ver el
// aviso de suspensión (provisionAndRouteStaff lo mandaba a /onboarding como si
// no tuviera complejo). El único estado que debe seguir excluido es `deleted`
// (datos ya eliminados/anonimizados — no hay nada a lo que entrar).

vi.mock('@/shared/db/client', () => ({ getWorkerSql: vi.fn() }))

import { getWorkerSql } from '@/shared/db/client'
import { resolveStaffTenants } from '@/modules/auth/auth.service'

const mockSql = getWorkerSql as ReturnType<typeof vi.fn>

function makeSqlStub(rows: unknown[]) {
  // El cliente postgres es un tagged template: llamarlo devuelve la promesa de filas.
  return vi.fn().mockResolvedValue(rows)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveStaffTenants — ENS-20', () => {
  it('incluye tenants suspended/blocked/churned/canceled/past_due (moroso puede entrar a pagar)', async () => {
    const rows = [
      { tenantId: 't-1', tenantName: 'Suspendido FC', tenantSlug: 'suspendido-fc', role: 'admin' },
    ]
    const sql = makeSqlStub(rows)
    mockSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const result = await resolveStaffTenants('staff-1')

    expect(result).toEqual(rows)
  })

  it('la query no excluye ningún status salvo deleted', async () => {
    const sql = makeSqlStub([])
    mockSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    await resolveStaffTenants('staff-1')

    expect(sql).toHaveBeenCalledTimes(1)
    const [strings] = sql.mock.calls[0] as [TemplateStringsArray]
    const queryText = strings.join('?')
    expect(queryText).toContain("t.status != 'deleted'")
    expect(queryText).not.toContain('suspended')
    expect(queryText).not.toContain('blocked')
    expect(queryText).not.toContain('churned')
  })
})
