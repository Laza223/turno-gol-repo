import type { NextResponse } from 'next/server'
import { enforce, rateLimit429 } from './apply'
import type { PolicyName } from './policies'
import { getRequestContext } from '@/shared/lib/request-context'

/**
 * Apply a rate-limit policy with the given key. Returns:
 *   - `null` if allowed (caller proceeds).
 *   - A `429` Response if throttled (caller returns it directly).
 *
 * Usage:
 *   const throttled = await guard('adminCrud', tenantId)
 *   if (throttled) return throttled
 *
 * A diferencia de `apply.ts` (que debe quedar edge-safe para middleware.ts,
 * donde `node:async_hooks` no existe), las 18 rutas que llaman a `guard()`
 * corren en runtime nodejs — `getRequestContext()` está poblado y el 429 debe
 * llevar el mismo `request_id` que cualquier otro error armado con
 * `@/shared/api-error` en la misma request (hallazgo #6, campaña de mutación).
 */
export async function guard(name: PolicyName, key: string): Promise<NextResponse | null> {
  const r = await enforce(name, key)
  if (!r.ok) return rateLimit429(r, getRequestContext()?.requestId) as unknown as NextResponse
  return null
}
