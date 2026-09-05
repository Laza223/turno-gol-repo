/**
 * La sonda declaraba `resend: down` con el PRIMER fetch que no llegaba. Como
 * contra `api.resend.com` se pierde cerca del 3% de las conexiones desde el
 * worker, eso producía 9 alertas por día en Sentry (2026-09-04) con Resend
 * arriba, el dominio verificado y los mails entregándose.
 *
 * Un timeout no prueba que el servicio esté caído; un status HTTP sí. Estos
 * tests fijan esa distinción: el fallo de RED se confirma antes de reportarse,
 * el fallo HTTP no se reintenta nunca.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pingResend, pingSupabaseAuth } from '@/shared/jobs/workers/health-ping.worker'

const env = process.env as Record<string, string | undefined>
const originalFetch = globalThis.fetch

/** Lo que tira `AbortSignal.timeout` cuando la petición se pasa del límite. */
function timeout(): Error {
  return new Error('The operation was aborted due to timeout')
}

beforeEach(() => {
  env['RESEND_API_KEY'] = 're_de_prueba'
  env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://proyecto.supabase.co'
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'anon-de-prueba'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('pingResend', () => {
  it('un timeout aislado NO es una caída: reintenta y reporta ok', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingResend()

    expect(res.status).toBe('ok')
    expect(res.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('si se cortan TODOS los intentos sí reporta caída, y dice cuántos fueron', async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeout())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingResend()

    expect(res.status).toBe('down')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // El contador es lo que distingue un pico de una caída sostenida cuando el
    // evento se lee en Sentry meses después.
    expect(res.error).toContain('3 intentos')
    expect(res.error).toContain('aborted due to timeout')
  })

  it('un 401 es la respuesta del servicio, no un pico: alerta sin reintentar', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingResend()

    expect(res.status).toBe('down')
    expect(res.error).toBe('HTTP 401')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un 429 sigue siendo "arriba pero rate-limited", y tampoco reintenta', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingResend()

    expect(res.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('pingSupabaseAuth', () => {
  it('comparte el mismo reintento: el blip de red no alerta', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingSupabaseAuth()

    expect(res.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
