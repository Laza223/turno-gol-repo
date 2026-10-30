import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ isRivalEnabled: vi.fn(async () => true) }))

// next/font solo existe en el build de Next: la landing carga su Archivo propia.
vi.mock('next/font/google', () => ({ Archivo: () => ({ variable: 'font-archivo' }) }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`PERMANENT:${url}`)
  }),
}))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import { permanentRedirect } from 'next/navigation'
import RivalPage from '@/app/(player)/rival/page'
import { RivalLanding } from '@/app/(player)/rival/_landing/RivalLanding'

const render = (params: { complejo?: string; despues?: string }) =>
  RivalPage({ searchParams: Promise.resolve(params) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(true)
})

describe('/rival (links viejos del tablón)', () => {
  it('con `complejo` o `despues` redirige permanente a /rival/tablon con los mismos params', async () => {
    await expect(render({ complejo: 'abc' })).rejects.toThrow(
      'PERMANENT:/rival/tablon?complejo=abc',
    )
    await expect(render({ despues: 'x_y' })).rejects.toThrow('PERMANENT:/rival/tablon?despues=x_y')
    await expect(render({ complejo: 'abc', despues: 'x_y' })).rejects.toThrow(
      'PERMANENT:/rival/tablon?complejo=abc&despues=x_y',
    )
  })

  it('sin params no redirige: muestra la landing', async () => {
    const page = await render({})
    expect(page.type).toBe(RivalLanding)
    expect(permanentRedirect).not.toHaveBeenCalled()
  })

  it('con el flag apagado es 404, antes de redirigir', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    await expect(render({ complejo: 'abc' })).rejects.toThrow('NOT_FOUND')
  })
})
