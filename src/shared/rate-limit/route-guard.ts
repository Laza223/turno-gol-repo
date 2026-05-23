import { NextResponse } from 'next/server'
import { enforce, rateLimit429 } from './apply'
import type { PolicyName } from './policies'

/**
 * Apply a rate-limit policy with the given key. Returns:
 *   - `null` if allowed (caller proceeds).
 *   - A `429` Response if throttled (caller returns it directly).
 *
 * Usage:
 *   const throttled = await guard('adminCrud', tenantId)
 *   if (throttled) return throttled
 */
export async function guard(name: PolicyName, key: string): Promise<NextResponse | null> {
  const r = await enforce(name, key)
  if (!r.ok) return rateLimit429(r) as unknown as NextResponse
  return null
}
