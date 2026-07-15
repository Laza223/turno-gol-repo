import { and, eq, like, or } from 'drizzle-orm'
import { getDb, getSql, getWorkerDb, withTenantContext } from '@/shared/db/client'
import { plans, tenants, tenantStaffMembers, tenantSubscriptions } from '@/shared/db/schema'
import { generateSlug } from './tenant.utils'
import type {
  CreateTenantInput,
  OpeningHours,
  TenantRow,
  TenantSettings,
  UpdateTenantInput,
  UpdateTenantSettingsInput,
} from './tenant.types'

export { generateSlug } from './tenant.utils'

export async function generateUniqueSlug(name: string): Promise<string> {
  const db = getDb()
  const base = generateSlug(name)
  const existing = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(or(eq(tenants.slug, base), like(tenants.slug, `${base}-%`)))
  const slugSet = new Set(existing.map((r) => r.slug))
  if (!slugSet.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!slugSet.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

const DEFAULT_SETTINGS: TenantSettings = {
  // Un complejo recién creado todavía no conectó MercadoPago, así que no puede cobrar
  // seña: arranca en "Sin seña". El admin la habilita en Settings → Reservas una vez
  // que conecta MP. (Fix: antes defaulteaba a true y mostraba "Requerir seña" tildado
  // sin forma de cobrarla.)
  requires_deposit: false,
  deposit_percentage: 30,
  cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
  accepts_cash: true,
  accepts_transfer: true,
  accepts_mercadopago: true,
  allow_online_booking: true,
  booking_advance_days: 6,
  auto_complete_minutes: 30,
  onboarding_step: 1,
  onboarding_completed: false,
}

export async function createTenantWithTrial(
  input: CreateTenantInput,
): Promise<{ id: string; slug: string }> {
  const db = getDb()
  const slug = await generateUniqueSlug(input.name)
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: input.name,
      address: input.address,
      city: input.city,
      province: input.province,
      phone: input.phone,
      email: input.email,
      status: 'trialing',
      trialEndsAt,
      settings: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
    })
    .returning({ id: tenants.id, slug: tenants.slug })

  // Plan default del trial: 'predio' (el plan real se elige recién al
  // suscribirse — subscribe() hace UPDATE de plan_id). Sin esta fila,
  // subscribe() no encuentra suscripción y tira SubscriptionNotFoundError
  // para todo tenant nuevo.
  const [predioPlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.slug, 'predio'), eq(plans.isActive, true)))
    .limit(1)
  if (!predioPlan) {
    throw new Error("Plan 'predio' no encontrado o inactivo — no se puede crear el trial")
  }

  // tenant.id was just generated — there's no pre-existing tenant context to
  // inherit, so RLS on tenant_staff_members / tenant_subscriptions
  // (tenant_id = app.current_tenant_id) needs it set explicitly to this
  // brand-new id before the INSERTs.
  await withTenantContext(tenant.id, async (tx) => {
    await tx.insert(tenantStaffMembers).values({
      tenantId: tenant.id,
      staffUserId: input.staffUserId,
      role: 'admin',
      isActive: true,
    })
    await tx.insert(tenantSubscriptions).values({
      tenantId: tenant.id,
      planId: predioPlan.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
    })
  })

  return tenant
}

function rowToTenantRow(t: typeof tenants.$inferSelect): TenantRow {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    logoUrl: t.logoUrl,
    coverUrl: t.coverUrl,
    address: t.address,
    city: t.city,
    province: t.province,
    phone: t.phone,
    email: t.email,
    status: t.status,
    trialEndsAt: t.trialEndsAt,
    settings: t.settings as TenantSettings,
    openingHours: t.openingHours as OpeningHours,
    closedDates: t.closedDates as string[] | null,
    closesNextDay: t.closesNextDay,
    mpConnectedAt: t.mpConnectedAt,
  }
}

export async function getStaffTenant(staffUserId: string): Promise<TenantRow | null> {
  // Called before any tenant_id is known (that's what it's resolving) —
  // RLS on tenant_staff_members requires app.current_tenant_id, which
  // doesn't exist yet here. Needs a bypass-capable pool, same as
  // resolveStaffTenants in auth.service.ts. Parameterized by an already
  // -authenticated staffUserId, not user-controlled input.
  const db = getWorkerDb()
  const rows = await db
    .select({ tenants })
    .from(tenants)
    .innerJoin(tenantStaffMembers, eq(tenantStaffMembers.tenantId, tenants.id))
    .where(
      and(
        eq(tenantStaffMembers.staffUserId, staffUserId),
        eq(tenantStaffMembers.isActive, true),
      ),
    )
    .orderBy(tenantStaffMembers.createdAt)
    .limit(1)
  if (!rows.length) return null
  return rowToTenantRow(rows[0].tenants)
}

/**
 * Tenant por id, sin pasar por una membresía de staff. Lo usa el resolver de
 * impersonación del SuperAdmin (entra a un tenant por id, no por su sesión).
 */
export async function getTenantById(tenantId: string): Promise<TenantRow | null> {
  const db = getDb()
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  if (!rows.length) return null
  return rowToTenantRow(rows[0])
}

export async function updateTenant(
  tenantId: string,
  data: UpdateTenantInput,
): Promise<void> {
  const db = getDb()
  await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
}

export async function updateTenantSettings(
  tenantId: string,
  patch: UpdateTenantSettingsInput,
): Promise<void> {
  // BUG FIX (jsonb double-encode): escribir el objeto via drizzle `.set()` sobre
  // una columna jsonb con este driver (postgres-js) lo guarda como un JSON STRING
  // escalar (`"{...}"`), no como objeto. Tras el save, `settings->>'key'` y
  // `tenant.settings.key` devuelven null/undefined → la config del complejo queda
  // corrupta. Se escribe con el cliente porsager + `sql.json()` (single-encode).
  // Las hermanas updateOnboardingStep/completeOnboarding tienen el MISMO bug.
  const sql = getSql()
  const rows = await sql<{ settings: TenantSettings }[]>`
    SELECT settings FROM tenants WHERE id = ${tenantId} LIMIT 1
  `
  if (!rows.length) throw new Error('Tenant not found')
  const merged = { ...rows[0]!.settings, ...patch }
  await sql`
    UPDATE tenants
    SET settings = ${sql.json(merged as unknown as Parameters<typeof sql.json>[0])},
        updated_at = NOW()
    WHERE id = ${tenantId}
  `
}

export async function updateOnboardingStep(
  tenantId: string,
  step: number,
): Promise<void> {
  // Mismo bug de doble-encode jsonb que updateTenantSettings: el write via
  // drizzle `.set({ settings })` guardaba la columna como JSON-string escalar.
  // Se escribe con porsager + sql.json() (single-encode).
  const sql = getSql()
  const rows = await sql<{ settings: TenantSettings }[]>`
    SELECT settings FROM tenants WHERE id = ${tenantId} LIMIT 1
  `
  if (!rows.length) throw new Error('Tenant not found')
  const settings = { ...rows[0]!.settings, onboarding_step: step }
  await sql`
    UPDATE tenants
    SET settings = ${sql.json(settings as unknown as Parameters<typeof sql.json>[0])},
        updated_at = NOW()
    WHERE id = ${tenantId}
  `
}

export async function completeOnboarding(tenantId: string): Promise<void> {
  // Mismo bug de doble-encode jsonb: ver updateTenantSettings.
  const sql = getSql()
  const rows = await sql<{ settings: TenantSettings }[]>`
    SELECT settings FROM tenants WHERE id = ${tenantId} LIMIT 1
  `
  if (!rows.length) throw new Error('Tenant not found')
  const settings = { ...rows[0]!.settings, onboarding_completed: true }
  await sql`
    UPDATE tenants
    SET settings = ${sql.json(settings as unknown as Parameters<typeof sql.json>[0])},
        updated_at = NOW()
    WHERE id = ${tenantId}
  `
}

export async function connectMercadoPago(
  tenantId: string,
  data: {
    mpAccessToken: string
    mpRefreshToken: string
    mpUserId: string
    mpPublicKey: string
  },
): Promise<void> {
  const db = getDb()
  await db
    .update(tenants)
    .set({
      mpAccessToken: data.mpAccessToken,
      mpRefreshToken: data.mpRefreshToken,
      mpUserId: data.mpUserId,
      mpPublicKey: data.mpPublicKey,
      mpConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
}
