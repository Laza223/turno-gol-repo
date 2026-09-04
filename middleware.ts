import { NextResponse, type NextRequest } from 'next/server'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'
import { resolveRequestId } from '@/shared/lib/request-id'
import {
  isForbiddenCrossSiteMutation,
  isSensitiveMutationPath,
} from '@/shared/security/fetch-metadata'
import { refreshSessionCookies } from '@/lib/supabase/middleware'

export const config = {
  matcher: [
    // ── Rate limit + Fetch-Metadata. NO refrescan sesión (ver needsSessionRefresh). ──
    '/api/public/:path*',
    '/api/auth/:path*',
    '/verify',
    // Sec-Fetch isolation for payments + cancellations (see below).
    '/api/billing/:path*',
    '/api/bookings/:path*',
    '/api/player/bookings/:path*',

    // ── Rutas de UI cuyos Server Components no pueden escribir cookies.
    // REGLA DE MANTENIMIENTO: toda ruta de UI que llame a `extractAuthUser` va acá.
    // Lista explícita y no un lookahead negativo a propósito: las fichas
    // públicas de complejo son `/[slug]` con slug arbitrario y `revalidate`,
    // así que ninguna expresión de exclusión las deja afuera — y meterlas
    // agregaría un viaje a GoTrue en la página más importante para SEO.
    // En Next, '/caja/:path*' NO matchea '/caja': por eso van los dos.
    '/dashboard',
    '/grilla',
    '/canchas',
    '/deudas',
    '/metricas',
    '/analiticas',
    '/reportes',
    '/staff',
    '/caja',
    '/caja/:path*',
    '/jugadores',
    '/jugadores/:path*',
    '/reservas',
    '/reservas/:path*',
    '/abonados',
    '/abonados/:path*',
    '/settings',
    '/settings/:path*',
    '/torneos',
    '/torneos/:path*',
    '/onboarding',
    '/onboarding/:path*',
    '/select-tenant',
    '/super-admin',
    '/super-admin/:path*',
    '/mis-reservas',
    '/perfil',
    '/configuracion',
    '/eliminar-cuenta',
    '/reserva/:path*',
    '/reset-password',
    '/aceptar-terminos',
    '/suspended',
    '/reactivar',
    // Los formularios de acceso entran para que una sesión VENCIDA se renueve
    // acá en vez de morir. Ojo: visitarlos no poda por sí solo los fragmentos
    // huérfanos — la poda ocurre cuando se ESCRIBE la sesión (login exitoso,
    // renovación o cierre). Medido en la app corriendo el 2026-09-04.
    '/login',
    '/ingresar',
  ],
}

/**
 * Prefijos de UI donde corresponde refrescar la sesión.
 *
 * El `matcher` de arriba es un SUPERCONJUNTO: incluye las rutas de API que solo
 * quieren rate limit y Fetch-Metadata. Este predicado es la segunda barrera, y
 * sobre todo el candado que impide que alguien meta la portada o una ficha
 * pública al camino de refresco sin darse cuenta: `/`, `/explorar` y `/[slug]`
 * son ISR y no leen cookies en el server — si entraran acá, perderían el cacheo.
 * Cubierto por tests/unit/root-middleware.test.ts.
 */
const SESSION_REFRESH_PREFIXES = [
  '/dashboard',
  '/grilla',
  '/canchas',
  '/deudas',
  '/metricas',
  '/analiticas',
  '/reportes',
  '/staff',
  '/caja',
  '/jugadores',
  '/reservas',
  '/abonados',
  '/settings',
  '/torneos',
  '/onboarding',
  '/select-tenant',
  '/super-admin',
  '/mis-reservas',
  '/perfil',
  '/configuracion',
  '/eliminar-cuenta',
  '/reserva',
  '/reset-password',
  '/aceptar-terminos',
  '/suspended',
  '/reactivar',
  '/login',
  '/ingresar',
] as const

export function needsSessionRefresh(path: string): boolean {
  return SESSION_REFRESH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

export async function middleware(req: NextRequest): Promise<NextResponse | Response> {
  const path = req.nextUrl.pathname
  const ip = parseClientIp(req.headers)

  // Trace correlation id: reuse incoming or mint a fresh one, propagate
  // downstream via request headers and echo it on the response.
  const requestId = resolveRequestId(req.headers.get('x-request-id'))
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  // Fetch Metadata isolation (CSRF / cross-origin-abuse defence-in-depth on the
  // money path). Block state-changing requests to payment/cancellation
  // endpoints that the browser stamps as cross-site. Webhooks and OAuth/auth
  // callbacks are excluded by isSensitiveMutationPath. See docs/security-decisions.md.
  if (
    isSensitiveMutationPath(path) &&
    isForbiddenCrossSiteMutation(req.method, req.headers.get('sec-fetch-site'))
  ) {
    const res = NextResponse.json(
      { error: { code: 'CROSS_SITE_FORBIDDEN', message: 'Origen de la solicitud no permitido.' } },
      { status: 403 },
    )
    res.headers.set('x-request-id', requestId)
    return res
  }

  let policy: 'publicAvailability' | 'authVerify' | null = null
  if (path.startsWith('/api/public/')) policy = 'publicAvailability'
  else if (path.startsWith('/api/auth/') || path === '/verify') policy = 'authVerify'

  if (policy) {
    const outcome = await enforce(policy, ip)
    if (!outcome.ok) {
      const res = rateLimit429(outcome, requestId)
      res.headers.set('x-request-id', requestId)
      return res
    }
  }

  // Refresco de sesión: solo rutas de UI. Va DESPUÉS del Fetch-Metadata y del
  // rate limit a propósito — una request rechazada por cualquiera de los dos no
  // debe gastar un viaje a GoTrue, ni permitirle a un atacante rate-limiteado
  // generar tráfico contra él.
  const res = needsSessionRefresh(path)
    ? await refreshSessionCookies(req, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } })

  // El x-request-id va AL FINAL, obligatoriamente: `refreshSessionCookies`
  // rehace la respuesta dentro de su `setAll`, así que descartaría un header
  // seteado antes.
  res.headers.set('x-request-id', requestId)
  return res
}
