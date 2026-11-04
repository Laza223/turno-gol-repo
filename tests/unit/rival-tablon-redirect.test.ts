import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`PERMANENT:${url}`)
  }),
}))

import RivalTablonRedirect from '@/app/(player)/rival/tablon/page'

const go = (sp: { complejo?: string; despues?: string }) =>
  RivalTablonRedirect({ searchParams: Promise.resolve(sp) })

describe('/rival/tablon → /rival', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin query redirige a /rival', async () => {
    await expect(go({})).rejects.toThrow('PERMANENT:/rival')
  })
  it('conserva complejo y despues', async () => {
    await expect(go({ complejo: 'abc' })).rejects.toThrow('PERMANENT:/rival?complejo=abc')
    await expect(go({ despues: 'x' })).rejects.toThrow('PERMANENT:/rival?despues=x')
    await expect(go({ complejo: 'abc', despues: 'x' })).rejects.toThrow(
      'PERMANENT:/rival?complejo=abc&despues=x',
    )
  })
})
