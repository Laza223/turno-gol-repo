import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regresión del bug de autorización (PR #30 dejó getStaffRole/
// getFirstActiveAdminStaffUserId en getDb() sin migrar): ambas funciones
// corren SIEMPRE antes de que exista `app.current_tenant_id` (guards.ts,
// with-tenant.ts, with-role.ts, callbacks de MP, impersonación) — bajo el pool
// restringido `turnogol_app` (sin BYPASSRLS) una query a `tenant_staff_members`
// sin contexto devuelve 0 filas, no un error, así que un `pnpm test` que solo
// mockee `getStaffRole: vi.fn()` en otros archivos nunca detecta el regreso a
// `getDb()`. Este test mockea el pool (no la función) para probar el cableado:
// si alguien revierte a `getDb()`, la aserción `getWorkerDb` sobre `getDb`
// falla y el rol devuelto es el "trap" del pool equivocado, no el real.
//
// tests/integration/staff-guards.test.ts complementa esto contra DB real, pero
// localmente DATABASE_URL/WORKER_DATABASE_URL apuntan al mismo superusuario
// (bypassa RLS de por sí) — no puede, por diseño del entorno local, distinguir
// "usa el pool correcto" de "usa cualquier pool que bypasee RLS". Este test sí.

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  getWorkerDb: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  getWorkerDb: h.getWorkerDb,
}))

type FakeRow = Record<string, unknown>

function makeChain(rows: FakeRow[]) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain
}

// Pool restringido "trampa": si el código llamara a getDb() en vez de
// getWorkerDb(), el rol/valor devuelto sería este centinela reconocible, no
// el real — la RLS real bajo turnogol_app daría 0 filas, pero acá el valor
// distinto alcanza para detectar la regresión sin depender de una DB real.
const RESTRICTED_POOL_TRAP: FakeRow[] = [{ role: 'TRAP_FROM_RESTRICTED_POOL', staffUserId: 'TRAP_FROM_RESTRICTED_POOL' }]

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeChain(RESTRICTED_POOL_TRAP))
})

describe('getStaffRole — usa el pool worker (bypass-capable), no getDb()', () => {
  it('devuelve el rol leído del pool worker, nunca del pool restringido', async () => {
    h.getWorkerDb.mockReturnValue(makeChain([{ role: 'manager' }]))
    const { getStaffRole } = await import('@/modules/staff/staff.service')

    const role = await getStaffRole('tenant-1', 'staff-1')

    expect(role).toBe('manager')
    expect(h.getWorkerDb).toHaveBeenCalledTimes(1)
    expect(h.getDb).not.toHaveBeenCalled()
  })

  it('devuelve null si el pool worker no encuentra membresía activa', async () => {
    h.getWorkerDb.mockReturnValue(makeChain([]))
    const { getStaffRole } = await import('@/modules/staff/staff.service')

    const role = await getStaffRole('tenant-1', 'staff-1')

    expect(role).toBeNull()
    expect(h.getDb).not.toHaveBeenCalled()
  })
})

describe('getFirstActiveAdminStaffUserId — usa el pool worker, no getDb()', () => {
  it('devuelve el staffUserId leído del pool worker, nunca del pool restringido', async () => {
    h.getWorkerDb.mockReturnValue(makeChain([{ staffUserId: 'admin-1' }]))
    const { getFirstActiveAdminStaffUserId } = await import('@/modules/staff/staff.service')

    const id = await getFirstActiveAdminStaffUserId('tenant-1')

    expect(id).toBe('admin-1')
    expect(h.getWorkerDb).toHaveBeenCalledTimes(1)
    expect(h.getDb).not.toHaveBeenCalled()
  })

  it('devuelve null si el tenant no tiene admin activo', async () => {
    h.getWorkerDb.mockReturnValue(makeChain([]))
    const { getFirstActiveAdminStaffUserId } = await import('@/modules/staff/staff.service')

    const id = await getFirstActiveAdminStaffUserId('tenant-1')

    expect(id).toBeNull()
    expect(h.getDb).not.toHaveBeenCalled()
  })
})
