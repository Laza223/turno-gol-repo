import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'player', playerId: 'player-1' })),
}))
vi.mock('@/shared/db/client', () => ({ withPlayerContext: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { captureException } from '@/lib/sentry'
import { withPlayerContext } from '@/shared/db/client'
import { updateProfileAction } from '@/app/(player)/perfil/actions'

function validForm(): FormData {
  const fd = new FormData()
  fd.set('first_name', 'Juan')
  fd.set('last_name', 'Pérez')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateProfileAction — fallo de DB (#37)', () => {
  it('captura en Sentry y devuelve un error amigable si withPlayerContext lanza', async () => {
    vi.mocked(withPlayerContext).mockRejectedValueOnce(new Error('connection lost'))
    const res = await updateProfileAction({ success: true }, validForm())
    expect(res.success).toBe(false)
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
