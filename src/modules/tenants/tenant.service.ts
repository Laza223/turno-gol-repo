import { cache } from 'react'
import { and, eq, like, ne, or, sql } from 'drizzle-orm'
import { getDb, getSql, getWorkerDb, withTenantContext, type DbTx } from '@/shared/db/client'
import { plans, tenants, tenantStaffMembers, tenantSubscriptions } from '@/shared/db/schema'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { TRIAL_DAYS } from '@/shared/constants'
import { generateSlug, RESERVED_SLUGS } from './tenant.utils'
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
  let base = generateSlug(name)
  // Un slug igual a un segmento estático del App Router queda shadowed (Next
  // resuelve estático antes que (public)/[slug]): se sufija antes de buscar colisiones.
  if (RESERVED_SLUGS.has(base)) base = `${base}-futbol`
  const existing = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(or(eq(tenants.slug, base), like(tenants.slug, `${base}-%`)))
  const slugSet = new Set(existing.map((r) => r.slug))
  for (const reserved of RESERVED_SLUGS) slugSet.add(reserved)
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
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

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

    // Bienvenida. Va DESPUÉS del insert de tenant_staff_members a propósito:
    // `enqueueTenantOwnerNotification` resuelve los destinatarios leyendo esa
    // tabla, así que invertir el orden manda el mail a nadie, en silencio.
    //
    // Sin try/catch adentro de la transacción — es una clase de bug ya barrida
    // en este repo (ver caja/actions.ts:107): tragarse el error dejaría el alta
    // commiteada a medias. Acá encolar es un INSERT más; si falla, falló la DB
    // y el alta entera tiene que abortar igual.
    //
    // No hace falta `dispatchEmail` post-commit: el worker send-email barre las
    // notificaciones en `queued` cada minuto.
    //
    // El nombre sale de `staff_users` (tabla global, sin RLS) en vez de sumarlo
    // a `CreateTenantInput`: ya está en la base y así no hay dos fuentes que
    // puedan discrepar.
    const ownerRows = (await tx.execute(
      sql`SELECT first_name FROM staff_users WHERE id = ${input.staffUserId} LIMIT 1`,
    )) as unknown as Array<{ first_name: string | null }>

    await enqueueTenantOwnerNotification(
      {
        tenantId: tenant.id,
        templateName: 'trial_welcome',
        triggerEvent: 'tenant.created',
        content: {
          ownerName: ownerRows[0]?.first_name ?? 'Hola',
          tenantName: input.name,
        },
      },
      tx,
    )
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
    mpNickname: t.mpNickname,
  }
}

/**
 * Cacheado por request (`React.cache`), mismo idiom que `extractAuthUser`: el
 * layout de (admin) y el guard de cada página lo pedían por separado sobre la
 * misma fila (tres veces en `/settings/*`, que suma su propio layout), y con la
 * base en otra región cada repetición es una ida y vuelta entera. La ventana es
 * un request: ninguna Server Action lo lee dos veces esperando ver una escritura
 * intermedia.
 */
export const getStaffTenant = cache(async function getStaffTenant(
  staffUserId: string,
): Promise<TenantRow | null> {
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
      and(eq(tenantStaffMembers.staffUserId, staffUserId), eq(tenantStaffMembers.isActive, true)),
    )
    .orderBy(tenantStaffMembers.createdAt)
    .limit(1)
  if (!rows.length) return null
  return rowToTenantRow(rows[0].tenants)
})

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

export async function updateTenant(tenantId: string, data: UpdateTenantInput): Promise<void> {
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

export async function updateOnboardingStep(tenantId: string, step: number): Promise<void> {
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
  const settings = {
    ...rows[0]!.settings,
    onboarding_completed: true,
    onboarding_completed_at: new Date().toISOString(),
  }
  await sql`
    UPDATE tenants
    SET settings = ${sql.json(settings as unknown as Parameters<typeof sql.json>[0])},
        updated_at = NOW()
    WHERE id = ${tenantId}
  `
}

/**
 * ¿Esta cuenta de MercadoPago ya está cobrando para OTRO complejo?
 *
 * Una cuenta de MP cobra para un solo complejo (decisión 2026-07-31, migr.
 * 069). El índice único es la red de seguridad ante dos requests simultáneos;
 * este chequeo existe para poder dar un mensaje que se entienda en vez de un
 * error de constraint.
 *
 * Pool worker a propósito: `tenants` no tiene RLS, pero la consulta es
 * cross-tenant por naturaleza —justamente busca en los complejos ajenos— y
 * dejarla en el pool restringido la ataría al contexto del tenant en curso.
 * Devuelve solo el nombre: nunca credenciales de otro complejo.
 */
export async function findTenantUsingMpAccount(
  mpUserId: string,
  exceptTenantId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await getWorkerDb()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(and(eq(tenants.mpUserId, mpUserId), ne(tenants.id, exceptTenantId)))
    .limit(1)
  return rows[0] ?? null
}

export async function connectMercadoPago(
  tenantId: string,
  data: {
    mpAccessToken: string
    mpRefreshToken: string
    mpUserId: string
    mpPublicKey: string
    mpNickname?: string | null
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
      mpNickname: data.mpNickname ?? null,
      mpConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
}

/**
 * Desvincula la cuenta de MercadoPago del complejo.
 *
 * Por qué existe: hasta ahora conectar era un camino de una sola dirección. El
 * botón de /settings/facturacion se oculta cuando `mpConnectedAt` está seteado
 * y no había ninguna otra puerta, así que un complejo que conectó la cuenta
 * equivocada —o que cambia de cuenta— quedaba trabado sin salida in-app.
 *
 * Apaga `requires_deposit` en el mismo UPDATE, y eso no es un extra: exigir
 * seña sin MercadoPago conectado es justo el estado que dejaba al jugador
 * colgado en el checkout (F-003 del QA de producción 2026-08-17; el guard de
 * `updateReservasPolicyAction` impide ENTRAR a ese estado, así que desconectar
 * sin apagar la seña lo reconstruiría por la puerta de atrás). Un solo
 * statement para que no exista una ventana con seña activa y sin credenciales.
 *
 * El `%` de seña se deja como está: es la preferencia del complejo y sirve tal
 * cual cuando vuelva a conectar.
 */
export async function disconnectMercadoPago(
  tenantId: string,
  tx: DbTx,
): Promise<{ mpUserId: string | null }> {
  // Un solo statement: lee el `mp_user_id` que había y lo limpia en el mismo
  // UPDATE. Hace falta devolverlo porque `TenantRow` no lo expone y es el dato
  // con el que el audit log reconstruye a qué cuenta estaba vinculado. `RETURNING`
  // trae la fila NUEVA, así que el valor viejo se saca del `FROM` — que ve el
  // snapshot previo al UPDATE dentro de la misma sentencia.
  const rows = await tx.execute<{ mp_user_id: string | null }>(sql`
    UPDATE tenants AS t
    SET mp_access_token = NULL,
        mp_refresh_token = NULL,
        mp_user_id = NULL,
        mp_public_key = NULL,
        mp_nickname = NULL,
        mp_connected_at = NULL,
        -- t.settings calificado: con el self-join del FROM, "settings" a secas
        -- es ambiguo (42702). El lado izquierdo del SET nunca lleva prefijo;
        -- el derecho sí lo necesita. (Sin backticks en este comentario: cierran
        -- el template literal de JS.)
        settings = t.settings || '{"requires_deposit": false}'::jsonb,
        updated_at = NOW()
    FROM tenants AS previo
    WHERE t.id = ${tenantId} AND previo.id = t.id
    RETURNING previo.mp_user_id AS mp_user_id
  `)
  return { mpUserId: rows[0]?.mp_user_id ?? null }
}
