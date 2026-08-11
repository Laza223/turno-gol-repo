import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireOperatorStaff: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/storage/r2', () => ({
  isR2Configured: vi.fn().mockReturnValue(true),
  putImage: vi.fn(),
  deleteImage: vi.fn(),
  publicUrl: vi.fn((key: string) => `https://media.turnogol.com/${key}`),
  keyFromPublicUrl: vi.fn((url: string) => url.replace('https://media.turnogol.com/', '')),
}))
vi.mock('@/modules/courts/court.service', () => ({
  createCourt: vi.fn(),
  updateCourt: vi.fn(),
  toggleStatus: vi.fn(),
  getCourtCountAndLimit: vi.fn(),
  validatePricingRulesCoverage: vi.fn(),
  getCourtById: vi.fn(),
  appendCourtPhoto: vi.fn(),
  removeCourtPhoto: vi.fn(),
  reorderCourtPhotos: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import {
  uploadCourtPhotoAction,
  removeCourtPhotoAction,
  reorderCourtPhotosAction,
} from '@/app/(admin)/settings/canchas/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { putImage, deleteImage, isR2Configured } from '@/shared/storage/r2'
import {
  getCourtById,
  appendCourtPhoto,
  removeCourtPhoto,
  reorderCourtPhotos,
} from '@/modules/courts/court.service'

const TENANT = { id: 'tenant-1', slug: 'demo' }
const FAKE_TX = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: true, tenant: TENANT } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(isR2Configured).mockReturnValue(true)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(FAKE_TX)) as never)
  vi.mocked(getCourtById).mockResolvedValue({
    photos: ['https://media.turnogol.com/tenant-1/courts/court-1/x.webp'],
  } as never)
})

describe('uploadCourtPhotoAction', () => {
  it('rechaza sin rol admin', async () => {
    vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: false, error: 'no' } as never)
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-1', fd)
    expect(res.success).toBe(false)
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })

  it('sube a R2 y appendea a courts.photos, y revalida grilla admin + perfil público', async () => {
    vi.mocked(appendCourtPhoto).mockResolvedValue([
      'https://media.turnogol.com/tenant-1/courts/court-1/x.webp',
    ])
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-1', fd)
    expect(res.success).toBe(true)
    expect(vi.mocked(putImage)).toHaveBeenCalledTimes(1)
    const [key] = vi.mocked(putImage).mock.calls[0]
    expect(key).toMatch(/^tenant-1\/courts\/court-1\/.+\.webp$/)
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/canchas')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/demo')
  })

  it('cancha inexistente devuelve error sin subir', async () => {
    vi.mocked(appendCourtPhoto).mockResolvedValue(null)
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-inexistente', fd)
    expect(res.success).toBe(false)
  })
})

describe('removeCourtPhotoAction', () => {
  it('anti-IDOR: rechaza url de otro tenant', async () => {
    const res = await removeCourtPhotoAction(
      'court-1',
      'https://media.turnogol.com/OTRO-TENANT/courts/court-1/x.webp',
    )
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('borra en R2 y en DB, y revalida grilla admin + perfil público', async () => {
    vi.mocked(removeCourtPhoto).mockResolvedValue([])
    const res = await removeCourtPhotoAction(
      'court-1',
      'https://media.turnogol.com/tenant-1/courts/court-1/x.webp',
    )
    expect(res.success).toBe(true)
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/courts/court-1/x.webp')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/canchas')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/demo')
  })

  it('rechaza sin R2 configurado (dev sin credenciales)', async () => {
    vi.mocked(isR2Configured).mockReturnValue(false)
    const res = await removeCourtPhotoAction(
      'court-1',
      'https://media.turnogol.com/tenant-1/courts/court-1/x.webp',
    )
    expect(res).toEqual({ success: false, error: 'Storage no configurado en este entorno' })
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
    expect(vi.mocked(removeCourtPhoto)).not.toHaveBeenCalled()
  })

  it('rechaza una url válida del tenant pero que no pertenece a las fotos de ESTA cancha', async () => {
    vi.mocked(getCourtById).mockResolvedValue({
      photos: ['https://media.turnogol.com/tenant-1/courts/court-1/otra-foto.webp'],
    } as never)
    const res = await removeCourtPhotoAction(
      'court-1',
      // key con prefijo tenant-1/ válido (pasa el anti-IDOR), pero es
      // por ejemplo el logo del propio tenant, no una foto de esta cancha.
      'https://media.turnogol.com/tenant-1/logo-x.webp',
    )
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
    expect(vi.mocked(removeCourtPhoto)).not.toHaveBeenCalled()
  })
})

describe('reorderCourtPhotosAction', () => {
  it('persiste el nuevo orden y revalida grilla admin + perfil público', async () => {
    vi.mocked(reorderCourtPhotos).mockResolvedValue(['b.webp', 'a.webp'])
    const res = await reorderCourtPhotosAction('court-1', ['b.webp', 'a.webp'])
    expect(res.success).toBe(true)
    expect(res.success && res.photos).toEqual(['b.webp', 'a.webp'])
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/settings/canchas')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/demo')
  })
})
