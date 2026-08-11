'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { passwordSchema } from '@/modules/auth/password'

export type ResetState = { status: 'idle' } | { status: 'error'; message: string }

const schema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

/**
 * Fija la nueva contraseña. Sirve a dos casos (spec §4.4):
 *  1) Recovery (link de "olvidé mi contraseña") — sesión recovery activa.
 *  2) Cambio forzado (tras reset del SuperAdmin) — limpia force_password_change.
 * Requiere una sesión activa (recovery o login con temp). Éxito → /dashboard.
 */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const supabase = await createClient()
  const { data, error: getErr } = await supabase.auth.getUser()
  if (getErr || !data?.user) {
    return {
      status: 'error',
      message:
        'El enlace expiró o la sesión no es válida. Pedí uno nuevo desde "Olvidé mi contraseña".',
    }
  }
  const user = data.user

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'same_password') {
      return { status: 'error', message: 'Esa ya es tu contraseña actual. Elegí una diferente.' }
    }
    return { status: 'error', message: 'No pudimos actualizar la contraseña. Probá de nuevo.' }
  }

  // Cambio forzado: limpiar el flag (null = delete en GoTrue) y refrescar la
  // sesión para que el próximo request entre sin el redirect a /reset-password.
  if (user.app_metadata?.force_password_change === true) {
    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, force_password_change: null },
    })
    await supabase.auth.refreshSession()
  }

  redirect('/dashboard')
}
