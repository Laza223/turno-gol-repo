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
  // Polling endpoint for deposit payment confirmation (every ~3s = 20 req/min).
  // playerBooking (20/60s) has zero headroom; a dedicated bucket gives 3x slack.
  bookingStatus:      { limit: 60,  window: '60 s', keyBy: 'player', failMode: 'open'   },
  // PIN brute-force defense (B6): 4-digit PIN = 10k combinations. 5 attempts
  // per 5 minutes per tenant — exhaustive search would need ~7 days. Fail
  // closed: if Upstash is down, deny new attempts (prefer false locks over
  // unmetered guessing).
  pinAttempts:        { limit: 5,   window: '5 m',  keyBy: 'tenant', failMode: 'closed' },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES
