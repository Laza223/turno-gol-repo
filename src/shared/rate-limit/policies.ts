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
  // Login de staff por contraseña. Defensa de fuerza bruta sobre UNA cuenta:
  // keyBy email, ventana estricta tipo pinAttempts (~8 intentos / 5 min) y fail
  // closed (si Upstash cae, denegar nuevos intentos antes que permitir adivinar
  // contraseñas sin medir). Mensaje genérico en la action: no revela el email.
  authPassword:       { limit: 8,   window: '5 m',  keyBy: 'email',  failMode: 'closed' },
  // Alta de staff (signUp). Antes SIN rate-limit. keyBy IP (un mismo origen no
  // debería crear cuentas en masa) + email-confirm + bajo volumen de altas.
  // Fail closed: ante outage de Upstash, frenar el alta automatizada.
  authRegister:       { limit: 5,   window: '10 m', keyBy: 'ip',     failMode: 'closed' },
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
  // VAPID public key endpoint (F9): public GET, no auth. 5 req/min per IP to
  // prevent bulk scraping. Fail open: if Upstash is down, allow the request
  // (VAPID public key is intentionally public).
  vapidPublic:        { limit: 5,   window: '60 s', keyBy: 'ip',     failMode: 'open'   },
  // Server Actions del panel SuperAdmin: un solo operador humano (el dueño del
  // SaaS), 60 ops/min sobra. Fail open: si Upstash cae, no bloquear soporte.
  superAdminAction:   { limit: 60,  window: '60 s', keyBy: 'email',  failMode: 'open'   },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES
