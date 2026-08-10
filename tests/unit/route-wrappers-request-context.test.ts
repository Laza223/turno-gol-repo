import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Candado de B5 (2026-08-09) — regresión "el contexto de request no lo abre nadie".
 *
 * `runRequestObservability` es lo ÚNICO que puebla el AsyncLocalStorage de
 * `request-context`, y no lo llamaba nadie. Los dos lectores sí estaban vivos,
 * así que el efecto en producción era silencioso y permanente:
 *
 *   - `logger.ts` emitía cada línea sin requestId / tenantId / userId.
 *   - `api-error.ts` respondía `"meta": { "request_id": null }` en TODOS los
 *     errores de la API, mientras doc15 §2.3 promete el id para correlacionar.
 *   - `tagSession` (que auth.middleware sí llama) no-opeaba: sin store activo,
 *     `updateRequestContext` no tiene nada que mutar.
 *
 * POR QUÉ NO LO VIO LA SUITE QUE YA EXISTÍA: `observability-middleware.test.ts`
 * prueba `tagSession` abriendo el contexto A MANO con `runWithRequestContext`.
 * Verifica la pieza, y la pieza andaba perfecto — lo que faltaba era el cable
 * entre la pieza y el request real. Por eso este archivo prueba el WRAPPER
 * (comportamiento observable de punta a punta), no el helper.
 */

const setTag = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  setTag: (key: string, value: unknown) => setTag(key, value),
}))

const h = vi.hoisted(() => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: h.extractAuthUser,
  tagSession: vi.fn(),
}))

import { withAuth } from '@/server/middleware/with-auth'
import { getRequestContext } from '@/shared/lib/request-context'

const REQ_ID = 'req-de-prueba-123'

function req(): NextRequest {
  return new NextRequest('https://turnogol.app/api/whatever', {
    headers: { 'x-request-id': REQ_ID },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('withAuth abre el contexto de request', () => {
  it('el handler ve el requestId del header x-request-id', async () => {
    h.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p-1' })

    let seen: string | undefined
    const route = withAuth(async () => {
      seen = getRequestContext()?.requestId
      return NextResponse.json({ ok: true })
    })

    await route(req())

    expect(seen).toBe(REQ_ID)
  })

  it('inventa un requestId cuando el header no viene', async () => {
    h.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p-1' })

    let seen: string | undefined
    const route = withAuth(async () => {
      seen = getRequestContext()?.requestId
      return NextResponse.json({ ok: true })
    })

    await route(new NextRequest('https://turnogol.app/api/whatever'))

    // 12 chars alfanuméricos, el formato de `newRequestId`.
    expect(seen).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('el 401 sale con meta.request_id POBLADO, no null', async () => {
    // Este es el síntoma exacto que el bug producía en producción: el rechazo
    // se arma con `unauthorized()` de api-error.ts, que lee el contexto. Si el
    // wrapper no lo abre, el cliente recibe null y no hay nada que correlacionar.
    h.extractAuthUser.mockResolvedValue(null)

    const route = withAuth(async () => NextResponse.json({ ok: true }))
    const res = await route(req())
    const body = (await res.json()) as { meta: { request_id: string | null } }

    expect(res.status).toBe(401)
    expect(body.meta.request_id).toBe(REQ_ID)
  })

  it('etiqueta el request_id en Sentry', async () => {
    h.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p-1' })

    const route = withAuth(async () => NextResponse.json({ ok: true }))
    await route(req())

    expect(setTag).toHaveBeenCalledWith('request_id', REQ_ID)
  })

  it('el contexto no sobrevive al request (no se filtra entre requests)', async () => {
    h.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p-1' })

    const route = withAuth(async () => NextResponse.json({ ok: true }))
    await route(req())

    expect(getRequestContext()).toBeUndefined()
  })
})

/**
 * `withTenant`, `withBillingTenant` y `withPlayer` comparten el mismo cableado
 * pero exigen montar Supabase + pool + RLS para ejercitarse. El costo de ese
 * andamio no compra nada acá: lo que puede volver a romperse es que alguien
 * saque la llamada, y eso se ve leyendo el archivo. `withAuth` arriba ya prueba
 * que el mecanismo funciona de verdad; esto prueba que los otros tres lo usan.
 */
describe('los 4 wrappers de route handler llaman a runRequestObservability', () => {
  const CASES = [
    { file: 'with-auth.ts', wrappers: ['withAuth'] },
    { file: 'with-player.ts', wrappers: ['withPlayer'] },
    { file: 'with-tenant.ts', wrappers: ['withTenant', 'withBillingTenant'] },
  ]

  for (const { file, wrappers } of CASES) {
    it(`${file} — ${wrappers.join(' + ')}`, () => {
      const source = readFileSync(
        join(process.cwd(), 'src/server/middleware', file),
        'utf-8',
      )

      for (const wrapper of wrappers) {
        expect(source, `falta \`export function ${wrapper}\` en ${file}`).toContain(
          `export function ${wrapper}(`,
        )
      }

      // Una llamada por wrapper exportado en el archivo.
      const calls = source.match(/runRequestObservability\(req, \(\) => run\(req\)\)/g) ?? []
      expect(
        calls.length,
        `${file} debería envolver sus ${wrappers.length} wrapper(s) en runRequestObservability`,
      ).toBe(wrappers.length)
    })
  }
})
