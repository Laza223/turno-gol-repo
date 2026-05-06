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

export async function checkPinSessionAction(): Promise<boolean> {
  const jar = cookies()
  const value = jar.get(COOKIE_NAME)?.value
  return value ? verifyPinCookie(value) : false
}

export type VerifyPinResult = { ok: true } | { ok: false; error: string }

export async function verifyPinAction(pin: string): Promise<VerifyPinResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { ok: false, error: 'Tenant no encontrado.' }

  const hash = tenant.settings.staff_pin_hash ?? null
  if (!hash) return { ok: false, error: 'PIN no configurado. Configuralo en Ajustes → Seguridad.' }

  const ok = await verifyPin(pin, hash)
  if (!ok) return { ok: false, error: 'PIN incorrecto.' }

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

  return { ok: true }
}
