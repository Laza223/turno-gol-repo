'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// AR mobile: optional + 54, optional 9, then 10 digits split however the user types.
const phoneRegex = /^\+?54\s?9?\s?\d{2,4}\s?\d{4}-?\d{4}$/

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(2, 'Ingresá tu nombre').max(80),
  lastName: z.string().trim().min(2, 'Ingresá tu apellido').max(80),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Formato: +54 9 11 1234-5678'),
})

type FieldKey = 'email' | 'firstName' | 'lastName' | 'phone' | '_form'

export type RegisterState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
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
  })
  if (!parsed.success) {
    const errs: Partial<Record<FieldKey, string>> = {}
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as FieldKey
      if (k && !errs[k]) errs[k] = issue.message
    }
    return { status: 'error', fieldErrors: errs }
  }

  const origin =
    headers().get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ''
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone,
      },
    },
  })
  if (error) {
    return {
      status: 'error',
      fieldErrors: { _form: 'No pudimos enviar el email. Probá de nuevo.' },
    }
  }
  return { status: 'sent', email: parsed.data.email }
}
