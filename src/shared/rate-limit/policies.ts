type KeyBy = 'email' | 'ip' | 'tenant' | 'player' | 'ip_tenant'

export type Policy = {
  limit: number
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  keyBy: KeyBy
  failMode: 'open' | 'closed'
}

export const POLICIES = {
  authMagicLink: { limit: 5, window: '60 s', keyBy: 'email', failMode: 'closed' },
  authVerify: { limit: 10, window: '60 s', keyBy: 'ip', failMode: 'closed' },
  // Login de staff por contraseña. Defensa de fuerza bruta sobre UNA cuenta:
  // keyBy email, ventana estricta tipo pinAttempts (~8 intentos / 5 min) y fail
  // closed (si Upstash cae, denegar nuevos intentos antes que permitir adivinar
  // contraseñas sin medir). Mensaje genérico en la action: no revela el email.
  authPassword: { limit: 8, window: '5 m', keyBy: 'email', failMode: 'closed' },
  // Alta de staff (signUp). Antes SIN rate-limit. keyBy IP (un mismo origen no
  // debería crear cuentas en masa) + email-confirm + bajo volumen de altas.
  // Fail closed: ante outage de Upstash, frenar el alta automatizada.
  authRegister: { limit: 5, window: '10 m', keyBy: 'ip', failMode: 'closed' },
  publicAvailability: { limit: 30, window: '60 s', keyBy: 'ip', failMode: 'open' },
  adminCrud: { limit: 100, window: '60 s', keyBy: 'tenant', failMode: 'open' },
  playerBooking: { limit: 20, window: '60 s', keyBy: 'player', failMode: 'open' },
  // Polling endpoint for deposit payment confirmation (every ~3s = 20 req/min).
  // playerBooking (20/60s) has zero headroom; a dedicated bucket gives 3x slack.
  bookingStatus: { limit: 60, window: '60 s', keyBy: 'player', failMode: 'open' },
  // INV-ABUSE-001 (Denial of Inventory): un mismo origen no debería crear
  // muchos holds (bookings pending_payment) por minuto EN UN MISMO TENANT,
  // sin importar cuántas cuentas de jugador use — playerBooking (20/60s por
  // player) no cubre el caso de múltiples cuentas desde la misma IP. Key
  // compuesta (ip, tenant): una key solo-IP permitía sostener ~60 holds
  // indefinidos contra UN tenant chico (10 req/60s × 360s de TTL de hold) sin
  // romper el límite — hallazgo de security review. Bajado a 5/60s tras ese
  // hallazgo. La key real (`${ip}:${slug}`) la arma el caller en actions.ts.
  // Fail open: ante outage de Upstash, no se bloquea el negocio (mismo
  // criterio que playerBooking/publicAvailability).
  publicBookingCreate: { limit: 5, window: '60 s', keyBy: 'ip_tenant', failMode: 'open' },
  // PIN brute-force defense (B6): 4-digit PIN = 10k combinations. 5 attempts
  // per 5 minutes per tenant — exhaustive search would need ~7 days. Fail
  // closed: if Upstash is down, deny new attempts (prefer false locks over
  // unmetered guessing).
  pinAttempts: { limit: 5, window: '5 m', keyBy: 'tenant', failMode: 'closed' },
  // VAPID public key endpoint (F9): public GET, no auth. 5 req/min per IP to
  // prevent bulk scraping. Fail open: if Upstash is down, allow the request
  // (VAPID public key is intentionally public).
  vapidPublic: { limit: 5, window: '60 s', keyBy: 'ip', failMode: 'open' },
  // Server Actions del panel SuperAdmin: un solo operador humano (el dueño del
  // SaaS), 60 ops/min sobra. Fail open: si Upstash cae, no bloquear soporte.
  superAdminAction: { limit: 60, window: '60 s', keyBy: 'email', failMode: 'open' },
  // Chequeo optimista de disponibilidad al abrir BookingFormModal (Fase 4 UX):
  // lectura automática disparada por cada apertura del modal, NO un click de
  // "Guardar". Balde propio para que un admin recorriendo la grilla no consuma
  // el `adminCrud` (100/60s por tenant) que comparten TODAS las mutaciones
  // reales de dinero del staff. Fail open: es solo un aviso temprano.
  adminAvailabilityCheck: { limit: 120, window: '60 s', keyBy: 'tenant', failMode: 'open' },
  // "Hoy: $X" del sidebar (B14): lectura automática que dispara la navegación y
  // un intervalo de 60 s, no un click. Balde propio por el mismo motivo que
  // `adminAvailabilityCheck` — con varios empleados navegando, ponerlo en
  // `adminCrud` (100/60s por tenant) le come el presupuesto a las mutaciones
  // reales de dinero. Fail open: si Upstash cae, mostrar el número no es un
  // riesgo, y esconderlo sí es una regresión visible.
  adminDayTotal: { limit: 120, window: '60 s', keyBy: 'tenant', failMode: 'open' },
  // CSP violation reports (security scan F9): public, unauthenticated POST.
  // A real browser sends at most a few of these per page load; 20/60s per IP
  // gives headroom while still bounding how many distinct Sentry events one
  // origin can trigger by varying blockedUri per request. Fail open: losing
  // CSP telemetry during an Upstash outage isn't worth blocking the endpoint.
  cspReport: { limit: 20, window: '60 s', keyBy: 'ip', failMode: 'open' },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES
