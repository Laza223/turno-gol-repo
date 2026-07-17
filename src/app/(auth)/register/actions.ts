'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { getWorkerDb } from '@/shared/db/client'
import { staffUsers } from '@/shared/db/schema'
import { signUpStaff } from '@/modules/auth/auth.service'
import { passwordSchema } from '@/modules/auth/password'
import { enforce } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'

// International mobile number validation (+ code + national digits)
const phoneRegex = /^\+?[1-9][0-9\s-]{7,24}$/

const schema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email({ message: 'Ingresá un email válido' })),
    firstName: z.string().trim().min(2, 'Ingresá tu nombre').max(80),
    lastName: z.string().trim().min(2, 'Ingresá tu apellido').max(80),
    phone: z.string().trim().regex(phoneRegex, 'Ingresá un número de teléfono válido'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

type FieldKey = 'email' | 'firstName' | 'lastName' | 'phone' | 'password' | 'confirmPassword' | '_form'

export type RegisterState =
  | { status: 'idle' }
  | { status: 'confirm'; email: string }
  | { status: 'existing'; email: string }
  | { status: 'error'; fieldErrors: Partial<Record<FieldKey, string>> }

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    const errs: Partial<Record<FieldKey, string>> = {}
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as FieldKey
      if (k && !errs[k]) errs[k] = issue.message
    }
    return { status: 'error', fieldErrors: errs }
  }

  // Alta de bajo volumen, sin captcha (v1): rate-limit por IP (fail closed).
  const ip = parseClientIp(await headers() as unknown as Headers)
  const rl = await enforce('authRegister', ip)
  if (!rl.ok) {
    return {
      status: 'error',
      fieldErrors: { _form: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' },
    }
  }

  // Si ya existe una cuenta con ese email no creamos otra: lo informamos para que
  // inicie sesión y agregue otro complejo desde el panel (US-ONB-001 / Flujo 1).
  // caza-bugs (6ta oleada): staff_users tiene RLS relacional (staff_see_same_tenant_staff,
  // 006_rls_policies.sql) — acá corre ANTES de que exista ningún tenant_id, así
  // que bajo el pool restringido turnogol_app la policy nunca matchea y esto
  // devolvía SIEMPRE 0 filas. Pool de servicio, mismo patrón que
  // getOrCreateStaffUser en auth.service.ts. Resiliente: si la verificación
  // falla no bloqueamos el alta y seguimos al signUp.
  try {
    const existing = await getWorkerDb()
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.email, parsed.data.email))
      .limit(1)
    if (existing[0]) {
      return { status: 'existing', email: parsed.data.email }
    }
  } catch {
    // continúa con el alta
  }

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const result = await signUpStaff(
    {
      email: parsed.data.email,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
    },
    // El `?next=` es ignorado por la rama staff del callback (provisionAndRouteStaff
    // calcula el path), pero es OBLIGATORIO: da el `?` separador para que
    // confirmation.html pueda concatenar `&token_hash=…` sobre `{{ .RedirectTo }}`
    // sin malformar la URL. Sin él, el link de confirmación del staff se rompería.
    `${origin}/api/auth/callback?next=${encodeURIComponent('/onboarding')}`,
  )
  if (!result.ok) {
    return {
      status: 'error',
      fieldErrors: { _form: 'No pudimos crear la cuenta. Probá de nuevo.' },
    }
  }
  // enable_confirmations=true → signUp no crea sesión: confirmar email primero.
  return { status: 'confirm', email: parsed.data.email }
}
