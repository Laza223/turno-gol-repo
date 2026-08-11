/**
 * Minimal staging seed: 1 tenant, 1 court, 1 staff admin test user.
 * Idempotent — safe to re-run (ON CONFLICT DO NOTHING / existing-user lookup).
 *
 * SOLO fuera de producción: crea un usuario con password conocida
 * (STAGING_ADMIN_PASSWORD), sería un backdoor si corriera contra prod.
 *
 * NOTA: no gateamos por NODE_ENV — Vercel setea NODE_ENV=production en
 * TODO build desplegado (`next build`), incluidos preview/staging, así que
 * ese check (usado en tests/e2e/_helpers/test-credentials.ts para runs
 * locales) daría falso-positivo acá y bloquearía staging real. En su lugar
 * chequeamos VERCEL_ENV (preview/staging ≠ 'production' en Vercel) y el
 * dominio de prod conocido.
 *
 * Usage:
 *   ENV_FILE=.env.staging STAGING_ADMIN_PASSWORD=... pnpm staging:seed
 */
import { config } from 'dotenv'
config({ path: process.env.ENV_FILE ?? '.env.staging' })

const PROD_APP_URL = 'https://turnogol.app'
if (process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_APP_URL === PROD_APP_URL) {
  throw new Error(
    'seed-staging.ts corrido contra producción (VERCEL_ENV=production o ' +
      `NEXT_PUBLIC_APP_URL=${PROD_APP_URL}): abortando (sería un backdoor).`,
  )
}

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { closeSql, getSql } from '@/shared/db/client'

const STAGING = {
  tenantId: '00000000-0000-4000-9000-000000000001',
  tenantSlug: 'staging-demo',
  tenantName: 'TurnoGol Staging Demo',
  courtId: '00000000-0000-4000-9000-000000000010',
  staffUserId: '00000000-0000-4000-9000-000000000002',
  adminAuthUserId: '00000000-0000-4000-9000-000000000003',
  adminEmail: process.env.STAGING_ADMIN_EMAIL ?? 'staging-admin@turnogol.test',
}

type SqlClient = ReturnType<typeof getSql>

async function findAuthUserByEmail(client: SupabaseClient, email: string): Promise<User | null> {
  const PER_PAGE = 200
  const MAX_PAGES = 5
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw error
    const users = data?.users ?? []
    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (users.length < PER_PAGE) return null
  }
  return null
}

async function seedTenantAndCourt(sql: SqlClient): Promise<void> {
  const pricing = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        to: '23:59',
        price: 10000,
      },
    ],
  }
  const openingHours = {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '08:00', close: '23:00' },
    sat: { open: '09:00', close: '23:00' },
    sun: { open: '09:00', close: '23:00' },
  }
  const settings = {
    requires_deposit: false,
    deposit_percentage: 0,
    cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
    accepts_cash: true,
    accepts_transfer: true,
    accepts_mercadopago: true,
    allow_online_booking: true,
    booking_advance_days: 6,
    auto_complete_minutes: 30,
    onboarding_completed: true,
  }
  await sql`
    INSERT INTO tenants (
      id, slug, name, address, city, province, phone, email, status,
      opening_hours, settings
    ) VALUES (
      ${STAGING.tenantId}, ${STAGING.tenantSlug}, ${STAGING.tenantName},
      ${'Av. Staging 100'}, ${'Buenos Aires'}, ${'Buenos Aires'},
      ${'+541100000000'}, ${'staging-tenant@turnogol.test'}, 'active',
      ${sql.json(openingHours)}, ${sql.json(settings)}
    )
    ON CONFLICT (id) DO NOTHING
  `
  await sql`
    INSERT INTO courts (id, tenant_id, name, capacity, status, pricing)
    VALUES (${STAGING.courtId}, ${STAGING.tenantId}, ${'Cancha Staging 1'}, 10, 'online', ${sql.json(pricing)})
    ON CONFLICT (id) DO NOTHING
  `
}

async function seedStaffAdmin(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${STAGING.staffUserId}, ${STAGING.adminEmail}, ${'Staging'}, ${'Admin'})
    ON CONFLICT (id) DO NOTHING
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${STAGING.tenantId}, ${STAGING.staffUserId}, 'admin')
    ON CONFLICT (tenant_id, staff_user_id) DO NOTHING
  `
}

async function seedAuthUser(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = process.env.STAGING_ADMIN_PASSWORD
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  if (!password) {
    throw new Error(
      'STAGING_ADMIN_PASSWORD required (no default on purpose — a known password ' +
        'is a backdoor). Set it to a fresh value before seeding.',
    )
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const existing = await findAuthUserByEmail(supabase, STAGING.adminEmail)
  if (existing) {
    console.log(`Auth user ya existe: ${existing.id}`)
    return
  }
  const { error } = await supabase.auth.admin.createUser({
    id: STAGING.adminAuthUserId,
    email: STAGING.adminEmail,
    email_confirm: true,
    password,
    app_metadata: {
      tenant_id: STAGING.tenantId,
      role: 'admin',
      staff_user_id: STAGING.staffUserId,
    },
  })
  if (error) throw error
}

async function main(): Promise<void> {
  const sql = getSql()
  try {
    await seedTenantAndCourt(sql)
    await seedStaffAdmin(sql)
    await seedAuthUser()
    console.log('Staging seed OK')
    console.log(`  tenant: ${STAGING.tenantId} (${STAGING.tenantSlug})`)
    console.log(`  court:  ${STAGING.courtId}`)
    console.log(`  admin:  ${STAGING.adminEmail}`)
  } finally {
    await closeSql()
  }
}

main().catch((e) => {
  console.error('Staging seed failed:', e)
  process.exit(1)
})
