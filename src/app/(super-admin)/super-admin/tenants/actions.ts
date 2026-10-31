'use server'

import { revalidatePath } from 'next/cache'
import { captureException } from '@/lib/sentry'
import { requireSystemAdminAction } from '@/modules/auth/system-admin.guards'
import { assistedSignupSchema } from '@/modules/tenants/tenant.schema'
import {
  createAssistedTenant,
  type AssistedSignupRejection,
} from '@/modules/tenants/assisted-signup.service'
import { echoFields } from '@/shared/forms/echo'

const FIELDS = [
  'name',
  'address',
  'city',
  'province',
  'phone',
  'firstName',
  'lastName',
  'email',
  'referral',
] as const

export type AssistedSignupField = (typeof FIELDS)[number]

/**
 * Estado del form de alta asistida (`useActionState`). La rama `success` trae
 * la contraseña temporal: es la ÚNICA vez que viaja en texto plano, y vive
 * solo en el estado del form del super-admin hasta que sale de la pantalla.
 */
export type AssistedSignupState =
  | { status: 'idle' }
  | {
      status: 'error'
      message?: string
      fieldErrors: Partial<Record<AssistedSignupField, string>>
      values: Partial<Record<AssistedSignupField, string>>
    }
  | {
      status: 'success'
      tenantId: string
      tenantName: string
      email: string
      tempPassword: string
    }

const REJECTIONS: Record<
  AssistedSignupRejection,
  { field?: AssistedSignupField; message: string }
> = {
  player_account: {
    field: 'email',
    message: 'Ese email es de un jugador de TurnoGol. El dueño tiene que usar otro email.',
  },
  staff_account: {
    field: 'email',
    message: 'Ese email ya tiene una cuenta de complejo. El dueño puede entrar con /login.',
  },
  email_taken: {
    field: 'email',
    // Auth sin fila de staff ni de jugador: un /register que nunca se confirmó, un
    // alta anterior que no se pudo deshacer o una cuenta interna. No se adivina cuál.
    message:
      'Ese email ya tiene un acceso a TurnoGol sin complejo (por ejemplo, un registro que nunca se confirmó). Usá otro email, o borrá ese acceso en Supabase Auth y probá de nuevo.',
  },
  invalid_referral: {
    field: 'referral',
    message: 'El código no es válido. Revisalo o dejalo vacío.',
  },
}

/**
 * Alta asistida de un complejo (decisión 2026-10-22): crea la cuenta del dueño
 * y el complejo, con 30 días de prueba. Guard triple + rate limit en
 * `requireSystemAdminAction`; el audit `support.tenant.created` lo escribe el
 * service en la misma transacción del alta.
 */
export async function createAssistedTenantAction(
  _prev: AssistedSignupState,
  formData: FormData,
): Promise<AssistedSignupState> {
  const values = echoFields(formData, FIELDS)

  const auth = await requireSystemAdminAction()
  if (!auth.ok) return { status: 'error', message: auth.error, fieldErrors: {}, values }

  const parsed = assistedSignupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Partial<Record<AssistedSignupField, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && isField(key) && !fieldErrors[key]) {
        fieldErrors[key] = issue.message
      }
    }
    return { status: 'error', fieldErrors, values }
  }

  let result: Awaited<ReturnType<typeof createAssistedTenant>>
  try {
    result = await createAssistedTenant(parsed.data, auth.admin)
  } catch (err) {
    captureException(err, { tags: { flow: 'assisted_signup' } })
    return {
      status: 'error',
      message: 'No se pudo completar el alta. Probá de nuevo en un rato.',
      fieldErrors: {},
      values,
    }
  }

  if (!result.ok) {
    const { field, message } = REJECTIONS[result.reason]
    return field
      ? { status: 'error', fieldErrors: { [field]: message }, values }
      : { status: 'error', message, fieldErrors: {}, values }
  }

  revalidatePath('/super-admin/tenants')
  return {
    status: 'success',
    tenantId: result.tenantId,
    tenantName: parsed.data.name,
    email: parsed.data.email,
    tempPassword: result.tempPassword,
  }
}

function isField(key: string): key is AssistedSignupField {
  return (FIELDS as readonly string[]).includes(key)
}
