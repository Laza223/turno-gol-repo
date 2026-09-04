import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * El middleware RAÍZ no tenía tests: solo los tenían sus ayudantes
 * (fetch-metadata, rate-limit/apply). Con el refresco de sesión adentro, eso
 * dejó de ser aceptable — es código nuevo en el camino de TODAS las páginas
 * autenticadas.
 *
 * El caso más importante es el candado: que la portada y las fichas públicas
 * NO entren al refresco. Son ISR y no leen cookies en el server; si entraran,
 * perderían el cacheo y le agregarían un viaje a GoTrue a la página más
 * importante para posicionamiento.
 */

vi.mock('@/lib/supabase/middleware', () => ({
  refreshSessionCookies: vi.fn(async (_req: NextRequest, headers: Headers) =>
    NextResponse.next({ request: { headers } }),
  ),
}))

vi.mock('@/shared/rate-limit/apply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/rate-limit/apply')>()
  return { ...actual, enforce: vi.fn(async () => ({ ok: true }) as never) }
})

import { middleware, needsSessionRefresh } from '../../middleware'
import { refreshSessionCookies } from '@/lib/supabase/middleware'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'

function req(
  path: string,
  init?: { method?: string; headers?: Record<string, string> },
): NextRequest {
  return new NextRequest(`https://turnogol.app${path}`, init)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('needsSessionRefresh', () => {
  it.each([
    '/',
    '/explorar',
    '/river-plate-futbol-5',
    '/river-plate-futbol-5/reservar',
    '/precios',
    '/para-complejos',
    '/blog',
    '/register',
    '/forgot-password',
    '/api/public/availability',
    '/api/webhooks/mercadopago',
  ])('NO refresca %s (ISR, pública o anónima)', (path) => {
    expect(needsSessionRefresh(path)).toBe(false)
  })

  it.each([
    '/dashboard',
    '/grilla',
    '/caja',
    '/caja/cantina',
    '/jugadores/abc-123',
    '/settings/equipo',
    '/torneos/abc/fixture',
    '/onboarding',
    '/onboarding/listo',
    '/select-tenant',
    '/super-admin',
    '/super-admin/tenants/abc',
    '/mis-reservas',
    '/perfil',
    '/reserva/abc/exito',
    '/reset-password',
    '/suspended',
    '/login',
    '/ingresar',
  ])('SÍ refresca %s', (path) => {
    expect(needsSessionRefresh(path)).toBe(true)
  })

  it('no matchea por prefijo de string suelto: /dashboardero no es /dashboard', () => {
    expect(needsSessionRefresh('/dashboardero')).toBe(false)
    expect(needsSessionRefresh('/loginz')).toBe(false)
  })
})

describe('middleware raíz', () => {
  it('no llama al refresco en una ruta pública de API', async () => {
    await middleware(req('/api/public/availability'))
    expect(refreshSessionCookies).not.toHaveBeenCalled()
  })

  it('llama al refresco en una ruta de panel', async () => {
    await middleware(req('/dashboard'))
    expect(refreshSessionCookies).toHaveBeenCalledTimes(1)
  })

  it('la respuesta lleva el x-request-id incluso cuando el refresco rehizo la respuesta', async () => {
    // Regresión del ORDEN: `refreshSessionCookies` rehace la respuesta dentro
    // de su `setAll`, así que un header seteado antes se perdería.
    vi.mocked(refreshSessionCookies).mockImplementationOnce(async () => {
      const res = NextResponse.next()
      res.cookies.set('sb-ref-auth-token.0', 'nuevo')
      return res
    })
    const res = await middleware(req('/dashboard'))
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('sb-ref-auth-token.0')
  })

  it('propaga el x-request-id entrante', async () => {
    const res = await middleware(
      req('/dashboard', { headers: { 'x-request-id': '11111111-1111-4111-8111-111111111111' } }),
    )
    expect(res.headers.get('x-request-id')).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('un rate limit excedido corta ANTES del refresco', async () => {
    vi.mocked(enforce).mockResolvedValueOnce({
      ok: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 1000,
      unavailable: false,
    })
    const res = await middleware(req('/api/auth/callback'))
    expect(res.status).toBe(429)
    expect(refreshSessionCookies).not.toHaveBeenCalled()
    expect(rateLimit429).toBeDefined()
  })

  it('un POST cross-site a una ruta de plata sigue dando 403 y no refresca', async () => {
    const res = await middleware(
      req('/api/billing/checkout', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }),
    )
    expect(res.status).toBe(403)
    expect(refreshSessionCookies).not.toHaveBeenCalled()
  })
})
