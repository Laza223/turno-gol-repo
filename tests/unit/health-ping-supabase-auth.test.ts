/**
 * La sonda de salud de Supabase Auth llamaba a `/auth/v1/health` SIN el header
 * `apikey`, que GoTrue exige en todos sus endpoints. Resultado: 401 siempre, o
 * sea `supabase-auth: down` cada 5 minutos desde el día uno — con el login
 * funcionando perfecto. Visto en los logs de Railway el 2026-08-21 mientras se
 * diagnosticaba otra cosa.
 *
 * Una alarma que no puede apagarse nunca es peor que no tener alarma: entrena a
 * ignorar el canal donde después aparece un problema real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pingSupabaseAuth } from '@/shared/jobs/workers/health-ping.worker'

const env = process.env as Record<string, string | undefined>
const originalFetch = globalThis.fetch

beforeEach(() => {
  env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://proyecto.supabase.co'
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'anon-de-prueba'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('pingSupabaseAuth', () => {
  it('manda la anon key en el header apikey', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingSupabaseAuth()

    expect(res.status).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://proyecto.supabase.co/auth/v1/health')
    expect((init.headers as Record<string, string>).apikey).toBe('anon-de-prueba')
  })

  it('un 401 de verdad sigue reportándose como caído', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch

    const res = await pingSupabaseAuth()

    expect(res.status).toBe('down')
    expect(res.error).toBe('HTTP 401')
  })

  it('sin anon key no inventa una caída: se declara no configurada', async () => {
    delete env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await pingSupabaseAuth()

    expect(res.status).toBe('ok')
    expect(res.note).toBe('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
