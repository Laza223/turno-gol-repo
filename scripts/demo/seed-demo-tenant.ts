import { config } from 'dotenv'
// Standalone: sin el auto-load de .env.local de Next.js (mismo patrón que seed-e2e).
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { formatInTimeZone } from 'date-fns-tz'
import { E2E_TEST_PASSWORD } from '../../tests/e2e/_helpers/test-credentials'
import { bookingInstants } from '../../tests/e2e/_helpers/booking-instants'
import { deleteFreshAdminTenants } from '../../tests/e2e/_helpers/fresh-tenant-cleanup'

// Tenant demo "Complejo La Redonda" para GRABAR videos de producto
// (scripts/demo/record.ts). No lo usan los tests: los e2e tienen su propio
// seed (scripts/seed-e2e.ts, tenants 00000000-…). UUIDs con prefijo d0 para
// que nunca colisionen. Igual que seed-e2e, entra por el superusuario local
// porque resetear fixtures borra de tablas que 008_revokes bloquea para
// turnogol_app.
const SEED_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

const ART_TZ = 'America/Argentina/Buenos_Aires'

const DEMO = {
  tenantId: 'd0000000-0000-4000-8000-000000000001',
  tenantSlug: 'la-redonda',
  tenantName: 'Complejo La Redonda',
  adminEmail: 'demo-admin@turnogol.test',
  adminAuthUserId: 'd0000000-0000-4000-8000-000000000002',
  staffUserId: 'd0000000-0000-4000-8000-000000000003',
  // Fresh admin para filmar el wizard de onboarding (0 tenants → wizard).
  freshEmail: 'demo-fresh@turnogol.test',
  freshAuthUserId: 'd0000000-0000-4000-8000-000000000004',
  freshStaffUserId: 'd0000000-0000-4000-8000-000000000005',
  playerEmail: 'demo-player@turnogol.test',
  playerId: 'd0000000-0000-4000-8000-000000000020',
  playerAuthUserId: 'd0000000-0000-4000-8000-000000000021',
  courtIds: [
    'd0000000-0000-4000-8000-000000000010',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000013',
  ],
}

type SqlClient = ReturnType<typeof postgres>

function todayArt(): string {
  return formatInTimeZone(new Date(), ART_TZ, 'yyyy-MM-dd')
}

async function cleanup(sql: SqlClient): Promise<void> {
  // Mismo orden reverse-FK que scripts/seed-e2e.ts (ver comentarios ahí).
  const t = DEMO.tenantId
  await sql`DELETE FROM audit_logs WHERE tenant_id = ${t}`
  await sql`DELETE FROM notifications WHERE tenant_id = ${t}`
  await sql`DELETE FROM stock_movements WHERE tenant_id = ${t}`
  await sql`DELETE FROM canteen_tabs WHERE tenant_id = ${t}`
  await sql`DELETE FROM canteen_products WHERE tenant_id = ${t}`
  await sql`DELETE FROM daily_cash_opens WHERE tenant_id = ${t}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${t}`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${t}`
  await sql`UPDATE payments SET booking_id = NULL WHERE tenant_id = ${t}`
  await sql`DELETE FROM bookings WHERE tenant_id = ${t}`
  await sql`DELETE FROM payments WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_match_events WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_matches WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_team_players WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_teams WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournament_stages WHERE tenant_id = ${t}`
  await sql`DELETE FROM tournaments WHERE tenant_id = ${t}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${t}`
  await sql`DELETE FROM abonados WHERE tenant_id = ${t}`
  await sql`DELETE FROM courts WHERE tenant_id = ${t}`
  await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${t}`
  await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${t}`
  await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${t}`
  await sql`DELETE FROM tenants WHERE id = ${t}`
  // Tenants que el fresh admin creó filmando el wizard en corridas anteriores
  // (cascade completo, mismo helper que usa el seed e2e).
  await deleteFreshAdminTenants(sql, DEMO.freshStaffUserId)
  await sql`DELETE FROM players WHERE id = ${DEMO.playerId} OR email = ${DEMO.playerEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${DEMO.staffUserId} OR email = ${DEMO.adminEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${DEMO.freshStaffUserId} OR email = ${DEMO.freshEmail}`
}

async function cleanupAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  for (const id of [DEMO.adminAuthUserId, DEMO.freshAuthUserId, DEMO.playerAuthUserId]) {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error && !/not found/i.test(error.message)) throw error
  }
}

async function seedTenant(sql: SqlClient): Promise<void> {
  // Precios reales 2026 en centavos: F5 $40.000/h, F7 $55.000/h.
  const pricingF5 = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        to: '23:59',
        price: 4000000,
      },
    ],
  }
  const pricingF7 = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        to: '23:59',
        price: 5500000,
      },
    ],
  }
  const openingHours = {
    mon: { open: '10:00', close: '00:00' },
    tue: { open: '10:00', close: '00:00' },
    wed: { open: '10:00', close: '00:00' },
    thu: { open: '10:00', close: '00:00' },
    fri: { open: '10:00', close: '00:00' },
    sat: { open: '09:00', close: '00:00' },
    sun: { open: '09:00', close: '00:00' },
  }
  // Seña 30% activa para que el flujo de reserva online muestre el paso de pago
  // (mock MP). mp_access_token mock: resolveTenantGateway lo exige aunque el
  // gateway esté mockeado.
  const settings = {
    requires_deposit: true,
    deposit_percentage: 30,
    cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
    no_show_penalty: { type: 'none', days: 0 },
    accepts_cash: true,
    accepts_transfer: true,
    accepts_mercadopago: true,
    allow_online_booking: true,
    booking_advance_days: 6,
    auto_complete_minutes: 30,
    onboarding_completed: true,
    admin_tour_seen_at: new Date().toISOString(),
  }
  await sql`
    INSERT INTO tenants (
      id, slug, name, address, city, province, phone, email, status,
      opening_hours, settings, mp_access_token
    ) VALUES (
      ${DEMO.tenantId}, ${DEMO.tenantSlug}, ${DEMO.tenantName},
      ${'Av. Directorio 2450'}, ${'Buenos Aires'}, ${'Buenos Aires'},
      ${'+541155550123'}, ${'demo-tenant@turnogol.test'}, 'active',
      ${sql.json(openingHours)}, ${sql.json(settings)}, ${'mock-mp-token'}
    )
  `
  const courts = [
    { id: DEMO.courtIds[0], name: 'Cancha 1 — F5', capacity: 10, pricing: pricingF5 },
    { id: DEMO.courtIds[1], name: 'Cancha 2 — F5', capacity: 10, pricing: pricingF5 },
    { id: DEMO.courtIds[2], name: 'Cancha 3 — F5 techada', capacity: 10, pricing: pricingF5 },
    { id: DEMO.courtIds[3], name: 'Cancha 4 — F7', capacity: 14, pricing: pricingF7 },
  ]
  for (const c of courts) {
    await sql`
      INSERT INTO courts (id, tenant_id, name, capacity, status, pricing)
      VALUES (${c.id}, ${DEMO.tenantId}, ${c.name}, ${c.capacity}, 'online', ${sql.json(c.pricing)})
    `
  }
  await sql`
    INSERT INTO tenant_subscriptions (tenant_id, plan_id, current_period_start, current_period_end)
    SELECT ${DEMO.tenantId}, id, NOW(), NOW() + INTERVAL '30 days'
    FROM plans WHERE slug = 'complejo'
  `
}

async function seedStaffAndPlayer(sql: SqlClient): Promise<void> {
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${DEMO.staffUserId}, ${DEMO.adminEmail}, ${'Marcelo'}, ${'Gómez'})
  `
  await sql`
    INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
    VALUES (${DEMO.tenantId}, ${DEMO.staffUserId}, 'admin')
  `
  await sql`
    INSERT INTO staff_users (id, email, first_name, last_name)
    VALUES (${DEMO.freshStaffUserId}, ${DEMO.freshEmail}, ${'Nuevo'}, ${'Dueño'})
  `
  await sql`
    INSERT INTO players (id, email, first_name, last_name, status, agreed_to_terms_at, terms_version)
    VALUES (${DEMO.playerId}, ${DEMO.playerEmail}, ${'Tomás'}, ${'Rivero'}, 'active', NOW(), 'v1')
  `
  await sql`
    INSERT INTO player_tenant_relationships (tenant_id, player_id)
    VALUES (${DEMO.tenantId}, ${DEMO.playerId})
  `
}

async function seedBookingsAndCaja(sql: SqlClient): Promise<void> {
  const date = todayArt()
  // Grilla de "noche movida": ocupación creíble, huecos a propósito para que
  // el video de reserva/turno fijo tenga slots libres donde clickear.
  const bookings: Array<{
    court: string
    start: string
    end: string
    guest: string
    status?: string
    price: number
  }> = [
    {
      court: DEMO.courtIds[0]!,
      start: '18:00:00',
      end: '19:00:00',
      guest: 'Los Pibes del Fondo',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[0]!,
      start: '20:00:00',
      end: '21:00:00',
      guest: 'Cristian Ledesma',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[0]!,
      start: '21:00:00',
      end: '22:00:00',
      guest: 'Ferretería San Martín FC',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[1]!,
      start: '19:00:00',
      end: '20:00:00',
      guest: 'Equipo de Nico',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[1]!,
      start: '21:00:00',
      end: '22:00:00',
      guest: 'Martina y amigas',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[2]!,
      start: '18:00:00',
      end: '19:00:00',
      guest: 'Colegio Don Bosco',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[2]!,
      start: '20:00:00',
      end: '21:00:00',
      guest: 'Los Lunes Nunca Más',
      price: 4000000,
      status: 'pending_payment',
    },
    {
      court: DEMO.courtIds[2]!,
      start: '22:00:00',
      end: '23:00:00',
      guest: 'Banco Provincia',
      price: 4000000,
    },
    {
      court: DEMO.courtIds[3]!,
      start: '19:00:00',
      end: '20:00:00',
      guest: 'La Redonda Veteranos',
      price: 5500000,
    },
    {
      court: DEMO.courtIds[3]!,
      start: '21:00:00',
      end: '22:00:00',
      guest: 'Panadería El Trigal',
      price: 5500000,
    },
  ]
  for (const b of bookings) {
    const instants = bookingInstants({ date, timeStart: b.start, timeEnd: b.end })
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        type, status, price_snapshot, deposit_amount, deposit_status,
        guest_name, created_by_staff
      ) VALUES (
        ${DEMO.tenantId}, ${b.court}, ${date}, ${b.start}, ${b.end},
        ${instants.starts_at}, ${instants.ends_at},
        'spontaneous', ${b.status ?? 'confirmed'}, ${b.price}, 0, 'not_required',
        ${b.guest}, ${DEMO.staffUserId}
      )
    `
  }
  // Caja del día abierta con fondo inicial $20.000 — la venta de cantina del
  // video no tiene que frenar en el guard de día cerrado.
  await sql`
    INSERT INTO daily_cash_opens (tenant_id, date, opening_cash, opened_by)
    VALUES (${DEMO.tenantId}, ${date}, 2000000, ${DEMO.staffUserId})
  `
  // Catálogo de cantina realista (centavos).
  const products = [
    { name: 'Cerveza Quilmes 1L', price: 350000, cost: 180000, stock: 48, sort: 1 },
    { name: 'Coca-Cola 500ml', price: 250000, cost: 120000, stock: 60, sort: 2 },
    { name: 'Agua sin gas 500ml', price: 200000, cost: 90000, stock: 40, sort: 3 },
    { name: 'Gatorade', price: 300000, cost: 150000, stock: 24, sort: 4 },
    { name: 'Alfajor Guaymallén', price: 80000, cost: 40000, stock: 50, sort: 5 },
    { name: 'Papas fritas', price: 180000, cost: 90000, stock: 30, sort: 6 },
  ]
  for (const p of products) {
    await sql`
      INSERT INTO canteen_products (tenant_id, name, price, cost, stock, min_stock, sort_order)
      VALUES (${DEMO.tenantId}, ${p.name}, ${p.price}, ${p.cost}, ${p.stock}, 5, ${p.sort})
    `
  }
}

async function seedAuthUsers(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  {
    const { error } = await supabase.auth.admin.createUser({
      id: DEMO.adminAuthUserId,
      email: DEMO.adminEmail,
      email_confirm: true,
      password: E2E_TEST_PASSWORD,
      app_metadata: { tenant_id: DEMO.tenantId, role: 'admin', staff_user_id: DEMO.staffUserId },
    })
    if (error) throw error
  }
  {
    const { error } = await supabase.auth.admin.createUser({
      id: DEMO.freshAuthUserId,
      email: DEMO.freshEmail,
      email_confirm: true,
      password: E2E_TEST_PASSWORD,
      app_metadata: { staff_user_id: DEMO.freshStaffUserId },
    })
    if (error) throw error
  }
  {
    const { error } = await supabase.auth.admin.createUser({
      id: DEMO.playerAuthUserId,
      email: DEMO.playerEmail,
      email_confirm: true,
      app_metadata: { is_player: true, player_id: DEMO.playerId },
    })
    if (error) throw error
  }
}

async function main(): Promise<void> {
  const sql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
  try {
    await cleanupAuthUsers()
    await cleanup(sql)
    await seedTenant(sql)
    await seedStaffAndPlayer(sql)
    await seedBookingsAndCaja(sql)
    await seedAuthUsers()
    console.log('Demo seed OK — Complejo La Redonda')
    console.log(`  portal público: /${DEMO.tenantSlug}`)
    console.log(`  admin: ${DEMO.adminEmail}`)
    console.log(`  fresh (wizard): ${DEMO.freshEmail}`)
  } finally {
    await sql.end()
  }
}

main().catch((e) => {
  console.error('Demo seed failed:', e)
  process.exit(1)
})
