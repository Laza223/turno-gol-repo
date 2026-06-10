'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import {
  verifyPin,
  verifyPinCookie,
  buildPinCookie,
  COOKIE_NAME,
  COOKIE_TTL_MS,
} from '@/modules/auth/pin'
import { enforce } from '@/shared/rate-limit'
import { withTenantContext } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'

export async function checkPinSessionAction(): Promise<boolean> {
  const jar = cookies()
  const value = jar.get(COOKIE_NAME)?.value
  return value ? verifyPinCookie(value) : false
}

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; error: string; locked: true; retryAtMs: number }
  | { ok: false; error: string; locked: false; attemptsLeft?: number }

export async function verifyPinAction(pin: string): Promise<VerifyPinResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { ok: false, error: 'Tenant no encontrado.', locked: false }

  // Brute-force defense (B6 P1 fix): 5 attempts per 5 minutes per tenant.
  // 4-digit PIN = 10k combinations; without this, exhaustive search trivial.
  // Fail closed via policy: Upstash outage denies new attempts (safer).
  const rl = await enforce('pinAttempts', tenant.id)
  if (!rl.ok) {
    const retryMin = Math.max(1, Math.ceil((rl.reset - Date.now()) / 60_000))
    return {
      ok: false,
      error: `Demasiados intentos fallidos. Volvé a intentar en ${retryMin} min.`,
      locked: true,
      retryAtMs: rl.reset,
    }
  }

  const hash = tenant.settings.staff_pin_hash ?? null
  if (!hash) return { ok: false, error: 'PIN no configurado. Configuralo en Ajustes → Seguridad.', locked: false }

  const ok = await verifyPin(pin, hash)
  if (!ok) {
    // rl.remaining is always number per RateLimitOutcome; expose it so the UI
    // can show "Te quedan N intentos" when N <= 2.
    withTenantContext(tenant.id, (tx) =>
      insertAuditLog(tx, {
        tenantId: tenant.id,
        actorId: user.staffUserId!,
        actorType: 'staff',
        action: 'pin.verify_failed',
        resourceType: 'tenant',
        resourceId: tenant.id,
      }),
    ).catch(() => {})
    return {
      ok: false,
      error: 'PIN incorrecto.',
      locked: false,
      attemptsLeft: rl.remaining,
    }
  }

  const jar = cookies()
  jar.set({
    name: COOKIE_NAME,
    value: buildPinCookie(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
    path: '/',
  })

  withTenantContext(tenant.id, (tx) =>
    insertAuditLog(tx, {
      tenantId: tenant.id,
      actorId: user.staffUserId!,
      actorType: 'staff',
      action: 'pin.verify_success',
      resourceType: 'tenant',
      resourceId: tenant.id,
    }),
  ).catch(() => {})

  return { ok: true }
}
