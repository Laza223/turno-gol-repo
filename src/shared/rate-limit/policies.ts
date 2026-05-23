export type KeyBy = 'email' | 'ip' | 'tenant' | 'player'

export type Policy = {
  limit: number
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  keyBy: KeyBy
  failMode: 'open' | 'closed'
}

export const POLICIES = {
  authMagicLink:      { limit: 5,   window: '60 s', keyBy: 'email',  failMode: 'closed' },
  authVerify:         { limit: 10,  window: '60 s', keyBy: 'ip',     failMode: 'closed' },
  publicAvailability: { limit: 30,  window: '60 s', keyBy: 'ip',     failMode: 'open'   },
  adminCrud:          { limit: 100, window: '60 s', keyBy: 'tenant', failMode: 'open'   },
  playerBooking:      { limit: 20,  window: '60 s', keyBy: 'player', failMode: 'open'   },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES
