# Portal Público + Reserva Online (Jugador) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el portal público del jugador (búsqueda + explorar + página de complejo + vista semanal) y el flujo de reserva online con login gate (provisioning de jugador +18), checkout y redirección a MercadoPago.

**Architecture:** Server Components leen datos vía servicios (`tenants` es global sin RLS → `getDb()`; disponibilidad usa `withTenantContext`). Las mutaciones del jugador van por Server Actions. El magic link de Supabase provisiona el jugador en el callback y honra un `?next` same-origin para volver a la reserva. La reserva se crea con `createOnlineBooking` (tx player+tenant) y, si hay seña, `createDepositPayment` (tx tenant) que redirige a MP.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Drizzle ORM + postgres-js, Supabase Auth (magic link), MercadoPago, Tailwind, Vitest (unit + integration).

---

## File Structure

**[NEW]**
- `src/modules/players/player.service.ts` — `getOrCreatePlayer`
- `src/modules/tenants/search.service.ts` — `searchPublicTenants`, `listPublicCities`, tipos card/ciudad
- `src/lib/safe-redirect.ts` — `sanitizeNext` (guard open-redirect)
- `src/app/api/public/search/route.ts`
- `src/app/api/public/cities/route.ts`
- `src/app/api/public/availability/week/route.ts`
- `src/components/site/SiteNav.tsx` — nav compartido (variant overlay|solid)
- `src/components/site/SiteFooter.tsx` — footer compartido
- `src/app/(public)/layout.tsx`
- `src/app/(public)/explorar/page.tsx`
- `src/app/(public)/explorar/components/SearchBar.tsx`
- `src/app/(public)/explorar/components/TenantCard.tsx`
- `src/app/(public)/[slug]/reservar/page.tsx`
- `src/app/(public)/[slug]/reservar/actions.ts` — `sendPlayerMagicLink`, `createBookingAndCheckout`
- `src/app/(public)/[slug]/reservar/components/BookingSummary.tsx`
- `src/app/(public)/[slug]/reservar/components/LoginGate.tsx`
- `src/app/(public)/[slug]/reservar/components/ConfirmBookingButton.tsx`
- `src/app/(public)/[slug]/disponibilidad/page.tsx`
- `src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx`
- `src/app/reserva/[bookingId]/exito/page.tsx`
- `src/app/reserva/[bookingId]/error/page.tsx`
- `src/app/reserva/[bookingId]/pendiente/page.tsx`

**[MODIFY]**
- `src/modules/auth/auth.service.ts` — añadir `signInWithPlayerMagicLink`
- `src/app/api/auth/callback/route.ts` — rama player: provisiona jugador + honra `?next`
- `src/modules/tenants/public.service.ts` — añadir `getPublicWeeklyAvailability` + tipos
- `src/app/page.tsx` — importar `SiteNav`/`SiteFooter` (variant overlay), borrar defs inline
- `src/app/(public)/[slug]/page.tsx` — quitar `<main>` (lo da el layout), leer `searchParams.date`
- `src/app/(public)/[slug]/components/AvailabilityGrid.tsx` — slot libre → `<Link>` a reservar
- `src/app/(public)/[slug]/components/TenantHeader.tsx` — CTA "Ver semana completa"

**[DELETE]**
- `src/app/(public)/explorar/.gitkeep`
- `src/app/(public)/[slug]/reservar/.gitkeep`
- `src/app/(public)/[slug]/disponibilidad/.gitkeep`

---

## Task 1: Player provisioning service

**Files:**
- Create: `src/modules/players/player.service.ts`
- Test: `tests/integration/players.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/players.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

beforeAll(async () => { await ensureRoles() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('getOrCreatePlayer', () => {
  it('creates a new player with terms agreed', async () => {
    const email = `p-${Date.now()}@test.local`
    const player = await getOrCreatePlayer(email, 'Tomás', 'Pérez', {
      agreedToTerms: true,
      termsVersion: 'v1',
    })
    expect(player.id).toMatch(/^[0-9a-f-]{36}$/)

    const sql = getSql()
    const rows = await sql<{ email: string; agreed_to_terms_at: Date | null; terms_version: string | null }[]>`
      SELECT email, agreed_to_terms_at, terms_version FROM players WHERE id = ${player.id}
    `
    expect(rows[0]!.email).toBe(email.toLowerCase())
    expect(rows[0]!.agreed_to_terms_at).not.toBeNull()
    expect(rows[0]!.terms_version).toBe('v1')
  })

  it('is idempotent by email and backfills terms', async () => {
    const email = `p2-${Date.now()}@test.local`
    const sql = getSql()
    await sql`INSERT INTO players (email, first_name, last_name) VALUES (${email}, 'X', '')`
    const player = await getOrCreatePlayer(email, 'Ignored', 'Ignored', {
      agreedToTerms: true,
      termsVersion: 'v1',
    })
    const rows = await sql<{ id: string }[]>`SELECT id FROM players WHERE email = ${email}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(player.id)

    const terms = await sql<{ agreed_to_terms_at: Date | null }[]>`
      SELECT agreed_to_terms_at FROM players WHERE id = ${player.id}
    `
    expect(terms[0]!.agreed_to_terms_at).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration players`
Expected: FAIL — `getOrCreatePlayer` is not defined (module missing).

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/players/player.service.ts
import { getSql } from '@/shared/db/client'

export type GetOrCreatePlayerOpts = {
  agreedToTerms?: boolean
  termsVersion?: string
  phone?: string | null
}

/**
 * Idempotent provisioning by email (global `players` table, no RLS).
 * On an existing player, backfills `agreed_to_terms_at`/`terms_version` if the
 * caller signals fresh consent and the row had none. Names are only used on insert.
 */
export async function getOrCreatePlayer(
  email: string,
  firstName: string,
  lastName: string,
  opts: GetOrCreatePlayerOpts = {},
): Promise<{ id: string }> {
  const sql = getSql()
  const lower = email.toLowerCase()
  const agreed = opts.agreedToTerms === true
  const termsVersion = opts.termsVersion ?? 'v1'

  const existing = await sql<{ id: string; agreed_to_terms_at: Date | null }[]>`
    SELECT id, agreed_to_terms_at FROM players WHERE email = ${lower} LIMIT 1
  `
  if (existing.length > 0) {
    const row = existing[0]!
    if (agreed && row.agreed_to_terms_at === null) {
      await sql`
        UPDATE players
        SET agreed_to_terms_at = NOW(), terms_version = ${termsVersion}, last_login_at = NOW()
        WHERE id = ${row.id}
      `
    } else {
      await sql`UPDATE players SET last_login_at = NOW() WHERE id = ${row.id}`
    }
    return { id: row.id }
  }

  const created = await sql<{ id: string }[]>`
    INSERT INTO players (email, first_name, last_name, phone, agreed_to_terms_at, terms_version, last_login_at)
    VALUES (
      ${lower}, ${firstName}, ${lastName}, ${opts.phone ?? null},
      ${agreed ? sql`NOW()` : null}, ${agreed ? termsVersion : null}, NOW()
    )
    RETURNING id
  `
  return { id: created[0]! }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration players`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/modules/players/player.service.ts tests/integration/players.test.ts
git commit -m "feat(players): add getOrCreatePlayer provisioning service"
```

---

## Task 2: Player magic-link sign-in

**Files:**
- Modify: `src/modules/auth/auth.service.ts`

- [ ] **Step 1: Add the function** (after `signInWithMagicLink`, reusing `SignInResult`)

```ts
// src/modules/auth/auth.service.ts — añadir tras signInWithMagicLink

export type PlayerProfile = {
  firstName: string
  lastName: string
  agreedTerms: boolean
  termsVersion: string
}

/**
 * Magic link for the player booking flow. `options.data` persists to
 * `user_metadata`; the auth callback reads `is_player` + profile to provision
 * the player and set durable `app_metadata`.
 */
export async function signInWithPlayerMagicLink(
  email: string,
  redirectTo: string,
  profile: PlayerProfile,
): Promise<SignInResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        is_player: true,
        first_name: profile.firstName,
        last_name: profile.lastName,
        agreed_terms: profile.agreedTerms,
        terms_version: profile.termsVersion,
      },
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

```bash
git add src/modules/auth/auth.service.ts
git commit -m "feat(auth): add signInWithPlayerMagicLink with is_player metadata"
```

---

## Task 3: Open-redirect guard (`sanitizeNext`)

**Files:**
- Create: `src/lib/safe-redirect.ts`
- Test: `tests/unit/safe-redirect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/safe-redirect.test.ts
import { describe, expect, it } from 'vitest'
import { sanitizeNext } from '@/lib/safe-redirect'

describe('sanitizeNext', () => {
  it('keeps a same-origin relative path', () => {
    expect(sanitizeNext('/club-x/reservar?court=1')).toBe('/club-x/reservar?court=1')
  })
  it('falls back when null', () => {
    expect(sanitizeNext(null)).toBe('/mis-reservas')
  })
  it('rejects protocol-relative //evil.com', () => {
    expect(sanitizeNext('//evil.com')).toBe('/mis-reservas')
  })
  it('rejects absolute http URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/mis-reservas')
  })
  it('rejects backslash trick /\\evil.com', () => {
    expect(sanitizeNext('/\\evil.com')).toBe('/mis-reservas')
  })
  it('honors a custom fallback', () => {
    expect(sanitizeNext(undefined, '/explorar')).toBe('/explorar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test safe-redirect`
Expected: FAIL — `sanitizeNext` not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/safe-redirect.ts

/**
 * Returns `next` only if it is a safe same-origin path (starts with a single
 * `/`, not `//` or `/\`). Otherwise returns `fallback`. Guards against
 * open-redirects through the auth callback `?next` param.
 */
export function sanitizeNext(
  next: string | null | undefined,
  fallback = '/mis-reservas',
): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  if (next.startsWith('/\\')) return fallback
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test safe-redirect`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/safe-redirect.ts tests/unit/safe-redirect.test.ts
git commit -m "feat(auth): add sanitizeNext open-redirect guard"
```

---

## Task 4: Auth callback — provision player + honor `next`

**Files:**
- Modify: `src/app/api/auth/callback/route.ts:35-37` (the `isPlayer` branch)

- [ ] **Step 1: Replace the player branch**

Current:
```ts
  if (isPlayer) {
    return NextResponse.redirect(new URL('/mis-reservas', req.url))
  }
```

New:
```ts
  if (isPlayer) {
    const email = user.email
    if (!email) return redirectVerifyError(req, 'invalid')

    const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
    const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
    const firstName = firstNameMeta || email.split('@')[0] || 'Jugador'
    const lastName = lastNameMeta ?? ''
    const agreedTerms = userMeta.agreed_terms === true || meta.agreed_terms === true
    const termsVersion = typeof userMeta.terms_version === 'string' ? userMeta.terms_version : 'v1'

    const player = await getOrCreatePlayer(email, firstName, lastName, {
      agreedToTerms: agreedTerms,
      termsVersion,
    })

    if (meta.player_id !== player.id || meta.is_player !== true) {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: { ...meta, is_player: true, player_id: player.id },
      })
      await supabase.auth.refreshSession()
    }

    const next = sanitizeNext(new URL(req.url).searchParams.get('next'))
    return NextResponse.redirect(new URL(next, req.url))
  }
```

- [ ] **Step 2: Add the imports** at the top of the file (after existing imports)

```ts
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { sanitizeNext } from '@/lib/safe-redirect'
```

(`createAdminClient` is already imported.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat(auth): provision player and honor ?next in magic-link callback"
```

---

## Task 5: Public search service

**Files:**
- Create: `src/modules/tenants/search.service.ts`
- Test: `tests/integration/public-search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/public-search.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { listPublicCities, searchPublicTenants } from '@/modules/tenants/search.service'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

const TAG = `srch${Date.now()}`

async function seed() {
  const sql = getSql()
  await sql`
    INSERT INTO tenants (slug, name, address, city, province, phone, email, status)
    VALUES
      (${`${TAG}-a`}, ${`${TAG} Goleador`}, 'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}a@t.local`}, 'active'),
      (${`${TAG}-b`}, ${`${TAG} Mundialito`}, 'x', 'Córdoba', 'Córdoba', '1', ${`${TAG}b@t.local`}, 'trialing'),
      (${`${TAG}-c`}, ${`${TAG} Suspendido`}, 'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}c@t.local`}, 'suspended')
  `
}

beforeAll(async () => { await ensureRoles(); await seed() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('searchPublicTenants', () => {
  it('returns only active/trialing matching the name query', async () => {
    const { results, total } = await searchPublicTenants({ q: TAG })
    expect(total).toBe(2)
    const slugs = results.map((r) => r.slug).sort()
    expect(slugs).toEqual([`${TAG}-a`, `${TAG}-b`])
  })

  it('filters by city', async () => {
    const { results } = await searchPublicTenants({ q: TAG, city: 'Mendoza' })
    expect(results).toHaveLength(1)
    expect(results[0]!.slug).toBe(`${TAG}-a`)
  })
})

describe('listPublicCities', () => {
  it('groups visible tenants by city (excludes suspended)', async () => {
    const cities = await listPublicCities()
    const mendoza = cities.find((c) => c.city === 'Mendoza')
    expect(mendoza).toBeDefined()
    // only the active 'Mendoza' tenant counts, not the suspended one
    expect(mendoza!.count).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration public-search`
Expected: FAIL — module/functions missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/tenants/search.service.ts
import { and, eq, ilike, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import type { TenantSettings } from './tenant.types'

export type PublicTenantCard = {
  id: string
  slug: string
  name: string
  city: string
  province: string
  logoUrl: string | null
  coverUrl: string | null
  allowOnlineBooking: boolean
}

export type SearchParams = {
  q?: string
  city?: string
  province?: string
  onlineOnly?: boolean
  limit?: number
  offset?: number
}

export type SearchResult = { results: PublicTenantCard[]; total: number }
export type CityCount = { city: string; province: string; count: number }

const VISIBLE = ['active', 'trialing']

export async function searchPublicTenants(params: SearchParams): Promise<SearchResult> {
  const db = getDb()
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)

  const conds = [inArray(tenants.status, VISIBLE as never)]
  const q = params.q?.trim()
  if (q) conds.push(ilike(tenants.name, `%${q}%`))
  if (params.city) conds.push(eq(tenants.city, params.city))
  if (params.province) conds.push(eq(tenants.province, params.province))
  if (params.onlineOnly) {
    conds.push(sql`(${tenants.settings} ->> 'allow_online_booking') = 'true'`)
  }
  const where = and(...conds)

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        city: tenants.city,
        province: tenants.province,
        logoUrl: tenants.logoUrl,
        coverUrl: tenants.coverUrl,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(where)
      .orderBy(tenants.name)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where),
  ])

  const results: PublicTenantCard[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    allowOnlineBooking: (r.settings as TenantSettings).allow_online_booking ?? true,
  }))
  return { results, total: countRows[0]?.count ?? 0 }
}

export async function listPublicCities(): Promise<CityCount[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT city, province, count(*)::int AS count
    FROM tenants
    WHERE status IN ('active', 'trialing')
    GROUP BY city, province
    ORDER BY count DESC, city ASC
  `)
  return rows as unknown as CityCount[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration public-search`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/modules/tenants/search.service.ts tests/integration/public-search.test.ts
git commit -m "feat(tenants): add public search + cities service"
```

---

## Task 6: Search + cities API routes

**Files:**
- Create: `src/app/api/public/search/route.ts`
- Create: `src/app/api/public/cities/route.ts`

- [ ] **Step 1: Write the search route**

```ts
// src/app/api/public/search/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { searchPublicTenants } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Number(sp.get('limit') ?? '20')
  const offset = Number(sp.get('offset') ?? '0')

  const result = await searchPublicTenants({
    q: sp.get('q') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    onlineOnly: sp.get('online') === '1',
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
  })

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
```

- [ ] **Step 2: Write the cities route**

```ts
// src/app/api/public/cities/route.ts
import { NextResponse } from 'next/server'
import { listPublicCities } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cities = await listPublicCities()
  return NextResponse.json(
    { cities },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  )
}
```

- [ ] **Step 3: Typecheck + smoke test**

Run: `pnpm typecheck`
Then run `pnpm dev` and verify:
- `curl 'http://localhost:3000/api/public/search?q=' ` → `{ "results": [...], "total": N }`
- `curl 'http://localhost:3000/api/public/cities'` → `{ "cities": [...] }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/public/search/route.ts src/app/api/public/cities/route.ts
git commit -m "feat(api): public search + cities endpoints"
```

---

## Task 7: Weekly availability service

**Files:**
- Modify: `src/modules/tenants/public.service.ts` (append at end)
- Test: `tests/integration/weekly-availability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/weekly-availability.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = {
  rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }],
}

beforeAll(async () => { await ensureRoles() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('getPublicWeeklyAvailability', () => {
  it('returns 7 consecutive days each with the online court', async () => {
    const sql = getSql()
    const t = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active' WHERE id = ${t.id}`
    await sql`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${t.id}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online')
    `
    const tenant = await getPublicTenant(t.slug)
    expect(tenant).not.toBeNull()

    const week = await getPublicWeeklyAvailability(tenant!, '2099-06-15')
    expect(week.startDate).toBe('2099-06-15')
    expect(week.days).toHaveLength(7)
    expect(week.days[0]!.date).toBe('2099-06-15')
    expect(week.days[6]!.date).toBe('2099-06-21')
    expect(week.days[0]!.courts).toHaveLength(1)
    expect(week.days[0]!.courts[0]!.slots.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration weekly-availability`
Expected: FAIL — `getPublicWeeklyAvailability` not exported.

- [ ] **Step 3: Append the implementation to `public.service.ts`**

```ts
// src/modules/tenants/public.service.ts — añadir al final

export type WeeklyDay = { date: string; courts: PublicCourt[] }
export type WeeklyAvailabilityResponse = { startDate: string; days: WeeklyDay[] }

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function getPublicWeeklyAvailability(
  tenant: PublicTenant,
  startDateStr: string,
): Promise<WeeklyAvailabilityResponse> {
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const nowDateStr = artNow.toISOString().slice(0, 10)
  const nowMins = artNow.getUTCHours() * 60 + artNow.getUTCMinutes()

  const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(startDateStr, i))
  const endDateStr = dates[dates.length - 1]!
  const durationMins = tenant.bookingDurationMinutes[0] ?? 60
  const closedDatesSet = new Set(tenant.closedDates)

  const { courtsData, bookingsByDate } = await withTenantContext(tenant.id, async (tx) => {
    const courtsData = await tx
      .select({
        id: courts.id,
        name: courts.name,
        surfaceType: courts.surfaceType,
        pricing: courts.pricing,
      })
      .from(courts)
      .where(eq(courts.status, 'online'))

    const rows = (await tx.execute(sql`
      SELECT court_id AS "courtId", date::text AS "date",
             time_start::text AS "timeStart", time_end::text AS "timeEnd"
      FROM bookings
      WHERE date >= ${startDateStr}::date AND date <= ${endDateStr}::date
        AND status NOT IN ('canceled_refunded', 'canceled_no_refund')
    `)) as unknown as Array<{ courtId: string; date: string; timeStart: string; timeEnd: string }>

    const bookingsByDate = new Map<string, BookingRange[]>()
    for (const r of rows) {
      const endMins = timeToMins(r.timeEnd.slice(0, 5))
      const range: BookingRange = {
        courtId: r.courtId,
        timeStartMins: timeToMins(r.timeStart.slice(0, 5)),
        timeEndMins: endMins === 0 ? 24 * 60 : endMins,
      }
      const key = r.date.slice(0, 10)
      const list = bookingsByDate.get(key) ?? []
      list.push(range)
      bookingsByDate.set(key, list)
    }
    return { courtsData, bookingsByDate }
  })

  const days: WeeklyDay[] = dates.map((dateStr) => {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const targetUtc = new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1))
    const dayKey = DAY_KEYS[targetUtc.getUTCDay()]!
    const dayHours = tenant.openingHours[dayKey as keyof OpeningHours]
    const closedDay = dayHours?.closed === true || closedDatesSet.has(dateStr)
    const courtBookings = bookingsByDate.get(dateStr) ?? []

    const dayCourts: PublicCourt[] = courtsData.map((court) => ({
      id: court.id,
      name: court.name,
      surfaceType: court.surfaceType,
      slots: generateSlots({
        courtId: court.id,
        pricing: court.pricing as CourtPricingData,
        dayKey,
        openHhmm: dayHours?.open ?? '08:00',
        closeHhmm: dayHours?.close ?? '23:00',
        closedDay,
        courtBookings,
        durationMins,
        date: dateStr,
        nowDateStr,
        nowMins,
      }),
    }))
    return { date: dateStr, courts: dayCourts }
  })

  return { startDate: startDateStr, days }
}
```

> Note: `DAY_KEYS`, `timeToMins`, `generateSlots`, `BookingRange`, `CourtPricingData`, `withTenantContext`, `courts`, `bookings`, `OpeningHours`, `eq`, `sql` are all already in scope in `public.service.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration weekly-availability`
Expected: PASS (1 test).

- [ ] **Step 5: Verify existing unit tests still pass + commit**

```bash
pnpm test public-service
pnpm typecheck
git add src/modules/tenants/public.service.ts tests/integration/weekly-availability.test.ts
git commit -m "feat(tenants): add getPublicWeeklyAvailability batch service"
```

---

## Task 8: Weekly availability API route

**Files:**
- Create: `src/app/api/public/availability/week/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/public/availability/week/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const slug = sp.get('slug')
  const start = sp.get('start')
  if (!slug || !start || !DATE_RE.test(start)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const todayStr = artNow.toISOString().slice(0, 10)

  const tenant = await getPublicTenant(slug)
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // start must be within [today, today + advanceDays]
  const maxStart = addDays(todayStr, tenant.bookingAdvanceDays)
  if (start < todayStr || start > maxStart) {
    return NextResponse.json({ error: 'date_out_of_range' }, { status: 400 })
  }

  const week = await getPublicWeeklyAvailability(tenant, start)
  return NextResponse.json(week, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
```

- [ ] **Step 2: Typecheck + smoke**

Run: `pnpm typecheck`
Smoke (with a real slug): `curl 'http://localhost:3000/api/public/availability/week?slug=<slug>&start=2099-06-15'` → `{ "startDate": ..., "days": [7] }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/public/availability/week/route.ts
git commit -m "feat(api): weekly public availability endpoint"
```

---

## Task 9: Shared SiteNav / SiteFooter + landing refactor

**Files:**
- Create: `src/components/site/SiteNav.tsx`
- Create: `src/components/site/SiteFooter.tsx`
- Modify: `src/app/page.tsx` (remove inline `SiteNav`/`SiteFooter`, import shared)

- [ ] **Step 1: Create `SiteNav.tsx`** (overlay = exact current landing markup; solid = light portal nav)

```tsx
// src/components/site/SiteNav.tsx
import Link from 'next/link'

type Props = { variant?: 'overlay' | 'solid' }

export default function SiteNav({ variant = 'solid' }: Props) {
  if (variant === 'overlay') {
    return (
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/90 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30">
              TG
            </span>
            <span className="text-lg font-semibold tracking-tight">TurnoGol</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-300 hover:text-white transition-colors">Funcionalidades</a>
            <a href="#testimonios" className="text-sm text-slate-300 hover:text-white transition-colors">Testimonios</a>
            <Link href="/explorar" className="text-sm text-slate-300 hover:text-white transition-colors">Explorar</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-slate-200 hover:text-white transition-colors sm:inline">
              Iniciar sesión
            </Link>
            <Link href="/register" className="inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/30 hover:bg-slate-100 transition-colors duration-150">
              Comenzar
            </Link>
          </div>
        </div>
      </header>
    )
  }

  // solid — portal pages over a light background
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white shadow-sm">TG</span>
          <span className="text-lg font-semibold tracking-tight">TurnoGol</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/explorar" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Explorar</Link>
          <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors">
            Ingresar
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Create `SiteFooter.tsx`** (exact current landing footer markup)

```tsx
// src/components/site/SiteFooter.tsx
import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-slate-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-slate-950">TG</span>
          <span className="text-sm font-semibold text-white">TurnoGol</span>
          <span className="text-xs text-slate-500">© {new Date().getFullYear()} · Argentina</span>
        </div>
        <div className="flex gap-6 text-xs text-slate-400">
          <Link href="/explorar" className="hover:text-white transition-colors">Explorar</Link>
          <Link href="/login" className="hover:text-white transition-colors">Iniciar sesión</Link>
          <a href="mailto:hola@turnogol.com.ar" className="hover:text-white transition-colors">Contacto</a>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Refactor `src/app/page.tsx`**

Add the imports at top (after the lucide import block):
```ts
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'
```

In `HomePage`, change `<SiteNav />` to `<SiteNav variant="overlay" />`. Then **delete** the two local `function SiteNav() {...}` and `function SiteFooter() {...}` definitions (lines ~106-144 and ~436-457).

- [ ] **Step 4: Verify the landing is visually unchanged**

Run: `pnpm typecheck && pnpm lint`
Run `pnpm dev`, open `/`, confirm nav (transparent over hero) and footer render identically. The only change: the desktop nav "Planes" anchor is now an "Explorar" link.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/ src/app/page.tsx
git commit -m "refactor(site): extract shared SiteNav/SiteFooter with overlay|solid variants"
```

---

## Task 10: Public layout + `[slug]` page main-wrapper fix

**Files:**
- Create: `src/app/(public)/layout.tsx`
- Modify: `src/app/(public)/[slug]/page.tsx`

- [ ] **Step 1: Create the layout**

```tsx
// src/app/(public)/layout.tsx
import type { ReactNode } from 'react'
import SiteNav from '@/components/site/SiteNav'
import SiteFooter from '@/components/site/SiteFooter'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <SiteNav variant="solid" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
```

- [ ] **Step 2: Drop the `<main>` from `[slug]/page.tsx`** (the layout now owns it)

Change the unavailable branch from `<main className="min-h-screen bg-background flex ...">` to a plain `<div className="flex min-h-[60vh] items-center justify-center px-4">`.

Change the main return wrapper from:
```tsx
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
```
to:
```tsx
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
```
and close with `</div>` (remove the `</main>`).

- [ ] **Step 3: Read `searchParams.date` to seed the grid**

Change the page signature and `todayStr` logic:
```tsx
type Props = { params: { slug: string }; searchParams: { date?: string } }
```
After `const todayStr = getArtToday()` add:
```tsx
  const maxStr = addDaysStr(todayStr, tenant.bookingAdvanceDays)
  const reqDate = props.searchParams.date
  const initialDate =
    reqDate && /^\d{4}-\d{2}-\d{2}$/.test(reqDate) && reqDate >= todayStr && reqDate <= maxStr
      ? reqDate
      : todayStr
```
Add a local helper near `getArtToday`:
```tsx
function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
```
Pass `initialDate` into `GridSection` (rename `todayStr` prop to `initialDate`) so the grid opens on the requested day:
```tsx
async function GridSection({ tenant, initialDate }: { tenant: PublicTenant; initialDate: string }) {
  const initialAvailability = await getPublicAvailability(tenant, initialDate)
  return <AvailabilityGrid tenant={tenant} initialDate={initialDate} initialAvailability={initialAvailability} />
}
```
and `<GridSection tenant={tenant} initialDate={initialDate} />`. Update the function param to `(props: Props)` and read `props.params.slug` / `props.searchParams`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Run `pnpm dev`, open `/<slug>` → nav + footer now wrap the page; open `/<slug>?date=<future-date>` → grid opens on that date.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/layout.tsx" "src/app/(public)/[slug]/page.tsx"
git commit -m "feat(public): shared portal layout + date-seeded complex page"
```

---

## Task 11: /explorar page + SearchBar + TenantCard

**Files:**
- Create: `src/app/(public)/explorar/components/TenantCard.tsx`
- Create: `src/app/(public)/explorar/components/SearchBar.tsx`
- Create: `src/app/(public)/explorar/page.tsx`
- Delete: `src/app/(public)/explorar/.gitkeep`

- [ ] **Step 1: TenantCard** (hover premium, mobile-first)

```tsx
// src/app/(public)/explorar/components/TenantCard.tsx
import Link from 'next/link'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

export default function TenantCard({ tenant }: { tenant: PublicTenantCard }) {
  return (
    <Link
      href={`/${tenant.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
        {tenant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-3xl font-bold text-emerald-600/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {tenant.allowOnlineBooking && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden /> Reserva online
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{tenant.name}</h3>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          {tenant.city}, {tenant.province}
        </p>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: SearchBar** (client, sincroniza con la URL, debounce)

```tsx
// src/app/(public)/explorar/components/SearchBar.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import type { CityCount } from '@/modules/tenants/search.service'

export default function SearchBar({ cities }: { cities: CityCount[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const city = params.get('city') ?? ''
  const online = params.get('online') === '1'
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function push(next: URLSearchParams) {
    next.delete('offset')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  // debounce free-text query
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (q.trim()) next.set('q', q.trim())
      else next.delete('q')
      if (next.toString() !== params.toString()) push(next)
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    push(next)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por nombre de complejo…"
          aria-label="Buscar complejo"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
        />
      </div>
      <select
        value={city}
        onChange={(e) => setParam('city', e.target.value || null)}
        aria-label="Filtrar por ciudad"
        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:w-56"
      >
        <option value="">Todas las ciudades</option>
        {cities.map((c) => (
          <option key={`${c.city}-${c.province}`} value={c.city}>{c.city} ({c.count})</option>
        ))}
      </select>
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
        <input type="checkbox" checked={online} onChange={(e) => setParam('online', e.target.checked ? '1' : null)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        Reserva online
      </label>
    </div>
  )
}
```

- [ ] **Step 3: explorar page** (server, lee searchParams + cities)

```tsx
// src/app/(public)/explorar/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { listPublicCities, searchPublicTenants } from '@/modules/tenants/search.service'
import SearchBar from './components/SearchBar'
import TenantCard from './components/TenantCard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Explorá complejos de fútbol — TurnoGol',
  description: 'Encontrá canchas de fútbol y reservá online en tu ciudad.',
}

const PAGE_SIZE = 20

type Props = {
  searchParams: { q?: string; city?: string; province?: string; online?: string; offset?: string }
}

export default async function ExplorarPage({ searchParams }: Props) {
  const offset = Math.max(Number(searchParams.offset ?? '0') || 0, 0)
  const [{ results, total }, cities] = await Promise.all([
    searchPublicTenants({
      q: searchParams.q,
      city: searchParams.city,
      province: searchParams.province,
      onlineOnly: searchParams.online === '1',
      limit: PAGE_SIZE,
      offset,
    }),
    listPublicCities(),
  ])

  const nextOffset = offset + PAGE_SIZE
  const hasMore = nextOffset < total

  const nextParams = new URLSearchParams()
  if (searchParams.q) nextParams.set('q', searchParams.q)
  if (searchParams.city) nextParams.set('city', searchParams.city)
  if (searchParams.online === '1') nextParams.set('online', '1')
  nextParams.set('offset', String(nextOffset))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Explorá complejos</h1>
        <p className="text-sm text-slate-500">{total} complejo{total === 1 ? '' : 's'} disponible{total === 1 ? '' : 's'}.</p>
      </header>

      <SearchBar cities={cities} />

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
          <SearchX className="h-10 w-10" aria-hidden />
          <p className="text-sm">No encontramos complejos con esos filtros.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((t) => <TenantCard key={t.id} tenant={t} />)}
        </div>
      )}

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <Link href={`/explorar?${nextParams.toString()}`} className="inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
            Ver más
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Delete the placeholder**

```bash
git rm "src/app/(public)/explorar/.gitkeep"
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Run `pnpm dev`, open `/explorar`: cards render, typing filters via URL, city select + online toggle work, "Ver más" paginates.

```bash
git add "src/app/(public)/explorar/"
git commit -m "feat(explorar): public search portal with filters and tenant cards"
```

---

## Task 12: AvailabilityGrid slot → reservar link + TenantHeader CTA

**Files:**
- Modify: `src/app/(public)/[slug]/components/AvailabilityGrid.tsx`
- Modify: `src/app/(public)/[slug]/components/TenantHeader.tsx`

- [ ] **Step 1: Make the free slot a booking link**

In `AvailabilityGrid.tsx`, add `import Link from 'next/link'` at top. Change `SlotCell` to accept the slug and the slot duration, and render the free+online branch as a `<Link>`:

Replace the `SlotCell` signature and free-slot branch:
```tsx
function SlotCell({
  slot,
  slug,
  allowOnlineBooking,
  phone,
}: {
  slot: Slot
  slug: string
  allowOnlineBooking: boolean
  phone: string
}) {
  if (slot.status === 'past') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-400">—</span>
    )
  }
  if (slot.status === 'occupied') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 ring-1 ring-inset ring-red-600/20">Ocupado</span>
    )
  }

  const priceFormatted = slot.price
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(slot.price / 100)
    : null

  if (!allowOnlineBooking) {
    return (
      <a href={`tel:${phone}`} aria-label="Contactar al complejo para reservar" className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors duration-150">
        <Phone className="h-3 w-3" aria-hidden /> Contactar
      </a>
    )
  }

  return (
    <Link
      href={`/${slug}/reservar?court=${cellCourtId(slot)}&date=${cellDate(slot)}&time=${slot.time}&dur=${slot.duration}`}
      className="inline-flex w-full flex-col items-center rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 hover:bg-green-100 active:scale-[0.98] transition-colors duration-150"
    >
      <span>Reservar</span>
      {priceFormatted && <span className="tabular-nums text-[10px] text-green-600">{priceFormatted}</span>}
    </Link>
  )
}
```

The `Slot` type has no `courtId`/`date`, so pass them explicitly instead of helper stubs. Update the call site in the grid body and the `SlotCell` props to receive `courtId` and `date`:

Replace the cell render block inside the table body:
```tsx
                  {row.cells.map(({ courtId, slot }) => (
                    <td key={courtId} className="py-1.5 px-2 text-center align-middle">
                      {slot ? (
                        <SlotCell
                          slot={slot}
                          slug={tenant.slug}
                          courtId={courtId}
                          date={date}
                          allowOnlineBooking={tenant.allowOnlineBooking}
                          phone={tenant.phone}
                        />
                      ) : (
                        <span className="text-slate-200 text-xs">—</span>
                      )}
                    </td>
                  ))}
```
and update `SlotCell` props to include `courtId: string` and `date: string`, building the href as:
```tsx
      href={`/${slug}/reservar?court=${courtId}&date=${date}&time=${slot.time}&dur=${slot.duration}`}
```
(Remove the `cellCourtId`/`cellDate` stubs — they were illustrative; use the passed `courtId` and `date` props directly.)

- [ ] **Step 2: TenantHeader CTA "Ver semana completa"**

In `TenantHeader.tsx`, add `import Link from 'next/link'` and `CalendarDays` to the lucide import. Inside the `flex flex-wrap ...` contact row, append:
```tsx
        <Link href={`/${tenant.slug}/disponibilidad`} className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium transition-colors">
          <CalendarDays className="h-4 w-4 flex-shrink-0" aria-hidden />
          Ver semana completa
        </Link>
```
Note: `tenant.slug` is part of `PublicTenant`, already available.

- [ ] **Step 3: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Run `pnpm dev`, open `/<slug>`: free slots now link to `/<slug>/reservar?...`; header shows "Ver semana completa".

```bash
git add "src/app/(public)/[slug]/components/AvailabilityGrid.tsx" "src/app/(public)/[slug]/components/TenantHeader.tsx"
git commit -m "feat(public): free slots link to booking + weekly CTA"
```

---

## Task 13: /[slug]/disponibilidad weekly view

**Files:**
- Create: `src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx`
- Create: `src/app/(public)/[slug]/disponibilidad/page.tsx`
- Delete: `src/app/(public)/[slug]/disponibilidad/.gitkeep`

- [ ] **Step 1: WeeklyAvailability** (client — day tabs/swipe, slots link to reservar)

```tsx
// src/app/(public)/[slug]/disponibilidad/components/WeeklyAvailability.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { WeeklyAvailabilityResponse } from '@/modules/tenants/public.service'

function formatDayTab(dateStr: string): { dow: string; dm: string } {
  const dt = new Date(dateStr + 'T12:00:00Z')
  const dow = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' }).format(dt)
  const dm = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dt)
  return { dow, dm }
}

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function WeeklyAvailability({ slug, week }: { slug: string; week: WeeklyAvailabilityResponse }) {
  const [active, setActive] = useState(0)
  const day = week.days[active]!

  return (
    <section className="space-y-4" aria-label="Disponibilidad semanal">
      {/* Day tabs — horizontally scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {week.days.map((d, i) => {
          const { dow, dm } = formatDayTab(d.date)
          const isActive = i === active
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`flex min-w-[68px] snap-start flex-col items-center rounded-xl border px-3 py-2 text-xs transition-colors ${
                isActive ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold capitalize">{dow}</span>
              <span className="tabular-nums">{dm}</span>
            </button>
          )
        })}
      </div>

      {day.courts.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Sin canchas disponibles este día.</p>
      ) : (
        <div className="space-y-5">
          {day.courts.map((court) => {
            const free = court.slots.filter((s) => s.status === 'free')
            return (
              <div key={court.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{court.name}</h3>
                {free.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin turnos libres.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {free.map((s) => (
                      <Link
                        key={s.time}
                        href={`/${slug}/reservar?court=${court.id}&date=${day.date}&time=${s.time}&dur=${s.duration}`}
                        className="flex flex-col items-center rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 hover:bg-green-100 active:scale-[0.98] transition-colors"
                      >
                        <span className="tabular-nums">{s.time}</span>
                        {s.price && <span className="text-[10px] text-green-600 tabular-nums">{formatARS(s.price)}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: disponibilidad page** (server)

```tsx
// src/app/(public)/[slug]/disponibilidad/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])

function getArtToday(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default async function DisponibilidadPage({ params }: Props) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant || UNAVAILABLE.has(tenant.status)) notFound()

  const week = await getPublicWeeklyAvailability(tenant, getArtToday())
  const { default: WeeklyAvailability } = await import('./components/WeeklyAvailability')

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <Link href={`/${tenant.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
        <ChevronLeft className="h-4 w-4" aria-hidden /> {tenant.name}
      </Link>
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Disponibilidad semanal</h1>
      <WeeklyAvailability slug={tenant.slug} week={week} />
    </div>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) return {}
  return { title: `Disponibilidad — ${tenant.name} · TurnoGol` }
}
```

- [ ] **Step 3: Delete placeholder + verify + commit**

```bash
git rm "src/app/(public)/[slug]/disponibilidad/.gitkeep"
pnpm typecheck && pnpm lint
```
Run `pnpm dev`, open `/<slug>/disponibilidad`: 7 day tabs, switching days shows free slots, slots link to reservar.

```bash
git add "src/app/(public)/[slug]/disponibilidad/"
git commit -m "feat(public): weekly availability page with day tabs"
```

---

## Task 14: Reservar — summary, login gate, magic-link action

**Files:**
- Create: `src/app/(public)/[slug]/reservar/components/BookingSummary.tsx`
- Create: `src/app/(public)/[slug]/reservar/components/LoginGate.tsx`
- Create: `src/app/(public)/[slug]/reservar/actions.ts` (first action only; checkout added in Task 15)
- Create: `src/app/(public)/[slug]/reservar/page.tsx`
- Delete: `src/app/(public)/[slug]/reservar/.gitkeep`

- [ ] **Step 1: BookingSummary** (presentational)

```tsx
// src/app/(public)/[slug]/reservar/components/BookingSummary.tsx
import { CalendarDays, Clock, MapPin } from 'lucide-react'

function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cents / 100)
}
function formatDateES(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z')
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dt)
}

export type BookingSummaryData = {
  tenantName: string
  city: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
  price: number
  depositAmount: number
}

export default function BookingSummary({ data }: { data: BookingSummaryData }) {
  const rest = Math.max(data.price - data.depositAmount, 0)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{data.tenantName}</h2>
        <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden /> {data.city}</p>
      </div>
      <dl className="space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div className="flex items-center gap-2 text-slate-700"><CalendarDays className="h-4 w-4 text-emerald-600" aria-hidden /><span className="capitalize">{formatDateES(data.date)}</span></div>
        <div className="flex items-center gap-2 text-slate-700"><Clock className="h-4 w-4 text-emerald-600" aria-hidden /><span className="tabular-nums">{data.timeStart}–{data.timeEnd} · {data.courtName}</span></div>
      </dl>
      <div className="space-y-1 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between text-slate-600"><span>Precio del turno</span><span className="tabular-nums">{formatARS(data.price)}</span></div>
        {data.depositAmount > 0 ? (
          <>
            <div className="flex justify-between font-semibold text-slate-900"><span>Seña a pagar ahora</span><span className="tabular-nums">{formatARS(data.depositAmount)}</span></div>
            <div className="flex justify-between text-xs text-slate-500"><span>Resto en el complejo</span><span className="tabular-nums">{formatARS(rest)}</span></div>
          </>
        ) : (
          <p className="text-xs text-slate-500">Este complejo no requiere seña. Pagás el total en el complejo.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `actions.ts` — `sendPlayerMagicLink`**

```ts
// src/app/(public)/[slug]/reservar/actions.ts
'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { signInWithPlayerMagicLink } from '@/modules/auth/auth.service'
import { sanitizeNext } from '@/lib/safe-redirect'

const TERMS_VERSION = 'v1'

const gateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1, 'Ingresá tu nombre').max(80),
  lastName: z.string().trim().max(80).optional().default(''),
  terms: z.literal('on', { errorMap: () => ({ message: 'Tenés que aceptar los términos.' }) }),
  next: z.string(),
})

export type GateState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

export async function sendPlayerMagicLink(_prev: GateState, formData: FormData): Promise<GateState> {
  const parsed = gateSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    terms: formData.get('terms'),
    next: formData.get('next'),
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const origin = headers().get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const safeNext = sanitizeNext(parsed.data.next, '/mis-reservas')
  const redirectTo = `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`

  const result = await signInWithPlayerMagicLink(parsed.data.email, redirectTo, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    agreedTerms: true,
    termsVersion: TERMS_VERSION,
  })
  if (!result.ok) return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' }
  return { status: 'sent', email: parsed.data.email }
}
```

- [ ] **Step 3: LoginGate** (client — email + nombre + términos +18)

```tsx
// src/app/(public)/[slug]/reservar/components/LoginGate.tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, Mail } from 'lucide-react'
import { sendPlayerMagicLink, type GateState } from '../actions'

const initial: GateState = { status: 'idle' }

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-60">
      {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Enviando…</> : 'Continuar con email'}
    </button>
  )
}

export default function LoginGate({ next }: { next: string }) {
  const [state, formAction] = useFormState(sendPlayerMagicLink, initial)

  if (state.status === 'sent') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100"><Mail className="h-5 w-5 text-emerald-700" aria-hidden /></div>
        <h2 className="text-base font-semibold text-slate-900">Revisá tu email</h2>
        <p className="mt-2 text-sm text-slate-600">Te enviamos un enlace a <strong>{state.email}</strong>. Hacé click para confirmar tu reserva.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4" noValidate>
      <div>
        <h2 className="text-base font-semibold text-slate-900">Confirmá con tu email</h2>
        <p className="text-sm text-slate-600">Sin contraseñas. Te mandamos un enlace mágico para entrar y reservar.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-900">Nombre</span>
          <input name="firstName" required className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-900">Apellido</span>
          <input name="lastName" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
        </label>
      </div>
      <label className="space-y-1 text-sm block">
        <span className="font-medium text-slate-900">Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="vos@email.com" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        <span>Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).</span>
      </label>
      {state.status === 'error' && <p role="alert" className="text-xs text-red-600">{state.message}</p>}
      <Submit />
    </form>
  )
}
```

- [ ] **Step 4: reservar page** (server — parse intent, revalidate, gate vs confirm)

```tsx
// src/app/(public)/[slug]/reservar/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import BookingSummary from './components/BookingSummary'
import LoginGate from './components/LoginGate'
import ConfirmBookingButton from './components/ConfirmBookingButton'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = new Set(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

type Props = {
  params: { slug: string }
  searchParams: { court?: string; date?: string; time?: string; dur?: string; error?: string }
}

function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + m!) + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function InvalidState({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
      <p className="text-sm text-slate-600">{message}</p>
      <Link href={`/${slug}`} className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Elegir otro turno
      </Link>
    </div>
  )
}

export default async function ReservarPage({ params, searchParams }: Props) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) notFound()
  if (UNAVAILABLE.has(tenant.status) || !tenant.allowOnlineBooking) {
    return <InvalidState slug={params.slug} message="Este complejo no acepta reservas online por el momento." />
  }

  const { court, date, time, dur } = searchParams
  const durNum = Number(dur)
  if (!court || !date || !time || !DATE_RE.test(date) || !TIME_RE.test(time) || !tenant.bookingDurationMinutes.includes(durNum)) {
    return <InvalidState slug={params.slug} message="Faltan datos del turno. Elegí un horario desde la grilla." />
  }

  // Revalidate against live availability (display-level; the Server Action is authoritative).
  const availability = await getPublicAvailability(tenant, date)
  const courtData = availability.courts.find((c) => c.id === court)
  const slot = courtData?.slots.find((s) => s.time === time)
  if (!courtData || !slot) {
    return <InvalidState slug={params.slug} message="No encontramos ese turno. Puede que haya cambiado la disponibilidad." />
  }
  if (slot.status !== 'free') {
    return <InvalidState slug={params.slug} message="Ese turno ya no está disponible. Elegí otro horario." />
  }

  const price = slot.price ?? 0
  const depositAmount = tenant.requiresDeposit && tenant.depositPercentage > 0
    ? Math.round((price * tenant.depositPercentage) / 100)
    : 0
  const timeEnd = addMinsToHHMM(time, durNum)

  const user = await extractAuthUser()
  const isPlayer = user?.type === 'player'
  const nextUrl = `/${params.slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${durNum}`

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:px-6 space-y-5">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Confirmá tu reserva</h1>

      {searchParams.error === 'slot_taken' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          Ese turno acaba de ser tomado. Elegí otro horario.
        </p>
      )}
      {searchParams.error === 'banned' && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
          No podés reservar en este complejo actualmente.
        </p>
      )}

      <BookingSummary
        data={{
          tenantName: tenant.name,
          city: tenant.city,
          courtName: courtData.name,
          date,
          timeStart: time,
          timeEnd,
          price,
          depositAmount,
        }}
      />

      {isPlayer ? (
        <ConfirmBookingButton
          slug={params.slug}
          court={court}
          date={date}
          time={time}
          dur={durNum}
          depositAmount={depositAmount}
        />
      ) : (
        <LoginGate next={nextUrl} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Delete placeholder + typecheck**

```bash
git rm "src/app/(public)/[slug]/reservar/.gitkeep"
pnpm typecheck
```
Expected: type error only for the missing `ConfirmBookingButton` import — created in Task 15. (Do not commit yet; Task 15 completes the page.)

---

## Task 15: createBookingAndCheckout Server Action + ConfirmBookingButton

**Files:**
- Modify: `src/app/(public)/[slug]/reservar/actions.ts` (append `createBookingAndCheckout`)
- Create: `src/app/(public)/[slug]/reservar/components/ConfirmBookingButton.tsx`
- Test: `tests/integration/booking-checkout.test.ts`

- [ ] **Step 1: Write the failing test** (deposit path creates a `pending` payment + MP preference)

```ts
// tests/integration/booking-checkout.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, getSql, withPlayerContext, withTenantContext } from '@/shared/db/client'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = { rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 1000000, '120': 1800000 } }] }
const FUTURE = '2099-07-20'

beforeAll(async () => { await ensureRoles() })
afterAll(async () => { await cleanupAll(); await closeSql() })

describe('booking + deposit checkout', () => {
  it('creates pending_payment booking then a deposit preference + pending payment row', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active', settings = jsonb_set(settings, '{requires_deposit}', 'true') WHERE id = ${tenant.id}`
    const player = await createTestPlayer(sql)
    const courtRows = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${tenant.id}, 'C1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
    `
    const courtId = courtRows[0]!.id

    // tx1: player + tenant context → createOnlineBooking (mirrors the Server Action)
    const booking = await withPlayerContext(player.id, async (tx) => {
      await tx.execute(drizzleSql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`)
      return createOnlineBooking(
        tenant.id,
        {
          playerId: player.id, courtId, date: FUTURE, timeStart: '10:00', timeEnd: '11:00',
          durationMins: 60, requiresDeposit: true, depositPercentage: 30,
        },
        tx,
      )
    })
    expect(booking.status).toBe('pending_payment')
    expect(booking.depositAmount).toBe(300000) // 30% of 1_000_000

    // tx2: tenant context → createDepositPayment with a mock gateway
    const gateway = new MockGateway()
    const pref = await withTenantContext(tenant.id, (tx) =>
      createDepositPayment(booking.id, gateway, tx, 'http://localhost:3000'),
    )
    expect(pref.initPoint).toBeTruthy()

    const payRows = await sql<{ status: string; type: string }[]>`
      SELECT status, type FROM payments WHERE booking_id = ${booking.id}
    `
    expect(payRows[0]!.type).toBe('deposit')
    expect(payRows[0]!.status).toBe('pending')
  })
})
```

> This test exercises the two-transaction composition (`createOnlineBooking` in player+tenant context, then `createDepositPayment` in tenant context) that `createBookingAndCheckout` relies on. It locks that contract; the action itself isn't unit-tested because it calls `redirect()`/`headers()` which need a request context (covered by the manual smoke in Task 17).

- [ ] **Step 2: Run the test**

Run: `pnpm test:integration booking-checkout`
Expected: PASS — it composes already-implemented services (`createOnlineBooking`, `createDepositPayment`, `MockGateway`). If it fails, the failure is a real regression in the building blocks the action depends on — fix before writing the action.

- [ ] **Step 3: Append `createBookingAndCheckout` to `actions.ts`**

```ts
// src/app/(public)/[slug]/reservar/actions.ts — añadir imports arriba:
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { getDb, withPlayerContext, withTenantContext } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'
import {
  CourtOfflineError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
} from '@/modules/bookings/booking.errors'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

// añadir al final del archivo:

const BLOCKED = ['deleted', 'blocked', 'canceled', 'churned', 'suspended']

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h! * 60 + m!) + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export async function createBookingAndCheckout(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const court = String(formData.get('court') ?? '')
  const date = String(formData.get('date') ?? '')
  const time = String(formData.get('time') ?? '')
  const dur = Number(formData.get('dur') ?? '60') as 60 | 120
  const backTo = `/${slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${dur}`

  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect(`/${slug}/reservar?court=${court}&date=${date}&time=${time}&dur=${dur}`)

  // Server-only tenant lookup (includes mpAccessToken, never sent to the client).
  const db = getDb()
  const tRows = await db
    .select({ id: tenants.id, status: tenants.status, settings: tenants.settings, mpAccessToken: tenants.mpAccessToken })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)
  const tenant = tRows[0]
  if (!tenant || BLOCKED.includes(tenant.status)) redirect(`/${slug}`)

  const settings = tenant!.settings as TenantSettings
  const timeEnd = addMins(time, dur)

  let redirectTo: string
  try {
    // tx1: player + tenant context → create the booking (RLS: bookings/PTR/notifications)
    const booking = await withPlayerContext(user!.playerId, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant!.id}, true)`)
      return createOnlineBooking(
        tenant!.id,
        {
          playerId: user!.playerId,
          courtId: court,
          date,
          timeStart: time,
          timeEnd,
          durationMins: dur,
          requiresDeposit: settings.requires_deposit,
          depositPercentage: settings.deposit_percentage,
        },
        tx,
      )
    })

    if (booking.status === 'confirmed') {
      redirectTo = `/reserva/${booking.id}/exito`
    } else {
      // pending_payment → deposit checkout (tx2: tenant context for payments RLS)
      if (!tenant!.mpAccessToken) {
        redirectTo = `/reserva/${booking.id}/pendiente`
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const gateway = new MercadoPagoGateway(tenant!.mpAccessToken)
        const pref = await withTenantContext(tenant!.id, (tx) =>
          createDepositPayment(booking.id, gateway, tx, appUrl),
        )
        redirectTo = pref.initPoint
      }
    }
  } catch (err) {
    if (err instanceof SlotTakenError) redirect(`${backTo}&error=slot_taken`)
    if (err instanceof PlayerBannedError) redirect(`${backTo}&error=banned`)
    if (err instanceof CourtOfflineError || err instanceof PriceUnavailableError) redirect(`${backTo}&error=unavailable`)
    throw err
  }

  redirect(redirectTo)
}
```

> `redirect()` throws `NEXT_REDIRECT`; the calls inside `catch` re-throw that control-flow signal cleanly, and the final `redirect(redirectTo)` runs outside the try. Do not wrap the final redirect in try/catch.

- [ ] **Step 4: ConfirmBookingButton** (client)

```tsx
// src/app/(public)/[slug]/reservar/components/ConfirmBookingButton.tsx
'use client'

import { useFormStatus } from 'react-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { createBookingAndCheckout } from '../actions'

function Inner({ depositAmount }: { depositAmount: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0">
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procesando…</> : (
        <><ShieldCheck className="h-4 w-4" aria-hidden /> {depositAmount > 0 ? 'Pagar seña y reservar' : 'Confirmar reserva'}</>
      )}
    </button>
  )
}

export default function ConfirmBookingButton(props: {
  slug: string
  court: string
  date: string
  time: string
  dur: number
  depositAmount: number
}) {
  return (
    <form action={createBookingAndCheckout} className="space-y-3">
      <input type="hidden" name="slug" value={props.slug} />
      <input type="hidden" name="court" value={props.court} />
      <input type="hidden" name="date" value={props.date} />
      <input type="hidden" name="time" value={props.time} />
      <input type="hidden" name="dur" value={props.dur} />
      <Inner depositAmount={props.depositAmount} />
      <p className="text-center text-xs text-slate-500">
        {props.depositAmount > 0 ? 'Te llevamos a MercadoPago para pagar la seña.' : 'Tu turno queda confirmado al instante.'}
      </p>
    </form>
  )
}
```

- [ ] **Step 5: Verify + commit (Tasks 14 + 15 together)**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm test:integration booking-checkout`
Expected: PASS.

```bash
git add "src/app/(public)/[slug]/reservar/" tests/integration/booking-checkout.test.ts
git commit -m "feat(reservar): booking flow with login gate + MP deposit checkout"
```

---

## Task 16: MercadoPago return pages

**Files:**
- Create: `src/app/reserva/[bookingId]/exito/page.tsx`
- Create: `src/app/reserva/[bookingId]/error/page.tsx`
- Create: `src/app/reserva/[bookingId]/pendiente/page.tsx`

- [ ] **Step 1: Shared helper + exito page**

```tsx
// src/app/reserva/[bookingId]/exito/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { CheckCircle2 } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'

type Props = { params: { bookingId: string } }

export const dynamic = 'force-dynamic'

async function loadBooking(bookingId: string, playerId: string) {
  return withPlayerContext(playerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT b.status, b.date::text AS date, b.time_start::text AS time_start, b.time_end::text AS time_end,
             c.name AS court_name, t.name AS tenant_name
      FROM bookings b JOIN courts c ON c.id = b.court_id JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId} LIMIT 1
    `)) as unknown as Array<{ status: string; date: string; time_start: string; time_end: string; court_name: string; tenant_name: string }>
    return rows[0] ?? null
  })
}

export default async function ReservaExitoPage({ params }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect(`/login`)
  const booking = await loadBooking(params.bookingId, user.playerId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">¡Reserva confirmada!</h1>
      {booking ? (
        <p className="mt-3 text-sm text-slate-600">
          {booking.tenant_name} · {booking.court_name}<br />
          {booking.date} · {booking.time_start.slice(0, 5)}–{booking.time_end.slice(0, 5)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Tu pago fue procesado.</p>
      )}
      <Link href="/mis-reservas" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Ver mis reservas
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: error page**

```tsx
// src/app/reserva/[bookingId]/error/page.tsx
import Link from 'next/link'
import { XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ReservaErrorPage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <XCircle className="h-8 w-8 text-red-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">El pago no se completó</h1>
      <p className="mt-3 text-sm text-slate-600">No pudimos confirmar la seña, así que el turno quedó liberado. Podés intentar reservar de nuevo.</p>
      <Link href="/explorar" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Buscar otro turno
      </Link>
      <span className="sr-only">Reserva {params.bookingId}</span>
    </div>
  )
}
```

- [ ] **Step 3: pendiente page**

```tsx
// src/app/reserva/[bookingId]/pendiente/page.tsx
import Link from 'next/link'
import { Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ReservaPendientePage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50">
        <Clock className="h-8 w-8 text-amber-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pago en proceso</h1>
      <p className="mt-3 text-sm text-slate-600">Tu pago está siendo procesado. Te avisamos por email cuando se confirme la reserva.</p>
      <Link href="/mis-reservas" className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        Ver mis reservas
      </Link>
      <span className="sr-only">Reserva {params.bookingId}</span>
    </div>
  )
}
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm typecheck && pnpm lint`
Run `pnpm dev`, hit `/reserva/<a-real-booking-id>/exito` while logged in as that player → shows booking detail; `/error` and `/pendiente` render their states.

```bash
git add src/app/reserva/
git commit -m "feat(reserva): MercadoPago return pages (exito/error/pendiente)"
```

---

## Task 17: Final verification

- [ ] **Step 1: Full type + lint + unit**

Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `pnpm test`
Expected: all green.

- [ ] **Step 2: Integration suite**

Run: `pnpm test:integration`
Expected: all green (includes `players`, `public-search`, `weekly-availability`, `booking-checkout`).

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds; `(public)/explorar`, `(public)/[slug]`, `(public)/[slug]/reservar`, `(public)/[slug]/disponibilidad`, `reserva/[bookingId]/*` and the three new API routes all compile.

- [ ] **Step 4: Manual end-to-end smoke** (`pnpm dev`)

1. `/explorar` → buscar, filtrar por ciudad, toggle online, "Ver más".
2. Click en una card → `/<slug>`; "Ver semana completa" → `/<slug>/disponibilidad`.
3. Click en un turno libre → `/<slug>/reservar?...` con resumen + seña.
4. Logueado como jugador nuevo: completar gate (nombre + email + términos), recibir magic link, el callback vuelve a `/<slug>/reservar` ya autenticado.
5. Confirmar → con seña redirige a MP; sin seña → `/reserva/<id>/exito`.
6. Verificar que el landing `/` quedó visualmente intacto.

- [ ] **Step 5: Final commit (if any residual changes)**

```bash
git add -A
git commit -m "chore(portal-publico): final verification pass"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Búsqueda API (T5/T6) ✓; /explorar (T11) ✓; layout compartido sin romper landing (T9/T10) ✓; mejoras /[slug] + slot→reservar (T10/T12) ✓; flujo reservar con login gate + checkout + Server Action → MP (T14/T15) ✓; vista semanal (T7/T8/T13) ✓; provisioning +18 (T1–T4) ✓; páginas de retorno MP (T16) ✓; caché (T6/T8) ✓; testing (T1,T3,T5,T7,T15,T17) ✓.
- **Type consistency:** `PublicTenantCard`, `SearchParams`, `SearchResult`, `CityCount` (T5) reused in T6/T11. `WeeklyAvailabilityResponse`/`WeeklyDay` (T7) reused in T8/T13. `GateState`/`sendPlayerMagicLink` (T14) reused in LoginGate. `createBookingAndCheckout` (T15) reused in ConfirmBookingButton. `sanitizeNext` (T3) reused in T4/T14. `getOrCreatePlayer` (T1) reused in T4.
- **Known caveats flagged in-task:** reservar page (T14) has an expected transient type error until T15 adds `ConfirmBookingButton` — that's why T14/T15 commit together. Mock gateway export confirmed as `MockGateway`.
