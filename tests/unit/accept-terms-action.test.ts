import { beforeEach, describe, expect, it, vi } from 'vitest'

// Consentimiento diferido (Google vía /ingresar, sin checkbox previo — ver
// provisionPlayerAndRedirect en el callback). Mismo patrón de mocks que
// caja-booking-id-rejected.test.ts para `redirect`.

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/players/player.service', () => ({ acceptPlayerTerms: vi.fn() }))

import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { acceptPlayerTerms } from '@/modules/players/player.service'
import { acceptTermsAction } from '@/app/(auth)/aceptar-terminos/actions'

const mockExtractAuthUser = vi.mocked(extractAuthUser)
const mockAcceptPlayerTerms = vi.mocked(acceptPlayerTerms)
const mockRedirect = vi.mocked(redirect)

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('acceptTermsAction', () => {
  it('sin sesión de jugador -> redirige a /ingresar sin escribir nada', async () => {
    mockExtractAuthUser.mockResolvedValue(null)

    await expect(
      acceptTermsAction({ status: 'idle' }, formData({ terms: 'on', next: '/mis-reservas' })),
    ).rejects.toThrow('REDIRECT:/ingresar')

    expect(mockAcceptPlayerTerms).not.toHaveBeenCalled()
  })

  it('checkbox sin tildar -> error, no redirige ni escribe', async () => {
    mockExtractAuthUser.mockResolvedValue({
      type: 'player',
      id: 'auth-1',
      playerId: 'player-1',
      email: 'jugador@example.com',
    })

    const result = await acceptTermsAction({ status: 'idle' }, formData({ next: '/mis-reservas' }))

    expect(result).toEqual({ status: 'error', message: 'Tenés que aceptar los términos.' })
    expect(mockAcceptPlayerTerms).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('checkbox tildado -> acepta términos y redirige a /verify de éxito', async () => {
    mockExtractAuthUser.mockResolvedValue({
      type: 'player',
      id: 'auth-1',
      playerId: 'player-1',
      email: 'jugador@example.com',
    })
    mockAcceptPlayerTerms.mockResolvedValue(undefined)

    await expect(
      acceptTermsAction({ status: 'idle' }, formData({ terms: 'on', next: '/mis-reservas' })),
    ).rejects.toThrow(/^REDIRECT:\/verify\?status=success/)

    expect(mockAcceptPlayerTerms).toHaveBeenCalledWith('player-1', expect.any(String))
  })
})
