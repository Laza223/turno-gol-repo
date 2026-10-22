import { beforeEach, describe, expect, it, vi } from 'vitest'

// Alta asistida (decisión 2026-10-22): la action es guard → zod → service. El
// service tiene su propio test de integración contra Postgres; acá se cubre lo
// que pasa ANTES y DESPUÉS de él.

const h = vi.hoisted(() => ({
  requireSystemAdminAction: vi.fn(),
  createAssistedTenant: vi.fn(),
  captureException: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('@/lib/sentry', () => ({ captureException: h.captureException }))
vi.mock('@/modules/auth/system-admin.guards', () => ({
  requireSystemAdminAction: () => h.requireSystemAdminAction(),
}))
vi.mock('@/modules/tenants/assisted-signup.service', () => ({
  createAssistedTenant: (...args: unknown[]) => h.createAssistedTenant(...args),
}))

import { createAssistedTenantAction } from '@/app/(super-admin)/super-admin/tenants/actions'

const ADMIN = { id: '22222222-2222-4222-8222-222222222222', email: 'sa@turnogol.test' }
const TENANT_ID = '11111111-1111-4111-8111-111111111111'

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  const values: Record<string, string> = {
    name: 'Canchas del Sur',
    address: 'Av. Siempreviva 742',
    city: 'Lanús',
    province: 'Buenos Aires',
    phone: '+54 11 5555-1234',
    firstName: 'Marcelo',
    lastName: 'Gómez',
    email: '  Marcelo@CanchasDelSur.test ',
    referral: '',
    ...overrides,
  }
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const IDLE = { status: 'idle' } as const

beforeEach(() => {
  vi.clearAllMocks()
  h.requireSystemAdminAction.mockResolvedValue({ ok: true, admin: ADMIN })
})

describe('createAssistedTenantAction', () => {
  it('sin super-admin no llama al service', async () => {
    h.requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })

    const res = await createAssistedTenantAction(IDLE, form())

    expect(res).toMatchObject({ status: 'error', message: 'No autorizado.' })
    expect(h.createAssistedTenant).not.toHaveBeenCalled()
  })

  it('devuelve el error de cada campo y lo tipeado, sin llamar al service', async () => {
    const res = await createAssistedTenantAction(IDLE, form({ name: 'X', email: 'no-es-mail' }))

    expect(res.status).toBe('error')
    if (res.status !== 'error') return
    expect(res.fieldErrors.name).toBeTruthy()
    expect(res.fieldErrors.email).toBe('Ingresá un email válido')
    expect(res.values).toMatchObject({ name: 'X', email: 'no-es-mail', city: 'Lanús' })
    expect(h.createAssistedTenant).not.toHaveBeenCalled()
  })

  it('normaliza el email y manda referral null cuando viene vacío', async () => {
    h.createAssistedTenant.mockResolvedValue({
      ok: true,
      tenantId: TENANT_ID,
      slug: 'canchas-del-sur',
      tempPassword: 'TG-1a2b3c4d5e',
    })

    await createAssistedTenantAction(IDLE, form())

    expect(h.createAssistedTenant).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'marcelo@canchasdelsur.test', referral: null }),
      ADMIN,
    )
  })

  it.each([
    ['player_account', 'email'],
    ['staff_account', 'email'],
    ['email_taken', 'email'],
    ['invalid_referral', 'referral'],
  ] as const)('el rechazo %s se muestra en el campo %s', async (reason, field) => {
    h.createAssistedTenant.mockResolvedValue({ ok: false, reason })

    const res = await createAssistedTenantAction(IDLE, form())

    expect(res.status).toBe('error')
    if (res.status !== 'error') return
    expect(res.fieldErrors[field]).toBeTruthy()
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  it('en el éxito devuelve la contraseña una vez y refresca la lista', async () => {
    h.createAssistedTenant.mockResolvedValue({
      ok: true,
      tenantId: TENANT_ID,
      slug: 'canchas-del-sur',
      tempPassword: 'TG-1a2b3c4d5e',
    })

    const res = await createAssistedTenantAction(IDLE, form())

    expect(res).toEqual({
      status: 'success',
      tenantId: TENANT_ID,
      tenantName: 'Canchas del Sur',
      email: 'marcelo@canchasdelsur.test',
      tempPassword: 'TG-1a2b3c4d5e',
    })
    expect(h.revalidatePath).toHaveBeenCalledWith('/super-admin/tenants')
  })

  it('si el service tira, reporta a Sentry y muestra un error general', async () => {
    const boom = new Error('createAssistedTenant: createUser falló (unexpected_failure)')
    h.createAssistedTenant.mockRejectedValue(boom)

    const res = await createAssistedTenantAction(IDLE, form())

    expect(res).toMatchObject({ status: 'error', fieldErrors: {} })
    expect(res.status === 'error' && res.message).toBeTruthy()
    expect(h.captureException).toHaveBeenCalledWith(boom, expect.anything())
  })
})
