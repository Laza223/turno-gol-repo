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

describe('updateProfileAction — affected rows (#38)', () => {
  it('devuelve error si el UPDATE no afecta ninguna fila (player inexistente)', async () => {
    vi.mocked(withPlayerContext).mockResolvedValueOnce([])
    const res = await updateProfileAction({ success: true }, validForm())
    expect(res).toEqual({ success: false, error: 'No encontramos tu perfil.' })
  })

  it('devuelve success cuando el UPDATE afecta una fila', async () => {
    vi.mocked(withPlayerContext).mockResolvedValueOnce([{ id: 'player-1' }])
    const res = await updateProfileAction({ success: true }, validForm())
    expect(res).toEqual({ success: true })
  })
})
