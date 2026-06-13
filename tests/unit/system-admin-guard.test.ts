import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Guards del panel SuperAdmin (spec §3 + §9): triple chequeo claim JWT →
// fila DB activa (la DB manda) → allowlist SYSTEM_ADMIN_EMAILS (fail-closed).
// requireSystemAdmin redirige a /login sin diferenciar motivo;
// requireSystemAdminAction devuelve { ok: false } genérico, sin redirect, y
// aplica enforce('superAdminAction', email) internamente.

const h = vi.hoisted(() => {
  // Filas que devuelve el select() del tx fake; cada test arma las suyas.
  const state = { dbRows: [] as Array<Record<string, unknown>> }
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.dbRows }),
      }),
    }),
  }
  return { state, tx }
})

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withSystemAdminContext: vi.fn() }))
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: vi.fn() }))

import { redirect } from 'next/navigation'
import {
  requireSystemAdmin,
  requireSystemAdminAction,
} from '@/modules/auth/system-admin.guards'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withSystemAdminContext } from '@/shared/db/client'
import { enforce } from '@/shared/rate-limit/apply'

const SYSTEM_ADMIN_USER = {
  type: 'system_admin' as const,
  id: 'auth-user-1',
  email: 'owner@turnogol.test',
  systemAdminId: 'sa-row-1',
}

const ACTIVE_ROW = {
  id: 'sa-row-1',
  email: 'owner@turnogol.test',
  firstName: 'Marce',
  lastName: 'Dueño',
  status: 'active',
}

const ENFORCE_OK = { ok: true, limit: 60, remaining: 59, reset: 0, unavailable: false }

const ORIGINAL_ALLOWLIST = process.env.SYSTEM_ADMIN_EMAILS

beforeEach(() => {
  vi.clearAllMocks()
  h.state.dbRows = []
  process.env.SYSTEM_ADMIN_EMAILS = 'owner@turnogol.test'
  vi.mocked(extractAuthUser).mockResolvedValue(SYSTEM_ADMIN_USER as never)
  vi.mocked(withSystemAdminContext).mockImplementation(
    (async (_id: string, fn: (tx: never) => Promise<unknown>) => fn(h.tx as never)) as never,
  )
  vi.mocked(enforce).mockResolvedValue(ENFORCE_OK)
})

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.SYSTEM_ADMIN_EMAILS
  else process.env.SYSTEM_ADMIN_EMAILS = ORIGINAL_ALLOWLIST
})

describe('requireSystemAdmin — rechazos (todo termina en /login, sin motivo)', () => {
  it('claim system_admin válido pero sin fila DB → redirect', async () => {
    h.state.dbRows = []
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
  })

  it('fila con status inactive → redirect (revocación inmediata por DB)', async () => {
    h.state.dbRows = [{ ...ACTIVE_ROW, status: 'inactive' }]
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
  })

  it('fila activa pero email fuera de la allowlist → redirect', async () => {
    h.state.dbRows = [ACTIVE_ROW]
    process.env.SYSTEM_ADMIN_EMAILS = 'otra-persona@turnogol.test'
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
  })

  it('allowlist ausente (env sin setear) → redirect (fail-closed)', async () => {
    h.state.dbRows = [ACTIVE_ROW]
    delete process.env.SYSTEM_ADMIN_EMAILS
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
  })

  it('user staff → redirect sin tocar la DB de system_admins', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'staff',
      id: 'auth-staff',
      email: 'staff@x.com',
      staffUserId: 'staff-1',
      tenantId: 'tenant-1',
      role: 'admin',
    } as never)
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
    expect(vi.mocked(withSystemAdminContext)).not.toHaveBeenCalled()
  })

  it('user player → redirect sin tocar la DB de system_admins', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'player',
      id: 'auth-player',
      playerId: 'player-1',
      email: 'player@x.com',
    } as never)
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
    expect(vi.mocked(withSystemAdminContext)).not.toHaveBeenCalled()
  })

  it('sin sesión (extractAuthUser null) → redirect', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)
    await expect(requireSystemAdmin()).rejects.toThrow('REDIRECT:/login')
  })
})

describe('requireSystemAdmin — happy path', () => {
  it('devuelve user + admin (fila DB) y consulta con el systemAdminId del claim', async () => {
    h.state.dbRows = [ACTIVE_ROW]
    const auth = await requireSystemAdmin()
    expect(auth.user).toEqual(SYSTEM_ADMIN_USER)
    expect(auth.admin).toEqual({
      id: 'sa-row-1',
      email: 'owner@turnogol.test',
      firstName: 'Marce',
      lastName: 'Dueño',
    })
    expect(vi.mocked(withSystemAdminContext)).toHaveBeenCalledWith(
      'sa-row-1',
      expect.any(Function),
    )
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })

  it('allowlist matchea case-insensitive y con espacios, contra el email de la FILA', async () => {
    // El email del JWT NO participa: solo el de la fila DB decide.
    vi.mocked(extractAuthUser).mockResolvedValue({
      ...SYSTEM_ADMIN_USER,
      email: 'otro-email-en-jwt@x.com',
    } as never)
    h.state.dbRows = [ACTIVE_ROW]
    process.env.SYSTEM_ADMIN_EMAILS = ' soporte@x.com , OWNER@Turnogol.TEST '
    const auth = await requireSystemAdmin()
    expect(auth.admin.email).toBe('owner@turnogol.test')
  })
})

describe('requireSystemAdminAction', () => {
  it('enforce ok:false → { ok: false } con mensaje de rate limit, sin redirect', async () => {
    h.state.dbRows = [ACTIVE_ROW]
    vi.mocked(enforce).mockResolvedValue({ ...ENFORCE_OK, ok: false, remaining: 0 })
    const res = await requireSystemAdminAction()
    expect(res).toEqual({ ok: false, error: 'Demasiadas operaciones, esperá un momento.' })
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })

  it('happy path → ok:true con user+admin y enforce(superAdminAction, email de la fila)', async () => {
    h.state.dbRows = [ACTIVE_ROW]
    const res = await requireSystemAdminAction()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.user).toEqual(SYSTEM_ADMIN_USER)
      expect(res.admin.id).toBe('sa-row-1')
    }
    expect(vi.mocked(enforce)).toHaveBeenCalledWith('superAdminAction', 'owner@turnogol.test')
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })

  it('user staff → { ok: false, error: "No autorizado." } sin redirect ni enforce', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'staff',
      id: 'auth-staff',
      email: 'staff@x.com',
      staffUserId: 'staff-1',
      tenantId: 'tenant-1',
      role: 'admin',
    } as never)
    const res = await requireSystemAdminAction()
    expect(res).toEqual({ ok: false, error: 'No autorizado.' })
    expect(vi.mocked(enforce)).not.toHaveBeenCalled()
    expect(vi.mocked(redirect)).not.toHaveBeenCalled()
  })

  it('fila inactive → { ok: false, error: "No autorizado." } sin diferenciar motivo', async () => {
    h.state.dbRows = [{ ...ACTIVE_ROW, status: 'inactive' }]
    const res = await requireSystemAdminAction()
    expect(res).toEqual({ ok: false, error: 'No autorizado.' })
    expect(vi.mocked(enforce)).not.toHaveBeenCalled()
  })
})
