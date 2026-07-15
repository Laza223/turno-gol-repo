import { config } from 'dotenv'
// Standalone scripts don't get Next.js's automatic .env.local loading.
config({ path: '.env.local' })

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { closeSql, getWorkerDb } from '@/shared/db/client'
import { systemAdmins } from '@/shared/db/schema'

/**
 * Bootstrap del SuperAdmin (spec §3: sin superficie HTTP — imposible
 * auto-promoverse desde la app). Correr manualmente con service role:
 *
 *   pnpm seed:system-admin <email> [firstName] [lastName]
 *
 * Idempotente: correrlo dos veces no rompe (createUser solo si falta,
 * INSERT con ON CONFLICT DO NOTHING, updateUserById re-aplica el claim).
 */

function usage(): never {
  console.error('Uso: pnpm seed:system-admin <email> [firstName] [lastName]')
  process.exit(1)
}

/**
 * supabase-js no expone lookup por email: paginamos listUsers de forma
 * acotada (mismo patrón que findAuthUserByEmail en (admin)/staff/actions.ts).
 */
async function findAuthUserByEmail(
  adminClient: SupabaseClient,
  email: string,
): Promise<User | null> {
  const PER_PAGE = 1000
  const MAX_PAGES = 10
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw error
    const users = data?.users ?? []
    const found = users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found
    if (users.length < PER_PAGE) return null
  }
  return null
}

async function main(): Promise<void> {
  const rawEmail = process.argv[2]
  if (!rawEmail) usage()
  const email = rawEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Email inválido: ${rawEmail}`)
    process.exit(1)
  }
  const firstName = process.argv[3]?.trim() || 'Super'
  const lastName = process.argv[4]?.trim() || 'Admin'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  try {
    // (a) Auth user: buscar por email; crear con email_confirm si no existe
    //     para que el magic link funcione de entrada.
    let authUser = await findAuthUserByEmail(supabase, email)
    if (authUser) {
      console.log(`[1/3] Auth user ya existe: ${authUser.id}`)
    } else {
      // El SuperAdmin sigue passwordless (magic link + MFA TOTP, ADR-002 / spec
      // auth §1). Password opcional vía SUPERADMIN_SEED_PASSWORD si se quiere
      // login por contraseña; si no, se setea luego por "olvidé mi contraseña".
      const seedPassword = process.env.SUPERADMIN_SEED_PASSWORD
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        ...(seedPassword ? { password: seedPassword } : {}),
      })
      if (error || !data?.user) {
        throw error ?? new Error('createUser no devolvió user')
      }
      authUser = data.user
      console.log(`[1/3] Auth user creado: ${authUser.id}`)
    }

    // (b) Fila en system_admins. La tabla tiene RLS + FORCE self-scoped (migr.
    //     006 + 036) SIN policy de INSERT, así que el pool restringido
    //     (turnogol_app / getDb) es rechazado con 42501. El bootstrap usa el pool
    //     worker BYPASSRLS (getWorkerDb): en prod requiere WORKER_DATABASE_URL
    //     apuntando a turnogol_worker; en local cae al superuser por defecto.
    //     ON CONFLICT (email) DO NOTHING + SELECT de respaldo para el id existente.
    const db = getWorkerDb()
    const inserted = await db
      .insert(systemAdmins)
      .values({ email, firstName, lastName })
      .onConflictDoNothing({ target: systemAdmins.email })
      .returning({ id: systemAdmins.id })
    let systemAdminId = inserted[0]?.id
    if (systemAdminId) {
      console.log(`[2/3] Fila system_admins creada: ${systemAdminId}`)
    } else {
      const existing = await db
        .select({ id: systemAdmins.id })
        .from(systemAdmins)
        .where(eq(systemAdmins.email, email))
        .limit(1)
      systemAdminId = existing[0]?.id
      if (!systemAdminId) {
        throw new Error(`system_admins: ON CONFLICT sin fila recuperable para ${email}`)
      }
      console.log(`[2/3] Fila system_admins ya existía: ${systemAdminId}`)
    }

    // (c) Claim JWT en app_metadata. Merge sobre lo existente para no pisar
    //     otras keys; re-correrlo es un no-op.
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      app_metadata: {
        ...authUser.app_metadata,
        is_system_admin: true,
        system_admin_id: systemAdminId,
      },
    })
    if (updateError) throw updateError
    console.log(`[3/3] Claim aplicado: is_system_admin=true, system_admin_id=${systemAdminId}`)

    console.log('')
    console.log('Seed SuperAdmin OK')
    console.log(`  email:           ${email}`)
    console.log(`  auth user:       ${authUser.id}`)
    console.log(`  system_admin_id: ${systemAdminId}`)
    console.log('')
    console.log('RECORDATORIO: el guard es fail-closed por allowlist. Agregá el email a')
    console.log('SYSTEM_ADMIN_EMAILS (en .env.local y en las env vars de producción):')
    console.log(`  SYSTEM_ADMIN_EMAILS=${email}`)
  } finally {
    await closeSql()
  }
}

main().catch((e) => {
  console.error('Seed SuperAdmin failed:', e)
  process.exit(1)
})
