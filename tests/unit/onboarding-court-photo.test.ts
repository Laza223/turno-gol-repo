import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La foto de cancha en el paso 3 del wizard.
 *
 * El caso que estos tests existen para que no vuelva a pasar: la versión
 * anterior subía el archivo a R2 y el submit armaba el payload SIN `photos`, así
 * que la cancha nacía sin foto y el objeto quedaba huérfano. Acá se cubre el
 * otro extremo del mismo lazo — que la URL que llega del cliente sea del propio
 * complejo antes de escribirse en `courts.photos`.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireAdminStaff: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/storage/r2', () => ({
  isR2Configured: vi.fn().mockReturnValue(true),
  putImage: vi.fn(),
  deleteImage: vi.fn(),
  publicUrl: vi.fn((key: string) => `https://media.turnogol.com/${key}`),
  keyFromPublicUrl: vi.fn((url: string) =>
    url.startsWith('https://media.turnogol.com/')
      ? url.replace('https://media.turnogol.com/', '')
      : null,
  ),
}))

import {
  uploadWizardCourtPhotoAction,
  deleteWizardCourtPhotoAction,
} from '@/app/onboarding/actions'
import { isOwnDraftPhotoKey } from '@/modules/onboarding/onboarding.service'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { deleteImage, isR2Configured, putImage } from '@/shared/storage/r2'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const PHOTO_UUID = '33333333-3333-4333-8333-333333333333'

function formDataWith(bytes: number): FormData {
  const fd = new FormData()
  fd.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), 'court.webp')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({
    ok: true,
    tenant: { id: TENANT_ID, slug: 'demo' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(isR2Configured).mockReturnValue(true)
})

describe('uploadWizardCourtPhotoAction', () => {
  it('sube al prefijo de borradores del propio complejo y devuelve la URL pública', async () => {
    const result = await uploadWizardCourtPhotoAction(formDataWith(1024))

    expect(result.success).toBe(true)
    const key = vi.mocked(putImage).mock.calls[0]![0]
    expect(key).toMatch(new RegExp(`^${TENANT_ID}/court-drafts/[0-9a-f-]{36}\\.webp$`))
    expect(vi.mocked(putImage).mock.calls[0]![2]).toBe('image/webp')
  })

  it('rechaza sin sesión de admin', async () => {
    vi.mocked(requireAdminStaffAction).mockResolvedValue({
      ok: false,
      error: 'No autorizado',
    } as never)
    const result = await uploadWizardCourtPhotoAction(formDataWith(1024))
    expect(result).toEqual({ success: false, error: 'No autorizado' })
    expect(putImage).not.toHaveBeenCalled()
  })

  it('respeta el rate limit', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiados intentos')
    const result = await uploadWizardCourtPhotoAction(formDataWith(1024))
    expect(result).toEqual({ success: false, error: 'Demasiados intentos' })
    expect(putImage).not.toHaveBeenCalled()
  })

  it('rechaza más de 2MB', async () => {
    const result = await uploadWizardCourtPhotoAction(formDataWith(2 * 1024 * 1024 + 1))
    expect(result).toEqual({ success: false, error: 'La imagen no puede superar 2MB' })
    expect(putImage).not.toHaveBeenCalled()
  })

  it('sin R2 configurado no rompe el paso: devuelve error y no sube nada', async () => {
    vi.mocked(isR2Configured).mockReturnValue(false)
    const result = await uploadWizardCourtPhotoAction(formDataWith(1024))
    expect(result.success).toBe(false)
    expect(putImage).not.toHaveBeenCalled()
  })
})

describe('deleteWizardCourtPhotoAction', () => {
  it('borra una foto de borrador propia', async () => {
    const url = `https://media.turnogol.com/${TENANT_ID}/court-drafts/${PHOTO_UUID}.webp`
    const result = await deleteWizardCourtPhotoAction(url)
    expect(result.success).toBe(true)
    expect(deleteImage).toHaveBeenCalledWith(`${TENANT_ID}/court-drafts/${PHOTO_UUID}.webp`)
  })

  it('NO borra la foto de otro complejo', async () => {
    const url = `https://media.turnogol.com/${OTHER_TENANT}/court-drafts/${PHOTO_UUID}.webp`
    const result = await deleteWizardCourtPhotoAction(url)
    expect(result.success).toBe(false)
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('NO borra un objeto de otro host', async () => {
    const result = await deleteWizardCourtPhotoAction(
      `https://evil.example/${TENANT_ID}/court-drafts/${PHOTO_UUID}.webp`,
    )
    expect(result.success).toBe(false)
    expect(deleteImage).not.toHaveBeenCalled()
  })
})

describe('isOwnDraftPhotoKey', () => {
  it('acepta la key exacta que escribe la action', () => {
    expect(isOwnDraftPhotoKey(TENANT_ID, `${TENANT_ID}/court-drafts/${PHOTO_UUID}.webp`)).toBe(true)
  })

  it('rechaza la key de otro complejo', () => {
    expect(isOwnDraftPhotoKey(TENANT_ID, `${OTHER_TENANT}/court-drafts/${PHOTO_UUID}.webp`)).toBe(
      false,
    )
  })

  it('rechaza otros objetos del MISMO complejo (logo, portada, fotos de canchas)', () => {
    // El prefijo del tenant solo no alcanza: acá es donde se cuela el logo.
    expect(isOwnDraftPhotoKey(TENANT_ID, `${TENANT_ID}/logo-${PHOTO_UUID}.webp`)).toBe(false)
    expect(isOwnDraftPhotoKey(TENANT_ID, `${TENANT_ID}/courts/court-1/${PHOTO_UUID}.webp`)).toBe(
      false,
    )
  })

  it('rechaza una key con path traversal o extensión distinta', () => {
    expect(isOwnDraftPhotoKey(TENANT_ID, `${TENANT_ID}/court-drafts/../../secreto.webp`)).toBe(
      false,
    )
    expect(isOwnDraftPhotoKey(TENANT_ID, `${TENANT_ID}/court-drafts/${PHOTO_UUID}.html`)).toBe(
      false,
    )
  })
})
