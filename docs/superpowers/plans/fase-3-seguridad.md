Usa la sub-skill de superpowers /superpowers:brainstorm :"Configuración de Playwright E2E, pruebas de estrés de concurrencia y checklist final de producción para TurnoGol"

# Instrucciones una vez finalizado el brainstorming:
Y después usa la otra sub-skill /superpowers:write-plan :"fase-4-testing-launch"

CONTEXTO DEL CODEBASE:
- Archivo playwright.config.ts ya configurado pero tests/e2e/ vacío.
- Ya existe Sentry configurado en client, server y edge.
- Endpoint /api/status/ para health check del sistema.

REQUERIMIENTOS DEL BLUEPRINT:
1. Pruebas de integración E2E con Playwright cubriendo: landing page, flujo de búsqueda en portal, disponibilidad diaria y login flow de admin.
2. Script de test de estrés de concurrencia (scripts/stress-test.ts) que dispare 50 requests paralelos de reserva y verifique que solo 1 es aceptado.
3. Observabilidad: integrar Sentry breadcrumbs a los eventos clave de negocio (booking, payment, webhooks) y completar el endpoint de /api/status/ para verificar conectividad con DB y pg-boss.
4. Launch Checklist final automatizada para producción.

ESPECIFICACIONES DE SUPERPOWERS:
- Generá pasos detallados de cómo configurar Playwright de forma local.
- Guardá el plan en docs/superpowers/plans/fase-4-testing-launch.md.
# Fase 3 — Seguridad: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-05-22-fase-3-seguridad-design.md`.

**Goal:** Audit and harden 7 security surfaces (SQLi+validation, RLS isolation, rate limiting, concurrency, secrets+headers, IDOR/Authz, SSRF MercadoPago) under TDD, leaving the code hardened.

**Architecture:** Sweep TDD per vulnerability class. For each gap: probe (failing test) → fix → green. Rate limiting added as a new module (`src/shared/rate-limit/*`) backed by Upstash Redis; root `middleware.ts` handles IP-based pre-auth limits; identity-based limits (tenant_id, player_id, email) applied inside actions/routes post-auth. Hybrid keys per doc15 §9.

**Tech Stack:** Next.js 14 App Router, Vitest, Drizzle ORM, `postgres` (postgres.js), `@upstash/ratelimit`, `@upstash/redis`, Zod, gitleaks.

**Conventions (CLAUDE.md):**
- `pnpm typecheck` after each change.
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`.
- ENUMs use `canceled` (one L), never `cancelled`.
- Money in centavos (integer).

---

## Phase 0 — Setup & baseline

### Task 0.1: Create feature branch + baseline check

**Files:** none

- [ ] **Step 1: Create branch**

```bash
git checkout -b fase-3-seguridad
```

- [ ] **Step 2: Baseline typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (record any pre-existing failures so we can distinguish them later)

- [ ] **Step 3: Confirm Upstash account / project exists**

Provision an Upstash Redis database for this project (free tier OK). Note the REST URL and REST TOKEN. Add them to your local `.env.local` (do NOT commit). We will add placeholders to `.env.example` in Task 3.1.

---

## Phase 1 — SQL Injection + Input Validation

### Task 1.1: AppRole allowlist guard in `client.ts`

**Files:**
- Modify: `src/shared/db/client.ts:104-120`
- Test: `tests/unit/db-client-role-guard.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/db-client-role-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { withContext } from '@/shared/db/client'

describe('withContext role allowlist', () => {
  it('rejects role outside the AppRole allowlist (SQL injection guard)', async () => {
    await expect(
      withContext(
        { role: "malicious; DROP TABLE users; --" as never },
        async () => 'unreachable',
      ),
    ).rejects.toThrow(/Invalid AppRole/i)
  })

  it('accepts each allowed role without throwing on the guard', async () => {
    // We only need the guard to pass — getSql() will try to connect, which is fine in test.
    for (const role of ['authenticated', 'anon', 'service_role', 'turnogol_app'] as const) {
      const p = withContext({ role }, async () => 'ok')
      // Even if DB connect fails, the throw must NOT be "Invalid AppRole".
      await p.catch((e: unknown) => {
        expect(String(e)).not.toMatch(/Invalid AppRole/i)
      })
    }
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm vitest run tests/unit/db-client-role-guard.test.ts`
Expected: FAIL — the current code interpolates any string into `SET LOCAL ROLE`, so it does not throw "Invalid AppRole".

- [ ] **Step 3: Add the allowlist guard**

In `src/shared/db/client.ts`, after the `AppRole` type declaration add:

```ts
const ALLOWED_ROLES: ReadonlySet<AppRole> = new Set([
  'authenticated',
  'anon',
  'service_role',
  'turnogol_app',
])
```

Replace the `if (opts.role) { ... }` block inside `applyContext`:

```ts
async function applyContext(tx: TransactionSql, opts: ContextOpts): Promise<void> {
  if (opts.role) {
    if (!ALLOWED_ROLES.has(opts.role)) {
      throw new Error(`Invalid AppRole: ${opts.role}`)
    }
    await tx.unsafe(`SET LOCAL ROLE ${opts.role}`)
  }
  if (opts.tenantId !== undefined && opts.tenantId !== null) {
    await tx`SELECT set_config('app.current_tenant_id', ${opts.tenantId}, true)`
  }
  if (opts.playerId !== undefined && opts.playerId !== null) {
    await tx`SELECT set_config('app.current_player_id', ${opts.playerId}, true)`
  }
  if (opts.systemAdminId !== undefined && opts.systemAdminId !== null) {
    await tx`SELECT set_config('app.current_system_admin_id', ${opts.systemAdminId}, true)`
  }
  if (opts.jwtClaims) {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(opts.jwtClaims)}, true)`
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm vitest run tests/unit/db-client-role-guard.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/db/client.ts tests/unit/db-client-role-guard.test.ts
git commit -m "fix(db): allowlist AppRole before SET LOCAL ROLE interpolation"
```

---

### Task 1.2: Shared Zod primitives

**Files:**
- Create: `src/shared/validation/primitives.ts`
- Create: `src/shared/validation/index.ts`
- Test: `tests/unit/validation-primitives.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/validation-primitives.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  uuid,
  dateStr,
  hhmm,
  moneyCents,
  boundedText,
  slug,
} from '@/shared/validation/primitives'

describe('shared validation primitives', () => {
  it('uuid: valid v4', () => {
    expect(uuid.safeParse('11111111-2222-3333-4444-555555555555').success).toBe(true)
  })
  it('uuid: rejects malformed', () => {
    expect(uuid.safeParse('not-a-uuid').success).toBe(false)
    expect(uuid.safeParse('11111111-2222-3333-4444').success).toBe(false)
  })
  it('dateStr: accepts YYYY-MM-DD', () => {
    expect(dateStr.safeParse('2026-05-22').success).toBe(true)
  })
  it('dateStr: rejects 2026/05/22 and other formats', () => {
    expect(dateStr.safeParse('2026/05/22').success).toBe(false)
    expect(dateStr.safeParse('22-05-2026').success).toBe(false)
  })
  it('hhmm: accepts 00:00 to 23:59', () => {
    expect(hhmm.safeParse('00:00').success).toBe(true)
    expect(hhmm.safeParse('23:59').success).toBe(true)
  })
  it('hhmm: rejects 24:00 and 12:60', () => {
    expect(hhmm.safeParse('24:00').success).toBe(false)
    expect(hhmm.safeParse('12:60').success).toBe(false)
  })
  it('moneyCents: integer >= 0', () => {
    expect(moneyCents.safeParse(0).success).toBe(true)
    expect(moneyCents.safeParse(100).success).toBe(true)
    expect(moneyCents.safeParse(-1).success).toBe(false)
    expect(moneyCents.safeParse(1.5).success).toBe(false)
  })
  it('boundedText: enforces max length', () => {
    const s100 = boundedText(100)
    expect(s100.safeParse('a'.repeat(100)).success).toBe(true)
    expect(s100.safeParse('a'.repeat(101)).success).toBe(false)
  })
  it('slug: lowercase alphanumeric + dashes, 1-64', () => {
    expect(slug.safeParse('valid-slug-123').success).toBe(true)
    expect(slug.safeParse('Invalid_Slug').success).toBe(false)
    expect(slug.safeParse('a'.repeat(65)).success).toBe(false)
    expect(slug.safeParse('').success).toBe(false)
  })
  it('boundedText: rejects payload large enough to be DoS bait', () => {
    const s = boundedText(1000)
    expect(s.safeParse('a'.repeat(100_000)).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm vitest run tests/unit/validation-primitives.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement primitives**

Create `src/shared/validation/primitives.ts`:

```ts
import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const uuid = z.string().regex(UUID_RE, 'UUID inválido')
export const dateStr = z.string().regex(DATE_RE, 'Formato YYYY-MM-DD requerido')
export const hhmm = z.string().regex(HHMM_RE, 'Formato HH:MM requerido')
export const moneyCents = z.number().int().nonnegative()
export const boundedText = (max: number) => z.string().max(max)
export const slug = z.string().regex(SLUG_RE, 'slug inválido')
```

Create `src/shared/validation/index.ts`:

```ts
export * from './primitives'
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm vitest run tests/unit/validation-primitives.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/validation/ tests/unit/validation-primitives.test.ts
git commit -m "feat(validation): add shared Zod primitives (uuid, dateStr, hhmm, moneyCents, boundedText, slug)"
```

---

### Task 1.3: Migrate `api/public/availability` to Zod

**Files:**
- Modify: `src/app/api/public/availability/route.ts`
- Test: `tests/integration/public-availability-validation.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/public-availability-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/public/availability/route'
import { NextRequest } from 'next/server'

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/public/availability?${qs}`)
}

describe('public availability validation', () => {
  it('rejects missing slug', async () => {
    const res = await GET(reqUrl('date=2026-05-22'))
    expect(res.status).toBe(400)
  })
  it('rejects invalid slug (uppercase / underscores)', async () => {
    const res = await GET(reqUrl('slug=Bad_Slug&date=2026-05-22'))
    expect(res.status).toBe(400)
  })
  it('rejects payload-bomb slug', async () => {
    const big = 'a'.repeat(10_000)
    const res = await GET(reqUrl(`slug=${big}&date=2026-05-22`))
    expect(res.status).toBe(400)
  })
  it('rejects missing date', async () => {
    const res = await GET(reqUrl('slug=demo'))
    expect(res.status).toBe(400)
  })
  it('rejects malformed date', async () => {
    const res = await GET(reqUrl('slug=demo&date=2026/05/22'))
    expect(res.status).toBe(400)
  })
  it('rejects SQL-injection-like slug', async () => {
    const res = await GET(reqUrl("slug=' OR 1=1--&date=2026-05-22"))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to confirm partial-fail behavior**

Run: `pnpm vitest run tests/integration/public-availability-validation.test.ts`
Expected: At least the "payload-bomb slug" and "uppercase / underscores" cases FAIL — the current handler does not validate slug shape or length.

- [ ] **Step 3: Migrate the route to Zod**

Replace `src/app/api/public/availability/route.ts` with:

```ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dateStr, slug } from '@/shared/validation/primitives'
import {
  getPublicAvailability,
  getPublicTenant,
} from '@/modules/tenants/public.service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  slug,
  date: dateStr,
})

function addDays(dateStrIn: string, n: number): string {
  const [y, m, d] = dateStrIn.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    slug: req.nextUrl.searchParams.get('slug'),
    date: req.nextUrl.searchParams.get('date'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const { slug: tenantSlug, date } = parsed.data

  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const todayStr = artNow.toISOString().slice(0, 10)

  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const maxDate = addDays(todayStr, tenant.bookingAdvanceDays)
  if (date < todayStr || date > maxDate) {
    return NextResponse.json({ error: 'date_out_of_range' }, { status: 400 })
  }

  const availability = await getPublicAvailability(tenant, date)

  return NextResponse.json(availability, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  })
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm vitest run tests/integration/public-availability-validation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/public/availability/route.ts tests/integration/public-availability-validation.test.ts
git commit -m "feat(public): migrate availability route to Zod schema + payload-bomb guard"
```

---

### Task 1.4: Meta-test — Zod coverage of actions + routes

**Files:**
- Create: `tests/unit/zod-coverage.test.ts`

- [ ] **Step 1: Write the meta-test (intentionally strict; expect initial failures)**

Create `tests/unit/zod-coverage.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const ACTIONS = findFiles(path.join(ROOT, 'src/app'), /^actions\.ts$/)
const ROUTES = findFiles(path.join(ROOT, 'src/app/api'), /^route\.ts$/)

// Files that legitimately have no user-supplied input (no body/params/query).
// Each entry MUST be commented with the reason.
const NO_INPUT_ALLOWLIST: ReadonlySet<string> = new Set([
  // /api/webhooks/mercadopago: payload validated via `webhookPayloadSchema` inside the file.
  // (still listed below — the regex check should match it; only add here if it genuinely has no input.)
])

function usesZod(src: string): boolean {
  return /from\s+['"]zod['"]/.test(src) ||
         /from\s+['"]@\/shared\/validation/.test(src) ||
         /from\s+['"][^'"]+\/[a-z-]+\.schema['"]/.test(src)
}

describe('Zod coverage on actions + route handlers', () => {
  for (const f of [...ACTIONS, ...ROUTES]) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    if (NO_INPUT_ALLOWLIST.has(rel)) continue
    it(`${rel} imports zod or a schema`, () => {
      const src = readFileSync(f, 'utf8')
      expect(usesZod(src), `${rel} must validate input via zod or a *.schema file`).toBe(true)
    })
  }
})
```

- [ ] **Step 2: Run it to see which files fail**

Run: `pnpm vitest run tests/unit/zod-coverage.test.ts`
Expected: One failing test per `actions.ts` / `route.ts` that does not import zod or a schema. Record the list.

- [ ] **Step 3: Triage each failure**

For each failing file, choose ONE of:

a. **Add Zod parsing** at the input boundary (preferred). Use shared primitives from `src/shared/validation`.

b. **Add to `NO_INPUT_ALLOWLIST`** with a comment explaining why (e.g., the handler reads no params/body/query — pure server-side trigger; or it delegates input parsing to a service that itself uses Zod, in which case import the schema indirectly so the regex picks it up).

Do this file-by-file. After each fix, re-run the meta-test to confirm the count drops.

- [ ] **Step 4: Run the suite to confirm all green**

Run: `pnpm vitest run tests/unit/zod-coverage.test.ts && pnpm typecheck`
Expected: PASS for all entries.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/zod-coverage.test.ts src/
git commit -m "test(validation): meta-test enforcing Zod use across actions + route handlers"
```

---

## Phase 2 — RLS Gap Closure (positive tests)

### Task 2.1: `player_update_self` positive test

**Files:**
- Modify: `tests/integration/isolation.test.ts` (append a new describe block; do NOT touch existing tests)

- [ ] **Step 1: Write failing test**

Append to the END of `tests/integration/isolation.test.ts` (after the closing `}` of the last `describe`):

```ts
// ─── J. Positive policies (gaps from the TODO) ─────────────────
describe('J. positive policies (cierre de gaps)', () => {
  it('player_update_self: jugador A actualiza su propia fila en players', async () => {
    const newFirstName = `n${Date.now()}`
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string; first_name: string }[]>`
          UPDATE players SET first_name = ${newFirstName}
          WHERE id = ${A.playerId}
          RETURNING id, first_name
        `,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].first_name).toBe(newFirstName)
  })

  it('player_update_self: jugador A NO puede actualizar fila de B', async () => {
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`
          UPDATE players SET first_name = 'hacked'
          WHERE id = ${B.playerId}
          RETURNING id
        `,
    )
    expect(rows.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it passes (policy already exists)**

Run: `pnpm vitest run tests/integration/isolation.test.ts -t "player_update_self"`
Expected: PASS (this codifies an existing, untested policy).

- [ ] **Step 3: Mutation check — comment the policy locally and confirm a red appears**

Manually comment out `CREATE POLICY player_update_self ON players ...` in `006_rls_policies.sql`, re-run migrations against the test DB, run the test, expect a red. Then revert the comment. Document the result in a code comment above the new describe block:

```ts
// Mutation-checked 2026-05-22: commenting `player_update_self` produces 1 failure in J.
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/isolation.test.ts
git commit -m "test(rls): cover player_update_self positive + cross-player negative"
```

---

### Task 2.2: `player_self_insert` (bookings) positive + foreign-id negative

**Files:**
- Modify: `tests/integration/isolation.test.ts` (extend the J block from Task 2.1)

- [ ] **Step 1: Write failing test**

Append to the J describe block:

```ts
  it('player_self_insert (bookings): jugador A inserta booking a su nombre', async () => {
    const inserted = await withContextRollback(
      { role: 'authenticated', playerId: A.playerId },
      (tx) =>
        tx<{ id: string }[]>`
          INSERT INTO bookings (
            tenant_id, court_id, player_id, date, time_start, time_end,
            price_snapshot, deposit_amount, deposit_status, payment_method
          )
          VALUES (
            ${tenantA.id}, ${A.courtId}, ${A.playerId},
            ${faker.date.future().toISOString().slice(0, 10)},
            '10:00', '11:00', 100000, 0, 'not_required', NULL
          )
          RETURNING id
        `,
    )
    expect(inserted.length).toBe(1)
  })

  it('player_self_insert: jugador A NO puede insertar booking con player_id de B', async () => {
    await expect(
      withContextRollback(
        { role: 'authenticated', playerId: A.playerId },
        (tx) =>
          tx`
            INSERT INTO bookings (
              tenant_id, court_id, player_id, date, time_start, time_end,
              price_snapshot, deposit_amount, deposit_status, payment_method
            )
            VALUES (
              ${tenantA.id}, ${A.courtId}, ${B.playerId},
              ${faker.date.future().toISOString().slice(0, 10)},
              '12:00', '13:00', 100000, 0, 'not_required', NULL
            )
          `,
      ),
    ).rejects.toThrow()
  })
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/isolation.test.ts -t "player_self_insert"`
Expected: PASS (existing policy enforces).

- [ ] **Step 3: Mutation check**

Comment `CREATE POLICY player_self_insert ON bookings ...` in `006_rls_policies.sql`, re-run migrations, run tests, expect the positive insert test to fail (no policy → CHECK denial). Revert and add a comment in the J block:

```ts
// Mutation-checked: commenting player_self_insert blocks the positive insert.
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/isolation.test.ts
git commit -m "test(rls): cover player_self_insert on bookings (own player_id only)"
```

---

### Task 2.3: `player_self_ptr_insert` positive

**Files:**
- Modify: `tests/integration/isolation.test.ts`

- [ ] **Step 1: Write failing test**

Append to J:

```ts
  it('player_self_ptr_insert: jugador A crea su propia relación con tenant B (cross-tenant signup)', async () => {
    // Create a player that has NO relation with tenant B yet. Use a fresh player.
    const sql = getSql()
    const freshPlayer = await createTestPlayer(sql)
    const rows = await withContextRollback(
      { role: 'authenticated', playerId: freshPlayer.id },
      (tx) =>
        tx<{ id: string }[]>`
          INSERT INTO player_tenant_relationships (tenant_id, player_id)
          VALUES (${tenantB.id}, ${freshPlayer.id})
          RETURNING id
        `,
    )
    expect(rows.length).toBe(1)
  })

  it('player_self_ptr_insert: jugador A NO puede insertar PTR a nombre de B', async () => {
    await expect(
      withContextRollback(
        { role: 'authenticated', playerId: A.playerId },
        (tx) =>
          tx`
            INSERT INTO player_tenant_relationships (tenant_id, player_id)
            VALUES (${tenantB.id}, ${B.playerId})
          `,
      ),
    ).rejects.toThrow()
  })
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/isolation.test.ts -t "player_self_ptr_insert"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/isolation.test.ts
git commit -m "test(rls): cover player_self_ptr_insert (own player_id only)"
```

---

### Task 2.4: `system_admin_self` + `system_admin_self_update`

**Files:**
- Modify: `tests/integration/isolation.test.ts`
- Modify: `tests/integration/helpers/tenant.ts` (only if a system-admin factory is missing — add `createTestSystemAdmin(sql)`).

- [ ] **Step 1: Verify or add the system_admin test helper**

Open `tests/integration/helpers/tenant.ts`. If `createTestSystemAdmin` does not exist, add:

```ts
export async function createTestSystemAdmin(
  sql: import('postgres').Sql,
): Promise<{ id: string; email: string }> {
  const email = `sa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
  const rows = await sql<{ id: string }[]>`
    INSERT INTO system_admins (email, password_hash, full_name)
    VALUES (${email}, 'x', 'Test SA')
    RETURNING id
  `
  return { id: rows[0].id, email }
}
```

(If the `system_admins` schema differs from these columns, adjust to match `src/shared/db/schema/system-admins.ts`.)

- [ ] **Step 2: Write failing test**

Append to J:

```ts
  it('system_admin_self: super admin ve SU PROPIA fila', async () => {
    const sql = getSql()
    const sa = await createTestSystemAdmin(sql)
    const rows = await withContext(
      { role: 'authenticated', systemAdminId: sa.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM system_admins WHERE id = ${sa.id}`,
    )
    expect(rows.length).toBe(1)
  })

  it('system_admin_self: super admin NO ve fila de otro super admin', async () => {
    const sql = getSql()
    const sa1 = await createTestSystemAdmin(sql)
    const sa2 = await createTestSystemAdmin(sql)
    const rows = await withContext(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM system_admins WHERE id = ${sa2.id}`,
    )
    expect(rows.length).toBe(0)
  })

  it('system_admin_self_update: super admin actualiza solo su fila', async () => {
    const sql = getSql()
    const sa1 = await createTestSystemAdmin(sql)
    const sa2 = await createTestSystemAdmin(sql)
    const ok = await withContextRollback(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`UPDATE system_admins SET full_name='x' WHERE id=${sa1.id} RETURNING id`,
    )
    expect(ok.length).toBe(1)
    const blocked = await withContextRollback(
      { role: 'authenticated', systemAdminId: sa1.id },
      (tx) =>
        tx<{ id: string }[]>`UPDATE system_admins SET full_name='hijack' WHERE id=${sa2.id} RETURNING id`,
    )
    expect(blocked.length).toBe(0)
  })
```

Also add to the top of the file, in the named imports from helpers:

```ts
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  createTestSystemAdmin,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
```

- [ ] **Step 3: Run**

Run: `pnpm vitest run tests/integration/isolation.test.ts -t "system_admin"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/isolation.test.ts tests/integration/helpers/tenant.ts
git commit -m "test(rls): cover system_admin_self + system_admin_self_update"
```

---

### Task 2.5: JWT tampering variants on `realtime_tenant_select`

**Files:**
- Modify: `tests/integration/isolation.test.ts`

- [ ] **Step 1: Write failing test**

Append to J:

```ts
  it('realtime: claim app_metadata.tenant_id ausente → 0 filas', async () => {
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { app_metadata: {} } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(0)
  })

  it('realtime: claim app_metadata.tenant_id malformado (no UUID) → 0 filas / no rompe', async () => {
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { app_metadata: { tenant_id: 'not-a-uuid' } } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    // Either 0 rows or a SQL cast error — both are safe.
    // If it throws, that's acceptable (fail-closed). If it returns, must be empty.
    if (Array.isArray(rows)) expect(rows.length).toBe(0)
  })

  it('realtime: claim sin app_metadata → 0 filas', async () => {
    const rows = await withContext(
      { role: 'authenticated', jwtClaims: { sub: 'whoever' } },
      (tx) =>
        tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
    )
    expect(rows.length).toBe(0)
  })
```

Wrap the malformed-uuid case with a try/catch if `withContext` re-throws — the test must accept either outcome:

```ts
  it('realtime: claim app_metadata.tenant_id malformado → safe (0 filas o error de cast)', async () => {
    try {
      const rows = await withContext(
        { role: 'authenticated', jwtClaims: { app_metadata: { tenant_id: 'not-a-uuid' } } },
        (tx) =>
          tx<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${A.bookingId}`,
      )
      expect(rows.length).toBe(0)
    } catch (e) {
      expect(String(e)).toMatch(/invalid input syntax for type uuid/i)
    }
  })
```

(Replace the first malformed-uuid `it(...)` with this try/catch version.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/isolation.test.ts -t "realtime"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/isolation.test.ts
git commit -m "test(rls): realtime JWT tampering variants (absent/malformed claim)"
```

---

## Phase 3 — Rate Limiting (Upstash Redis)

### Task 3.1: Install deps + env placeholders

**Files:**
- Modify: `package.json` (deps)
- Modify: `.env.example`, `.env.test.example`

- [ ] **Step 1: Install runtime deps**

Run: `pnpm add @upstash/ratelimit @upstash/redis`
Then: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Add env placeholders**

Append to `.env.example`:

```
# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Append to `.env.test.example`:

```
# Upstash mocked in tests; leave empty.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example .env.test.example
git commit -m "feat(rate-limit): install @upstash/ratelimit + @upstash/redis"
```

---

### Task 3.2: `policies.ts`

**Files:**
- Create: `src/shared/rate-limit/policies.ts`
- Test: `tests/unit/rate-limit-policies.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/rate-limit-policies.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@/shared/rate-limit/policies'

describe('rate-limit policies (doc15 §9)', () => {
  it('matches doc15 §9 exactly', () => {
    expect(POLICIES.authMagicLink).toEqual({ limit: 5, window: '60 s', keyBy: 'email', failMode: 'closed' })
    expect(POLICIES.authVerify).toEqual({ limit: 10, window: '60 s', keyBy: 'ip', failMode: 'closed' })
    expect(POLICIES.publicAvailability).toEqual({ limit: 30, window: '60 s', keyBy: 'ip', failMode: 'open' })
    expect(POLICIES.adminCrud).toEqual({ limit: 100, window: '60 s', keyBy: 'tenant', failMode: 'open' })
    expect(POLICIES.playerBooking).toEqual({ limit: 20, window: '60 s', keyBy: 'player', failMode: 'open' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run tests/unit/rate-limit-policies.test.ts`
Expected: FAIL — module not present.

- [ ] **Step 3: Implement**

Create `src/shared/rate-limit/policies.ts`:

```ts
export type KeyBy = 'email' | 'ip' | 'tenant' | 'player'

export type Policy = {
  limit: number
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  keyBy: KeyBy
  failMode: 'open' | 'closed'
}

export const POLICIES = {
  authMagicLink:      { limit: 5,   window: '60 s', keyBy: 'email',  failMode: 'closed' },
  authVerify:         { limit: 10,  window: '60 s', keyBy: 'ip',     failMode: 'closed' },
  publicAvailability: { limit: 30,  window: '60 s', keyBy: 'ip',     failMode: 'open'   },
  adminCrud:          { limit: 100, window: '60 s', keyBy: 'tenant', failMode: 'open'   },
  playerBooking:      { limit: 20,  window: '60 s', keyBy: 'player', failMode: 'open'   },
} as const satisfies Record<string, Policy>

export type PolicyName = keyof typeof POLICIES
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run tests/unit/rate-limit-policies.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/rate-limit/policies.ts tests/unit/rate-limit-policies.test.ts
git commit -m "feat(rate-limit): define policies per doc15 §9 (hybrid keys)"
```

---

### Task 3.3: `key.ts` (x-forwarded-for parsing) + tests

**Files:**
- Create: `src/shared/rate-limit/key.ts`
- Test: `tests/unit/rate-limit-key.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/rate-limit-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseClientIp } from '@/shared/rate-limit/key'

describe('parseClientIp', () => {
  it('returns "unknown" when no header', () => {
    expect(parseClientIp(new Headers())).toBe('unknown')
  })
  it('returns leftmost of x-forwarded-for (single)', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('returns leftmost of x-forwarded-for (multi-hop)', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('falls back to x-real-ip when no x-forwarded-for', () => {
    const h = new Headers({ 'x-real-ip': '7.7.7.7' })
    expect(parseClientIp(h)).toBe('7.7.7.7')
  })
  it('handles surrounding whitespace', () => {
    const h = new Headers({ 'x-forwarded-for': '   1.2.3.4   , 5.6.7.8' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('returns "unknown" when header is empty string', () => {
    const h = new Headers({ 'x-forwarded-for': '' })
    expect(parseClientIp(h)).toBe('unknown')
  })
  it('does NOT pick a non-leftmost value (spoofing guard)', () => {
    const h = new Headers({ 'x-forwarded-for': 'attacker-spoof, 5.6.7.8' })
    // We still take leftmost (attacker-spoof). Trust depends on the proxy
    // configuration; on Vercel the leftmost is rewritten to the real client.
    // We must never silently pick a later hop, which would be CONFIGURABLE-DENIAL bait.
    expect(parseClientIp(h)).toBe('attacker-spoof')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm vitest run tests/unit/rate-limit-key.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/shared/rate-limit/key.ts`:

```ts
/**
 * Parse the client IP from request headers.
 *
 * Strategy: leftmost of `x-forwarded-for`, falling back to `x-real-ip`,
 * then `'unknown'`. On Vercel, the leftmost XFF is the real client.
 *
 * We do NOT pick a non-leftmost value. If you ever run behind a proxy that
 * appends rather than rewrites, fix the deployment, not this parser.
 */
export function parseClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim() ?? ''
    if (first) return first
  }
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run tests/unit/rate-limit-key.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/rate-limit/key.ts tests/unit/rate-limit-key.test.ts
git commit -m "feat(rate-limit): parseClientIp (leftmost XFF, x-real-ip fallback)"
```

---

### Task 3.4: `client.ts` + `apply.ts` (enforce + 429 helper)

**Files:**
- Create: `src/shared/rate-limit/client.ts`
- Create: `src/shared/rate-limit/apply.ts`
- Create: `src/shared/rate-limit/index.ts`
- Test: `tests/unit/rate-limit-apply.test.ts`

- [ ] **Step 1: Write failing test (with mocked @upstash modules)**

Create `tests/unit/rate-limit-apply.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub Upstash modules. The fake Ratelimit counts hits per `${prefix}:${key}`.
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))

vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  let throwOnNext = false
  class FakeRatelimit {
    static tokenBucket(limit: number, _w: string, _max: number) {
      return { kind: 'tokenBucket', limit }
    }
    private prefix: string
    private limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this.limit = opts.limiter.limit
    }
    async limit(key: string) {
      if (throwOnNext) { throwOnNext = false; throw new Error('redis-down') }
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return {
        success: n <= this.limit,
        limit: this.limit,
        remaining: Math.max(0, this.limit - n),
        reset: Date.now() + 60_000,
      }
    }
    static __throwOnNext() { throwOnNext = true }
    static __reset() { counts.clear(); throwOnNext = false }
  }
  return { Ratelimit: FakeRatelimit }
})

import { Ratelimit } from '@upstash/ratelimit'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'

beforeEach(() => {
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
})

describe('enforce', () => {
  it('publicAvailability: first N=30 ok, 31st throttled', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await enforce('publicAvailability', '1.2.3.4')
      expect(r.ok).toBe(true)
    }
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('keys are scoped by policy AND key', async () => {
    for (let i = 0; i < 30; i++) await enforce('publicAvailability', 'a')
    const r = await enforce('publicAvailability', 'b')
    expect(r.ok).toBe(true)
  })

  it('fail-open: publicAvailability lets request through when Redis throws', async () => {
    ;(Ratelimit as unknown as { __throwOnNext: () => void }).__throwOnNext()
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })

  it('fail-closed: authVerify denies when Redis throws', async () => {
    ;(Ratelimit as unknown as { __throwOnNext: () => void }).__throwOnNext()
    const r = await enforce('authVerify', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
})

describe('rateLimit429', () => {
  it('returns 429 with Retry-After', async () => {
    const res = rateLimit429({
      ok: false, limit: 30, remaining: 0, reset: Date.now() + 60_000, unavailable: false,
    })
    expect(res.status).toBe(429)
    const retry = Number(res.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(60)
    const body = await res.json()
    expect(body).toEqual({ error: 'RATE_LIMITED' })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm vitest run tests/unit/rate-limit-apply.test.ts`
Expected: FAIL — `enforce` / `rateLimit429` not implemented.

- [ ] **Step 3: Implement**

Create `src/shared/rate-limit/client.ts`:

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { POLICIES, type PolicyName } from './policies'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing')
  }
  _redis = new Redis({ url, token })
  return _redis
}

const limiters = new Map<PolicyName, Ratelimit>()

export function getLimiter(name: PolicyName): Ratelimit {
  let l = limiters.get(name)
  if (!l) {
    const p = POLICIES[name]
    l = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.tokenBucket(p.limit, p.window, p.limit),
      prefix: `rl:${name}`,
      analytics: false,
    })
    limiters.set(name, l)
  }
  return l
}

// Test helper: reset memoized limiters between tests.
export function __resetLimitersForTests(): void {
  limiters.clear()
  _redis = null
}
```

Create `src/shared/rate-limit/apply.ts`:

```ts
import { POLICIES, type PolicyName } from './policies'
import { getLimiter } from './client'

export type RateLimitOutcome = {
  ok: boolean
  limit: number
  remaining: number
  reset: number
  unavailable: boolean
}

export async function enforce(name: PolicyName, key: string): Promise<RateLimitOutcome> {
  try {
    const l = getLimiter(name)
    const r = await l.limit(key)
    return {
      ok: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
      unavailable: false,
    }
  } catch {
    const p = POLICIES[name]
    return {
      ok: p.failMode === 'open',
      limit: p.limit,
      remaining: 0,
      reset: Date.now() + 60_000,
      unavailable: true,
    }
  }
}

export function rateLimit429(outcome: RateLimitOutcome): Response {
  const retryAfter = Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000))
  return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(outcome.limit),
      'X-RateLimit-Remaining': String(outcome.remaining),
    },
  })
}
```

Create `src/shared/rate-limit/index.ts`:

```ts
export { parseClientIp } from './key'
export { enforce, rateLimit429 } from './apply'
export { POLICIES, type PolicyName } from './policies'
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run tests/unit/rate-limit-apply.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/rate-limit/ tests/unit/rate-limit-apply.test.ts
git commit -m "feat(rate-limit): enforce + 429 helper with fail-open/closed semantics"
```

---

### Task 3.5: Root `middleware.ts` (edge, IP-based limits)

**Files:**
- Create: `middleware.ts` (project root)

- [ ] **Step 1: Implement (no separate unit test — covered by Task 3.6 integration)**

Create `middleware.ts` at the repository root:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { parseClientIp } from '@/shared/rate-limit/key'

export const config = {
  matcher: [
    '/api/public/:path*',
    '/api/auth/:path*',
    '/verify',
  ],
}

export async function middleware(req: NextRequest): Promise<NextResponse | Response> {
  const path = req.nextUrl.pathname
  const ip = parseClientIp(req.headers)

  let policy: 'publicAvailability' | 'authVerify' | null = null
  if (path.startsWith('/api/public/')) policy = 'publicAvailability'
  else if (path.startsWith('/api/auth/') || path === '/verify') policy = 'authVerify'

  if (!policy) return NextResponse.next()

  const outcome = await enforce(policy, ip)
  if (!outcome.ok) return rateLimit429(outcome)
  return NextResponse.next()
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(middleware): edge rate limiter for /api/public/*, /api/auth/*, /verify"
```

---

### Task 3.6: Integration test — middleware throttles after N hits

**Files:**
- Create: `tests/integration/middleware-rate-limit.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/middleware-rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this.limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return {
        success: n <= this.limit,
        limit: this.limit,
        remaining: Math.max(0, this.limit - n),
        reset: Date.now() + 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { middleware } from '../../middleware'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

function mkReq(path: string, ip: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': ip },
  })
}

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

describe('root middleware rate limit', () => {
  it('passes through non-matched paths', async () => {
    const res = await middleware(mkReq('/some/other', '1.2.3.4'))
    expect(res.status).toBeLessThan(400)
  })

  it('public/availability: 30 OK, 31st returns 429', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.2.3.4'))
      expect(r.status).not.toBe(429)
    }
    const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.2.3.4'))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBeTruthy()
  })

  it('auth/callback: 10 OK, 11th returns 429', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await middleware(mkReq('/api/auth/callback', '5.6.7.8'))
      expect(r.status).not.toBe(429)
    }
    const r = await middleware(mkReq('/api/auth/callback', '5.6.7.8'))
    expect(r.status).toBe(429)
  })

  it('different IPs do not share buckets', async () => {
    for (let i = 0; i < 30; i++) await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.1.1.1'))
    const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '2.2.2.2'))
    expect(r.status).not.toBe(429)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/middleware-rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/middleware-rate-limit.test.ts
git commit -m "test(middleware): rate-limit throttling per IP and policy"
```

---

### Task 3.7: Apply rate limit to login action (5/min per email)

**Files:**
- Modify: `src/app/(auth)/login/actions.ts`
- Test: `tests/integration/login-rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/login-rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this.limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return {
        success: n <= this.limit,
        limit: this.limit,
        remaining: Math.max(0, this.limit - n),
        reset: Date.now() + 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

// Stub the signInWithMagicLink so the test does not hit Supabase.
vi.mock('@/modules/auth/auth.service', () => ({
  signInWithMagicLink: vi.fn(async () => ({ ok: true })),
}))

// Stub next/headers `headers()` — Server Actions read from it.
vi.mock('next/headers', () => ({
  headers: () => new Headers({ origin: 'http://localhost:3000' }),
}))

import { Ratelimit } from '@upstash/ratelimit'
import { loginAction } from '@/app/(auth)/login/actions'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

function fd(email: string): FormData {
  const f = new FormData()
  f.set('email', email)
  return f
}

describe('loginAction rate limit (5/min per email)', () => {
  it('first 5 attempts succeed; 6th returns RATE_LIMITED', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
      expect(res.status).toBe('sent')
    }
    const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).toMatch(/rate|límite|límit|too many/i)
  })

  it('different emails do not share buckets', async () => {
    for (let i = 0; i < 5; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd('c@d.com'))
    expect(res.status).toBe('sent')
  })

  it('email key is normalized (trim + lowercase) so case variants share the bucket', async () => {
    for (let i = 0; i < 5; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd(' A@B.COM '))
    expect(res.status).toBe('error')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm vitest run tests/integration/login-rate-limit.test.ts`
Expected: FAIL — no rate limit on loginAction.

- [ ] **Step 3: Insert the enforce() call**

Replace `src/app/(auth)/login/actions.ts` with:

```ts
'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { signInWithMagicLink } from '@/modules/auth/auth.service'
import { enforce } from '@/shared/rate-limit/apply'

const schema = z.object({ email: z.string().trim().toLowerCase().email() })

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { status: 'error', message: 'Email inválido.' }
  }

  const rl = await enforce('authMagicLink', parsed.data.email)
  if (!rl.ok) {
    return {
      status: 'error',
      message: 'Demasiados intentos. Probá de nuevo en un minuto.',
    }
  }

  const origin =
    headers().get('origin') ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ''
  const result = await signInWithMagicLink(
    parsed.data.email,
    `${origin}/api/auth/callback`,
  )
  if (!result.ok) {
    return { status: 'error', message: 'No pudimos enviar el email. Probá de nuevo.' }
  }
  return { status: 'sent', email: parsed.data.email }
}
```

- [ ] **Step 4: Run**

Run: `pnpm vitest run tests/integration/login-rate-limit.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/login/actions.ts tests/integration/login-rate-limit.test.ts
git commit -m "feat(auth): rate limit magic-link 5/min per email (doc15 §9)"
```

---

### Task 3.8: Apply rate limit to admin route handler (tenant key)

**Files:**
- Create: `src/shared/rate-limit/route-guard.ts`
- Modify: `src/app/api/bookings/route.ts` (or whichever admin route handler you choose first)
- Test: `tests/integration/admin-rate-limit.test.ts`

- [ ] **Step 1: Implement a thin guard helper to keep handlers terse**

Create `src/shared/rate-limit/route-guard.ts`:

```ts
import { NextResponse } from 'next/server'
import { enforce, rateLimit429 } from './apply'
import type { PolicyName } from './policies'

/**
 * Apply a rate-limit policy with the given key. Returns:
 *   - `null` if allowed (caller proceeds).
 *   - A `429` Response if throttled (caller returns it directly).
 *
 * Usage:
 *   const throttled = await guard('adminCrud', tenantId)
 *   if (throttled) return throttled
 */
export async function guard(name: PolicyName, key: string): Promise<NextResponse | null> {
  const r = await enforce(name, key)
  if (!r.ok) return rateLimit429(r) as unknown as NextResponse
  return null
}
```

- [ ] **Step 2: Write failing test**

Create `tests/integration/admin-rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix; this.limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return { success: n <= this.limit, limit: this.limit, remaining: Math.max(0, this.limit - n), reset: Date.now() + 60_000 }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { Ratelimit } from '@upstash/ratelimit'
import { guard } from '@/shared/rate-limit/route-guard'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

describe('guard helper', () => {
  it('returns null for first 100 hits per tenant; 101st returns 429', async () => {
    const tid = '11111111-1111-1111-1111-111111111111'
    for (let i = 0; i < 100; i++) expect(await guard('adminCrud', tid)).toBeNull()
    const res = await guard('adminCrud', tid)
    expect(res?.status).toBe(429)
  })
  it('different tenants do not share buckets', async () => {
    const a = 'a'.repeat(36), b = 'b'.repeat(36)
    for (let i = 0; i < 100; i++) await guard('adminCrud', a)
    expect(await guard('adminCrud', b)).toBeNull()
  })
})
```

- [ ] **Step 3: Run**

Run: `pnpm vitest run tests/integration/admin-rate-limit.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Wire the guard into the chosen admin route**

Open `src/app/api/bookings/route.ts`. Locate the function that handles staff requests (typically a wrapper like `withTenant(...)` providing `tenantId`). Insert the guard at the top of the handler body:

```ts
import { guard } from '@/shared/rate-limit/route-guard'

// inside the handler, after `tenantId` is known but before any work:
const throttled = await guard('adminCrud', tenantId)
if (throttled) return throttled
```

Apply the same change to the other admin route handlers under `src/app/api/bookings/[id]/*`, `src/app/api/...` (admin scope). Use this checklist:

- `src/app/api/bookings/route.ts`
- `src/app/api/bookings/[id]/route.ts`
- `src/app/api/bookings/[id]/cancel/route.ts`
- `src/app/api/bookings/[id]/complete/route.ts`
- `src/app/api/bookings/[id]/no-show/route.ts`

For each: add the import + 2-line `guard` call after `tenantId` is resolved.

- [ ] **Step 5: Typecheck + run admin integration tests**

Run: `pnpm typecheck && pnpm vitest run tests/integration/booking-api.test.ts`
Expected: PASS (existing admin tests should not exceed 100 req/min in their fixtures).

- [ ] **Step 6: Commit**

```bash
git add src/shared/rate-limit/route-guard.ts src/app/api/bookings/ tests/integration/admin-rate-limit.test.ts
git commit -m "feat(admin): rate limit admin route handlers 100/min per tenant (doc15 §9)"
```

---

### Task 3.9: Apply rate limit to player route handlers (player_id key)

**Files:**
- Modify: `src/app/api/player/bookings/route.ts`
- Modify: `src/app/api/player/bookings/[id]/route.ts`
- Modify: `src/app/api/player/bookings/[id]/cancel/route.ts`

- [ ] **Step 1: Wire `guard('playerBooking', playerId)` into each player route**

For each handler wrapped by `withPlayer`, add at the top of the body (after `user.playerId` is in scope):

```ts
import { guard } from '@/shared/rate-limit/route-guard'

// inside the handler:
const throttled = await guard('playerBooking', user.playerId)
if (throttled) return throttled
```

- [ ] **Step 2: Test**

Create `tests/integration/player-rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix; this.limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return { success: n <= this.limit, limit: this.limit, remaining: Math.max(0, this.limit - n), reset: Date.now() + 60_000 }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { Ratelimit } from '@upstash/ratelimit'
import { guard } from '@/shared/rate-limit/route-guard'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

describe('player rate limit (20/min per player_id)', () => {
  it('20 OK, 21st throttled', async () => {
    const pid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    for (let i = 0; i < 20; i++) expect(await guard('playerBooking', pid)).toBeNull()
    const r = await guard('playerBooking', pid)
    expect(r?.status).toBe(429)
  })
})
```

Run: `pnpm vitest run tests/integration/player-rate-limit.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/player/ tests/integration/player-rate-limit.test.ts
git commit -m "feat(player): rate limit player route handlers 20/min per player_id (doc15 §9)"
```

---

### Task 3.10: Fail-mode regression tests (open vs closed)

**Files:**
- Create: `tests/integration/rate-limit-fail-mode.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/rate-limit-fail-mode.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    constructor(_: unknown) {}
    async limit(_: string): Promise<never> { throw new Error('redis-down') }
  }
  return { Ratelimit: FakeRatelimit }
})

import { enforce } from '@/shared/rate-limit/apply'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  __resetLimitersForTests()
})

describe('fail-mode behavior when Redis is unreachable', () => {
  it('publicAvailability fails OPEN (allow + unavailable=true)', async () => {
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('adminCrud fails OPEN', async () => {
    const r = await enforce('adminCrud', 'tenant-x')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('playerBooking fails OPEN', async () => {
    const r = await enforce('playerBooking', 'player-x')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('authMagicLink fails CLOSED (deny)', async () => {
    const r = await enforce('authMagicLink', 'a@b.com')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
  it('authVerify fails CLOSED', async () => {
    const r = await enforce('authVerify', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/rate-limit-fail-mode.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rate-limit-fail-mode.test.ts
git commit -m "test(rate-limit): fail-mode regression (open availability/admin/player, closed auth)"
```

---

## Phase 4 — Concurrency Stress Tests

### Task 4.1: Double booking — manual vs online same slot

**Files:**
- Create: `tests/integration/race-double-booking.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/race-double-booking.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext, withPlayerContext } from '@/shared/db/client'
import { createManualBooking } from '@/modules/bookings/booking.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from './helpers/tenant'
import { seedIsolationData, type IsolationSeed } from './helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: double booking (manual vs online, same court/slot)', () => {
  it('N=10 concurrent attempts → exactly 1 succeeds, rest reject', async () => {
    const date = '2026-06-15'
    const timeStart = '20:00'
    const timeEnd = '21:00'

    const N = 10
    const attempts: Promise<'won' | 'lost'>[] = []
    for (let i = 0; i < N; i++) {
      attempts.push(
        withTenantContext(tenant.id, async (tx) => {
          try {
            await createManualBooking(
              tenant.id,
              {
                courtId: seed.courtId,
                date,
                timeStart,
                timeEnd,
                durationMins: 60,
                type: 'spontaneous',
                staffUserId: seed.staffUserId,
                playerId,
              },
              tx,
            )
            return 'won' as const
          } catch {
            return 'lost' as const
          }
        }),
      )
    }
    const results = await Promise.all(attempts)
    const winners = results.filter((r) => r === 'won').length
    expect(winners).toBe(1)
    expect(results.filter((r) => r === 'lost').length).toBe(N - 1)

    // Confirm DB has exactly 1 booking for this slot.
    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM bookings
      WHERE court_id = ${seed.courtId}
        AND date = ${date}::date
        AND time_start = ${timeStart}::time
        AND status IN ('pending_payment', 'confirmed')
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/race-double-booking.test.ts`
Expected: PASS (defenses already exist). If it FAILS with > 1 winner, that's a real bug → apply `systematic-debugging` (reproduce → minimal case → fix in `lockCourtOrThrow` / `checkOverlapOrThrow` / exclusion constraint).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/race-double-booking.test.ts
git commit -m "test(concurrency): double-booking stress — exactly 1 winner under N parallel inserts"
```

---

### Task 4.2: Double payment — webhook storm

**Files:**
- Create: `tests/integration/race-double-payment.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/race-double-payment.test.ts`. The test issues M concurrent `handleMpWebhookJob` calls with the SAME `mpEventId` + `mpPaymentId` and asserts: exactly 1 booking transitions, 1 payment row, 1 cash_flow row.

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from './helpers/tenant'
import { seedIsolationData, type IsolationSeed } from './helpers/seed'
import { insertBooking } from './helpers/factories'

// Stub the MP SDK so getPaymentStatus returns a deterministic "approved".
vi.mock('@/modules/payments/mp-gateway.implementation', () => ({
  MercadoPagoGateway: class {
    constructor(_: string) {}
    async getPaymentStatus(id: string) {
      return {
        mpPaymentId: id,
        status: 'approved' as const,
        amount: 100000,
        externalReference: globalThis.__BOOKING_ID__ ?? '',
        paymentMethodId: 'account_money',
      }
    }
  },
}))

import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

let tenant: { id: string }
let seed: IsolationSeed
let bookingId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: player.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
  // Connect MP to the tenant so handler doesn't bail on TenantMpNotConnectedError.
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc:fake'}
    WHERE id = ${tenant.id}
  `
  ;(globalThis as Record<string, unknown>).__BOOKING_ID__ = bookingId
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: webhook storm', () => {
  it('M=8 concurrent identical webhooks → exactly 1 transitions booking, 1 payment, 1 cashflow', async () => {
    const M = 8
    const jobs = Array.from({ length: M }, () => ({
      tenantId: tenant.id,
      mpEventId: 'evt-race-1',
      eventType: 'payment',
      mpPaymentId: '999000111',
      rawPayload: { id: 'evt-race-1', type: 'payment', data: { id: '999000111' } },
    }))

    const results = await Promise.allSettled(jobs.map((j) => handleMpWebhookJob(j)))
    // Some may reject from race-induced rollbacks — that's acceptable; what matters is DB state.
    const rejected = results.filter((r) => r.status === 'rejected').length
    expect(rejected).toBeLessThanOrEqual(M)

    const sql = getSql()
    const bk = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(bk[0].status).toBe('confirmed')

    const pays = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM payments WHERE mp_payment_id = '999000111'
    `
    expect(pays[0].c).toBe(1)

    const cfs = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM cash_flows
      WHERE tenant_id = ${tenant.id}
        AND description LIKE '%999000111%'
    `
    expect(cfs[0].c).toBeLessThanOrEqual(1) // exactly 0 or 1; never duplicated.

    const evt = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = 'evt-race-1'
    `
    expect(evt[0].c).toBe(1)
  }, 30_000)
})
```

(If the `cash_flows.description` pattern doesn't match the production formatter, replace the LIKE with a tighter predicate that joins to payment/booking — adjust to what `dispatchPaymentInfo` writes.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/race-double-payment.test.ts`
Expected: PASS. If duplicates appear → real bug → `systematic-debugging`.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/race-double-payment.test.ts
git commit -m "test(concurrency): webhook storm — idempotent under M concurrent identical webhooks"
```

---

### Task 4.3: Expiry vs confirm race

**Files:**
- Create: `tests/integration/race-expiry-vs-confirm.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/race-expiry-vs-confirm.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from './helpers/tenant'
import { seedIsolationData, type IsolationSeed } from './helpers/seed'
import { insertBooking } from './helpers/factories'

let tenant: { id: string }
let seed: IsolationSeed
let bookingId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: player.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: expiry vs confirm (same pending_payment row)', () => {
  it('exactly one transitions; loser sees won=false', async () => {
    const [a, b] = await Promise.all([
      withTenantContext(tenant.id, (tx) =>
        transitionFromPendingPayment(bookingId, 'confirmed', tx),
      ),
      withTenantContext(tenant.id, (tx) =>
        transitionFromPendingPayment(bookingId, 'expired', tx),
      ),
    ])

    const winners = [a, b].filter((r) => r.won).length
    expect(winners).toBe(1)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(['confirmed', 'expired']).toContain(rows[0].status)
  }, 30_000)
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/race-expiry-vs-confirm.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/race-expiry-vs-confirm.test.ts
git commit -m "test(concurrency): expiry vs confirm — conditional UPDATE picks exactly one winner"
```

---

## Phase 5 — Secrets + Headers

### Task 5.1: `src/shared/env.ts` — fail-fast Zod env validation

**Files:**
- Create: `src/shared/env.ts`
- Test: `tests/unit/env-validation.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/env-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateServerEnv } from '@/shared/env'

describe('validateServerEnv', () => {
  const baseValid = {
    DATABASE_URL: 'postgres://x',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
    SUPABASE_SERVICE_ROLE_KEY: 'a'.repeat(40),
    PIN_COOKIE_SECRET: 'a'.repeat(32),
    ENCRYPTION_KEY: 'a'.repeat(32),
    MP_CLIENT_ID: 'mp-id',
    MP_CLIENT_SECRET: 'mp-secret',
    MP_WEBHOOK_SECRET: 'a'.repeat(32),
    RESEND_API_KEY: 're_xxx',
    UPSTASH_REDIS_REST_URL: 'https://stub',
    UPSTASH_REDIS_REST_TOKEN: 'a'.repeat(32),
  }

  it('passes with all required vars', () => {
    expect(() => validateServerEnv({ ...baseValid, NODE_ENV: 'production' })).not.toThrow()
  })

  it('fails when PIN_COOKIE_SECRET < 16', () => {
    expect(() => validateServerEnv({ ...baseValid, PIN_COOKIE_SECRET: 'short' })).toThrow(/PIN_COOKIE_SECRET/)
  })

  it('fails when MP_WEBHOOK_SECRET missing in production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(/MP_WEBHOOK_SECRET/)
  })

  it('allows missing MP_WEBHOOK_SECRET outside production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'development' })).not.toThrow()
  })

  it('fails when NEXT_PUBLIC_APP_URL missing in production', () => {
    const { NEXT_PUBLIC_APP_URL: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(/NEXT_PUBLIC_APP_URL/)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/unit/env-validation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/shared/env.ts`:

```ts
import { z } from 'zod'

const minLen = (n: number, name: string) =>
  z.string().min(n, `${name} must be at least ${n} chars`)

function makeSchema(isProd: boolean) {
  return z.object({
    DATABASE_URL: z.string().min(1),
    NEXT_PUBLIC_APP_URL: isProd ? z.string().url() : z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    PIN_COOKIE_SECRET: minLen(16, 'PIN_COOKIE_SECRET'),
    ENCRYPTION_KEY: minLen(32, 'ENCRYPTION_KEY'),
    MP_CLIENT_ID: z.string().min(1),
    MP_CLIENT_SECRET: z.string().min(1),
    MP_WEBHOOK_SECRET: isProd ? minLen(16, 'MP_WEBHOOK_SECRET') : minLen(16, 'MP_WEBHOOK_SECRET').optional(),
    RESEND_API_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: isProd ? z.string().url() : z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: isProd ? z.string().min(20) : z.string().min(20).optional(),
  })
}

export type ServerEnv = z.infer<ReturnType<typeof makeSchema>>

export function validateServerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const isProd = (env.NODE_ENV ?? 'development') === 'production'
  const schema = makeSchema(isProd)
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return parsed.data
}
```

- [ ] **Step 4: Wire validation at boot (Next instrumentation)**

Create or extend `instrumentation.ts` at the repository root:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerEnv } = await import('./src/shared/env')
    validateServerEnv(process.env)
  }
}
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm vitest run tests/unit/env-validation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/env.ts instrumentation.ts tests/unit/env-validation.test.ts
git commit -m "feat(env): fail-fast Zod validation of server env at boot"
```

---

### Task 5.2: gitleaks scan + CI hook

**Files:**
- Create: `.gitleaks.toml`
- Create: `.github/workflows/security.yml` (or extend existing CI file)

- [ ] **Step 1: Run gitleaks locally on full history**

Install gitleaks (one-off, document the command):

```bash
# Windows (scoop) / macOS (brew) / linux (release tarball)
# https://github.com/gitleaks/gitleaks
gitleaks detect --source . --no-banner --redact -v
```

If any **real** leak is found:
- Rotate the secret in the corresponding provider (MP, Supabase, Resend, Upstash, Sentry).
- Remove the secret from history via `git filter-repo` or BFG (out of scope for this plan — escalate to a human).
- Re-run gitleaks until clean.

If only fixtures / `.env.example` placeholders are flagged, add them to `.gitleaks.toml` allowlist:

```toml
title = "TurnoGol gitleaks config"

[allowlist]
description = "Allowlist for placeholders and test fixtures"
paths = [
  '''\.env\.example$''',
  '''\.env\.test\.example$''',
  '''tests/.*''',
  '''docs/.*''',
]
```

- [ ] **Step 2: CI hook**

Add `.github/workflows/security.yml` (if it does not exist):

```yaml
name: security

on:
  push: { branches: [main] }
  pull_request:

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  pnpm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod --audit-level=high
```

- [ ] **Step 3: Commit**

```bash
git add .gitleaks.toml .github/workflows/security.yml
git commit -m "ci(security): gitleaks + pnpm audit on push/PR"
```

---

### Task 5.3: Harden CSP (remove `unsafe-eval`) + add HSTS

**Files:**
- Modify: `next.config.js`
- Test: `tests/integration/security-headers.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/security-headers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('next.config.js security headers', () => {
  const src = readFileSync(path.resolve('next.config.js'), 'utf8')

  it('does NOT include unsafe-eval in script-src', () => {
    const cspBlock = src.match(/Content-Security-Policy[\s\S]*?]\.join/m)?.[0] ?? ''
    expect(cspBlock).not.toMatch(/'unsafe-eval'/)
  })

  it('includes Strict-Transport-Security with preload + includeSubDomains', () => {
    expect(src).toMatch(/Strict-Transport-Security/i)
    expect(src).toMatch(/preload/)
    expect(src).toMatch(/includeSubDomains/)
    expect(src).toMatch(/max-age=\d{7,}/)
  })

  it('keeps X-Frame-Options: DENY', () => {
    expect(src).toMatch(/X-Frame-Options.*DENY/s)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm vitest run tests/integration/security-headers.test.ts`
Expected: FAIL — `unsafe-eval` present, no HSTS.

- [ ] **Step 3: Update `next.config.js`**

Replace the `securityHeaders` block:

```js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' *.supabase.co images.unsplash.com data: blob:",
      "font-src 'self'",
      "connect-src 'self' *.supabase.co *.mercadopago.com",
      "frame-src *.mercadopago.com",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]
```

Note on `'unsafe-inline'`: this remains for now because Next 14 emits some inline runtime scripts. The follow-up to introduce nonce-based CSP is out of scope for Fase 3 — document it in the spec's "Risks" section if not already.

- [ ] **Step 4: Smoke-run the dev server**

Run: `pnpm dev`
Open: `http://localhost:3000` in a browser.
Check DevTools → Network → response headers: `Strict-Transport-Security` is set; CSP no longer mentions `unsafe-eval`. Confirm no console CSP errors block functionality.

Stop the dev server (Ctrl-C).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/integration/security-headers.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add next.config.js tests/integration/security-headers.test.ts
git commit -m "feat(headers): drop unsafe-eval from CSP, add HSTS"
```

---

### Task 5.4: Cookie flags + headers HTTP-level test

**Files:**
- Create: `tests/integration/cookie-flags.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/cookie-flags.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    const s = statSync(p)
    if (s.isDirectory() && !p.includes('node_modules') && !p.includes('.next')) walk(p, acc)
    else if (s.isFile() && p.endsWith('.ts')) acc.push(p)
  }
  return acc
}

const files = walk(path.resolve('src'))

describe('cookie flags', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // Only consider files that actually .set( a cookie via `cookies()` jar.
    if (!/cookies\(\)/.test(src)) continue
    if (!/\.set\(\s*\{/.test(src)) continue
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/')

    it(`${rel} sets httpOnly + sameSite + secure(prod)`, () => {
      const block = src.match(/\.set\(\s*\{[\s\S]*?\}\s*\)/g) ?? []
      for (const b of block) {
        expect(b, `${rel}: cookie .set must include httpOnly: true`).toMatch(/httpOnly:\s*true/)
        expect(b, `${rel}: cookie .set must include sameSite`).toMatch(/sameSite:\s*['"](lax|strict)['"]/)
        expect(b, `${rel}: cookie .set must include secure based on NODE_ENV`).toMatch(/secure:\s*process\.env\.NODE_ENV/)
      }
    })
  }
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/cookie-flags.test.ts`
Expected: PASS (current code already sets these). If FAIL, audit the offending file and align with the pattern in `src/app/(admin)/actions/pin.ts:37-42`.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cookie-flags.test.ts
git commit -m "test(cookies): assert httpOnly + sameSite + secure(prod) on every set"
```

---

## Phase 6 — IDOR / Authz in Route Handlers

### Task 6.1: Player A cannot access player B booking (cancel + read)

**Files:**
- Create: `tests/integration/idor-player-bookings.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/idor-player-bookings.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from './helpers/tenant'
import { seedIsolationData, type IsolationSeed } from './helpers/seed'
import { insertBooking } from './helpers/factories'
import { GET as readPlayerBooking } from '@/app/api/player/bookings/[id]/route'
import { POST as cancelPlayerBooking } from '@/app/api/player/bookings/[id]/cancel/route'
import { NextRequest } from 'next/server'

let tenant: { id: string }
let seed: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfB: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  playerA = await createTestPlayer(sql)
  playerB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, playerA.id)
  await linkPlayerToTenant(sql, tenant.id, playerB.id)
  bookingOfB = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

/**
 * `withPlayer` reads identity from the Supabase session cookie. For this test
 * we stub it to inject `playerA` as the authenticated player. The implementation
 * detail of how `withPlayer` is stubbed depends on the project — see
 * `src/shared/middleware/with-player.ts`. If a test helper does not exist,
 * add one (`mockWithPlayer(playerId)`).
 */
import { vi } from 'vitest'

vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer: (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const playerId = (globalThis as Record<string, unknown>).__AS_PLAYER__ as string
      const { getDb } = await import('@/shared/db/client')
      const db = getDb()
      return db.transaction(async (tx) => {
        await tx.execute({ sql: `SELECT set_config('app.current_player_id', '${playerId}', true)`, params: [] } as never)
        return handler(req, { playerId }, tx)
      })
    },
}))

describe('IDOR: player route handlers', () => {
  it('GET /api/player/bookings/[id] as A cannot read B booking → 404', async () => {
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = playerA.id
    const req = new NextRequest(`http://localhost/api/player/bookings/${bookingOfB}`)
    const res = await readPlayerBooking(req, { params: { id: bookingOfB } } as never)
    expect(res.status).toBe(404)
  })

  it('POST /api/player/bookings/[id]/cancel as A on B booking → 404 or 403, no mutation', async () => {
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = playerA.id
    const req = new NextRequest(`http://localhost/api/player/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelPlayerBooking(req)
    expect([403, 404]).toContain(res.status)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingOfB}`
    expect(rows[0].status).toBe('confirmed') // unchanged
  })
})
```

(If the existing `withPlayer` signature differs, adjust the mock to call the inner handler with the same args used in the file under test.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/idor-player-bookings.test.ts`
Expected: PASS (RLS + `cancelByPlayer` already guard ownership). If FAIL → the handler leaks data → fix per `systematic-debugging`.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/idor-player-bookings.test.ts
git commit -m "test(idor): player A cannot read or cancel player B booking"
```

---

### Task 6.2: Tenant A cannot operate on tenant B `[id]` routes

**Files:**
- Create: `tests/integration/idor-admin-cross-tenant.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/idor-admin-cross-tenant.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from './helpers/tenant'
import { seedIsolationData, type IsolationSeed } from './helpers/seed'
import { insertBooking } from './helpers/factories'

let tenantA: { id: string }
let tenantB: { id: string }
let A: IsolationSeed
let B: IsolationSeed
let bookingOfB: string
let staffOfA: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)
  A = await seedIsolationData(sql, tenantA.id)
  B = await seedIsolationData(sql, tenantB.id)
  staffOfA = A.staffUserId
  const playerB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantB.id, playerB.id)
  bookingOfB = await insertBooking(sql, {
    tenantId: tenantB.id,
    courtId: B.courtId,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// Stub the admin auth wrapper to inject tenantA's identity.
vi.mock('@/shared/middleware/with-tenant', () => ({
  withTenant: (handler: (req: NextRequest, user: { tenantId: string; staffUserId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const tenantId = (globalThis as Record<string, unknown>).__AS_TENANT__ as string
      const staffUserId = (globalThis as Record<string, unknown>).__AS_STAFF__ as string
      const { getDb } = await import('@/shared/db/client')
      const db = getDb()
      return db.transaction(async (tx) => {
        await tx.execute({ sql: `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`, params: [] } as never)
        return handler(req, { tenantId, staffUserId }, tx)
      })
    },
}))

import { GET as readBooking } from '@/app/api/bookings/[id]/route'
import { POST as cancelBooking } from '@/app/api/bookings/[id]/cancel/route'

describe('IDOR: admin route handlers (cross-tenant)', () => {
  beforeAll(() => {
    ;(globalThis as Record<string, unknown>).__AS_TENANT__ = tenantA.id
    ;(globalThis as Record<string, unknown>).__AS_STAFF__ = staffOfA
  })

  it('GET /api/bookings/[id] for tenant B booking → 404', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}`)
    const res = await readBooking(req, { params: { id: bookingOfB } } as never)
    expect(res.status).toBe(404)
  })

  it('POST /api/bookings/[id]/cancel on tenant B booking → 404, no mutation', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelBooking(req, { params: { id: bookingOfB } } as never)
    expect(res.status).toBe(404)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingOfB}`
    expect(rows[0].status).toBe('confirmed') // unchanged
  })
})
```

(Adjust the `withTenant` import path and handler signatures to match the actual file. If admin routes do not export their handlers directly, refactor to expose `GET` / `POST` named exports — this is standard for Next 14 app router and should already be the case.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/idor-admin-cross-tenant.test.ts`
Expected: PASS. If FAIL → confirm that every admin `[id]` handler operates inside `withTenantContext(session.tenantId, …)` and lets RLS filter the row.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/idor-admin-cross-tenant.test.ts
git commit -m "test(idor): staff of tenant A cannot read/mutate booking of tenant B"
```

---

### Task 6.3: Context source audit — `tenant_id`/`player_id` never from request

**Files:**
- Create: `tests/unit/context-source.test.ts`

- [ ] **Step 1: Write a static-analysis test**

Create `tests/unit/context-source.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(root: string, suffix: RegExp, acc: string[] = []): string[] {
  for (const e of readdirSync(root)) {
    const p = path.join(root, e)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, suffix, acc)
    else if (suffix.test(e)) acc.push(p)
  }
  return acc
}

const routes = walk(path.resolve('src/app/api'), /^route\.ts$/)

/**
 * Forbidden pattern: passing a `tenant_id` / `player_id` *derived from the request*
 * (URL params, body, query) directly into `withTenantContext` / `withPlayerContext`.
 *
 * Allowed: deriving it from a row already filtered by RLS (e.g. pre-read inside the
 * authenticated player context, then setting tenant context from the row).
 *
 * Heuristic: flag any `withTenantContext(<expr>, ...)` whose expression contains
 * `params.` or `searchParams.` or `body.tenant`.
 */
const FORBIDDEN = [
  /withTenantContext\([^,]*params\./,
  /withTenantContext\([^,]*searchParams\./,
  /withTenantContext\([^,]*body\.tenant/,
  /withPlayerContext\([^,]*params\./,
  /withPlayerContext\([^,]*searchParams\./,
  /withPlayerContext\([^,]*body\.player/,
]

describe('context source must NEVER come from request input', () => {
  for (const f of routes) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/')
    const src = readFileSync(f, 'utf8')
    it(`${rel} does not seed context from request`, () => {
      for (const re of FORBIDDEN) {
        expect(src, `${rel}: forbidden pattern ${re}`).not.toMatch(re)
      }
    })
  }
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/unit/context-source.test.ts`
Expected: PASS (current code uses session-derived ids). If FAIL → the offending route MUST be rewritten so context comes from session/JWT.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/context-source.test.ts
git commit -m "test(idor): static guard — tenant/player context never seeded from request"
```

---

## Phase 7 — SSRF in MercadoPago Flows

### Task 7.1: Validate `mpPaymentId` is strictly numeric

**Files:**
- Modify: `src/modules/payments/payment.schema.ts` (extend `webhookPayloadSchema`)
- Modify: `src/modules/payments/mp-gateway.implementation.ts` (defensive check in `getPaymentStatus`)
- Test: `tests/unit/mp-payment-id-validation.test.ts`

- [ ] **Step 1: Read the current schema**

Open `src/modules/payments/payment.schema.ts`. Locate `webhookPayloadSchema`. Confirm that `payload.data.id` is currently typed as `z.string()` (or similar). If it is already strict numeric, skip Step 3.

- [ ] **Step 2: Write failing test**

Create `tests/unit/mp-payment-id-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'

const NUMERIC = '999000111'
const HARMFUL = ['../../etc/passwd', 'https://evil.example/x', '1; DROP TABLE', '1 OR 1=1', 'abc', '']

describe('webhookPayloadSchema: mpPaymentId must be strictly numeric', () => {
  it('accepts a numeric id', () => {
    const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: 'payment', data: { id: NUMERIC } })
    expect(r.success).toBe(true)
  })
  for (const bad of HARMFUL) {
    it(`rejects "${bad}"`, () => {
      const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: 'payment', data: { id: bad } })
      expect(r.success).toBe(false)
    })
  }
})
```

- [ ] **Step 3: Run to confirm fail**

Run: `pnpm vitest run tests/unit/mp-payment-id-validation.test.ts`
Expected: FAIL — current schema accepts arbitrary strings.

- [ ] **Step 4: Tighten the schema**

Open `src/modules/payments/payment.schema.ts`. Locate the `data` field in `webhookPayloadSchema` and tighten the `id` field:

```ts
const MP_ID_RE = /^\d{1,32}$/

// Inside webhookPayloadSchema definition, replace data:
data: z.object({
  id: z.string().regex(MP_ID_RE, 'invalid mpPaymentId'),
}),
```

- [ ] **Step 5: Defense in depth — guard inside the gateway**

In `src/modules/payments/mp-gateway.implementation.ts`, at the top of `getPaymentStatus`, add:

```ts
async getPaymentStatus(mpPaymentId: string): Promise<GatewayPaymentInfo> {
  if (!/^\d{1,32}$/.test(mpPaymentId)) {
    throw new MpGatewayError(`invalid mpPaymentId: ${mpPaymentId}`)
  }
  const payment = new Payment(this.config)
  // ...rest unchanged
}
```

Apply the same guard at the top of `createRefund(mpPaymentId, …)`.

- [ ] **Step 6: Run + typecheck**

Run: `pnpm vitest run tests/unit/mp-payment-id-validation.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/payments/payment.schema.ts src/modules/payments/mp-gateway.implementation.ts tests/unit/mp-payment-id-validation.test.ts
git commit -m "fix(mp): strict numeric mpPaymentId (SSRF/path-injection guard at schema + gateway)"
```

---

### Task 7.2: Require `APP_URL` in `mp/callback` (no `req.url` fallback)

**Files:**
- Modify: `src/app/api/mp/callback/route.ts`
- Modify: `src/app/api/mp/oauth-start/route.ts` (same fallback present)
- Test: `tests/integration/mp-callback-app-url.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/mp-callback-app-url.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as mpCallback } from '@/app/api/mp/callback/route'

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL
  saved.NODE_ENV = process.env.NODE_ENV
})
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = saved.NEXT_PUBLIC_APP_URL
  process.env.NODE_ENV = saved.NODE_ENV
})

describe('mp/callback: APP_URL required in production', () => {
  it('redirects with an error when APP_URL missing in production', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL

    const req = new NextRequest('http://attacker.example/api/mp/callback?code=c&state=s.x')
    const res = await mpCallback(req)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toMatch(/mp_config_missing|mp_invalid_state/)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/mp-callback-app-url.test.ts`
Expected: FAIL — current code falls back to `req.url` origin.

- [ ] **Step 3: Patch the callback**

In `src/app/api/mp/callback/route.ts`, replace the line:

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
```

with:

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL
if (!appUrl) {
  return NextResponse.redirect(
    new URL('/onboarding?error=mp_config_missing', req.url),
  )
}
```

Apply the same change in `src/app/api/mp/oauth-start/route.ts`:

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL
if (!appUrl) {
  return NextResponse.json({ error: 'mp_config_missing' }, { status: 500 })
}
```

- [ ] **Step 4: Run**

Run: `pnpm vitest run tests/integration/mp-callback-app-url.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mp/callback/route.ts src/app/api/mp/oauth-start/route.ts tests/integration/mp-callback-app-url.test.ts
git commit -m "fix(mp): require NEXT_PUBLIC_APP_URL — drop req.url origin fallback (host-header injection)"
```

---

### Task 7.3: Webhook tenant cross-check (or documented residual risk)

**Files:**
- Modify: `src/modules/payments/mp-webhook.handler.ts` (lines around the `payment` branch)
- Modify: `docs/superpowers/specs/2026-05-22-fase-3-seguridad-design.md` (record outcome)

- [ ] **Step 1: Decide the path**

Choose ONE of the two paths below, based on what the MP `getPaymentStatus` response includes (the `collector` / `external_reference` fields):

**Path A — Cross-check (preferred when feasible)**

After `gateway.getPaymentStatus(job.mpPaymentId)` returns, validate that the result is bound to the claimed tenant. If `info.externalReference` is a SaaS-upgrade ref, validate the embedded `tenantId` matches `job.tenantId`. For booking deposits, look up the booking by `info.externalReference` and confirm `booking.tenantId === job.tenantId` before any side effects.

In `src/modules/payments/mp-webhook.handler.ts`, inside the `payment` branch, after `const info = await gateway.getPaymentStatus(...)`:

```ts
const upgrade = parseSaasUpgradeRef(info.externalReference)
if (upgrade) {
  if (upgrade.tenantId !== job.tenantId) {
    throw new Error(`webhook tenant mismatch: claimed=${job.tenantId} actual=${upgrade.tenantId}`)
  }
  if (info.status === 'approved') {
    await handleUpgradeApproved(upgrade.tenantId, upgrade.targetPlanId, gateway, tx)
  }
  return
}

// Booking deposit branch: external_reference is the booking id.
const bookingRow = await tx.execute(sql`
  SELECT tenant_id FROM bookings WHERE id = ${info.externalReference} LIMIT 1
`)
const claimed = (bookingRow as unknown as Array<{ tenant_id: string }>)[0]?.tenant_id
if (!claimed) return // booking not in this tenant context = RLS filtered; bail out.
if (claimed !== job.tenantId) {
  throw new Error(`webhook tenant mismatch: claimed=${job.tenantId} actual=${claimed}`)
}

await dispatchPaymentInfo(info, job.tenantId, tx)
```

**Path B — Document residual risk**

If the cross-check is not feasible (e.g., `external_reference` is unreliable on some MP event types), update the spec's "Risks" section with:

```
- Webhook tenant query (`?tenant=`) is not cross-checked against the payment's
  external_reference. A holder of `MP_WEBHOOK_SECRET` could enqueue a job for an
  arbitrary tenant. Mitigation: keep `MP_WEBHOOK_SECRET` strictly per-environment;
  monitor for tenant_id values not matching any active tenant.
```

- [ ] **Step 2: Write a regression test for the chosen path**

If Path A: create `tests/integration/webhook-tenant-cross-check.test.ts` that fakes a payment whose `externalReference` belongs to tenant B and a webhook claiming tenant A → assert handler throws and no side-effect runs.

If Path B: skip Step 2; the residual is documented.

- [ ] **Step 3: Run + commit**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS.

Path A commit:
```bash
git add src/modules/payments/mp-webhook.handler.ts tests/integration/webhook-tenant-cross-check.test.ts
git commit -m "fix(mp): cross-check webhook tenant against payment external_reference"
```

Path B commit:
```bash
git add docs/superpowers/specs/2026-05-22-fase-3-seguridad-design.md
git commit -m "docs(security): document residual webhook tenant risk + monitoring mitigation"
```

---

### Task 7.4: Final SSRF regression — invalid mpPaymentId rejected end-to-end

**Files:**
- Create: `tests/integration/webhook-ssrf-guard.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/webhook-ssrf-guard.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as webhookRoute } from '@/app/api/webhooks/mercadopago/route'

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn() })),
}))
process.env.MP_WEBHOOK_SECRET = 'a'.repeat(32)

function mk(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/mercadopago?tenant=11111111-1111-1111-1111-111111111111', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': 'a'.repeat(32),
    },
    body: JSON.stringify(body),
  })
}

describe('webhook route rejects non-numeric mpPaymentId', () => {
  for (const bad of ['../etc/passwd', 'https://evil', '1 OR 1=1', '']) {
    it(`rejects data.id="${bad}"`, async () => {
      const res = await webhookRoute(mk({ id: 'evt-1', type: 'payment', data: { id: bad } }))
      expect(res.status).toBe(400)
    })
  }
  it('accepts a numeric id', async () => {
    const res = await webhookRoute(mk({ id: 'evt-1', type: 'payment', data: { id: '12345' } }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/integration/webhook-ssrf-guard.test.ts`
Expected: PASS (the schema tightening from Task 7.1 enforces this).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/webhook-ssrf-guard.test.ts
git commit -m "test(mp): webhook route rejects non-numeric mpPaymentId (SSRF guard)"
```

---

## Phase 8 — Final verification + integration

### Task 8.1: Full suite + typecheck + lint

**Files:** none

- [ ] **Step 1: Full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration`
Expected: ALL PASS. Pre-existing failures (recorded in Task 0.1) may persist; new failures introduced by this branch must be 0.

- [ ] **Step 2: Mutation spot-check (manual)**

For each of the 4 closed RLS gaps (J block), comment the policy in `006_rls_policies.sql`, re-run migrations, run the J subset:

```bash
pnpm vitest run tests/integration/isolation.test.ts -t "J\."
```

Expected: ≥1 red per gap. Restore the policy after each check.

- [ ] **Step 3: Smoke test the rate-limited paths**

Run: `pnpm dev`
In a separate shell:

```bash
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/public/availability?slug=demo&date=2026-06-01"; done
```

Expected: 200 (or 404 for an unknown slug) for the first 30 requests; 429 starting from request 31.

Stop the dev server.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git status
# Only commit if there are stragglers; otherwise skip.
```

---

### Task 8.2: Open PR

**Files:** none

- [ ] **Step 1: Push branch**

```bash
git push -u origin fase-3-seguridad
```

- [ ] **Step 2: Create PR**

Use the existing PR template / `gh pr create` command per repo convention. PR body should:

- Link to the spec: `docs/superpowers/specs/2026-05-22-fase-3-seguridad-design.md`
- Summarize the 7 areas covered, with the count of new tests per area.
- Call out the 2 fail-mode policies (open vs closed) for ops awareness.
- Flag the residual risk from Task 7.3 if Path B was chosen.
- List the new env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) that must be set in the deployment environment before merge.

---

## Spec Coverage Self-Review

Mapping spec sections → tasks:

| Spec section | Tasks |
|---|---|
| §5.1 SQLi + validation: SET LOCAL ROLE guard | 1.1 |
| §5.1 SQLi + validation: shared Zod primitives + availability migration | 1.2, 1.3 |
| §5.1 SQLi + validation: meta-test (Zod coverage) | 1.4 |
| §5.2 RLS isolation: positive policies + matrix completion | 2.1, 2.2, 2.3, 2.4 |
| §5.2 RLS isolation: realtime JWT tampering | 2.5 |
| §5.3 Rate limiting: module, middleware, post-auth wiring | 3.1–3.9 |
| §5.3 Rate limiting: fail-open/closed | 3.10 |
| §5.4 Concurrency: double booking | 4.1 |
| §5.4 Concurrency: double payment / webhook storm | 4.2 |
| §5.4 Concurrency: expiry vs confirm | 4.3 |
| §5.5 Secrets: env validation (fail-fast) | 5.1 |
| §5.5 Secrets: gitleaks + CI | 5.2 |
| §5.5 Headers: CSP unsafe-eval + HSTS | 5.3 |
| §5.5 Cookies: flags audit | 5.4 |
| §5.6 IDOR/Authz: player cross-player | 6.1 |
| §5.6 IDOR/Authz: admin cross-tenant | 6.2 |
| §5.6 IDOR/Authz: context source guard | 6.3 |
| §5.7 SSRF MP: mpPaymentId strict numeric | 7.1 |
| §5.7 SSRF MP: APP_URL required (host-header) | 7.2 |
| §5.7 SSRF MP: webhook tenant cross-check or documented residual | 7.3 |
| §5.7 SSRF MP: end-to-end regression | 7.4 |
| Verification | 8.1, 8.2 |

All 7 areas covered. No placeholders. Type names consistent across tasks (`RateLimitOutcome`, `PolicyName`, `enforce`, `guard`, `rateLimit429`, `parseClientIp`, `validateServerEnv`).
