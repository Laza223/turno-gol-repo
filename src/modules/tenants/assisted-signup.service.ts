import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/sentry'
import { getWorkerDb } from '@/shared/db/client'
import { players, staffUsers } from '@/shared/db/schema'
import { generateTempPassword } from '@/modules/auth/password'
import { extractReferralCode } from '@/modules/referrals/referral.schema'
import { resolveSignupReferrer } from '@/modules/referrals/referral.service'
import { createTenantWithTrial } from './tenant.service'
import type { AssistedSignupInput } from './tenant.schema'

export type AssistedSignupRejection =
  'player_account' | 'staff_account' | 'email_taken' | 'invalid_referral'

export type AssistedSignupResult =
  | { ok: true; tenantId: string; slug: string; tempPassword: string }
  | { ok: false; reason: AssistedSignupRejection }

/**
 * Alta asistida de un complejo desde el super-admin (decisión 2026-10-22).
 *
 * Crea la cuenta del dueño con el email ya confirmado y una contraseña temporal
 * con `force_password_change`, y después el complejo con el mismo trial que el
 * self-signup. El primer ingreso pasa por `/reset-password` y sigue en el
 * wizard desde Horarios. La contraseña vuelve UNA vez al caller: no se loguea,
 * no va al audit ni a Sentry.
 *
 * Todo lo que puede rechazar el alta se chequea antes de crear nada. Después,
 * Auth va primero porque es el único efecto externo y `deleteUser` lo deshace
 * limpio. Si falla la base, se compensa y el error sube.
 */
export async function createAssistedTenant(
  input: AssistedSignupInput,
  actor: { id: string; email: string },
): Promise<AssistedSignupResult> {
  // `players` y `staff_users` son globales y todavía no hay tenant de contexto:
  // pool worker, igual que `/register` y `getOrCreateStaffUser`.
  const workerDb = getWorkerDb()

  // F5 (2026-10-14-foco-jugador-rival.md): una cuenta de complejo no puede ser
  // también jugador con el mismo mail. `players.email` se guarda en minúsculas
  // y el schema ya bajó el input.
  const [player] = await workerDb
    .select({ id: players.id })
    .from(players)
    .where(eq(players.email, input.email))
    .limit(1)
  if (player) return { ok: false, reason: 'player_account' }

  // Un dueño con cuenta que suma un segundo complejo queda fuera de esta versión.
  const [staff] = await workerDb
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(eq(staffUsers.email, input.email))
    .limit(1)
  if (staff) return { ok: false, reason: 'staff_account' }

  // Pre-generado para el chequeo de "no autoreferirse", como `createTenantAction`.
  const tenantId = randomUUID()

  // Mismas reglas que el self-signup, pero un código inválido frena el alta: lo
  // tipeó el super-admin y lo tiene que poder corregir.
  let referralCode: string | null = null
  let referredByTenantId: string | null = null
  if (input.referral) {
    referralCode = extractReferralCode(input.referral)
    referredByTenantId = referralCode
      ? await resolveSignupReferrer({
          code: referralCode,
          excludeTenantId: tenantId,
        })
      : null
    if (!referredByTenantId) return { ok: false, reason: 'invalid_referral' }
  }

  const staffUserId = randomUUID()
  const tempPassword = generateTempPassword()
  const adminClient = createAdminClient()

  // El login con `force_password_change` va directo a /reset-password y no pasa
  // por `provisionAndRouteStaff`, así que los claims del tenant nacen acá.
  // `staff_invited` solo cambia el copy a "Creá tu contraseña".
  const { data, error } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName },
    app_metadata: {
      staff_user_id: staffUserId,
      tenant_id: tenantId,
      role: 'admin',
      force_password_change: true,
      staff_invited: true,
    },
  })
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
    // Cuenta de Auth sin fila de staff ni de jugador: un /register que nunca se
    // confirmó, un alta anterior que no se pudo deshacer, o un super admin.
    return { ok: false, reason: 'email_taken' }
  }
  if (error || !data.user) {
    // Solo el código: el mensaje de GoTrue no tiene por qué saber de la
    // contraseña, pero no hay motivo para arriesgarlo.
    throw new Error(`createAssistedTenant: createUser falló (${error?.code ?? 'sin usuario'})`)
  }
  const authUserId = data.user.id

  try {
    await workerDb.insert(staffUsers).values({
      id: staffUserId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      signupReferralCode: referralCode,
    })

    const tenant = await createTenantWithTrial({
      id: tenantId,
      staffUserId,
      name: input.name,
      address: input.address,
      city: input.city,
      province: input.province,
      phone: input.phone,
      email: input.email,
      referredByTenantId,
      assistedBy: {
        systemAdminId: actor.id,
        metadata: {
          owner_email: input.email,
          system_admin_email: actor.email,
          referral_code: referralCode,
        },
      },
    })

    return { ok: true, tenantId: tenant.id, slug: tenant.slug, tempPassword }
  } catch (err) {
    await undoOwnerAccount(authUserId, staffUserId)
    throw err
  }
}

/**
 * Compensación best-effort: sin cuenta de Auth ni fila de staff, el alta se
 * puede reintentar con el mismo email.
 *
 * Si el DELETE de `staff_users` falla, la cuenta de Auth NO se borra. La FK de
 * la membresía no tiene cascada, así que ese DELETE choca justo cuando la
 * transacción sí commiteó y se perdió la respuesta: el complejo está entero y
 * borrarle el acceso al dueño sería peor que el error. Si `tenants` se insertó y
 * la transacción no, el complejo queda sin miembros. Eso es preexistente en
 * `createTenantWithTrial`, y borrar en `tenants` arrastra cascadas.
 */
async function undoOwnerAccount(authUserId: string, staffUserId: string): Promise<void> {
  // Los ids son lo único que permite encontrar la cuenta que quedó colgada: sin
  // ellos, el email queda tomado (`email_taken`) y nadie sabe qué borrar.
  const context = { tags: { flow: 'assisted_signup_undo' }, extra: { authUserId, staffUserId } }
  try {
    await getWorkerDb().delete(staffUsers).where(eq(staffUsers.id, staffUserId))
  } catch (err) {
    captureException(err, context)
    return
  }
  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(authUserId)
    if (error) throw new Error(`createAssistedTenant: deleteUser falló (${error.code ?? '?'})`)
  } catch (err) {
    captureException(err, context)
  }
}
