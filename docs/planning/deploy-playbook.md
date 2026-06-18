# Playbook de deploy a producción — TurnoGol

> Verificado contra el código en dev @ `4a3c6c2` (2026-06-12). Cada claim cita `archivo:línea`.
> Arquitectura de deploy: **web Next.js → Vercel** + **workers pg-boss → Railway** (`railway.toml:1-15`, `Dockerfile.worker:1-31`) + **PostgreSQL/Auth/Realtime → Supabase Pro** (`docs/infraestructura.md` §1-§3). No existe `vercel.json`; el deploy de la web lo hace `.github/workflows/deploy.yml` (Vercel CLI `--prebuilt --prod`) tras CI verde en `main`.

---

## 1. Variables de entorno

Validación central: `src/shared/env.ts:30-39` (`validateServerEnv`) corre al boot del server Next vía `instrumentation.ts:1-6` y **tira `throw` si falta algo obligatorio**. OJO: el proceso de workers (`pnpm jobs:start` → `src/shared/jobs/run-workers.ts`) **NO ejecuta esa validación** — un worker con env incompleto arranca igual y falla en runtime.

### 1.1 Obligatorias en producción (el boot de la web tira throw si faltan — `src/shared/env.ts:7-25`)

| Variable | Formato esperado | Dónde se configura | Throw vs fallback |
|---|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:puerto/db`. **Web (Vercel): pooler Supavisor `:6543` + `?pgbouncer=true`; Workers (Railway): directa `:5432`** (`docs/infraestructura.md` §4, `Dockerfile.worker:29-30`) | Vercel + Railway (la password sale de Supabase → Settings → Database) | Throw en boot web (`env.ts:8`). PERO `getSql()` tiene fallback silencioso a localhost (`src/shared/db/client.ts:6,53`) y el worker no valida env → en Railway, si falta, el worker apunta a `127.0.0.1:54322` sin avisar |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Vercel + Railway (Supabase → Settings → API) | Throw en boot (`env.ts:10`) y en uso (`src/lib/supabase/server.ts:9-11`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT `eyJ...` (≥20 chars) | Vercel (Supabase → Settings → API) | Throw (`env.ts:11`, `server.ts:9-11`) |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT `eyJ...` — **nunca al browser** | Vercel + Railway (Supabase → Settings → API) | Throw (`env.ts:12`, `src/lib/supabase/admin.ts:15-17`) |
| `NEXT_PUBLIC_APP_URL` | URL absoluta sin slash final, ej. `https://turnogol.app` | Vercel + Railway | Throw en prod (`env.ts:9`). Usada en redirect OAuth MP (`src/app/api/mp/oauth-start/route.ts:32-36`), magic links (`src/app/(auth)/login/actions.ts:34`), invitaciones staff (`src/app/(admin)/staff/actions.ts:203`) |
| `PIN_COOKIE_SECRET` | string ≥16 chars aleatorio | Vercel | Throw en boot (`env.ts:13`) y en uso (`src/modules/auth/pin.ts:40-44`) |
| `ENCRYPTION_KEY` | **exactamente 64 hex chars (32 bytes)** — el zod del boot pide ≥32 (`env.ts:14`) pero el uso real exige 64 (`src/lib/crypto/encrypt.ts:4-8`) | Vercel + Railway (los workers desencriptan tokens MP, ej. `refresh-mp-tokens.worker`) | Throw en uso. Cifra los tokens OAuth MP de cada tenant (única barrera: `tenants` no tiene RLS) |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | credenciales de la aplicación MercadoPago (panel Developers) | Vercel + Railway | Throw en boot (`env.ts:15-16`); `/api/status` los marca `down` si faltan (`src/app/api/status/route.ts:68`) |
| `MP_WEBHOOK_SECRET` | string ≥16 (lo genera MP en la pantalla de Webhooks) | Vercel (lo consume el route handler) | Throw en boot prod (`env.ts:17`). Sin secret en prod la verificación **falla cerrado** → todo webhook responde 401 (`src/modules/payments/webhook-auth.ts:24-25`) |
| `RESEND_API_KEY` | `re_...` | Vercel + Railway (el `send-email.worker` corre en Railway) | Throw en boot (`env.ts:18`); en uso degrada: `new Resend('')` falla recién al enviar (`src/modules/notifications/email.provider.ts:19`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | URL https + token (consola Upstash → REST API) | Vercel | Throw en boot prod (`env.ts:19-20`). En uso: rate-limit degrada por policy `failMode` open/closed (`src/shared/rate-limit/apply.ts:68-78`); cache de slots fail-open (`src/shared/cache/slots-cache.ts:40-51`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | par generado con `npx web-push generate-vapid-keys`; subject `mailto:...` | Vercel + Railway (`push.worker` envía desde Railway) | Throw en boot prod (`env.ts:21-23`) y al enviar (`src/lib/web-push.ts:33-43`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | mismo valor que `VAPID_PUBLIC_KEY` | Vercel | Throw en boot prod (`env.ts:24`); lo sirve `src/app/api/admin/push/vapid/route.ts:22` |

### 1.2 Necesarias en prod pero SIN validación al boot (degradan con fallback — riesgo silencioso)

| Variable | Qué pasa si falta | Evidencia |
|---|---|---|
| `APP_URL` | **CRÍTICO**: las URLs de retorno y `notification_url` de las suscripciones SaaS MP apuntan a `http://localhost:3000` | `src/modules/billing/billing.service.ts:127-133` (fallback localhost). No está en `env.ts` ni en `.env.example`. Setear = `NEXT_PUBLIC_APP_URL` en Vercel |
| `MP_TURNOGOL_ACCESS_TOKEN` | cobros SaaS (preapproval de la cuenta master TurnoGol) fallan contra MP con token `''` | `src/modules/billing/billing.gateway.ts:20` (fallback `''`). Tampoco está en `.env.example` |
| `SENTRY_DSN` | Sentry server/edge no inicializa (silencioso) | `sentry.server.config.ts:38,46`, `sentry.edge.config.ts:4`. `launch:check` sí lo exige (`scripts/launch-check.ts:25`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry browser no inicializa | `sentry.client.config.ts:4,87` |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | build sin upload de source maps | `next.config.js:74-82`; en CI van como secrets (`.github/workflows/deploy.yml:44-46`). Configurar en GitHub Actions secrets (y en Vercel si se buildea ahí) |
| `NEXT_PUBLIC_SITE_URL` | URLs canónicas/OG de SEO quedan en `http://localhost:3000`; fallback del redirect de registro | `src/lib/seo/metadata.ts:2`, `src/app/(auth)/register/actions.ts:69`. Setear = dominio prod en Vercel |

### 1.3 Opcionales (tuning / operación)

| Variable | Default | Evidencia |
|---|---|---|
| `DATABASE_POOL_MAX` | 3 conexiones por instancia (serverless-safe). Subirlo SOLO en Railway (proceso único) | `src/shared/db/client.ts:38-45` |
| `TERMS_VERSION` | `'v1'` | `src/shared/terms.ts:10-11` |
| `NEXT_PUBLIC_SERVICE_DEGRADED` | `'true'` muestra banner de incidente a los admins, sin redeploy de código | `src/components/layout/status-banner.tsx:26` |
| `ANALYZE` | `'true'` activa bundle analyzer en build | `next.config.js:2` |
| `VERCEL_GIT_COMMIT_SHA` | la setea Vercel sola; release tracking de Sentry | `sentry.server.config.ts:50` |

### 1.4 SOLO dev/test — deben estar AUSENTES en prod

| Variable | Guard en código | Evidencia |
|---|---|---|
| `MP_MOCK_MODE` | hard-gate `NODE_ENV !== 'production'` — aunque se filtre, no activa el mock en prod | `src/modules/payments/mock-mp.ts:20-24` |
| `NEXT_PUBLIC_E2E` | bypass de rate-limit y endpoint de seed E2E; el endpoint además exige `NODE_ENV !== 'production'`. `launch:check` falla fatal si vale `1` | `src/shared/rate-limit/apply.ts:54`, `src/app/api/e2e/create-booking/route.ts:11-13`, `scripts/launch-check.ts:144-151` |
| `E2E_BASE_URL` | solo Playwright/stress | `playwright.config.ts:19`, `scripts/stress-test.ts:6` |
| `LHCI_GRILLA_COOKIES_FILE` | solo Lighthouse | `scripts/lhci-grilla-puppeteer.js:26` |

### 1.5 Discrepancias detectadas en `.env.example`

- Lista `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` y `EMAIL_FROM` que **no usa ningún archivo de `src/`** (grep `process.env` exhaustivo: 0 matches). El "from" de email está **hardcodeado**: `'TurnoGol <no-reply@turnogol.app>'` (`src/modules/notifications/email.provider.ts:23`) → el dominio `turnogol.app` debe estar verificado en Resend; cambiar el remitente requiere deploy.
- **Faltan** en `.env.example`: `ENCRYPTION_KEY`, `PIN_COOKIE_SECRET`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TURNOGOL_ACCESS_TOKEN`, `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_POOL_MAX`, `TERMS_VERSION`.

---

## 2. Migraciones (26)

Fuente de verdad: `src/shared/db/migrations/` (también es el `out` de drizzle, `drizzle.config.ts:5`). Espejo para la CLI de Supabase: `supabase/migrations/20260424000001..26_*.sql`, regenerado con `pnpm db:sync-supabase` (`package.json:53` → `scripts/sync-supabase-migrations.mjs:13-15`, borra los `.sql` del target y copia con prefijo timestamp). Hoy ambos árboles están 1:1 (26 ↔ 26, verificado).

### 2.1 Procedimiento de aplicación a Supabase Pro

```bash
# 0) Regenerar el espejo y verificar que el diff esté limpio
pnpm db:sync-supabase
git status --porcelain supabase/migrations/   # debe estar vacío

# 1) Prerrequisito de la 008: el rol turnogol_app debe existir (008_revokes.sql:9-12).
#    CI lo crea así (.github/workflows/ci.yml, step previo a "Apply migrations"):
psql "$DATABASE_URL_DIRECTA" -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='turnogol_app') THEN CREATE ROLE turnogol_app NOLOGIN; END IF; END \$\$;"

# 2) Aplicar con la CLI de Supabase (procedimiento real documentado en docs/operations/MIGRATIONS.md:19)
supabase link --project-ref <ref-del-proyecto>
supabase db push          # aplica supabase/migrations/* pendientes, en orden, una transacción por archivo
supabase migration list   # verifica qué quedó registrado en supabase_migrations.schema_migrations
```

- **NO usar `pnpm db:push` / `pnpm db:migrate` en prod**: ambos son `drizzle-kit push:pg` (`package.json:46-47`), que difunde el schema Drizzle por introspección y **no aplica el SQL de las migraciones** (perdería policies RLS, triggers, FORCE RLS, seeds — nada de eso está en el schema Drizzle).
- Alternativa equivalente a CI (sin CLI Supabase): loop `psql` en orden lexicográfico, igual que `.github/workflows/ci.yml` ("Apply migrations"): `for f in src/shared/db/migrations/0*.sql; do psql "$DB" -v ON_ERROR_STOP=1 -f "$f"; done`. Si se usa esta vía, la CLI de Supabase no registra el historial — elegir UNA vía y sostenerla.
- Gotcha enums: `ALTER TYPE ... ADD VALUE` + uso del valor nuevo en la misma transacción da error `55P04`; la 025 lo esquiva comparando `::text` (`025_cashflow_expense.sql:11-12`). No mezclar a mano una 0NN de enum con DML que use el valor nuevo en la misma transacción.

### 2.2 Tabla 001→026

| # | Qué hace | Idempotente |
|---|---|---|
| 001 `extensions` | Extensiones `uuid-ossp`, `btree_gist`, `pg_trgm` + shim `auth.jwt()` para plain-postgres (`001:7-30`) | **Sí** (IF NOT EXISTS / OR REPLACE) |
| 002 `enums` | ~24 `CREATE TYPE` (tenant/booking/payment/cashflow/staff/etc.) | **No** — `CREATE TYPE` sin guard; re-run falla `already exists` |
| 003 `global_tables` | 6 tablas globales (`plans`, `tenants`, `players`, `staff_users`, `price_versions`, `processed_webhooks`) + `system_admins` + índices | **No** — `CREATE TABLE`/`CREATE INDEX` sin guard |
| 004 `isolated_tables` | Las 12 tablas con `tenant_id` + `player_tenant_relationships`, exclusion constraints `no_overlapping_bookings`/`no_overlapping_abonados` (`004:215,288`), `ENABLE ROW LEVEL SECURITY` en todas | **No** — `CREATE TABLE` sin guard |
| 005 `triggers` | `set_updated_at` (5 tablas), invariantes de booking, ban activo único, validación de recipient de notification | **No** — funciones `OR REPLACE` pero `CREATE TRIGGER` sin `DROP IF EXISTS` (`005:24-42`) |
| 006 `rls_policies` | Policies: `tenant_isolation_{select,insert,update,delete}` por tabla con `tenant_id = NULLIF(current_setting('app.current_tenant_id', true),'')::uuid` (`006:83-91`), RLS dual player, policies de players/staff/system_admins | **No** — `CREATE POLICY` sin guard |
| 007 `seed_data` | Seed 3 planes SaaS + `price_versions` inicial | **No** — `INSERT` sin `ON CONFLICT`; re-run falla por `plans.slug UNIQUE` |
| 008 `revokes` | `REVOKE UPDATE, DELETE` sobre `audit_logs` y `daily_cash_closes` al rol `turnogol_app` | **Sí** (REVOKE re-ejecutable) — pero **requiere que el rol exista** (`008:9-12`) |
| 009 `relax_payment_consistency` | Reemplaza `chk_booking_payment_consistency` (permite `pending_payment` antes de la preferencia MP) | **Sí** (`DROP CONSTRAINT IF EXISTS` + ADD) |
| 010 `billing_columns` | Columnas dunning en `tenant_subscriptions` + índice | **Sí** (IF NOT EXISTS) |
| 011 `notification_sending_enum` | `notification_status` + `'sending'` | **Sí** (`ADD VALUE IF NOT EXISTS`) |
| 012 `system_admins_audit` | `audit_logs.tenant_id` nullable + trigger de auditoría de `system_admins` | **Sí** (DROP NOT NULL no-op, OR REPLACE, DROP TRIGGER IF EXISTS) |
| 013 `realtime_publication` | Agrega `bookings` a la publicación `supabase_realtime` + `REPLICA IDENTITY FULL` (grilla admin) | **Sí** (`DO $$` con guards; skip si la publicación no existe — `013:17-26`) |
| 014 `push_subscriptions` | Tabla + RLS policies de suscripciones Web Push | **Sí** (IF NOT EXISTS + DO $$ guards) |
| 015 `feature_flags` | Tabla + policy + seed con `ON CONFLICT ... DO NOTHING` (`015:63`) | **Sí** |
| 016 `reviews` | Tabla reviews + policies | **Sí** |
| 017 `player_favorites` | Tabla favoritos + policies | **Sí** |
| 018 `open_matches` | Enum `open_match_status` (DO $$ guard), tablas `open_matches`/`open_match_players`, policies, triggers de join/slots | **Sí** |
| 019 `tenants_amenities_from_price` | `tenants.amenities` + `from_price_cents` + función/trigger de recálculo | **Sí** |
| 020 `public_backend_review_fixes` | `tenants.court_surfaces/court_formats` + reemplaza funciones recalc/open-match | **Sí** |
| 021 `force_row_level_security` | `FORCE ROW LEVEL SECURITY` en las 13 tablas RLS (aplica también al owner) | **Sí** (`021:18`) |
| 022 `ptr_balance` | `player_tenant_relationships.balance` (centavos, deudor) | **Sí** |
| 023 `cashflow_idempotency_key` | `cash_flows.client_idempotency_key` + unique index | **Sí** |
| 024 `player_notification_prefs` | `players.notify_email` / `notify_push` | **Sí** |
| 025 `cashflow_expense` | Enums `expense`/`operating_expense`, CHECK nuevo en `cash_flows`, `daily_cash_closes.total_expense` | **Parcial** — `ADD CONSTRAINT chk_expense_non_negative` sin guard (`025:23-24`) falla en re-run; el resto sobrevive |
| 026 `staff_roles` | `staff_role` + `'manager'` + `'read_only'` | **Sí** (`026:17-18`) |

---

## 3. Webhooks y callbacks de servicios externos

### 3.1 `POST /api/webhooks/mercadopago?tenant=<uuid>` — `src/app/api/webhooks/mercadopago/route.ts`

- **Eventos procesados** (`route.ts:57-61`): `payment` (seña de booking o proration de upgrade SaaS), `subscription_authorized_payment` (cobro recurrente SaaS), `subscription_preapproval` (cancel/hold del preapproval). Cualquier otro tipo → `200 {ok, ignored}`.
- **Firma**: SÍ verifica HMAC SHA-256 del header `x-signature` (`ts=...,v1=...`) contra el manifest `id:{data.id};request-id:{x-request-id};ts:{ts};` con `data.id` en minúsculas y compare timing-safe (`src/modules/payments/webhook-auth.ts:40-50`). Firma inválida → 401 (`route.ts:42-44`). En prod sin `MP_WEBHOOK_SECRET` → fail-closed (`webhook-auth.ts:24-25`).
- Encola `process-mp-webhook` en pg-boss (`route.ts:84`) → **lo procesa el worker de Railway**; fallo de enqueue devuelve 5xx para que MP reintente (`route.ts:87-91`).
- **Dónde se configura**: panel [MercadoPago Developers] → Tus integraciones → (tu aplicación) → **Webhooks / Notificaciones** → modo Producción → URL `https://<dominio>/api/webhooks/mercadopago` → suscribir eventos de Pagos y Suscripciones → copiar la **clave secreta** que muestra esa pantalla a `MP_WEBHOOK_SECRET` en Vercel. El `?tenant=` lo agrega el código como `notification_url` por operación (`src/modules/billing/billing.service.ts:131-133`), por eso `APP_URL` tiene que estar bien seteada.

### 3.2 `GET /api/mp/oauth-start` y `GET /api/mp/callback` — OAuth por tenant (señas)

- `oauth-start` (`src/app/api/mp/oauth-start/route.ts:38-45`): redirige al admin a `https://auth.mercadopago.com/authorization` con `state` HMAC-firmado (`MP_CLIENT_SECRET`) y `redirect_uri = ${NEXT_PUBLIC_APP_URL}/api/mp/callback` (`route.ts:32-36`).
- `callback` (`src/app/api/mp/callback/route.ts`): valida state (HMAC + TTL 10 min anti-replay, `route.ts:66-75`), intercambia `code` en `https://api.mercadopago.com/oauth/token` (`route.ts:88-98`), guarda `access_token`/`refresh_token` **encriptados con `ENCRYPTION_KEY`** (`route.ts:108-113`) y completa el onboarding.
- **Dónde se configura**: panel MP Developers → tu aplicación → **Editar** → "URLs de redirección" (Redirect URIs): agregar EXACTAMENTE `https://<dominio>/api/mp/callback` (debe coincidir carácter a carácter con lo que arma el código; ya estaba en `docs/operations/LAUNCH.md:19`).

### 3.3 `GET /api/auth/callback` — Supabase Auth (magic link / invitaciones)

- `src/app/api/auth/callback/route.ts:42-67`: flujo preferido `token_hash` + `verifyOtp` (robusto a prefetch de scanners y a doble pedido de link); fallback `code` + `exchangeCodeForSession` (PKCE). Después setea claims (`tenant_id`/`player_id`) vía service role y redirige.
- **Dónde se configura** (Supabase Dashboard → Authentication):
  1. **URL Configuration**: Site URL = `https://<dominio>`; Redirect URLs = `https://<dominio>/api/auth/callback` (y `https://<dominio>/**` si se usan previews).
  2. **Email Templates → Magic Link**: ver gotcha del template en el checklist §4 (el default PKCE rompe el primer link).

### 3.4 `POST /api/csp-report` — `src/app/api/csp-report/route.ts`

- Recibe reportes de violación CSP de los navegadores. No requiere configuración externa: los headers `report-uri /api/csp-report` + `Reporting-Endpoints` se emiten desde `next.config.js:25-44` en todas las respuestas. Solo verificar que el endpoint responda en prod.

### 3.5 `/monitoring` — túnel de Sentry browser

- `tunnelRoute: '/monitoring'` (`next.config.js:80`): el SDK del browser manda los eventos por ahí para esquivar ad-blockers. No configurar nada externo; no bloquear esa ruta en proxies/WAF.

---

## 4. Checklist pre-deploy

> Atajo: `pnpm launch:check` (`scripts/launch-check.ts:141-172`) corre casi todo esto en orden con env de prod: env vars → bypass E2E off → BYPASSRLS → fuerza de `ENCRYPTION_KEY` → probe credenciales MP → typecheck → lint → unit → integration → isolation → build → e2e → stress → `/api/status`.

- [ ] **Typecheck limpio**: `pnpm typecheck`
- [ ] **Unit tests 0 failures**: `pnpm vitest run --dir tests/unit` (= `pnpm test`, `package.json:36`)
- [ ] **Integration + isolation (BLOQUEANTE de aislamiento)**: `pnpm test:integration && pnpm test:isolation` (requiere Supabase local: `pnpm supabase:start`)
- [ ] **Build exitoso**: `pnpm build`
- [ ] **Env vars de prod en Vercel**: `vercel env ls production` y contrastar contra §1.1 + §1.2 (en especial `APP_URL` y `MP_TURNOGOL_ACCESS_TOKEN`, que el boot NO valida). Réplica de las que apliquen en Railway (`railway.toml:17-21`).
- [ ] **Migraciones aplicadas**: `supabase migration list --linked` → las 26 en `Applied`. Verificación directa: `psql "$DB" -c "SELECT count(*) FROM supabase_migrations.schema_migrations;"` → 26.
- [ ] **Espejo de migraciones sincronizado**: `pnpm db:sync-supabase && git status --porcelain supabase/migrations/` → vacío.
- [ ] **Webhook MP con URL prod**: en el panel MP (ver §3.1) y smoke negativo desde afuera — debe responder **401** (firma inválida = fail-closed activo):
  ```bash
  curl -si -X POST "https://<dominio>/api/webhooks/mercadopago?tenant=00000000-0000-0000-0000-000000000000" \
    -H 'Content-Type: application/json' -d '{"id":"1","type":"payment","data":{"id":"1"}}' | head -1
  ```
- [ ] **Dominio custom + SSL + HSTS**: `curl -sI https://<dominio>/ | grep -i strict-transport-security` → `max-age=63072000; includeSubDomains; preload` (`next.config.js:49`).
- [ ] **Sentry DSN prod**: Sentry **SÍ está integrado** en el código: `@sentry/nextjs` (`package.json:65`), init server/client/edge (`sentry.server.config.ts:46-88`, `sentry.client.config.ts:34-95`, `sentry.edge.config.ts`), `withSentryConfig` + source maps (`next.config.js:74-82`), release = `VERCEL_GIT_COMMIT_SHA`. **Pendiente manual**: las alert rules NO son código — hay que crearlas en la UI de Sentry (error rate >5% y p95 >2s, instrucciones literales en `sentry.server.config.ts:5-36`). Verificación: lanzar un error de prueba en preview y verlo llegar al proyecto.
- [ ] **Template de Magic Link en Supabase apuntando a `token_hash`** (gotcha conocido): el callback ya soporta `token_hash + verifyOtp` (`src/app/api/auth/callback/route.ts:36-54`) pero **el template default de Supabase usa `{{ .ConfirmationURL }}` (flujo PKCE)**, que rompe el primer link cuando un scanner de mail lo prefetchea o cuando se pide un segundo link (el code_verifier en cookie deja de matchear). En Supabase Dashboard → Authentication → Email Templates → **Magic Link**, reemplazar el href por:
  ```html
  <a href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=email">Iniciar sesión</a>
  ```
  Trade-off documentado: con `SiteURL` se pierde el query `next=` que el flujo de jugador mete en `emailRedirectTo` (`src/app/(public)/[slug]/reservar/actions.ts:62-64`); el callback cae al default de `sanitizeNext` (`route.ts:98`). Aplicar el mismo cambio al template **Invite user** (las invitaciones de staff usan `inviteUserByEmail`, `src/app/(admin)/staff/actions.ts:201-204`) usando `type=invite`.
- [ ] **RLS verificado** — dos queries (la primera la automatiza `launch:check` `bypassRlsCheck`, `scripts/launch-check.ts:64-93`):
  ```sql
  -- (a) conectado con el DATABASE_URL DE LA WEB: el rol NO debe bypassear RLS
  SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
  -- esperado: rolsuper = f, rolbypassrls = f

  -- (b) FORCE RLS de la migración 021 activo en las 13 tablas
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
  WHERE relname IN ('courts','bookings','payments','cash_flows','abonados',
    'daily_cash_closes','products','tenant_subscriptions','notifications',
    'audit_logs','tenant_player_bans','tenant_staff_members','player_tenant_relationships')
  ORDER BY relname;
  -- esperado: t / t en las 13
  ```
- [ ] **Rol de servicio de los workers (BK-01 — riesgo abierto)**: los workers pg-boss acceden a la DB con `getSql()`/`getDb()` **sin `SET LOCAL` de tenant** (ej. `src/modules/bookings/booking.expiry.ts:38,105,172`, invocado por `src/shared/jobs/workers/expire-pending-booking.worker.ts:28`). Con FORCE RLS (021) y policies que exigen `app.current_tenant_id` (`006_rls_policies.sql:83-91`), un rol **sin** BYPASSRLS ve 0 filas → los sweeps no expiran nada, los webhooks no confirman reservas, y nada tira error visible. **Requisito exacto**: el `DATABASE_URL` de Railway debe autenticar con un rol que ignore RLS — el rol `postgres` de Supabase (que tiene `rolbypassrls=true` en Supabase gestionado) o un rol dedicado `CREATE ROLE turnogol_worker LOGIN BYPASSRLS ...` con GRANTs sobre `public` y `pgboss`. Es el opuesto deliberado del rol de la web (que `launch:check` obliga a NO bypassear). Hoy los tests pasan porque CI corre como `postgres` — verificar el rol real de Railway con la query (a) de arriba conectado con ESE URL, esperando `rolbypassrls = t`.
- [ ] **`NEXT_PUBLIC_E2E` y `MP_MOCK_MODE` ausentes en Vercel prod**: `vercel env ls production | grep -E 'E2E|MOCK'` → vacío (guards en `mock-mp.ts:20-24` y `launch-check.ts:144-151`).
- [ ] **Resend**: dominio `turnogol.app` verificado (SPF+DKIM+DMARC) — el From está hardcodeado a `no-reply@turnogol.app` (`src/modules/notifications/email.provider.ts:23`).
- [ ] **Worker deployado en Railway**: servicio con `Dockerfile.worker`, `startCommand pnpm jobs:start` (`railway.toml:10`), env §1 cargado, `DATABASE_URL` **directa `:5432`** y con rol BYPASSRLS (ítem anterior).

---

## 5. Checklist post-deploy (primeras 48 h)

- [ ] **Crear complejo de prueba + onboarding completo**: `/register` con un mail real → magic link → wizard de onboarding → conectar MercadoPago (recorre `/api/mp/oauth-start` → consentimiento MP → `/api/mp/callback` → `/dashboard`). Verifica OAuth, encriptación de tokens y claims de tenant en un solo flujo.
- [ ] **Reservar como jugador y verificar email + QR**: `https://<dominio>/<slug>/reservar` → magic link de jugador → confirmar reserva → debe llegar el email (Resend Dashboard → Emails → Delivered) y la página de éxito `/reserva/<bookingId>/exito` debe mostrar el QR (`src/components/booking/BookingQR.tsx`) que resuelve a `/reserva/<bookingId>/verificar` (`src/app/reserva/[bookingId]/verificar/page.tsx`).
- [ ] **Pago MP + webhook**: el mock está hard-bloqueado en prod (`mock-mp.ts:20-24`), así que usar el flujo real con el tenant piloto (cuenta de prueba MP o seña mínima real). Verificar el ciclo completo:
  ```sql
  SELECT mp_event_id, event_type, processed_at FROM processed_webhooks ORDER BY processed_at DESC LIMIT 5;
  SELECT id, status, mp_payment_id FROM payments ORDER BY created_at DESC LIMIT 5;  -- approved
  SELECT id, status FROM bookings ORDER BY created_at DESC LIMIT 5;                 -- confirmed
  ```
- [ ] **Health `/api/status`**: `curl -s https://<dominio>/api/status | jq` → `{"status":"ok"}` con HTTP 200. Qué chequea REALMENTE (`src/app/api/status/route.ts:18-92`): `SELECT 1` a la DB, vitalidad de pg-boss vía `getQueueSize('send-email')` (tolera permission-denied), `PING` a Upstash, y **presencia** (no validez) de `MP_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`. **Limitación**: corre dentro de la web (Vercel) — un 200 acá NO prueba que el worker de Railway esté vivo; para eso el ítem siguiente.
- [ ] **Workers pg-boss procesando**: el worker `health-ping` corre cada 5 min en Railway (`src/shared/jobs/workers/health-ping.worker.ts:135-142`). Verificación por SQL (mismo query que usa `/api/admin/system-status`, `src/app/api/admin/system-status/route.ts:57-73`):
  ```sql
  SELECT max(completedon) AS last FROM (
    SELECT completedon FROM pgboss.job     WHERE name='health-ping' AND state='completed'
    UNION ALL
    SELECT completedon FROM pgboss.archive WHERE name='health-ping' AND state='completed'
  ) pings;  -- esperado: < 10 minutos atrás
  -- profundidad de colas / jobs trabados:
  SELECT name, state, count(*) FROM pgboss.job GROUP BY 1,2 ORDER BY 1,2;
  ```
  UI equivalente: `/metricas` como admin (consume `GET /api/admin/system-status`: depth por cola + `lastHealthPing`). Logs: Railway → service → Logs, buscar `registered queue` (13 registros, `src/shared/jobs/workers/index.ts:17-34`).
- [ ] **Error rate en Sentry**: proyecto prod → Issues con `environment:production`; confirmar que llegan transacciones (tracesSampler activo: 0.5 webhooks, 0.3 bookings — `sentry.server.config.ts:51-57`) y que las 2 alertas (§4) están en verde.
- [ ] **Cache / Upstash**: el código **SÍ usa Upstash Redis** — no es una discrepancia: (a) rate-limit `@upstash/ratelimit` (`src/shared/rate-limit/client.ts:1-33`), (b) cache de disponibilidad TTL 30 s (`src/shared/cache/slots-cache.ts:19,40-51`) y búsqueda cross-tenant (`slots-cache.ts:129-215`). Verificar: consola Upstash → Metrics con comandos creciendo; data browser con claves `slots:*` / `avail-search:*` / `rl:*`; sanity de rate-limit: 31 requests rápidos a un endpoint público desde la misma IP → 429 (`docs/operations/LAUNCH.md:48`).
- [ ] **Realtime de la grilla**: dos sesiones admin del mismo tenant; crear una reserva en una → aparece sin refresh en la otra (publicación `supabase_realtime` de la migración 013).
- [ ] **DLQ vacía a las 48 h**: `SELECT name, count(*) FROM pgboss.job WHERE state='failed' GROUP BY 1;` → idealmente 0 filas (los handlers de DLQ alertan a Sentry: `src/shared/jobs/workers/index.ts:31-33`).

---

## 6. Rollback

### 6.1 Web (Vercel) — instant rollback

1. Dashboard → Project → **Deployments** → ubicar el deployment estable anterior (production).
2. Menú `⋯` del deployment → **Instant Rollback** (o "Promote to Production"). Es un cambio de alias, tarda segundos y no toca la DB.
3. CLI equivalente: `vercel rollback <deployment-url> --token=$VERCEL_TOKEN`.
4. Anotar siempre el SHA estable previo antes de deployar (`docs/operations/LAUNCH.md:59-62`).

### 6.2 Workers (Railway)

Deployments del servicio → **Redeploy** del deployment anterior. Es seguro: pg-boss persiste los jobs en Postgres y los retoma al reiniciar (`railway.toml:11-13`).

### 6.3 Migraciones SQL — reversibilidad por archivo

Regla general del repo: **roll-forward** (migración correctiva nueva) antes que DOWN; nunca editar un archivo ya aplicado (`docs/operations/MIGRATIONS.md:54`). `supabase db push` aplica cada archivo en su propia transacción → un fallo no deja medio archivo aplicado.

| Grupo | Migraciones | Reversibilidad |
|---|---|---|
| Fundacionales | 001–008 | **No hay DOWN razonable** (schema entero). Rollback = restore PITR/backup de Supabase Pro |
| Valores de ENUM | 011 (`sending`), 025 (`expense`, `operating_expense`), 026 (`manager`, `read_only`) | **Irreversibles en la práctica**: Postgres no tiene `DROP VALUE`; quitar un valor exige recrear el tipo y reescribir cada columna que lo usa. Mitigación: son aditivas — el código anterior no usa los valores nuevos, así que el rollback de app (Vercel) es seguro SIN tocar la DB |
| Reversibles con DOWN simple | 009, 010, 012, 013, 014–018, 019/020, 021, 022, 023, 024, y parte de 025 | Ver DOWNs abajo |

DOWN de las riesgosas/recientes (ejecutar con `psql -v ON_ERROR_STOP=1`, rol con privilegios):

```sql
-- 026: NO revertir el enum. Para desactivar la feature, degradar miembros:
UPDATE tenant_staff_members SET role = 'admin' WHERE role::text IN ('manager','read_only');

-- 025 (parcial): solo si NO hay filas type='expense' (verificar primero):
SELECT count(*) FROM cash_flows WHERE type::text = 'expense';  -- debe ser 0
ALTER TABLE daily_cash_closes DROP CONSTRAINT IF EXISTS chk_expense_non_negative;
ALTER TABLE daily_cash_closes DROP COLUMN IF EXISTS total_expense;
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type = 'income' AND category IN ('booking','product_sale','other')) OR
  (type = 'adjustment' AND category IN ('other','no_show_correction')));

-- 024:
ALTER TABLE players DROP COLUMN IF EXISTS notify_email, DROP COLUMN IF EXISTS notify_push;

-- 023:
DROP INDEX IF EXISTS idx_cash_flows_idempotency_key;
ALTER TABLE cash_flows DROP COLUMN IF EXISTS client_idempotency_key;

-- 022 (OJO: el flujo de deuda/bloqueo de jugador depende de esta columna):
ALTER TABLE player_tenant_relationships DROP COLUMN IF EXISTS balance;

-- 021 (NO recomendado: baja una capa de seguridad; solo para diagnóstico puntual):
-- ALTER TABLE <tabla> NO FORCE ROW LEVEL SECURITY;  -- por cada una de las 13

-- 013:
ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings;
ALTER TABLE public.bookings REPLICA IDENTITY DEFAULT;

-- 010:
DROP INDEX IF EXISTS idx_tenant_subs_dunning;
ALTER TABLE tenant_subscriptions
  DROP COLUMN IF EXISTS dunning_started_at,
  DROP COLUMN IF EXISTS last_payment_failed_at,
  DROP COLUMN IF EXISTS last_payment_at;
```

### 6.4 Si una migración dejó datos a medias

1. **No revertir a ciegas.** Identificar el statement exacto que falló (salida de `ON_ERROR_STOP` o del CLI) y el estado real: `\d <tabla>`, `SELECT ... LIMIT`.
2. Si la migración es **idempotente** (ver tabla §2.2): corregir la causa y **re-correr el mismo archivo** — los guards hacen que lo ya aplicado sea no-op.
3. Si es de las **no idempotentes** (002–007): aplicar a mano solo los statements restantes desde el punto de fallo, en orden. Después registrar la migración como aplicada (`supabase migration repair --status applied <version>`), si se usa la CLI.
4. Si hay **filas usando valores nuevos de enum** y hay que volver el código atrás: no tocar el enum; neutralizar los datos (ej. §6.3 caso 026) o apagar la feature vía `feature_flags` (migración 015) y dejar la DB adelante del código — el schema aditivo es forward-compatible.
5. **Última línea de defensa**: Supabase Pro PITR — restaurar al minuto previo a la migración (Dashboard → Database → Backups → PITR) y re-aplicar lo que sí estaba bien. Probar un restore al menos una vez antes de necesitarlo (`docs/infraestructura.md` §5, drill en `docs/operations/LAUNCH.md:88-94`).
