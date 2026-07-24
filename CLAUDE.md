# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# TurnoGol

SaaS B2B de gestión para complejos de fútbol en Argentina. Competidor vertical de ATC Sports, exclusivo para fútbol.

## Documentación

La carpeta `docs/spec/` contiene 19 documentos (doc9 eliminado; lifecycle SaaS unificado en doc4 §2) que son la fuente de verdad del proyecto. Numerados del 1 al 20 salvo doc9, cubren todas las capas. El resto de `docs/` está organizado en subcarpetas (ver `docs/README.md` para el mapa completo): `business/` (planes originales de negocio/sistema/HU), `decisions/`, `operations/`, `qa/`, `audit/`, `planning/`, `superpowers/`, `archive/`.

### Capa de Negocio
- `doc1` — Problema y mercado objetivo (complejos de fútbol, Argentina)
- `doc2` — Competitive teardown vs ATC Sports
- `doc3` — 3 Personas: Marcelo (Owner = rol `admin`), Rodrigo (Empleado = rol `manager`/Encargado), Tomás (Jugador). Partidos abiertos ("Falta Uno") fuera de scope v1 — eliminados del schema/código (migr. 028).
- `doc4` — Monetización: suscripción mensual por canchas (Predio/Complejo/Estadio), MercadoPago

### Capa Funcional
- `doc5` — Requisitos no funcionales (monolito Y1, 99.5% SLA, p95 <500ms)
- `doc6` — Entidades y state machines (19 tablas + system_admins, Booking es la más crítica)
- `doc7` — 9 flujos end-to-end con efectos secundarios detallados
- `doc8` — ~42 user stories con Given/When/Then, edge cases, out-of-scope
- `doc10` — Onboarding: wizard 4 pasos, Aha Moment = primera reserva online

### Capa Técnica
- `doc11` — 12 ADRs (RLS, Magic Link, Resend, MercadoPago, pg-boss, monolito, AFIP out-of-scope, +18 declaración jurada). NOTA: ADR-002 (Magic Link) en migración — ver `docs/superpowers/specs/2026-06-16-auth-password-migration-design.md`.
- `doc12` — Tenant isolation: 12 tablas RLS, 6 globales + 1 híbrida + system_admins, SET LOCAL, JWT, RLS dual para jugadores
- `doc13` — SQL completo: 19 tablas + system_admins, ENUMs, exclusion constraints, índices, RLS policies
- `doc14` — Tech stack (doc desactualizado: el stack real migró a Next.js 16 / React 19 / Tailwind 4 / Zod 4 — ver "Stack confirmado" abajo)
- `doc15` — API contracts: endpoints, payloads, auth, error codes

### Capa de Calidad & Operaciones
- `doc16` — Testing: ~140 unit, ~50 integration, ~10 e2e. Tests de aislamiento BLOQUEANTES
- `doc17` — Observabilidad: Sentry, logs, métricas
- `doc18` — Privacy/Compliance: Ley 25.326
- `doc19` — Runbook operativo
- `doc20` — Design System: `docs/spec/design-system/MASTER.md` como fuente de verdad visual

## Stack confirmado
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict
- PostgreSQL via Supabase (Auth + Realtime). **Storage de imágenes: Cloudflare R2** (`src/shared/storage/r2.ts`), NO Supabase Storage
- Drizzle ORM + Zod 4 (validación) + pg-boss (background jobs)
- shadcn/ui + Tailwind CSS v4
- MercadoPago (Checkout Pro + Suscripciones; OAuth por complejo para señas)
- Resend (email transaccional — WhatsApp descartado para v1, ver ADR-003)
- Web Push API (notificaciones push al admin cuando llega reserva online)
- Vitest + Playwright

## Comandos
- `pnpm dev` — desarrollo (localhost:3000)
- `pnpm typecheck` — verificar tipos (correr después de cada cambio)
- `pnpm lint` — ESLint sobre `src/`
- `pnpm format` — Prettier sobre `src/`
- `pnpm test` — unit tests (SOLO `tests/unit/`)
- `pnpm test:integration` — tests con DB real (`tests/integration/`; requiere Postgres local: `pnpm supabase:start`, puerto 54322)
- `pnpm test:isolation` — tests de aislamiento RLS (`tests/integration/isolation.test.ts`), BLOQUEANTES en CI
- `pnpm test:e2e` — Playwright (`tests/e2e/`, 6 projects: chromium, mobile-chrome, axe-audit, webkit, firefox, mobile-safari); levanta `pnpm dev` solo con `MP_MOCK_MODE=1` y `NEXT_PUBLIC_E2E=1`
- `pnpm jobs:start` — workers pg-boss standalone (`src/shared/jobs/run-workers.ts`)
- `pnpm supabase:start|stop|reset` — Postgres + Auth local (puerto 54322)
- `pnpm db:studio` — Drizzle Studio

### Correr un test individual
- Unit: `pnpm vitest run tests/unit/<archivo>.test.ts` (+ `-t "nombre"` para un caso puntual)
- Integración: `DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54322/postgres" pnpm test:integration tests/integration/<archivo>.test.ts`
- E2E: `pnpm exec playwright test --project chromium <substring>` (+ `--grep "<título>"`)
- Hay un solo `vitest.config.ts` (split unit/integration por `--dir`, singleThread por los tests de DB)

### Migraciones (importante)
- `db:push` y `db:migrate` son alias de `drizzle-kit push:pg` y están DENEGADOS por `.claude/settings.json` — no usarlos
- Las migraciones reales son SQL escritas a mano en `src/shared/db/migrations/0*.sql` (numeradas 001–045; incluyen RLS, triggers y grants que drizzle-kit no genera), con espejo timestamped en `supabase/migrations/` (`pnpm db:sync-supabase` sincroniza)
- CI las aplica en orden vía psql; NUNCA modificar migraciones existentes — crear una nueva

## Arquitectura del código

Patrón: **feature-modules + shared por capas**. La lógica de negocio NO vive en el App Router.

- `src/modules/*` — 25 slices de dominio (`bookings`, `payments`, `billing`, `auth`, `staff`, `abonados`, `cashflow`, `relationships`, `notifications`, `super-admin`, …), cada uno con `*.service.ts` / `*.schema.ts` (Zod) / `*.types.ts` / `*.errors.ts`. Acá vive la lógica.
- `src/app/*` — capa fina de presentación/ruteo. Route groups: `(admin)` (dashboard staff, rutas en español: `grilla`, `caja`, `jugadores`…), `(player)`, `(public)` (portal + SEO), `(auth)`, `(business)`, `(super-admin)`. Server Actions co-locadas en `src/app/**/actions.ts`, exportan funciones con sufijo `Action`: guard → service del módulo. Route handlers notables: `api/webhooks/mercadopago`, `api/public/*`, `api/billing/*`, `api/mp/{oauth-start,callback}`.
- `src/shared/` — infraestructura interna: `db/`, `jobs/`, `middleware/`, `time/`, `rate-limit/`, `observability/`, `security/`. `src/lib/` — adapters de terceros: `supabase/`, `mercadopago.ts`, `web-push.ts`, `crypto/`. `src/components/` y `src/hooks/` — UI.

### Núcleo de tenant isolation: `src/shared/db/client.ts`
- `getDb()` — pool restringido (rol `turnogol_app`, RLS enforced). `getWorkerDb()` — pool BYPASSRLS (`WORKER_DATABASE_URL`, rol `turnogol_worker`) para sweeps cross-tenant y lookups pre-contexto.
- Wrappers de contexto (transacción + `set_config(..., true)` = SET LOCAL): `withTenantContext(tenantId)`, `withPlayerContext(playerId)`, `withSystemAdminContext(id)`.
- Flujo de un request staff: `withTenant()` (`src/shared/middleware/with-tenant.ts`) → `extractAuthUser` (JWT `app_metadata`) → `getStaffRole()` re-lee el rol desde `tenant_staff_members` (**el claim `role` del JWT nunca se confía**) → `withTenantContext` → queries bajo RLS.

### Guards
- `src/modules/staff/guards.ts` — `requireAdminStaff()` (pages, redirige), `requireOperatorStaff()` / `requireAdminStaffAction()` (Server Actions, devuelven `{ok:false}`).
- `src/modules/auth/system-admin.guards.ts` — triple check: JWT `is_system_admin` + fila activa en `system_admins` + allowlist `SYSTEM_ADMIN_EMAILS`.
- Route handlers: `withTenant()` / `withPlayer()` en `src/shared/middleware/`.
- `middleware.ts` raíz (edge): Fetch-Metadata anti-CSRF + rate-limit + request-id en rutas públicas/de dinero.

### Background jobs
- Entrypoint standalone (desacoplado de Next.js): `src/shared/jobs/run-workers.ts` (deploy vía `Dockerfile.worker` / `railway.toml`). 13 workers registrados en `src/shared/jobs/workers/index.ts` (14 colas: expire-pending-booking suma una `-sweep`); colas y retry-config en `definitions.ts` / `queue-names.ts`. OJO: los crons registrados sin `SendOptions` corren con retryLimit=0 real — el "retry" es el próximo tick del cron, no pg-boss.
- Webhook MP: `api/webhooks/mercadopago/route.ts` verifica firma → `boss.send(QUEUE_PROCESS_MP_WEBHOOK, …)`; con `MP_MOCK_ENABLED` (E2E) procesa inline.

### Tests y CI
- `tests/unit/` (~200 archivos), `tests/integration/` (~90, DB real: aislamiento, carreras, idempotencia de webhooks), `tests/e2e/` (`critical-flows/`, `a11y/`, `mobile/`, `cross-browser/`).
- CI (4 jobs): lint+types → unit → integration+isolation (BLOQUEANTE; postgres:15 en 54322, aplica `0*.sql` vía psql) → e2e (solo PRs a main). Deploy automático a Vercel tras CI verde en main.

## Reglas críticas
- TypeScript strict, nunca `any`
- Server Actions para mutaciones de UI interna (forms del admin, cancelación por jugador)
- Route Handlers solo para: webhooks de MP, endpoints públicos cross-origin (/api/public/*), auth callbacks
- Queries a DB solo desde Server Components o Server Actions
- Montos en centavos de ARS (integer, nunca decimal)
- Timestamps en UTC, conversión a ART solo en el frontend
- UUIDs como primary keys, nunca autoincremental
- `SET LOCAL` para tenant context, nunca `SET` sin LOCAL
- Auth staff: email+password. Jugador sigue passwordless (Magic Link). SuperAdmin: script (`seed:system-admin`) + allowlist `SYSTEM_ADMIN_EMAILS` (MFA TOTP: columnas en schema, aún NO enforced en los guards). La identidad sale del JWT (`app_metadata`), no del método de login.
- Correr `pnpm typecheck` después de cada cambio

## Convenciones de comunicación
- Respuestas directas, sin introducciones ni conclusiones
- Código y comandos, no explicaciones previas
- Si hay ambigüedad entre docs, señalarla explícitamente
- Si falta info, preguntar antes de inventar

## Multi-tenancy
- Tablas aisladas (tenant_id + RLS): courts, bookings, abonados, payments, cash_flows, daily_cash_closes, tenant_subscriptions, notifications, audit_logs, tenant_player_bans, tenant_staff_members, push_subscriptions
- Tablas globales (sin tenant_id): tenants, players, staff_users, plans, price_versions, processed_webhooks
- Tablas híbridas (tenant_id + RLS por jugador): player_tenant_relationships (dual staff/player), reviews (lectura pública + insert del jugador dueño del booking), player_favorites (solo el jugador, por `app.current_player_id`)
- Tabla operacional: feature_flags (fila con tenant_id NULL = default global; con tenant_id = override por complejo)
- Tabla del sistema: `system_admins` — **tiene RLS + FORCE self-scoped** (migr. 006+036: policies SELECT/UPDATE por `app.current_system_admin_id`, SIN policy de INSERT). El bootstrap (`seed:system-admin`) inserta vía pool worker BYPASSRLS (`getWorkerDb`), no vía `turnogol_app`.
- NOTA: doc6/doc12/doc13 todavía dicen "19 tablas / 12 RLS"; el schema creció (reviews, player_favorites, push_subscriptions, feature_flags). Specs desactualizados respecto al código.
- Players son cross-tenant: un jugador reserva en N complejos
- El JWT del admin tiene tenant_id; el del jugador tiene player_id (sin tenant_id)
- **RLS dual en `bookings` y `player_tenant_relationships`**: policy para admin (por `app.current_tenant_id`), policy para jugador (por `app.current_player_id`). Policy Realtime SOLO en `bookings` (grilla admin). `player_tenant_relationships` no necesita Realtime en v1.
- Background jobs usan rol de servicio separado: `turnogol_worker` (BYPASSRLS, pool de `WORKER_DATABASE_URL`) vs `turnogol_app` (restringido, RLS enforced) — migr. 037–039
- `tenants.mp_access_token` + `mp_refresh_token`: credenciales OAuth MP del complejo para cobrar señas (encriptadas at-rest)
- **Super Admin**: tabla `system_admins`, panel en `/super-admin/*`, puede ver todos los tenants y métricas globales, y **impersonar** un complejo (cookie firmada `tg_sa_impersonate` HMAC, TTL 1h — `src/modules/auth/impersonation.ts` + `impersonation.server.ts`). El login de super-admin rutea a `/super-admin`.

## Convenciones críticas de schema
- ENUMs usan `canceled` (americano, una L). NUNCA `cancelled` (británico, doble L)
- `booking_status`: `canceled_refunded`, `canceled_no_refund` (no `cancelled_*`)
- `abonado_status`: `canceled` (no `cancelled`)
- `payment_status`: `canceled` (no `cancelled`)
- `tenant_status` tiene 8 estados: trialing, active, past_due, suspended, blocked, canceled, churned, deleted
- `player_status`: active, banned, anonymized. `banned` = ban global del sistema (no de un complejo). `anonymized` = eliminación ARCO Ley 25.326. Bans per-tenant via `tenant_player_bans`.
- `player_tenant_relationships.noshow_count` + `last_no_show_at`: contador de ausencias dentro de la ventana de reincidencia (softban, ver más abajo). NO existe columna `balance` (eliminada migr. 044, era deuda de dinero por no-show — revertido).
- `players.agreed_to_terms_at` + `terms_version`: declaración jurada +18 (ADR-012)
- Consentimiento v1: `players.agreed_to_terms_at` + `audit_logs`; NO existe tabla `consent_records` (se evalúa en v1.5)
- Facturación AFIP: fuera de scope v1 (ADR-011), responsabilidad del complejo
- Planes SaaS (migr. 043): Predio (1-2 canchas, $55.000/mes), Complejo (3-5, $85.000/mes), Estadio (6+, $115.000/mes); anual = 20% off. Sin límite de cantidad de staff. Página pública de planes: `/precios` (`src/app/(business)/precios/`, constantes en `plans-data.ts` a mantener en sync con la tabla `plans`).
- `staff_role`: **2 roles** (Modelo ATC; migr. 029 quitó `read_only`) — `admin` (dueño, acceso total: Configuración, Equipo, MP/facturación, config de productos, métricas de sistema) y `manager` (Encargado: grilla, reservas, caja, jugadores). El manager NO accede a Configuración ni a gestión de Equipo. Guards: `requireOperatorStaff` (admin+manager) para operación; `requireAdminStaff`/`requireAdminStaffAction` (solo admin) para config/equipo. `/metricas` lo ve el manager pero sin las métricas de sistema. Sin sistema de PIN.
- `court_status`: `online` | `offline` (no active/maintenance/inactive)
- Seña: configurable por complejo vía `settings.requires_deposit` (on/off) + `settings.deposit_percentage` (porcentaje global, default 30). Sin modo garantía.
- Duración de turno: 60 minutos fijo (constante global `SLOT_DURATION_MINUTES` en `src/shared/constants.ts`). El campo configurable `booking_duration_minutes` se eliminó (dead code, cambio #14).
- **Día operativo** (`tenants.closes_next_day`, migr. 035): para complejos que cierran después de medianoche. Si `true`, un día de `opening_hours` cuyo `close <= open` (ej. open 08:00, close 02:00) cierra en la madrugada del día calendario siguiente; sin el flag ese cierre es inválido (cero slots). `bookings.date` = día OPERATIVO (no calendario): los slots post-medianoche pertenecen a la noche anterior. El slot 23:00→00:00 se guarda con `time_end='24:00'` (TIME válido y `> '23:00'` → pasa `chk_time_valid`; `'00:00'` lo violaría). `src/shared/time/operating-day.ts` (`effectiveCloseMins`/`endLabelFromMins`/`normalizeRangeToOpenDay`), consumido por TODOS los generadores de slots (grilla admin, perfil público, semanal, búsqueda cross-tenant, `getAvailableSlots`).
- **Día operativo en caja/cantina/métricas** (alineado 2026-07-24, RI #2 de D4, `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md`): `cash_flows`/`daily_cash_opens`/`daily_cash_closes`/cantina/`getTenantMetrics` YA agrupan por día operativo, no calendario ART puro — una venta de madrugada de un complejo `closes_next_day` cae en la noche anterior, igual que `bookings.date`. Criterio DISTINTO al de bookings: no es por-día-de-semana, es un cutoff ÚNICO por tenant (`nightCutoffMins`, mismo archivo `operating-day.ts` — el mayor "cuánto se extiende a la madrugada" entre los días que operan, excluye días `closed`) más `operatingDateOf`/`operatingDayRangeUtc`. `closeDayAction`/`openDayAction` recalculan el cutoff server-side (nunca confían en un valor del cliente — el guard de escritura `assertDayOpen` hace lo mismo con su propio SELECT a `tenants`). Corte hacia adelante: datos y cierres previos al deploy NO se re-bucketearon. Fuera de alcance (documentado, no un gap silencioso): `src/modules/reports/` (`getRevenueReport`/exports) sigue en UTC calendario puro — problema distinto, no relacionado a `closes_next_day`.
- **Instantes físicos (migr. 040/041)**: `bookings.starts_at`/`ends_at` (TIMESTAMPTZ) = instante físico absoluto en UTC, fuente única para lógica fuerte (comparaciones "ya pasó / falta X"); `date` = día operativo y `time_start`/`time_end` = display. Corrigen los slots post-medianoche de complejos `closes_next_day`. Spec: `docs/superpowers/specs/2026-07-10-booking-physical-instants-design.md`.
- Anticipación de reserva: `settings.booking_advance_days`, default 6 días (como ATC).
- Precios por cancha: JSONB con reglas de puntos de corte horarios flexibles, **un precio por franja** (`rule.price`). Turnos de 60 min fijos: no hay precio por duración (cambios #6/#13).
- NO hay billetera virtual del jugador. Reembolsos se resuelven entre jugador y complejo.
- **No-show = softban por reincidencia (REVERTIDO de "no-show = deuda", 2026-07-11)**: el cambio #5 original (deuda financiera + bloqueo indefinido en `player_tenant_relationships.balance`) se consideró desproporcionado — cobraba plata nunca entregada y bloqueaba sin plazo. `player_tenant_relationships.balance` se ELIMINÓ (migr. 044); no existe deuda de dinero por no-show. Modelo actual: marcar no-show sigue capturando la seña pagada (`deposit_status='captured'`, único costo real) y registra la ausencia en `player_tenant_relationships.noshow_count`/`last_no_show_at`. La 1ra ausencia (o la 1ra después de `NO_SHOW_STRIKE_WINDOW_DAYS`=90 días sin faltar) solo se registra; la 2da dentro de esa ventana dispara un bloqueo de `NO_SHOW_SOFTBAN_DAYS`=14 días para reservar online, vía una fila en `tenant_player_bans` (mismo mecanismo que los bans manuales del complejo, `checkPlayerBanned` ya lo lee — no hay gate nuevo). Lógica en `handleNoShow` (`booking.cancellation.ts`) → `applyNoShowStrike` (`ptr.service.ts`). Constantes en `src/shared/constants.ts`.
- **Abonados sin saldo a favor (REVERTIDO, 2026-07-10)**: el sistema de crédito/saldo a favor copiado de ATC (`abonados.credit_balance`, `bookings.credit_applied`, `CashFlow` categoría `abonado_payment`) fue eliminado — modelo ATC descartado para fútbol. El abonado NO tiene saldo a favor ni precio mensual: solo `price_per_session` (precio por sesión).
- **Módulo Jugadores** (`/jugadores`, cambio #9): vista admin de jugadores vinculados al complejo (vía `player_tenant_relationships`, NUNCA guests). Ficha = stats + indicador de softban activo (si `tenant_player_bans` tiene una fila vigente) + Abonados + historial. Sin cobro de deuda (ver softban arriba). Protegido con `requireOperatorStaff()` (admin + manager).
- **Caja y Cantina (rediseño 2026-07-22, migrs. 048–051)**: ítem de sidebar "Caja y Cantina", tabs por sub-ruta: `/caja` (movimientos, gastos, apertura/cierre), `/caja/cantina` (venta por ticket multi-ítem + fiados), `/caja/productos` (catálogo, reposición, mermas, reporte). Cantina sobre TABLAS REALES (`canteen_products` + ledger `stock_movements` append-only + `canteen_tabs` para fiados; módulo `src/modules/canteen/`) — el JSONB `tenants.settings.canteen_products` se backfilleó en 048 y se eliminó en 051. Venta = 1 `cash_flows` (income/`product_sale`) + N líneas en el ledger (`cash_flow_id`); fiado = stock sale al ENTREGAR, plata entra al COBRAR (`canteen_tabs`, `settleTab`); mermas/cortesías/consumo interno mueven stock sin tocar caja. Apertura de caja (`daily_cash_opens`, migr. 049): fondo inicial editable mientras el día está abierto; el cierre snapshotea `opening_cash`/`expected_cash` y `diff = contado − esperado` (cierres legacy: `expected_cash NULL`, nunca reinterpretar). Gastos con categorías (migr. 050): `merchandise`/`salaries`/`utilities`/`maintenance`/`other_expense` (`operating_expense` = legacy válido, la UI no lo ofrece). `cashflow_type`: `income` | `adjustment` | `expense`. Decisión: `docs/decisions/2026-07-22-caja-cantina-redesign.md` (la tabla `products` original se había dropeado en migr. 046 por dead code — `docs/decisions/2026-07-17-deprecate-products-table.md`; `canteen_products` la revive con otro shape y escritores reales).
- Realtime Supabase: solo para admin (grilla). Jugador NO tiene Realtime en v1 (polling/refresh).
- Push notifications: Web Push API al admin cuando llega reserva online (sonido fijo, no configurable). **Horario silencioso (cambio #7)**: en madrugada (00:00–08:00 en la timezone del complejo) el push se agenda (`startAfter`) para las 08:00 locales en vez de sonar al instante. Implementado en `notifyAdminPush` vía `pushSendOptions`/`quietHoursReleaseAt` (`push-quiet-hours.ts`).
- NO hay recordatorio 24hs al jugador en v1 (descartado en P9.2 por costo de email masivo; worker/template eliminados, cambio #18). Se reconstruye con WhatsApp post-v1.
- DB columns de cancelación: `canceled_reason`, `canceled_by`, `canceled_at` (sin doble L)
- Middleware SET LOCAL: `app.current_tenant_id` para admin, `app.current_player_id` para jugador

## Modo Auditoría (Método Karpathy)

### Criterios de calidad de un hallazgo:
- Archivo exacto + línea
- Evidencia: qué dice el código vs qué debería decir
- Severidad: 🔴 crítico / 🟡 medio / 🟢 bajo
- Solución propuesta
- Si es decisión de negocio: NO aplicar, solo reportar como "REQUIERE INPUT"

### Verificación obligatoria después de cada fix:
- `pnpm typecheck`
- `pnpm lint`
- Si fallan: revertir el cambio y registrar el intento fallido

### Reglas de acciones:
SIEMPRE: citar archivo/línea, correr typecheck, registrar en docs/audit/PROGRESS.md
PREGUNTAR: decisiones de negocio, eliminar código, cambiar estructura
NUNCA: commits, modificar migraciones, inventar nombres, asumir sin preguntar

## Compact Instructions
Al resumir la conversación, preservar:
- Cambios de API pública y su razón
- Errores encontrados y sus soluciones
- Archivos modificados en esta sesión
- Decisiones arquitectónicas tomadas
- Estado actual de la auditoría o tarea en progreso

Resumir brevemente:
- Intentos de exploración fallidos
- Discusiones que llegaron a conclusión
