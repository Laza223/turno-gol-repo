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

import { setTenantImageAction, removeTenantImageAction } from '@/app/(admin)/settings/perfil/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant, updateTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { isR2Configured, putImage, deleteImage } from '@/shared/storage/r2'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1' }
const TENANT = { id: 'tenant-1' }

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

  it('sube el archivo y actualiza logoUrl', async () => {
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(true)
    expect(vi.mocked(putImage)).toHaveBeenCalledTimes(1)
    const [key] = vi.mocked(putImage).mock.calls[0]
    expect(key).toMatch(/^tenant-1\/logo-.+\.webp$/)
    expect(vi.mocked(updateTenant)).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ logoUrl: expect.stringContaining('tenant-1/logo-') }),
    )
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
})
