# Fase B11 — Operativo / Backups / Runbook (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Cuando rompa, sabés QUÉ HACER. Recuperás de incidentes. Cerrar done-criteria MASTER_PLAN B11 (backup restore evidence, runbook 5+, staging, CI gate) + arrastres P1/P2 documentados en STATE.md (BYPASSRLS validation, refresh-mp-tokens FOR UPDATE, magic link runbook, JWT rotation, ENCRYPTION_KEY rotation, /privacy /terms, NEXT_PUBLIC_E2E stress, launch-check env vars).

**Architecture:** CI fix migrations divergidas (P0 descubierto en investigator) + advisory lock por tenant en refresh-mp-tokens + páginas legales server-side rendered desde docs/doc18/terms + launch-check probes reales (BYPASSRLS, ENCRYPTION_KEY ≠ example) + runbook expansion en doc19 + staging decision documentada (Vercel preview-as-staging para v1). Worktree `audit/backend-b11`.

**Tech Stack:** Vitest, Drizzle, postgres.js, pg_advisory_xact_lock, Next.js App Router, GitHub Actions, Supabase CLI.

---

## Hallazgo P0 (descubierto por investigator)

**CI aplica migrations divergidas vs entorno local/prod.**

- `src/shared/db/migrations/` (usado por `.github/workflows/ci.yml:118-121,192-195`): 001-008 + 009_relax_payment_consistency
- `supabase/migrations/` (autoritativa para Supabase CLI local + prod): 001-008 + 009_billing_columns + B10 (sending enum + system_admins audit)

CI **no aplica** B4 billing_columns ni B10 sending enum ni B10 system_admins audit trigger. Tests integration que dependen de ellos pasarían local pero fallarían en CI. Sin embargo, los workflows GitHub Actions de B10 pueden no haber corrido o no haberse mirado.

**Decisión Task 1:** unificar la fuente de verdad de migrations. Opciones:
- (A) Portar supabase migrations 009/2026* a `src/shared/db/migrations/` (con orden numérico 009→010→011). CI mantiene `src/shared/db/migrations/`. Pro: ningún cambio en CI workflow.
- (B) CI aplica `supabase/migrations/*.sql` en orden. Borrar `src/shared/db/migrations/`. Pro: una sola fuente. Contra: cambio invasivo en CI.

**Recomendación: (A).** Aditivo, reversible, mínimo blast radius. `src/shared/db/migrations/` queda como autoridad para CI; `supabase/migrations/` se sincroniza tras cada cambio (responsabilidad del autor). Documentar la convención en doc19.

---

## File Structure

**Crear:**
- `src/shared/db/migrations/009_billing_columns.sql` — copia idempotente del supabase 009 (renumerar 010 si el actual 009 se conserva — ver Task 1)
- `src/shared/db/migrations/010_notification_sending_enum.sql` — port B10
- `src/shared/db/migrations/011_system_admins_audit.sql` — port B10
- `src/shared/db/migrations/012_refresh_mp_tokens_advisory_lock.sql` — sólo si Task 3 necesita schema (no — pg_advisory_xact_lock no requiere DDL)
- `src/app/(public)/privacy/page.tsx` — Política de Privacidad (renderiza doc18 condensado + datos contacto AAIP)
- `src/app/(public)/terms/page.tsx` — Términos y Condiciones (responsabilidad del complejo, declaración +18, MP intermediario)
- `src/components/site/legal-footer.tsx` — links footer a /privacy /terms (reutilizable)
- `tests/integration/refresh-mp-tokens-advisory-lock.test.ts` — race entre N=5 workers, sólo 1 hace fetch a MP por tenant
- `tests/unit/launch-check-bypassrls.test.ts` — guard que detecta `rolbypassrls = true`
- `docs/audit/reports/fase-b11-operativo-report.md`
- `docs/audit/reports/fase-b11-raw/`
- `docs/LAUNCH.md` — checklist pre-launch ejecutable (referenced por doc19)
- `docs/MIGRATIONS.md` — convención dos trees (autoridad CI, sync supabase)

**Modificar:**
- `scripts/launch-check.ts`:
  - Step adicional `bypassrls` (queries `pg_roles` con current_user)
  - Step adicional `encryption-key-strength` (no es valor del .env.example ni longitud < 32 chars)
  - Step adicional `mp-credentials-probe` (POST a MP oauth, valida client_id+secret → 200/400 distingue válido)
- `docs/doc19_runbook.md`:
  - §3.10 Magic Link debugging (TTL 10min, single-use, troubleshoot recipiente vs token consumido)
  - §3.11 JWT rotation (Supabase-managed, no acción TurnoGol, link a Supabase Dashboard)
  - §3.12 ENCRYPTION_KEY rotation (v1: single-key con rotación quarterly + monitoring; v1.5: key versioning)
  - §4.X Stress test ritual (`NEXT_PUBLIC_E2E=1 pnpm dev` + `pnpm stress:bookings` en otra terminal; expectativa Accepted=1)
  - §10.6 Backup restore drill (test trimestral en branch staging)
- `src/shared/jobs/workers/refresh-mp-tokens.worker.ts` — wrap cada `refreshTenantMpToken(row.id)` en transacción con `pg_advisory_xact_lock(hashtext(tenant_id))`
- `src/app/(public)/layout.tsx` o root layout — agregar `<LegalFooter />` (verificar layout actual primero)
- `.github/workflows/ci.yml` — opcional: agregar job `stress-test` (manual_dispatch o tag release-*) — **deferido si tiempo escaso** (B11 mismo lo flagea como nice-to-have)

**No tocar:**
- `supabase/migrations/*` (queda como mirror para local Supabase CLI)
- Backup procedures físicas (Supabase Dashboard manual)

---

## Task 1: Unificar migration trees (P0 CI fix)

**Goal:** CI aplica exactamente las migrations que prod debería tener.

- [ ] **Step 1**: Comparar `src/shared/db/migrations/009_relax_payment_consistency.sql` vs supabase. Decidir:
  - Si `relax_payment_consistency` no está en supabase → portar a supabase también (es contenido de B4? B5?)
  - Renumerar para mantener orden consistente: keep `009_relax_payment_consistency` y agregar `010_billing_columns`, `011_notification_sending_enum`, `012_system_admins_audit`. Confirmar fechas/origen.

- [ ] **Step 2**: Crear `src/shared/db/migrations/010_billing_columns.sql` ← copia idempotente de `supabase/migrations/20260424000009_billing_columns.sql`. Validar `IF NOT EXISTS` para columnas/enums. Si idempotencia requiere edits, ajustar.

- [ ] **Step 3**: `src/shared/db/migrations/011_notification_sending_enum.sql`:
```sql
-- Port from supabase/migrations/20260525000001_notification_sending_enum.sql
-- Aditivo: ADD VALUE IF NOT EXISTS
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'sending' AFTER 'queued';
COMMENT ON TYPE notification_status IS
  'Lifecycle: queued → sending → sent | delivered | failed. `sending` claim prevents double-dispatch under sweep races (B5/B10).';
```

- [ ] **Step 4**: `src/shared/db/migrations/012_system_admins_audit.sql` ← copia del supabase 20260525000002. Validar que se aplica idempotente (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS … CREATE TRIGGER`).

- [ ] **Step 5**: Documentar convención en `docs/MIGRATIONS.md`:
  - `src/shared/db/migrations/` = autoritativa para CI (orden numérico simple 001, 002, …)
  - `supabase/migrations/` = mirror sincronizada (formato YYYYMMDDHHMMSS_name.sql para CLI)
  - Tras cambio: actualizar ambos, mismo contenido SQL, distinto nombre
  - Razón: CI no usa Supabase CLI (cost + dependencias); local sí

- [ ] **Step 6**: Verificar test:integration local pasa con ambos sets aplicados (sin double-create errors): correr `pnpm test:integration tests/integration/notification-sending-enum.test.ts tests/integration/system-admins-audit-trigger.test.ts`.

- [ ] **Step 7**: Push branch + verificar CI workflow corre verde (incluido tests integration B10).

**Done:** CI pasa tests B10 sin skip. Convención documentada.

---

## Task 2: refresh-mp-tokens advisory lock

**Goal:** Imposibilitar last-writer-wins race entre 2+ workers refrescando mismo tenant. Si 2 jobs corren concurrentes para tenant X, sólo uno hace fetch a MP; el otro espera y skip (token ya rotado).

- [ ] **Step 1**: Modificar `src/shared/jobs/workers/refresh-mp-tokens.worker.ts`:
```typescript
import { getSql, getDb } from '@/shared/db/client'

export async function runRefreshMpTokens(): Promise<void> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM tenants
    WHERE mp_refresh_token IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'suspended')
  `

  let refreshed = 0, skippedLocked = 0
  for (const row of rows) {
    try {
      const acquired = await sql<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('mp_refresh:' || ${row.id}::text)) AS locked
      `
      // pg_try_advisory_xact_lock devuelve true/false. Si false, otro worker ya
      // tiene el lock → skip. Lock se libera al cerrar la transacción implícita.
      // postgres.js wraps each call in implicit tx, so we explicitly use a tx:
      const db = getDb()
      const didRefresh = await db.transaction(async (tx) => {
        const lockRows = await tx.execute(
          `SELECT pg_try_advisory_xact_lock(hashtext('mp_refresh:' || $1)) AS locked` as any,
          [row.id] as any,
        ) as unknown as { locked: boolean }[]
        if (!lockRows[0]?.locked) return false
        await refreshTenantMpToken(row.id)
        return true
      })
      if (didRefresh) refreshed += 1
      else skippedLocked += 1
    } catch (err) {
      logger.error('tenant token refresh failed', { module: 'refresh-mp-tokens', tenantId: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (rows.length > 0) {
    logger.info('refreshed mp tokens', { module: 'refresh-mp-tokens', refreshed, skipped_locked: skippedLocked, total: rows.length })
  }
}
```

**Nota crítica:** `refreshTenantMpToken` ya usa `getDb()` (Drizzle, no `getSql()`). El advisory lock vive en la misma conexión que el `refreshTenantMpToken`. Si éste abre su propia conexión vía Drizzle, el lock NO le aplica.

Mejor diseño: mover `refreshTenantMpToken` dentro del `tx` (ejecutar select+update bajo la misma transacción que tiene el lock). Requiere modificar `refreshTenantMpToken` para aceptar `tx?: DbTx` opcional, o duplicar query/update bajo `tx`.

**Implementación correcta:**
```typescript
import { eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { decrypt, encrypt } from '@/lib/crypto/encrypt'
import { refreshMpAccessToken } from '@/modules/payments/mp-oauth'
import { TenantMpNotConnectedError } from '@/modules/payments/payment.errors'

export async function runRefreshMpTokens(): Promise<void> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM tenants
    WHERE mp_refresh_token IS NOT NULL
      AND status IN ('active', 'trialing', 'past_due', 'suspended')
  `
  const db = getDb()
  let refreshed = 0, skipped = 0
  for (const row of rows) {
    try {
      const result = await db.transaction(async (tx) => {
        const lockRows = await tx.execute(drizzleSql`
          SELECT pg_try_advisory_xact_lock(hashtext(${'mp_refresh:' + row.id})) AS locked
        `) as unknown as Array<{ locked: boolean }>
        if (!lockRows[0]?.locked) return 'skipped'
        // We hold the lock for this tenant; do the full refresh inside the tx.
        const tenantRows = await tx
          .select({ mpRefreshToken: tenants.mpRefreshToken })
          .from(tenants)
          .where(eq(tenants.id, row.id))
          .limit(1)
        const encryptedRefresh = tenantRows[0]?.mpRefreshToken
        if (!encryptedRefresh) throw new TenantMpNotConnectedError(row.id)
        const fresh = await refreshMpAccessToken(encryptedRefresh)
        await tx.update(tenants).set({
          mpAccessToken: encrypt(fresh.accessToken),
          mpRefreshToken: encrypt(fresh.refreshToken),
          ...(fresh.userId ? { mpUserId: fresh.userId } : {}),
          ...(fresh.publicKey ? { mpPublicKey: fresh.publicKey } : {}),
          mpConnectedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(tenants.id, row.id))
        return 'refreshed'
      })
      if (result === 'refreshed') refreshed += 1
      else skipped += 1
    } catch (err) {
      logger.error('tenant token refresh failed', { module: 'refresh-mp-tokens', tenantId: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (rows.length > 0) {
    logger.info('refreshed mp tokens', { module: 'refresh-mp-tokens', refreshed, skipped_locked: skipped, total: rows.length })
  }
}
```

- [ ] **Step 2**: Verificar `refreshTenantMpToken` ya en `mp-oauth.ts` — puede co-existir sin cambios (sigue usable por gateway 401 retry). Cambia sólo `runRefreshMpTokens`.

- [ ] **Step 3**: Tests integration:
  * `tests/integration/refresh-mp-tokens-advisory-lock.test.ts`:
    - 5 workers concurrentes sobre 1 tenant → 1 hace fetch (mock MP), 4 reportan `skipped_locked`
    - Lock se libera tras tx: 2do batch refresca normalmente
    - Tenant con `mp_refresh_token IS NULL` no entra al loop (sweep filter)

- [ ] **Step 4**: Actualizar `tests/integration/refresh-mp-tokens-concurrency.test.ts` existente (B5 lo testea como last-writer-wins — debe ahora pasar como single-winner).

**Done:** Race test 50 iters: 1 fetch real por tenant. STATE.md P1 cerrado.

---

## Task 3: launch-check enhancements (BYPASSRLS + ENCRYPTION_KEY + MP probe)

**Goal:** `pnpm launch-check` falla si el role de prod tiene BYPASSRLS, si ENCRYPTION_KEY es el del `.env.example`, o si credenciales MP son inválidas.

- [ ] **Step 1**: Modificar `scripts/launch-check.ts`. Agregar funciones:
```typescript
async function bypassRlsCheck(): Promise<boolean> {
  const url = process.env.DATABASE_URL
  if (!url) return false
  const postgres = (await import('postgres')).default
  const sql = postgres(url, { max: 1 })
  try {
    const rows = await sql<{ bypass: boolean; rolname: string }[]>`
      SELECT rolname, rolbypassrls AS bypass
      FROM pg_roles WHERE rolname = current_user
    `
    if (rows[0]?.bypass) {
      console.error(`current_user '${rows[0].rolname}' has BYPASSRLS=true — RLS would be ignored in production`)
      return false
    }
    return true
  } finally {
    await sql.end()
  }
}

function encryptionKeyStrengthCheck(): boolean {
  const key = process.env.ENCRYPTION_KEY ?? ''
  if (key.length < 64) {
    console.error(`ENCRYPTION_KEY must be >= 64 hex chars (got ${key.length})`)
    return false
  }
  // Reject the well-known example placeholder
  const EXAMPLE = '0000000000000000000000000000000000000000000000000000000000000000'
  if (key === EXAMPLE) {
    console.error('ENCRYPTION_KEY equals the .env.example placeholder')
    return false
  }
  if (!/^[0-9a-f]+$/i.test(key)) {
    console.error('ENCRYPTION_KEY must be hex-only')
    return false
  }
  return true
}

async function mpCredentialsProbe(): Promise<boolean> {
  const id = process.env.MP_CLIENT_ID
  const secret = process.env.MP_CLIENT_SECRET
  if (!id || !secret) return false
  // Probe: POST oauth with a deliberately-invalid grant. MP returns:
  //   - 400 if client_id+secret authenticated (and grant rejected) → valid credentials
  //   - 401 if client_id+secret invalid → bad credentials
  // We accept 400 as "credentials OK"; 401/403 as bad; anything else flagged.
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: 'probe-invalid' }),
    })
    if (res.status === 400) return true
    console.error(`MP oauth probe returned HTTP ${res.status} (expected 400 for valid creds)`)
    return false
  } catch (e) {
    console.error(`MP oauth probe failed: ${(e as Error).message}`)
    return false
  }
}
```

- [ ] **Step 2**: Agregar al `steps[]`:
```typescript
{ name: 'bypassrls role check',    check: bypassRlsCheck,           fatal: true  },
{ name: 'encryption-key strength', check: async () => encryptionKeyStrengthCheck(), fatal: true },
{ name: 'mp credentials probe',    check: mpCredentialsProbe,       fatal: false }, // non-fatal: MP can be slow / unreachable in some envs
```

- [ ] **Step 3**: Tests unit:
  * `tests/unit/launch-check-bypassrls.test.ts` — extraer `encryptionKeyStrengthCheck` a pure helper exportado de un módulo testeable (e.g., `scripts/launch-check.helpers.ts`), verificar casos: empty, length<64, example, non-hex, OK.
  * `bypassRlsCheck` queda untested unit-wise (requiere DB real); validar manual en local.

- [ ] **Step 4**: Documentar en `docs/LAUNCH.md`:
```markdown
### Pre-launch checks

Correr en entorno con env vars de **production**:
1. `pnpm launch-check` — falla si:
   - role current_user tiene BYPASSRLS (RLS sería ignorada)
   - ENCRYPTION_KEY es placeholder o < 64 hex chars
   - credenciales MP inválidas (probe 400 esperado, 401 indica bad creds)
   - typecheck/lint/tests/build/e2e/stress fail
```

**Done:** `pnpm launch-check` detecta los 3 escenarios. Test unit verde.

---

## Task 4: Páginas legales /privacy /terms

**Goal:** Cumplir pre-launch Ley 25.326 + responsabilidades del complejo + declaración +18.

- [ ] **Step 1**: `src/app/(public)/privacy/page.tsx`:
```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidad — TurnoGol',
  description: 'Cómo TurnoGol recolecta, usa y protege tus datos personales (Ley 25.326).',
}

export default function PrivacyPage() {
  return (
    <main className="prose mx-auto max-w-3xl px-4 py-12">
      <h1>Política de Privacidad</h1>
      <p>Última actualización: 25/05/2026.</p>
      {/* Render content from docs/doc18 condensado + datos AAIP + responsable, encargado, finalidad, transferencias, derechos ARCO, contacto. */}
      …
    </main>
  )
}
```
Contenido: condensado de `docs/doc18_privacy_compliance.md` — roles, finalidades, sub-procesadores (Supabase, Resend, MercadoPago, Sentry, Vercel, Upstash), derechos ARCO + endpoint `/api/player/data-export`, contacto privacidad@turnogol.app (placeholder).

- [ ] **Step 2**: `src/app/(public)/terms/page.tsx`:
```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — TurnoGol',
  description: 'Términos de uso de la plataforma TurnoGol.',
}

export default function TermsPage() {
  return (
    <main className="prose mx-auto max-w-3xl px-4 py-12">
      <h1>Términos y Condiciones</h1>
      {/* Secciones: 1. Objeto plataforma (intermediario reserva-complejo), 2. Responsabilidad complejo (cancha + factura AFIP), 3. Declaración +18 jugador (ADR-012), 4. Pagos MP (TurnoGol no procesa dinero), 5. Cancelaciones (políticas del complejo), 6. Sub planes SaaS, 7. Suspensión cuenta, 8. Ley aplicable Argentina, 9. Jurisdicción CABA. */}
      …
    </main>
  )
}
```

- [ ] **Step 3**: `src/components/site/legal-footer.tsx`:
```typescript
import Link from 'next/link'

export function LegalFooter() {
  return (
    <footer className="mt-16 border-t py-6 text-center text-sm text-muted-foreground">
      <nav className="flex justify-center gap-4">
        <Link href="/privacy" className="hover:underline">Política de Privacidad</Link>
        <span>·</span>
        <Link href="/terms" className="hover:underline">Términos y Condiciones</Link>
      </nav>
      <p className="mt-2 text-xs">© {new Date().getFullYear()} TurnoGol</p>
    </footer>
  )
}
```

- [ ] **Step 4**: Integrar `<LegalFooter />` en `src/app/(public)/layout.tsx`. Verificar layout actual primero — no romper estructura existente.

- [ ] **Step 5**: Tests unit:
  * `tests/unit/legal-pages.test.ts` — render /privacy y /terms via vitest + react testing library (si helper existe), o smoke check vía import del component, asegurar metadata.title exporta.

**Done:** `/privacy` y `/terms` renderizan en local + reachable via footer.

---

## Task 5: Runbook expansion doc19

**Goal:** Cerrar gaps documentales arrastrados (magic link, JWT, ENCRYPTION_KEY, stress test, backup drill).

- [ ] **Step 1**: Leer `docs/doc19_runbook.md` estructura actual. Agregar:

  - **§3.10 Magic Link Debugging** (entre 3.9 Data Leak y §4):
    - "¿Token no llega?" → checks Resend logs, Spam folder, retry send.
    - "¿Token llega pero expirado?" → 10min TTL Supabase-managed, no extendible; usuario re-requests.
    - "¿Token ya consumido?" → Supabase single-use, error 400; re-request.
    - Procedure: Supabase Dashboard → Auth → Users → buscar email → "Send magic link" manual.

  - **§3.11 JWT Secret Rotation**:
    - Disclaimer: JWT signing secret managed by Supabase, no acción TurnoGol.
    - Si seguridad requiere rotación: Supabase Dashboard → Settings → API Keys → Rotate.
    - Tras rotar: invalida todas las sesiones activas (usuarios deben re-login). Comunicar.
    - Vercel env vars (NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) deben re-sincronizar.

  - **§3.12 ENCRYPTION_KEY Rotation Strategy**:
    - v1: single-key.
    - Cuando rotar: filtración sospechada o anual (calendar).
    - Procedimiento (v1 manual):
      1. Generar nueva key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      2. Re-encriptar todos los `tenants.mp_access_token` y `tenants.mp_refresh_token` con la nueva: script aparte (no en v1; documentar como TODO).
      3. Para v1, simplificación: si la key compromete, **revocar credenciales MP de cada tenant via OAuth disconnect/reconnect** (los complejos re-conectan MP). Más simple que key-rotation con cipher versioning.
    - v1.5: key versioning con tabla `encryption_keys (id, key_hex, created_at, retired_at)` y `mp_*_token_key_id` columna.

  - **§4.X Stress Test Ritual**:
    - Pre-launch: cada deploy a prod requiere stress test verde.
    - Terminal 1: `NEXT_PUBLIC_E2E=1 pnpm dev`
    - Terminal 2: `pnpm stress:bookings`
    - Resultado esperado: 1 accepted, N-1 rejected (race contra DB exclusion constraint).
    - Si Accepted > 1 → CRITICAL, bloquea deploy.

  - **§10.6 Backup Restore Drill** (sección 10 ya existe):
    - Quarterly: en un branch staging (Vercel preview), correr restore desde PITR a una fecha 24h atrás.
    - Verify: row counts +/- 5% vs prod current, smoke `/api/status`.
    - Documentar evidence en `docs/audit/backup-drills/YYYY-MM-DD.md`.

  - **§11 Migration Strategy** (nueva sección referenciada por MIGRATIONS.md):
    - Dos trees: `src/shared/db/migrations/` (CI authority) y `supabase/migrations/` (Supabase CLI mirror).
    - Convención: por cada change, escribir SQL en ambos.
    - Antes de PR: `psql` ambos files contra local DB para verify idempotencia.

**Done:** doc19 contiene las 6 nuevas secciones. Total ≥15 runbooks/procedimientos (>5 done-criteria).

---

## Task 6: Staging decision + LAUNCH.md checklist

**Goal:** Done-criteria "Staging environment espejo de prod" requiere decisión documentada (no hay infra para v1, justificar).

- [ ] **Step 1**: `docs/LAUNCH.md` — sección "Staging Strategy v1":
```markdown
## Staging strategy (v1)

**Decisión:** v1 usa **Vercel Preview Deployments** como staging.
- Cada PR a `main` genera un preview deployment automático.
- Preview deployment usa **mismo** Supabase project (prod), **mismo** env vars que prod.
  EXCEPCIÓN: `NEXT_PUBLIC_APP_URL` apunta al preview URL.
- E2E + integration tests corren en CI antes del merge (gate).
- Después del merge: deploy.yml deploya a prod.

**Riesgo aceptado v1:** preview deployments leen/escriben prod DB. Compensación: PRs nunca corren write tests contra prod (sólo CI ephemeral DB).

**v1.5 (post-launch):** crear Supabase staging project + Vercel staging environment con env vars separadas. Justificación de upgrade: cuando haya feature flags y tests destructivos en preview.

**Backup restore drill:** ver doc19 §10.6 — usa Vercel preview de un branch dedicado `audit/backup-drill-YYYY-MM-DD`.
```

- [ ] **Step 2**: `docs/LAUNCH.md` — checklist completo:
```markdown
## Pre-launch checklist (production)

### Código
- [ ] `pnpm launch-check` verde (incluye bypassrls, encryption-key, mp-probe, typecheck, lint, tests, build, e2e, stress)
- [ ] Stress test Accepted=1 (doc19 §4.X)
- [ ] Tests integration + isolation 100% verde en CI último push a main
- [ ] Sentry DSN configurada en Vercel env

### Datos
- [ ] Backup restore drill ejecutado en últimos 90 días (doc19 §10.6, evidencia en docs/audit/backup-drills/)
- [ ] PITR enabled en Supabase Pro
- [ ] Seed data prod cargada (plans, price_versions)

### Seguridad
- [ ] ENCRYPTION_KEY rotada en último año (doc19 §3.12)
- [ ] Vercel env: SUPABASE_SERVICE_ROLE_KEY restricted (no expuesta a client)
- [ ] DATABASE_URL apunta a role non-BYPASSRLS (validado por launch-check)
- [ ] Sentry beforeSend scrub PII activo (B9)

### Legal
- [ ] `/privacy` publicada
- [ ] `/terms` publicada
- [ ] DPA template draft revisado por counsel (legal team)
- [ ] AAIP inscripción submitted (status tracked in docs/legal/aaip-status.md)

### Operacional
- [ ] doc19 leído por al menos 1 persona on-call
- [ ] Magic link debugging procedure conocida (doc19 §3.10)
- [ ] Webhook MP HMAC secret rotated (paranoia anual)
- [ ] /api/status + /api/health monitor externo configurado (UptimeRobot free → support@email)
```

**Done:** LAUNCH.md exists + linked from README + linked from doc19.

---

## Task 7: Report + STATE update + final verification

**Goal:** Reportar trabajo, actualizar STATE, asegurar merge clean.

- [ ] **Step 1**: `docs/audit/reports/fase-b11-operativo-report.md`:
  * Tabla done-criteria con evidencia (commit SHAs)
  * Hallazgo P0 CI migrations + fix
  * P1 arrastres cerrados: BYPASSRLS validation (launch-check), refresh-mp-tokens advisory lock, /privacy /terms, runbook expansion
  * P1 deferidos (legal/admin): DPA, AAIP, backup restore real evidence (requiere prod-real env)
  * Stats: tests nuevos, archivos, líneas, gaps remanentes

- [ ] **Step 2**: Actualizar `docs/audit/STATE.md`:
  * B11 → completed
  * P1 cerrados: BYPASSRLS validation, refresh-mp-tokens, /privacy /terms, runbook gaps
  * P1 deferidos a v1.5 o legal: DPA templates, AAIP, ENCRYPTION_KEY versioning, backup drill evidence real (requiere prod)
  * Próxima fase: F0 (frontend baseline)

- [ ] **Step 3**: Final verify:
```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
```
Si CI workflow disponible, validar también su pasaje tras Task 1.

**Done:** Reports + STATE updated. Ready for merge to main.

---

## Verification

- [ ] `pnpm typecheck` verde
- [ ] `pnpm test` verde
- [ ] `pnpm test:integration` verde (especialmente notification-sending + system-admins-audit + nueva refresh-mp-tokens-advisory-lock)
- [ ] `pnpm lint` verde
- [ ] `pnpm launch-check` muestra steps nuevos (bypassrls, encryption-key, mp-probe)
- [ ] `/privacy` y `/terms` reachable en `pnpm dev`
- [ ] grep finds no console.* in src/
- [ ] CI workflow corre verde tras push del branch

## Out-of-scope (deferred)

- **DPA templates**: legal team draft + counsel review (no código)
- **AAIP inscripción**: trámite administrativo (status tracking en docs/legal/aaip-status.md sí, submission no)
- **Backup restore drill real con evidencia**: requiere acceso a prod Supabase + acción operacional (humano)
- **ENCRYPTION_KEY key versioning (v1.5)**: requiere schema change + re-encrypt script (deferido)
- **Supabase staging project**: v1.5 (Vercel preview suficiente v1)
- **CI stress test job**: nice-to-have, B11 lo flagea como deferido si tiempo escaso (Task 1 + 2 + 3 + 4 + 5 + 6 + 7 ya es scope denso)
- **MP webhook HMAC secret rotation procedure**: paranoia anual, documentar en doc19 si tiempo
