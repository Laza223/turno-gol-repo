'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { captureMessage } from '@/lib/sentry'
import { getWorkerDb } from '@/shared/db/client'
import { staffUsers } from '@/shared/db/schema'
import { signUpStaff, undoStaffSignup } from '@/modules/auth/auth.service'
import { extractRealAuthUser } from '@/modules/auth/auth.middleware'
import { passwordSchema } from '@/modules/auth/password'
import { referralCodeSchema } from '@/modules/referrals/referral.schema'
import { signupDraftSchema } from '@/modules/onboarding/signup-draft.schema'
import {
  createComplexFromDraft,
  markGoogleOwnerProfile,
  validateDraft,
  type CreateComplexResult,
} from '@/modules/onboarding/signup.service'
import { enforce } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'
import {
  buildOwnerIntentCookie,
  OWNER_INTENT_COOKIE_NAME,
  OWNER_INTENT_COOKIE_TTL_MS,
} from '@/shared/security/owner-intent-cookie'

// Ninguna action navega con `redirect()`: con la cookie de sesión recién puesta, el redirect
// server-side perdió una carrera en WebKit móvil (fix #158, ver login/actions.ts). El cliente
// hace `window.location.assign(path)`.
export type SignupResult =
  | { ok: true; path: string }
  | {
      ok: false
      error: string
      field?: 'name' | 'email' | 'password' | 'phone' | 'form'
      existing?: boolean
    }

const DONE_PATH = '/onboarding/listo'
// Complejo creado pero sin terminar de armar: el wizard sigue desde el paso guardado.
const WIZARD_PATH = '/onboarding'
const RATE_LIMITED = 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'

const mailSignupSchema = z.object({
  draft: signupDraftSchema,
  name: z.string().trim().min(2, 'Ingresá tu nombre').max(80, 'Máximo 80 caracteres'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Ingresá un email válido' })),
  password: passwordSchema,
})

function fieldOf(
  issue: z.core.$ZodIssue,
): NonNullable<Extract<SignupResult, { ok: false }>['field']> {
  const [first, second] = issue.path
  if (first === 'name' || first === 'email' || first === 'password') return first
  if (first === 'draft' && second === 'phone') return 'phone'
  return 'form'
}

function invalid(error: z.ZodError): SignupResult {
  const issue = error.issues[0]
  return {
    ok: false,
    error: issue?.message ?? 'Datos inválidos',
    field: issue ? fieldOf(issue) : 'form',
  }
}

async function clientIp(): Promise<string> {
  return parseClientIp((await headers()) as unknown as Headers)
}

/** El borrador no se puede completar: el mensaje es del servicio, el campo es el formulario. */
function failed(result: Extract<CreateComplexResult, { ok: false }>): SignupResult {
  return { ok: false, error: result.error, field: 'form' }
}

/**
 * Alta con mail: crea la cuenta (con login) y el complejo de una vez. Si el complejo no se
 * pudo crear, deshace la cuenta para que el mismo mail se pueda volver a usar; si el complejo
 * ya existe (quedó a medias), la cuenta se queda y el dueño sigue en el wizard.
 */
export async function signUpWithMailAction(input: unknown): Promise<SignupResult> {
  const parsed = mailSignupSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { draft, name, email, password } = parsed.data

  // Alta de bajo volumen, sin captcha (v1): rate-limit por IP (fail closed).
  const rl = await enforce('authRegister', await clientIp())
  if (!rl.ok) return { ok: false, error: RATE_LIMITED, field: 'form' }

  // Un borrador que no cierra se rechaza ANTES de crear la cuenta y mandar el mail.
  const checked = validateDraft(draft)
  if (!checked.ok) return { ok: false, error: checked.error, field: 'form' }

  // Si ya existe una cuenta con ese mail no creamos otra. `staff_users` tiene RLS relacional
  // y acá no hay tenant: pool de servicio. Resiliente: si la consulta falla seguimos, y el
  // UNIQUE de `signUpStaff` (`email_exists`) lo ataja igual.
  const existingResult = {
    ok: false,
    error: 'Ese mail ya tiene una cuenta. Ingresá con ese mail o usá otro.',
    field: 'email',
    existing: true,
  } as const
  try {
    const found = await getWorkerDb()
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1)
    if (found[0]) return existingResult
  } catch {
    // continúa con el alta
  }

  // Referidos (B2): un código con formato roto se descarta en silencio, nunca frena el alta.
  const referralCode =
    draft.referralCode && referralCodeSchema.safeParse(draft.referralCode).success
      ? draft.referralCode
      : null

  const account = await signUpStaff({
    email,
    password,
    firstName: name,
    phone: draft.phone,
    referralCode,
  })
  if (!account.ok) {
    // GoTrue expone `error.code`: los conocidos van al campo que corresponde.
    if (account.code === 'weak_password') {
      return {
        ok: false,
        error:
          'Esa contraseña es fácil de adivinar o está en una base de datos de filtraciones conocidas. Probá con otra.',
        field: 'password',
      }
    }
    if (account.code === 'user_already_exists' || account.code === 'email_exists') {
      return existingResult
    }
    if (account.code === 'email_address_invalid') {
      return { ok: false, error: 'Ese email no es válido.', field: 'email' }
    }
    // Código no mapeado: genérico al usuario, el motivo real queda auditable en Sentry.
    captureMessage('signUpWithMailAction: código de error sin mapear', {
      level: 'warning',
      extra: { code: account.code, reason: account.error },
    })
    return { ok: false, error: 'No pudimos crear la cuenta. Probá de nuevo.', field: 'form' }
  }

  const complex = await createComplexFromDraft({
    staffUserId: account.staffUserId,
    authUserId: account.authUserId,
    email,
    draft,
  })
  if (complex.ok) return { ok: true, path: DONE_PATH }

  if (complex.tenantCreated) {
    captureMessage('signUpWithMailAction: complejo a medias, sigue en el wizard', {
      level: 'warning',
      extra: { staffUserId: account.staffUserId },
    })
    return { ok: true, path: WIZARD_PATH }
  }

  // Sin complejo no hay nada que proteger: cuenta y sesión se deshacen y el mail queda libre.
  await undoStaffSignup(account.authUserId, account.staffUserId)
  await (await createClient()).auth.signOut({ scope: 'local' })
  return failed(complex)
}

/**
 * Arma la URL de Google para el alta de un dueño. Antes deja la cookie firmada de intención
 * "owner": es lo que le dice al callback que esta cuenta de Google es de un complejo y no de
 * un jugador (ver `owner-intent-cookie.ts`). La navegación a Google la hace el cliente.
 */
export async function startGoogleOwnerSignupAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent('/register/finalizar')}`

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Sin esto, quien tiene abierta la cuenta de Google equivocada (la de jugador) no puede elegir otra.
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error || !data?.url) {
    return { ok: false, error: 'No pudimos conectar con Google. Probá con tu mail.' }
  }

  // Los flags van escritos en el bloque (lo exige `cookie-flags.test.ts`).
  ;(await cookies()).set({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    name: OWNER_INTENT_COOKIE_NAME,
    value: buildOwnerIntentCookie(),
    maxAge: Math.floor(OWNER_INTENT_COOKIE_TTL_MS / 1000),
  })
  return { ok: true, url: data.url }
}

/**
 * Cierre del alta con Google: el callback ya dejó la sesión de staff. Guarda el celular, da
 * el mail por verificado (solo si Google lo verificó) y crea el complejo. Idempotente: si ya
 * lo creó, devuelve el mismo destino.
 */
export async function finalizeGoogleSignupAction(input: unknown): Promise<SignupResult> {
  const draft = signupDraftSchema.safeParse(input)
  if (!draft.success) {
    const issue = draft.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Datos inválidos',
      field: issue?.path[0] === 'phone' ? 'phone' : 'form',
    }
  }

  // Identidad REAL (sin impersonación): un super admin no da de alta complejos acá.
  const user = await extractRealAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId || !user.email) {
    return { ok: false, error: 'Tu sesión venció. Volvé a continuar con Google.', field: 'form' }
  }

  const rl = await enforce('authRegister', await clientIp())
  if (!rl.ok) return { ok: false, error: RATE_LIMITED, field: 'form' }

  // El mail solo se da por verificado si la sesión es de Google con el mail verificado por
  // Google. Una cuenta de mail sin verificar que llame a esta action no puede saltearse la
  // verificación.
  const { data } = await (await createClient()).auth.getUser()
  const googleVerified = (data?.user?.identities ?? []).some(
    (i) => i.provider === 'google' && i.identity_data?.email_verified === true,
  )
  await markGoogleOwnerProfile(user.staffUserId, draft.data.phone, googleVerified)

  const complex = await createComplexFromDraft({
    staffUserId: user.staffUserId,
    authUserId: user.id,
    email: user.email,
    draft: draft.data,
  })
  if (complex.ok) return { ok: true, path: DONE_PATH }
  if (complex.tenantCreated) {
    captureMessage('finalizeGoogleSignupAction: complejo a medias, sigue en el wizard', {
      level: 'warning',
      extra: { staffUserId: user.staffUserId },
    })
    return { ok: true, path: WIZARD_PATH }
  }
  return failed(complex)
}
