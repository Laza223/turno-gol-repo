import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => ({ type: 'player', playerId: 'player-1' })),
  enforce: vi.fn(async () => ({ ok: true })),
  isR2Configured: vi.fn(() => true),
  validatePhotoUpload: vi.fn((): { ok: true } | { ok: false; error: string } => ({ ok: true })),
  setPlayerPhoto: vi.fn(async () => 'https://media.example.test/rival/avatars/new.webp'),
  removePlayerPhoto: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/sentry', () => ({ captureException: mocks.captureException }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/shared/rate-limit', () => ({ enforce: mocks.enforce }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/shared/storage/r2-config', () => ({ isR2Configured: mocks.isR2Configured }))
vi.mock('@/modules/players/player-photo.service', () => ({
  validatePhotoUpload: mocks.validatePhotoUpload,
  setPlayerPhoto: mocks.setPlayerPhoto,
  removePlayerPhoto: mocks.removePlayerPhoto,
}))

import { removeRivalPhotoAction, uploadRivalPhotoAction } from '@/app/(player)/rival/photo-actions'

function formWith(file?: Blob): FormData {
  const fd = new FormData()
  if (file) fd.set('file', file, 'foto.webp')
  return fd
}
const photo = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(true)
  mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'player-1' })
  mocks.enforce.mockResolvedValue({ ok: true })
  mocks.isR2Configured.mockReturnValue(true)
  mocks.validatePhotoUpload.mockReturnValue({ ok: true })
  mocks.setPlayerPhoto.mockResolvedValue('https://media.example.test/rival/avatars/new.webp')
  mocks.removePlayerPhoto.mockResolvedValue(undefined)
})

describe('uploadRivalPhotoAction', () => {
  it('con RIVAL apagado no hace nada', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(res.success).toBe(false)
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('sin sesión de jugador rechaza', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    expect((await uploadRivalPhotoAction(formWith(photo()))).success).toBe(false)
    mocks.extractAuthUser.mockResolvedValue({ type: 'staff', tenantId: 't' })
    expect((await uploadRivalPhotoAction(formWith(photo()))).success).toBe(false)
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('rate limit: usa la política rivalPhoto por jugador y corta', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(mocks.enforce).toHaveBeenCalledWith('rivalPhoto', 'player-1')
    expect(res).toEqual({ success: false, error: 'Demasiadas solicitudes. Esperá un momento.' })
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('R2 sin configurar: mensaje claro y no sube', async () => {
    mocks.isR2Configured.mockReturnValue(false)
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(res).toEqual({ success: false, error: 'Storage no configurado en este entorno' })
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('sin archivo o archivo vacío rechaza', async () => {
    expect((await uploadRivalPhotoAction(formWith())).success).toBe(false)
    expect((await uploadRivalPhotoAction(formWith(new Blob([])))).success).toBe(false)
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('si el servicio dice que el archivo no vale, devuelve su error y no sube', async () => {
    mocks.validatePhotoUpload.mockReturnValue({ ok: false, error: 'La foto pesa demasiado.' })
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(res).toEqual({ success: false, error: 'La foto pesa demasiado.' })
    expect(mocks.setPlayerPhoto).not.toHaveBeenCalled()
  })

  it('caso feliz: pasa los bytes al servicio, devuelve la URL y revalida', async () => {
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(res).toEqual({ success: true, url: 'https://media.example.test/rival/avatars/new.webp' })
    expect(mocks.setPlayerPhoto).toHaveBeenCalledWith('player-1', new Uint8Array([1, 2, 3]))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/configuracion')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('error de infraestructura: Sentry y mensaje genérico, sin filtrar el detalle', async () => {
    mocks.setPlayerPhoto.mockRejectedValue(new Error('R2 down: secret-detail'))
    const res = await uploadRivalPhotoAction(formWith(photo()))
    expect(res).toEqual({
      success: false,
      error: 'No pudimos subir la foto. Probá de nuevo en un momento.',
    })
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })
})

describe('removeRivalPhotoAction', () => {
  it('con RIVAL apagado, sin sesión o con rate limit no borra nada', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    expect((await removeRivalPhotoAction()).success).toBe(false)
    mocks.isRivalEnabled.mockResolvedValue(true)
    mocks.extractAuthUser.mockResolvedValue(null)
    expect((await removeRivalPhotoAction()).success).toBe(false)
    mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'player-1' })
    mocks.enforce.mockResolvedValue({ ok: false })
    expect((await removeRivalPhotoAction()).success).toBe(false)
    expect(mocks.removePlayerPhoto).not.toHaveBeenCalled()
  })

  it('caso feliz: borra la del jugador de la sesión, url null y revalida', async () => {
    const res = await removeRivalPhotoAction()
    expect(res).toEqual({ success: true, url: null })
    expect(mocks.removePlayerPhoto).toHaveBeenCalledWith('player-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/configuracion')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('error de infraestructura: Sentry y mensaje genérico', async () => {
    mocks.removePlayerPhoto.mockRejectedValue(new Error('boom'))
    const res = await removeRivalPhotoAction()
    expect(res.success).toBe(false)
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })
})
