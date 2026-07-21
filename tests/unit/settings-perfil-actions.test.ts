import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
  updateTenant: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/storage/r2', () => ({
  isR2Configured: vi.fn(),
  putImage: vi.fn(),
  deleteImage: vi.fn(),
  publicUrl: vi.fn((key: string) => `https://media.turnogol.com/${key}`),
  keyFromPublicUrl: vi.fn((url: string) => url.replace('https://media.turnogol.com/', '')),
}))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))
vi.mock('@/modules/auth/auth.service', () => ({ isStaffEmailTaken: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { revalidatePath } from 'next/cache'
import {
  setTenantImageAction,
  removeTenantImageAction,
  updateUserEmailAction,
} from '@/app/(admin)/settings/perfil/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant, updateTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { isR2Configured, putImage, deleteImage } from '@/shared/storage/r2'
import { isStaffEmailTaken } from '@/modules/auth/auth.service'
import { createClient } from '@/lib/supabase/server'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1' }
const TENANT = { id: 'tenant-1', slug: 'demo' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(isR2Configured).mockReturnValue(true)
})

function fakeFormData(fileBytes = 'abc', previousUrl: string | null = null) {
  const fd = new FormData()
  fd.set('file', new Blob([fileBytes], { type: 'image/webp' }), 'logo.webp')
  if (previousUrl) fd.set('previousUrl', previousUrl)
  return fd
}

describe('setTenantImageAction — guard de rol', () => {
  it('manager no puede subir logo (Sin acceso a configuración)', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(false)
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })
})

describe('setTenantImageAction — admin', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
  })

  it('sube el archivo y actualiza logoUrl, y revalida perfil admin + perfil público', async () => {
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(true)
    expect(vi.mocked(putImage)).toHaveBeenCalledTimes(1)
    const [key] = vi.mocked(putImage).mock.calls[0]
    expect(key).toMatch(/^tenant-1\/logo-.+\.webp$/)
    expect(vi.mocked(updateTenant)).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ logoUrl: expect.stringContaining('tenant-1/logo-') }),
    )
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/perfil')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/demo')
  })

  it('borra el objeto anterior si se pasa previousUrl', async () => {
    await setTenantImageAction(
      'cover',
      fakeFormData('abc', 'https://media.turnogol.com/tenant-1/cover-old.webp'),
    )
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/cover-old.webp')
  })

  it('rechaza sin R2 configurado (dev sin credenciales)', async () => {
    vi.mocked(isR2Configured).mockReturnValue(false)
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res).toEqual({ success: false, error: 'Storage no configurado en este entorno' })
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })

  it('devuelve error controlado (sin throw) si putImage falla por caída de R2', async () => {
    vi.mocked(putImage).mockRejectedValueOnce(new Error('R2 unreachable'))
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res).toEqual({ success: false, error: 'No se pudo subir la imagen' })
    expect(vi.mocked(updateTenant)).not.toHaveBeenCalled()
  })

  it('devuelve error controlado (sin throw) si updateTenant falla tras subir a R2', async () => {
    vi.mocked(updateTenant).mockRejectedValueOnce(new Error('DB down'))
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toBe('DB down')
  })
})

describe('removeTenantImageAction', () => {
  it('admin borra el logo y limpia la columna', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    const res = await removeTenantImageAction(
      'logo',
      'https://media.turnogol.com/tenant-1/logo-old.webp',
    )
    expect(res.success).toBe(true)
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/logo-old.webp')
    expect(vi.mocked(updateTenant)).toHaveBeenCalledWith('tenant-1', { logoUrl: null })
  })

  it('anti-IDOR: rechaza borrar una key que no pertenece al tenant', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    const res = await removeTenantImageAction(
      'logo',
      'https://media.turnogol.com/OTRO-TENANT/logo-old.webp',
    )
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('rechaza sin R2 configurado (dev sin credenciales)', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(isR2Configured).mockReturnValue(false)
    const res = await removeTenantImageAction(
      'logo',
      'https://media.turnogol.com/tenant-1/logo-old.webp',
    )
    expect(res).toEqual({ success: false, error: 'Storage no configurado en este entorno' })
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
    expect(vi.mocked(updateTenant)).not.toHaveBeenCalled()
  })
})

describe('updateUserEmailAction', () => {
  const updateUser = vi.fn()

  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(isStaffEmailTaken).mockResolvedValue(false)
    updateUser.mockReset().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ auth: { updateUser } } as never)
  })

  it('email ya usado por otra cuenta (staff_users UNIQUE) → error limpio, sin tocar Supabase Auth', async () => {
    vi.mocked(isStaffEmailTaken).mockResolvedValue(true)
    const res = await updateUserEmailAction('otro@complejo.com')
    expect(res).toEqual({ success: false, error: 'Ese email ya está en uso por otra cuenta.' })
    expect(vi.mocked(isStaffEmailTaken)).toHaveBeenCalledWith('otro@complejo.com', 'staff-1')
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('email disponible → pide el cambio a Supabase con el redirect al callback', async () => {
    const res = await updateUserEmailAction('nuevo@complejo.com')
    expect(res.success).toBe(true)
    expect(updateUser).toHaveBeenCalledWith(
      { email: 'nuevo@complejo.com' },
      expect.objectContaining({ emailRedirectTo: expect.stringContaining('/api/auth/callback') }),
    )
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/perfil')
  })

  it('manager no puede cambiar el email de la cuenta', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    const res = await updateUserEmailAction('nuevo@complejo.com')
    expect(res.success).toBe(false)
    expect(vi.mocked(isStaffEmailTaken)).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })
})
