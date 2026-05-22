# Fase 4 — Testing E2E + Stress + Launch: Diseño

> Spec de brainstorming. Fuente de verdad del diseño. El plan de ejecución vive en
> `docs/superpowers/plans/fase-4-testing-launch.md`.
> Fecha: 2026-05-22

## 1. Contexto y motivación

Fase 1 (portal público), Fase 2 (estabilización admin) y Fase 3 (seguridad + rate-limit)
dejaron el sistema con suites unit + integration verdes y rate-limit con Upstash en producción.
Falta cerrar el último escalón antes de promocionar a producción:

1. **Pruebas E2E con Playwright**: `playwright.config.ts` ya existe; `tests/e2e/` está vacío
   (solo `.gitkeep`). Se necesita una suite que cubra los 4 flujos críticos de cara al usuario.
2. **Stress test de concurrencia HTTP-end**: las defensas de booking (`lockCourtOrThrow`,
   `checkOverlapOrThrow`, exclusion constraint) están probadas a nivel servicio en
   `tests/integration` (fase-3 §Área 4). Falta una prueba HTTP que valide el stack completo
   (middleware + action + DB) bajo 50 reservas paralelas.
3. **Observabilidad incompleta**: Sentry inicializado en client/server/edge, pero los
   eventos clave de negocio (booking, payment, webhook) no dejan breadcrumbs. `/api/status`
   devuelve un stub (`{ mercadopago: 'operational', email: 'operational' }`) sin verificar
   conectividad real con DB ni pg-boss.
4. **Launch sin gate ejecutable**: no hay manera reproducible de validar "todo verde antes
   de mergear a main → deploy a prod".

Fase-4 cierra estos 4 frentes y deja el sistema listo para release.

## 2. Objetivos / No-objetivos

**Objetivos**
- Construir suite E2E Playwright con 4 specs (landing, portal-search, availability, admin-login)
  corriendo contra Supabase local + seed determinístico.
- Crear `scripts/stress-test.ts` que dispare 50 requests HTTP paralelos de reserva sobre el
  mismo slot y verifique la invariante "exactamente 1 confirmada".
- Instrumentar eventos de negocio (booking, payment, webhook) con breadcrumbs Sentry
  típados; cubrir vía un helper único en `src/shared/observability/`.
- Reescribir `/api/status` para validar conectividad real con DB y pg-boss; mantener
  externos (MP, Resend) como "configured" basado en presencia de env vars.
- Crear `scripts/launch-check.ts` como gate ejecutable (typecheck + lint + tests + e2e +
  stress + healthcheck) con exit 0/1.
- Crear `docs/LAUNCH.md` con ítems manuales no automatizables (DNS, Sentry alerts,
  MercadoPago prod, Resend SPF/DKIM, etc).

**No-objetivos**
- Performance/carga sostenida (k6, Artillery, JMeter). Solo el invariante de concurrencia.
- Visual regression (Percy, Chromatic).
- Cross-browser E2E (solo Chromium en v1; Firefox/WebKit deferidos a v1.5).
- Webhook storm de MP a nivel HTTP (cubierto por fase-3 a nivel servicio).
- AFIP / facturación (out of scope global, ADR-011).

## 3. Decisiones tomadas (brainstorming)

| Decisión | Resolución | Razón |
|---|---|---|
| Backend E2E local | **Supabase local + seed real** | Coherente con fase-2/3; detecta bugs de RLS y queries reales |
| Target stress test | **HTTP contra dev server** | Valida stack completo (middleware + action + RLS + exclusion constraint) |
| Formato Launch | **Script + markdown** | Automatizamos lo automatizable; ops manuales en `docs/LAUNCH.md` |
| Sentry breadcrumbs | **Helper típado en `src/shared/observability/`** | Un único punto para mock en tests + payload consistente |
| Scope `/api/status` | **DB + pg-boss + externos estáticos** | Rápido (<200ms), seguro para uptime monitor de alta frecuencia |
| Dependencia con fases previas | **Fase-3 mergeado antes de fase-4** | Rate-limit existe; tests E2E acomodan (`UPSTASH_REDIS_REST_URL=''` → fail-open en `publicAvailability`) |
| Organización | **Enfoque C (híbrido por riesgo)** | M1 observability → M2 E2E → M3 stress + launch; commits separados, un PR |

## 4. Arquitectura general

Una rama `fase-4-testing-launch` con tres milestones (M1, M2, M3) en commits separados.

**Árbol de archivos (delta):**

```
NUEVOS
src/shared/observability/breadcrumbs.ts        # helper típado Sentry
src/shared/observability/index.ts
tests/unit/breadcrumbs.test.ts
tests/unit/api-status.test.ts

src/app/api/__e2e__/create-booking/route.ts    # endpoint guarded (solo E2E)

tests/e2e/global-setup.ts
tests/e2e/global-teardown.ts
tests/e2e/fixtures.ts                          # auth contexts via Supabase admin
tests/e2e/landing.spec.ts
tests/e2e/portal-search.spec.ts
tests/e2e/availability.spec.ts
tests/e2e/admin-login.spec.ts

scripts/seed-e2e.ts                            # seed determinístico
scripts/stress-test.ts                         # 50 reservas HTTP paralelas
scripts/launch-check.ts                        # gate ejecutable producción

docs/LAUNCH.md                                 # checklist manual ops

MODIFICA
src/app/api/status/route.ts                    # DB + pg-boss reales
playwright.config.ts                           # globalSetup + healthcheck webServer
package.json                                   # scripts: test:e2e:ci, stress, launch:check
.env.test.example                              # vars E2E + UPSTASH vacío
src/modules/bookings/booking.service.ts        # call sites breadcrumbs
src/modules/bookings/booking.concurrency.ts    # call sites
src/modules/bookings/booking.cancellation.ts   # call sites
src/modules/payments/payment.service.ts        # call sites
src/modules/payments/mp-webhook.handler.ts     # call sites
src/shared/jobs/workers/process-mp-webhook.worker.ts  # call sites
```

**Dependencias entre milestones:**
- M1 (observability + `/api/status`) → independiente de M2/M3.
- M2 (E2E) → depende de seed determinístico; usa `/api/status` para healthcheck en `global-setup`.
- M3 (stress + launch) → depende de M1 (`launch-check` verifica `/api/status`) y M2 (`launch-check` corre `pnpm test:e2e:ci`).

**Convenciones heredadas:**
- `pnpm typecheck` después de cada cambio (CLAUDE.md).
- Conventional commits: `feat(observability)`, `test(e2e)`, `chore(launch)`.
- Tests E2E corren contra Supabase local (54322) bootstrappeado con `scripts/bootstrap-test-db.mjs` + `scripts/seed-e2e.ts`.

## 5. M1 — Observability + /api/status

### 5.1 Helper típado de breadcrumbs

`src/shared/observability/breadcrumbs.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

type BookingEvent =
  | 'booking.online.create.start'
  | 'booking.online.create.success'
  | 'booking.online.create.slot_taken'
  | 'booking.manual.create.success'
  | 'booking.transition.confirmed'
  | 'booking.transition.expired'
  | 'booking.cancel.by_player'
  | 'booking.cancel.by_admin'

type PaymentEvent =
  | 'payment.deposit.create'
  | 'payment.deposit.approved'
  | 'payment.deposit.rejected'
  | 'payment.saas.upgrade.approved'

type WebhookEvent =
  | 'mp.webhook.received'
  | 'mp.webhook.duplicate'
  | 'mp.webhook.processed'
  | 'mp.webhook.failed'

type BookingCtx = { bookingId?: string; tenantId?: string; courtId?: string; playerId?: string }
type PaymentCtx = { paymentId?: string; bookingId?: string; tenantId?: string; mpPaymentId?: string; amountCents?: number }
type WebhookCtx = { mpEventId?: string; tenantId?: string; eventType?: string; mpPaymentId?: string }

function emit(category: string, message: string, data: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })
}

export const track = {
  booking: (ev: BookingEvent, ctx: BookingCtx) => emit('booking', ev, ctx),
  payment: (ev: PaymentEvent, ctx: PaymentCtx) => emit('payment', ev, ctx),
  webhook: (ev: WebhookEvent, ctx: WebhookCtx) => emit('webhook', ev, ctx),
}
```

Reglas:
- **Nunca PII** en `data`. Solo IDs (UUIDs, montos en centavos, status enums).
- `level: 'info'`. Errores siguen vía `Sentry.captureException` en el caller.
- Tipos cerrados (literales en union) garantizan que un typo en el nombre del evento es error de compilación.

### 5.2 Call sites de instrumentación

| Sitio | Evento | Justificación |
|---|---|---|
| `booking.service.ts:createOnlineBooking` (entry) | `booking.online.create.start` | Marca inicio de tx |
| `booking.service.ts:createOnlineBooking` (post-insert) | `booking.online.create.success` | Éxito antes de retorno |
| `booking.service.ts:createOnlineBooking` (catch exclusion) | `booking.online.create.slot_taken` | Carrera ganada por otro |
| `booking.service.ts:createManualBooking` (post-insert) | `booking.manual.create.success` | Admin path |
| `booking.concurrency.ts:transitionFromPendingPayment` (won=true, status=confirmed) | `booking.transition.confirmed` | Webhook gana race |
| `booking.concurrency.ts:transitionFromPendingPayment` (won=true, status=expired) | `booking.transition.expired` | Cron gana race |
| `booking.cancellation.ts` (entry player/admin) | `booking.cancel.by_player` / `by_admin` | Quién canceló |
| `payment.service.ts:createDepositPayment` | `payment.deposit.create` | Request a MP |
| `payment.service.ts:dispatchPaymentInfo` (approved) | `payment.deposit.approved` | Resolución MP |
| `payment.service.ts:dispatchPaymentInfo` (rejected) | `payment.deposit.rejected` | Resolución MP |
| `billing.service.ts:handleUpgradeApproved` | `payment.saas.upgrade.approved` | SaaS path |
| `webhooks/mercadopago/route.ts` (post-parse) | `mp.webhook.received` | Inbound |
| `payment.service.ts:lockMpEvent` (duplicate) | `mp.webhook.duplicate` | Idempotencia |
| `mp-webhook.handler.ts:handleMpWebhookJob` (post-dispatch) | `mp.webhook.processed` | Éxito |
| `process-mp-webhook.worker.ts` (catch) | `mp.webhook.failed` | Retry path |

Total: ~15 call sites; cada uno es 1 línea (`track.booking(...)`, `track.payment(...)`, `track.webhook(...)`).

### 5.3 `/api/status` real (con mitigación de permisos)

`src/app/api/status/route.ts`:

```ts
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Check = { name: string; status: 'ok' | 'degraded' | 'down'; latencyMs?: number; error?: string }

async function checkDb(): Promise<Check> {
  const t0 = Date.now()
  try {
    const sql = getSql()
    await sql`SELECT 1`
    return { name: 'database', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'database', status: 'down', error: (err as Error).message }
  }
}

/**
 * pg-boss readiness check.
 *
 * IMPORTANT — privilege mitigation:
 * The application role may not have SELECT on the `pgboss` schema (only the
 * service/job-runner role does in production). To avoid false negatives, we
 * try the cheapest connectivity probe first (`boss.start()` is idempotent and
 * just ensures the internal pool is alive). If `getQueueSize()` fails with
 * `permission denied for schema pgboss` or similar, we degrade to "ok" (the
 * pool is alive; only privilege is missing, which is by design).
 */
async function checkPgBoss(): Promise<Check> {
  const t0 = Date.now()
  try {
    const boss = await getBoss() // idempotent start
    try {
      await boss.getQueueSize('send-email')
    } catch (innerErr) {
      const msg = String((innerErr as Error).message ?? innerErr).toLowerCase()
      if (msg.includes('permission denied') || msg.includes('does not exist')) {
        // Pool alive, role lacks introspection privilege — that's OK.
        return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
      }
      throw innerErr
    }
    return { name: 'pg-boss', status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    return { name: 'pg-boss', status: 'down', error: (err as Error).message }
  }
}

function checkConfigured(): Check[] {
  const envs = {
    mercadopago: !!process.env.MP_CLIENT_ID && !!process.env.MP_CLIENT_SECRET,
    email: !!process.env.RESEND_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
  }
  return Object.entries(envs).map(([name, ok]) => ({
    name,
    status: ok ? 'ok' : 'down',
  }))
}

export async function GET() {
  const [db, pgboss] = await Promise.all([checkDb(), checkPgBoss()])
  const configured = checkConfigured()
  const checks = [db, pgboss, ...configured]
  const overall = checks.every((c) => c.status === 'ok')
    ? 'ok'
    : checks.some((c) => c.status === 'down')
    ? 'down'
    : 'degraded'
  const status = overall === 'ok' ? 200 : 503
  return Response.json({ status: overall, checks, timestamp: new Date().toISOString() }, { status })
}
```

Notas:
- `runtime = 'nodejs'`: pg-boss requiere Node, no edge.
- 503 si algo down → uptime monitor lo detecta.
- `tracesSampler` en `sentry.server.config.ts` ya excluye `/api/status` (sampleRate 0).
- **Mitigación de permisos pg-boss**: si la app no tiene SELECT en schema `pgboss` (válido en prod), `getQueueSize` lanza "permission denied" → degradamos a `ok` (pool vivo); solo reportamos `down` ante errores reales de conexión.

### 5.4 Tests M1

- `tests/unit/breadcrumbs.test.ts` — `vi.mock('@sentry/nextjs')`, asserts sobre `addBreadcrumb` calls (category, message, data shape).
- `tests/unit/api-status.test.ts` — mocks de `getSql` y `getBoss` para 4 escenarios: todo ok / DB down / pg-boss permission denied → ok / pg-boss connection error → down.

### 5.5 Commits M1

1. `feat(observability): add typed Sentry breadcrumb helper`
2. `feat(observability): instrument booking + payment + webhook events`
3. `feat(status): real DB and pg-boss health checks in /api/status`

## 6. M2 — E2E suite Playwright

### 6.1 Setup local (Windows PowerShell)

Pre-requisitos: Node 20+, pnpm 8.15, Supabase CLI, Docker Desktop corriendo.

```powershell
# 1. Instalar browsers (una vez por máquina)
pnpm exec playwright install --with-deps chromium

# 2. Levantar Supabase local
pnpm supabase:start
# Verifica: psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select 1"

# 3. Bootstrap DB de test (migrations + roles)
pnpm db:sync-supabase
node scripts/bootstrap-test-db.mjs

# 4. Seed determinístico E2E
pnpm tsx scripts/seed-e2e.ts

# 5. Dev server (Playwright lo reutiliza si ya está)
pnpm dev

# 6. Correr E2E
pnpm test:e2e
# UI interactiva:
pnpm exec playwright test --ui
# Solo un spec:
pnpm exec playwright test tests/e2e/landing.spec.ts
```

### 6.2 `playwright.config.ts` (modificaciones)

```ts
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: path.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: path.resolve('./tests/e2e/global-teardown.ts'),
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/status',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E: '1',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
})
```

Notas:
- `webServer.url` apunta a `/api/status` (M1) → Playwright espera 200 antes de correr.
- `UPSTASH_REDIS_REST_URL=''` → en fase-3 las políticas `publicAvailability` son fail-**open** ante Redis caído. Los tests E2E **no atraviesan login real** (usan storageState pre-cocinado, §6.4), así que `authVerify` (fail-closed) no afecta.
- `NEXT_PUBLIC_E2E=1`: feature flag que (a) habilita endpoints `/api/__e2e__/*` (M3), (b) opcionalmente activa modo dry-run de Resend en el seed.

### 6.3 Seed determinístico (`scripts/seed-e2e.ts`)

**Borrado explícito en orden inverso de FK** (idempotencia robusta, no depende de cascades):

```ts
// scripts/seed-e2e.ts
import { closeSql, getSql } from '@/shared/db/client'

const E2E = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  tenantSlug: 'e2e-complejo-demo',
  tenantName: 'E2E Complejo Demo',
  city: 'Buenos Aires',
  adminEmail: 'e2e-admin@turnogol.test',
  adminAuthUserId: '00000000-0000-4000-8000-000000000002',
  staffUserId: '00000000-0000-4000-8000-000000000003',
  courtId: '00000000-0000-4000-8000-000000000010',
  playerEmail: 'e2e-player@turnogol.test',
  playerId: '00000000-0000-4000-8000-000000000020',
  playerAuthUserId: '00000000-0000-4000-8000-000000000021',
}

/**
 * Explicit reverse-FK delete order. We do NOT rely on cascades because:
 *   1. Different envs may have ON DELETE NO ACTION on some FKs.
 *   2. Explicit ordering surfaces seed mistakes immediately (a stray child row
 *      causes a clear FK violation, not a silent partial cascade).
 *
 * Order: deepest dependents first, then parents.
 *
 * Children of tenant (and their grand-children):
 *   - audit_logs (refs booking, staff)
 *   - notifications (refs player/staff)
 *   - cash_flows (refs booking, registered_by)
 *   - daily_cash_closes (refs staff)
 *   - payments (refs booking, player)
 *   - bookings (refs court, player, abonado)
 *   - tenant_player_bans (refs player, staff)
 *   - abonados (refs court, player)
 *   - products
 *   - courts
 *   - player_tenant_relationships (refs player)
 *   - tenant_staff_members (refs staff_user)
 *   - tenant_subscriptions (refs plan)
 *   - tenants
 *
 * Players (global, only delete the E2E-owned one):
 *   - players  (after every tenant-scoped row that references it is gone)
 *
 * Staff (global):
 *   - staff_users  (after tenant_staff_members and audit_logs are gone)
 *
 * Auth (Supabase auth.users): deleted last via Supabase Admin API.
 */
async function cleanup(sql: ReturnType<typeof getSql>): Promise<void> {
  await sql`DELETE FROM audit_logs WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM notifications WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM cash_flows WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM payments WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM bookings WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM abonados WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM products WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM courts WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${E2E.tenantId}`
  await sql`DELETE FROM tenants WHERE id = ${E2E.tenantId}`
  // Players + staff are global; only delete the E2E-identified rows
  await sql`DELETE FROM players WHERE id = ${E2E.playerId} OR email = ${E2E.playerEmail}`
  await sql`DELETE FROM staff_users WHERE id = ${E2E.staffUserId} OR email = ${E2E.adminEmail}`
  // Supabase auth.users (separate schema) — clean via Admin API
  // (handled outside this SQL block, in seedAdminAuth/seedPlayerAuth)
}

async function seedTenant(sql: ReturnType<typeof getSql>): Promise<void> {
  // 1. tenant + tenant_subscription
  // 2. staff_user + tenant_staff_members
  // 3. court (status='online', pricing JSON con regla horaria simple)
  // 4. player (status='active', agreed_to_terms_at=now, terms_version='v1')
  // 5. player_tenant_relationship (balance=0)
}

async function main(): Promise<void> {
  const sql = getSql()
  try {
    await cleanup(sql)
    // Cleanup auth.users via Supabase Admin API (idempotent: ignore "not found")
    await cleanupAuthUsers([E2E.adminAuthUserId, E2E.playerAuthUserId])
    await seedTenant(sql)
    await seedAdminAuth() // creates auth.users + maps to staff_user
    await seedPlayerAuth() // creates auth.users + maps to player
    console.log('E2E seed OK')
  } finally {
    await closeSql()
  }
}

main().catch((e) => {
  console.error('E2E seed failed:', e)
  process.exit(1)
})
```

Reglas:
- UUIDs hardcoded (deterministic) → tests pueden referirlos sin lookup.
- **Borrado explícito en orden inverso de FK**: no confiamos en ON DELETE CASCADE; documentado en el comentario.
- Solo borra filas con identificadores E2E reservados — no toca data de dev.
- `auth.users` se limpia vía Supabase Admin API (separate schema, no SQL plano).

### 6.4 Fixtures auth (`tests/e2e/fixtures.ts`)

Generamos storageState una vez por sesión, sin enviar magic-link real:

```ts
import { test as base, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

type AuthedContext = BrowserContext & { __role: 'admin' | 'player' }

export const test = base.extend<{ adminContext: AuthedContext; playerContext: AuthedContext }>({
  adminContext: async ({ browser }, use) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: 'e2e-admin@turnogol.test',
    })
    const ctx = (await browser.newContext({
      storageState: await buildStorageState(data.properties!.action_link),
    })) as AuthedContext
    ctx.__role = 'admin'
    await use(ctx)
    await ctx.close()
  },
  playerContext: async ({ browser }, use) => {
    // idem con email player
  },
})

export { expect } from '@playwright/test'
```

`buildStorageState` navega 1 vez a `/api/auth/callback?token_hash=...&type=magiclink&next=/dashboard`, captura cookies, retorna `StorageState`. Sucede en `global-setup` (1 vez por suite).

### 6.5 Specs E2E (4 archivos, 12-15 tests totales)

**`landing.spec.ts`** (no auth):
- `GET /` → hero + CTA "Explorar complejos" visibles.
- Click CTA → navega a `/explorar`.
- `nav` + `footer` con links esperados.
- Smoke: no errores no-warning en `page.on('console')`.

**`portal-search.spec.ts`** (no auth):
- `/explorar` → ve al menos el tenant E2E demo.
- Filtra ciudad "Buenos Aires" → resultado contiene el tenant demo.
- Buscar texto "demo" → resultado contiene el tenant demo.
- Click card → navega a `/e2e-complejo-demo`.

**`availability.spec.ts`** (no auth):
- `/e2e-complejo-demo` → nombre + ciudad + grilla de hoy.
- Click "Ver semana completa" → navega a `/e2e-complejo-demo/disponibilidad`.
- Cambiar fecha → grilla actualiza.
- Slot libre futuro tiene `<a href="/e2e-complejo-demo/reservar?...">`.

**`admin-login.spec.ts`** (usa `adminContext`):
- Con storageState admin → `GET /dashboard` → 200 + nombre del complejo visible.
- Sin storageState → `GET /dashboard` → redirige a `/login`.
- Login form happy path: ingresar email seeded → ver mensaje "Revisá tu mail".

### 6.6 Scripts en `package.json`

```json
"test:e2e:ci": "playwright test --reporter=github,html",
"e2e:seed": "tsx scripts/seed-e2e.ts"
```

E2E **no** corre en `pnpm test` ni `pnpm test:integration` (suite separada, lenta, requiere supabase + dev server). Se invoca explícitamente desde `launch-check.ts`.

### 6.7 Commits M2

1. `chore(playwright): config global-setup + webServer healthcheck`
2. `feat(scripts): deterministic E2E seed with reverse-FK cleanup`
3. `test(e2e): auth fixtures via Supabase admin session`
4. `test(e2e): landing + portal-search specs`
5. `test(e2e): availability + admin-login specs`

## 7. M3 — Stress test + Launch script + LAUNCH.md

### 7.1 Endpoint guard `/api/__e2e__/create-booking`

Solo activo en modo E2E. Triple guard:

```ts
// src/app/api/__e2e__/create-booking/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createOnlineBooking } from '@/modules/bookings/booking.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE2E(): boolean {
  return process.env.NEXT_PUBLIC_E2E === '1' && process.env.NODE_ENV !== 'production'
}

export async function POST(req: NextRequest) {
  if (!isE2E()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const playerId = req.headers.get('x-e2e-player-id') ?? ''
  const body = await req.json()
  // Body: { courtId, date, start, end }
  try {
    const booking = await createOnlineBooking({ ...body, playerId })
    return NextResponse.json({ bookingId: booking.id }, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message
    if (/SlotTaken|exclusion/i.test(msg)) {
      return NextResponse.json({ error: 'SLOT_TAKEN' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

Guards:
1. `NEXT_PUBLIC_E2E === '1'` (env flag explícito).
2. `NODE_ENV !== 'production'` (segunda capa).
3. Path bajo `/api/__e2e__/*` está fuera del matcher del middleware público y no se referencia desde ningún componente cliente.

Si alguno falla → 404 (no 403; no filtramos existencia).

### 7.2 `scripts/stress-test.ts`

```ts
import { closeSql, getSql } from '@/shared/db/client'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const SLOT_COUNT = 50

type Result = { ok: boolean; status: number; bookingId?: string; error?: string }

async function attemptBooking(playerId: string, slot: { courtId: string; date: string; start: string; end: string }): Promise<Result> {
  const res = await fetch(`${BASE}/api/__e2e__/create-booking`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-e2e-player-id': playerId },
    body: JSON.stringify(slot),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, bookingId: body.bookingId, error: body.error }
}

async function createStressPlayers(n: number): Promise<string[]> {
  const sql = getSql()
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const email = `e2e_stress_${i}_${Date.now()}@turnogol.test`
    const rows = await sql<{ id: string }[]>`
      INSERT INTO players (email, first_name, last_name, status, agreed_to_terms_at, terms_version)
      VALUES (${email}, 'Stress', ${'P' + i}, 'active', NOW(), 'v1')
      RETURNING id
    `
    ids.push(rows[0]!.id)
  }
  return ids
}

async function cleanupStress(playerIds: string[], winningBookingId?: string): Promise<void> {
  const sql = getSql()
  if (winningBookingId) {
    await sql`DELETE FROM cash_flows WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM payments WHERE booking_id = ${winningBookingId}`
    await sql`DELETE FROM bookings WHERE id = ${winningBookingId}`
  }
  if (playerIds.length > 0) {
    await sql`DELETE FROM player_tenant_relationships WHERE player_id = ANY(${playerIds})`
    await sql`DELETE FROM players WHERE id = ANY(${playerIds})`
  }
}

function tomorrowIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const slot = {
    courtId: '00000000-0000-4000-8000-000000000010',
    date: tomorrowIso(),
    start: '10:00',
    end: '11:00',
  }

  const playerIds = await createStressPlayers(SLOT_COUNT)
  let winningBookingId: string | undefined

  try {
    // Barrier: align all 50 requests
    const barrier = new Promise<void>((resolve) => setTimeout(resolve, 50))
    const promises = playerIds.map(async (pid) => {
      await barrier
      return attemptBooking(pid, slot)
    })
    const results = await Promise.all(promises)

    const accepted = results.filter((r) => r.ok && r.bookingId)
    const rejected = results.filter((r) => !r.ok || !r.bookingId)
    winningBookingId = accepted[0]?.bookingId

    console.log(`Accepted: ${accepted.length}`)
    console.log(`Rejected: ${rejected.length}`)
    const reasons = new Map<string, number>()
    for (const r of rejected) {
      const k = `${r.status}:${r.error ?? 'unknown'}`
      reasons.set(k, (reasons.get(k) ?? 0) + 1)
    }
    for (const [k, v] of reasons) console.log(`  ${k}: ${v}`)

    if (accepted.length !== 1) {
      console.error(`FAIL: expected exactly 1 accepted, got ${accepted.length}`)
      process.exit(1)
    }
    console.log('OK: invariant held (exactly 1 accepted)')
  } finally {
    await cleanupStress(playerIds, winningBookingId)
    await closeSql()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Reglas:
- **Invariante**: `accepted.length === 1`. Resto debe ser 409 `SLOT_TAKEN`.
- **Cleanup en `finally`**: garantiza limpieza incluso si falla.
- **Player IDs distintos**: `playerBooking` rate-limit (20/min per player) no bloquea.
- Endpoint `__e2e__` no atraviesa el matcher de rate-limit público.

`package.json`:
```json
"stress:bookings": "tsx scripts/stress-test.ts"
```

### 7.3 `scripts/launch-check.ts`

```ts
import { execSync } from 'node:child_process'

type Step = { name: string; cmd?: () => void; check?: () => Promise<boolean>; fatal: boolean }

const REQUIRED_ENV = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'PIN_COOKIE_SECRET',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_APP_URL',
]

const steps: Step[] = [
  { name: 'env vars present', check: async () => REQUIRED_ENV.every((k) => !!process.env[k]), fatal: true },
  { name: 'typecheck',         cmd: () => execSync('pnpm typecheck', { stdio: 'inherit' }), fatal: true },
  { name: 'lint',              cmd: () => execSync('pnpm lint', { stdio: 'inherit' }), fatal: true },
  { name: 'unit tests',        cmd: () => execSync('pnpm test', { stdio: 'inherit' }), fatal: true },
  { name: 'integration tests', cmd: () => execSync('pnpm test:integration', { stdio: 'inherit' }), fatal: true },
  { name: 'isolation tests',   cmd: () => execSync('pnpm test:isolation', { stdio: 'inherit' }), fatal: true },
  { name: 'build',             cmd: () => execSync('pnpm build', { stdio: 'inherit' }), fatal: true },
  { name: 'e2e',               cmd: () => execSync('pnpm test:e2e:ci', { stdio: 'inherit' }), fatal: true },
  { name: 'stress (1 accepted invariant)', cmd: () => execSync('pnpm stress:bookings', { stdio: 'inherit' }), fatal: true },
  { name: '/api/status healthy', check: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/status`)
      return res.status === 200
    }, fatal: false },
]

async function main(): Promise<void> {
  const failed: string[] = []
  for (const step of steps) {
    const t0 = Date.now()
    process.stdout.write(`▶ ${step.name}... `)
    try {
      if (step.cmd) step.cmd()
      else if (step.check) {
        const ok = await step.check()
        if (!ok) throw new Error('check returned false')
      }
      console.log(`OK (${Date.now() - t0}ms)`)
    } catch (e) {
      console.log('FAIL')
      console.error(`  ${(e as Error).message}`)
      failed.push(step.name)
      if (step.fatal) break
    }
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll launch checks passed.')
}

main()
```

`package.json`:
```json
"launch:check": "tsx scripts/launch-check.ts"
```

### 7.4 `docs/LAUNCH.md`

```markdown
# TurnoGol — Launch Checklist (manual ops)

Ítems no automatizables. El operador debe verificar en consola la condición antes de tildar.
`pnpm launch:check` cubre lo automatizable.

## Infraestructura
- [ ] Dominio comprado y DNS apuntando a Vercel
- [ ] Certificado HTTPS válido (verificar en navegador)
- [ ] Supabase project en plan Pro (no free, sin auto-pausa)
- [ ] Backups Supabase configurados (daily, retención ≥7 días)
- [ ] Vercel project: branch production = main, preview = PR
- [ ] Env vars cargadas en Vercel (production + preview)
- [ ] Upstash Redis project creado, URL+TOKEN en Vercel

## MercadoPago
- [ ] App MP en "Producción" (no sandbox)
- [ ] Webhook URL: https://<dominio>/api/webhooks/mercadopago
- [ ] Webhook secret rotado y cargado en MP_WEBHOOK_SECRET
- [ ] OAuth redirect_uri whitelisted: https://<dominio>/api/mp/callback
- [ ] Test OAuth completo con 1 tenant piloto (link + delink)

## Email (Resend)
- [ ] Dominio verificado (SPF + DKIM + DMARC)
- [ ] From address activa: noreply@<dominio>
- [ ] Test end-to-end (magic link recibido en gmail + outlook)

## Sentry
- [ ] Project creado, DSN cargado (client + server)
- [ ] Alerts:
  - error rate > 5/min sobre 5 min
  - p95 latency /api/* > 2s sobre 10 min
- [ ] Release tracking activo (VERCEL_GIT_COMMIT_SHA)
- [ ] Source maps subidos en build de producción

## Privacy / Legal (Ley 25.326)
- [ ] Términos +18 publicados en /legal/terminos
- [ ] Política de privacidad en /legal/privacidad
- [ ] Process documentado para ARCO requests
- [ ] Email legal@<dominio> configurado

## Observabilidad
- [ ] /api/status responde 200 desde dominio público
- [ ] Uptime monitor externo configurado → /api/status
- [ ] VAPID keys (Web Push) generadas y cargadas

## Rate limit
- [ ] Upstash env vars en Vercel production
- [ ] Sanity check: 31º request a /api/public/availability misma IP → 429

## Smoke test post-deploy
- [ ] `/` carga sin errores
- [ ] `/explorar` muestra al menos 1 tenant
- [ ] Login admin → /dashboard sin errores
- [ ] Crear booking manual desde grilla admin → OK
- [ ] Crear booking online como player → redirige a MP (o confirma si deposit_mode=off)
- [ ] Webhook MP llega y procesa (1 booking confirmado, 1 cash_flow, 1 payment)
- [ ] Cancelación player → estado canceled_*, cashflow ajustado

## Rollback plan
- [ ] Commit SHA de versión anterior anotado
- [ ] `vercel rollback <deployment-id>` documentado
- [ ] Última migración aplicada documentada
```

### 7.5 Commits M3

1. `feat(api): guarded __e2e__ endpoint for stress test only`
2. `feat(scripts): stress test for concurrent booking creation`
3. `feat(scripts): launch-check automation gate`
4. `docs: LAUNCH.md manual ops checklist`

## 8. Estrategia de testing

| Capa | Herramienta | Suite |
|---|---|---|
| Unit | Vitest | `breadcrumbs.test.ts` (mock Sentry), `api-status.test.ts` (mock DB/pg-boss, 4 escenarios) |
| Integración | Vitest + Supabase | sin nuevos (M1 no agrega lógica de DB; M2/M3 son ejecutables, no servicio) |
| E2E | Playwright | landing, portal-search, availability, admin-login (~12-15 tests) |
| Stress | tsx | 1 invariante HTTP: 50 concurrentes → exactamente 1 confirmada |
| Gate | tsx | launch-check ejecuta todas las suites + env + /api/status |

**Reglas:**
- Tests E2E **no son BLOCKING** en `pnpm test` (suite separada, lenta).
- `launch-check` **sí es BLOCKING** en pipeline de release.
- Stress invariante (exactamente 1) es BLOCKING dentro de `launch-check`.

**Lo que NO se testea (out of scope):**
- Performance/carga sostenida (k6, Artillery).
- Visual regression (Percy, Chromatic).
- Cross-browser (solo Chromium en v1).
- Webhook storm HTTP (cubierto por fase-3 a nivel servicio).

## 9. Riesgos globales y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Fase-3 no mergeado al momento de fase-4 | Media | Alto | Spec asume fase-3; si no está, M2/M3 fallan visiblemente. Documentado en preamble. |
| E2E flaky por estado compartido | Media | Medio | Seed determinístico, no escribir DB en specs, `fullyParallel: true` solo para lecturas. |
| Stress test deja basura en DB | Baja | Bajo | Cleanup en `finally`. Players con prefijo `e2e_stress_` identificables. |
| `/api/__e2e__/*` filtrado a prod | Muy baja | Crítico | Triple guard (env + NODE_ENV + path naming), 1 test verifica 404 con `NODE_ENV=production`. |
| Sentry breadcrumbs filtran PII | Baja | Alto | Helper típado restringe `ctx` a IDs. Revisión humana en PR. |
| pg-boss healthcheck cae por privilegio | Media | Bajo | Mitigación explícita (§5.3): degradamos a `ok` si error es "permission denied" — el pool está vivo, solo falta SELECT en schema pgboss. |
| Seed E2E falla por FK cascade silente | Baja | Medio | **Mitigación**: borrado explícito en orden inverso de FK (§6.3), no se confía en ON DELETE CASCADE. |
| Launch-check >10min en CI | Media | Bajo | Ejecutar en pipeline dedicado de release, no en cada PR. PR-CI corre subset (typecheck+lint+test). |
| Magic-link en E2E requiere Resend prod | Baja | Medio | Usamos `auth.admin.generateLink` directo, sin Resend. |

## 10. Entregables consolidados

**Código:**
- `src/shared/observability/{breadcrumbs,index}.ts` + tests
- `src/app/api/status/route.ts` (rewrite con mitigación de privilegios)
- `src/app/api/__e2e__/create-booking/route.ts` (guarded triple)
- Instrumentación en 6 archivos de servicios
- `tests/e2e/{global-setup,global-teardown,fixtures,landing,portal-search,availability,admin-login}.{ts,spec.ts}`
- `tests/unit/{breadcrumbs,api-status}.test.ts`
- `scripts/{seed-e2e,stress-test,launch-check}.ts`
- `playwright.config.ts` (modified)
- `package.json` (3 scripts añadidos: `test:e2e:ci`, `e2e:seed`, `stress:bookings`, `launch:check`)

**Docs:**
- `docs/superpowers/specs/2026-05-22-fase-4-testing-launch-design.md` (este spec)
- `docs/superpowers/plans/fase-4-testing-launch.md` (siguiente paso, writing-plans)
- `docs/LAUNCH.md` (operativo)
