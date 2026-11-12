'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { z } from 'zod'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { passwordSchema } from '@/modules/auth/password'
import { signupDraftSchema } from '@/modules/onboarding/signup-draft.schema'
import { cn } from '@/lib/utils'
import { StepScreen } from '@/app/onboarding/components/StepScreen'
import { SIGNUP_INPUT_CLASS } from '@/app/onboarding/components/signup-style'
import type { SignupResult } from './actions'
import { clearSignupDraft, patchSignupDraft, type SignupDraftData } from './signup-draft'

type Field = 'name' | 'email' | 'password' | 'phone' | 'form'
type GoogleResult = { ok: true; url: string } | { ok: false; error: string }

type Props = {
  draft: SignupDraftData
  /** Código de referido de esta visita (o el guardado), ya validado. */
  referralCode: string | null
  /** Las actions llegan por prop: los módulos `'use server'` no se importan como valor acá. */
  signUpAction: (input: unknown) => Promise<SignupResult>
  googleAction: () => Promise<GoogleResult>
  onBack: () => void
  /** Google no deja entrar desde el navegador interno de Instagram: ahí va solo el mail. */
  inAppBrowser?: boolean
  /** Error con el que se llega (ej. volvió de Google con un mail de jugador). */
  initialError?: string | null
}

const OPTION =
  'flex min-h-16 w-full items-center gap-3 rounded-xl border border-input bg-white/4 p-4 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60'

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

/**
 * Última pantalla del alta: celular (obligatorio, es el WhatsApp del complejo) y dos
 * caminos para crear la cuenta. Google es lo más corto (sin contraseña); el mail queda
 * siempre. Ninguno guarda la contraseña: viaja en el submit y no toca el borrador.
 *
 * Éxito de mail: `window.location.assign`, nunca `router.push` ni `redirect()` (la
 * cookie de sesión recién puesta perdía la carrera contra WebKit móvil, #158).
 */
export function StepCuenta({
  draft,
  referralCode,
  signUpAction,
  googleAction,
  onBack,
  inAppBrowser = false,
  initialError = null,
}: Props) {
  const [phone, setPhone] = useState(draft.phone ?? '')
  const [mailOpen, setMailOpen] = useState(inAppBrowser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>(
    initialError ? { form: initialError } : {},
  )
  const [existing, setExisting] = useState(false)
  const [pending, setPending] = useState<'google' | 'mail' | null>(null)

  function fail(field: Field, message: string) {
    setErrors({ [field]: message })
    setPending(null)
  }

  /** El borrador completo, o null si falta algo del complejo o el celular no sirve. */
  function readyDraft() {
    const phoneCheck = signupDraftSchema.shape.phone.safeParse(phone)
    if (!phoneCheck.success) {
      fail('phone', 'Escribí un celular válido, con código de área.')
      return null
    }
    const parsed = signupDraftSchema.safeParse({ ...draft, phone, referralCode })
    if (!parsed.success) {
      fail('form', 'Faltan respuestas sobre tu complejo. Volvé atrás y revisalas.')
      return null
    }
    return parsed.data
  }

  async function continueWithGoogle() {
    setExisting(false)
    const complete = readyDraft()
    if (!complete) return
    setErrors({})
    setPending('google')
    // El borrador viaja por localStorage: /register/finalizar lo lee al volver de Google.
    patchSignupDraft({ phone: complete.phone, referralCode })
    try {
      const result = await googleAction()
      if (!result.ok) return fail('form', result.error)
      window.location.assign(result.url)
    } catch {
      fail('form', 'No pudimos conectar con Google. Probá con tu mail.')
    }
  }

  async function createWithMail() {
    setExisting(false)
    const complete = readyDraft()
    if (!complete) return
    if (name.trim().length < 2) return fail('name', 'Escribí tu nombre.')
    if (!emailSchema.safeParse(email).success) return fail('email', 'Ingresá un mail válido.')
    const passwordCheck = passwordSchema.safeParse(password)
    if (!passwordCheck.success) {
      return fail('password', passwordCheck.error.issues[0]?.message ?? 'Contraseña inválida.')
    }
    setErrors({})
    setPending('mail')
    patchSignupDraft({ phone: complete.phone, referralCode })
    const result = await signUpAction({ draft: complete, name: name.trim(), email, password })
    if (result.ok) {
      clearSignupDraft()
      window.location.assign(result.path)
      return
    }
    setExisting(result.existing === true)
    fail(result.field ?? 'form', result.error)
  }

  return (
    <StepScreen
      title="Último paso: tu cuenta"
      accent="tu cuenta"
      description="Con tu cuenta entrás al panel de tu complejo."
      nextLabel="Crear mi cuenta"
      onNext={mailOpen ? () => void createWithMail() : undefined}
      isPending={pending === 'mail'}
      onBack={onBack}
      focusHeading
    >
      <div className="space-y-5">
        <PhoneInput
          id="signup-phone"
          label="Tu celular"
          helper="Es el WhatsApp de tu complejo."
          value={phone}
          onChange={setPhone}
          error={errors.phone}
        />

        <div className="space-y-3">
          {!inAppBrowser && (
            <button
              type="button"
              className={cn(OPTION, 'signup-lit')}
              disabled={pending !== null}
              onClick={() => void continueWithGoogle()}
            >
              <GoogleIcon className="size-6 shrink-0" />
              <span className="min-w-0">
                <span className="block text-base font-medium text-foreground">
                  {pending === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}
                </span>
                <span className="block text-sm text-emerald-300">
                  Recomendado · más rápido, sin contraseña
                </span>
              </span>
            </button>
          )}

          {mailOpen ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/3 p-4">
              {!inAppBrowser && (
                <p className="flex items-center gap-2 text-base font-medium text-foreground">
                  <Mail className="size-5" aria-hidden />
                  Continuar con email
                </p>
              )}
              <TextField
                id="signup-name"
                label="Tu nombre"
                value={name}
                onChange={setName}
                error={errors.name}
                autoComplete="given-name"
                autoCapitalize="words"
              />
              <TextField
                id="signup-email"
                label="Tu email"
                type="email"
                value={email}
                onChange={setEmail}
                error={errors.email}
                autoComplete="email"
                placeholder="vos@micomplejo.com"
              />
              <div className="space-y-1.5">
                <label htmlFor="signup-password" className="text-sm font-medium text-foreground">
                  Contraseña
                </label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    aria-invalid={errors.password ? true : undefined}
                    className={`pr-12 ${SIGNUP_INPUT_CLASS}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" aria-hidden />
                    ) : (
                      <Eye className="size-5" aria-hidden />
                    )}
                  </button>
                </div>
                {errors.password && <FieldError>{errors.password}</FieldError>}
              </div>
            </div>
          ) : (
            <button type="button" className={OPTION} onClick={() => setMailOpen(true)}>
              <Mail className="size-6 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-base font-medium text-foreground">Continuar con email</span>
            </button>
          )}
        </div>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <p className="text-sm text-muted-foreground">
          {existing ? 'Entrá con esa cuenta. ' : '¿Ya tenés cuenta? '}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-semibold text-emerald-300 hover:underline"
          >
            Ingresar
          </Link>
        </p>
      </div>
    </StepScreen>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {children}
    </p>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  ...input
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: string
  autoComplete?: string
  autoCapitalize?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={SIGNUP_INPUT_CLASS}
        {...input}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
