import { describe, expect, it } from 'vitest'
import { POLICIES } from '@/shared/rate-limit/policies'

describe('rate-limit policies (doc15 §9)', () => {
  it('matches doc15 §9 exactly', () => {
    expect(POLICIES.authMagicLink).toEqual({ limit: 5, window: '60 s', keyBy: 'email', failMode: 'closed' })
    expect(POLICIES.authVerify).toEqual({ limit: 10, window: '60 s', keyBy: 'ip', failMode: 'closed' })
    expect(POLICIES.publicAvailability).toEqual({ limit: 30, window: '60 s', keyBy: 'ip', failMode: 'open' })
    expect(POLICIES.adminCrud).toEqual({ limit: 100, window: '60 s', keyBy: 'tenant', failMode: 'open' })
    expect(POLICIES.playerBooking).toEqual({ limit: 20, window: '60 s', keyBy: 'player', failMode: 'open' })
  })

  it('auth password/register policies (migración de auth)', () => {
    expect(POLICIES.authPassword).toEqual({ limit: 8, window: '5 m', keyBy: 'email', failMode: 'closed' })
    expect(POLICIES.authRegister).toEqual({ limit: 5, window: '10 m', keyBy: 'ip', failMode: 'closed' })
  })
})
