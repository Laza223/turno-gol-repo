# TurnoGol

SaaS B2B de gestión para complejos de fútbol en Argentina. Competidor vertical de ATC Sports, exclusivo para fútbol.

## Documentación

La carpeta `docs/spec/` contiene 19 documentos vigentes (doc9 deprecado) que son la fuente de verdad del proyecto. Están numerados del 1 al 20 y cubren todas las capas. El resto de `docs/` está organizado en subcarpetas (ver `docs/README.md` para el mapa completo): `business/` (planes originales de negocio/sistema/HU), `decisions/`, `operations/`, `qa/`, `audit/`, `planning/`, `superpowers/`, `archive/`.

### Capa de Negocio
- `doc1` — Problema y mercado objetivo (complejos de fútbol, Argentina)
- `doc2` — Competitive teardown vs ATC Sports
- `doc3` — 3 Personas: Marcelo (Owner = rol `admin`), Rodrigo (Empleado = rol `manager`/Encargado), Tomás (Jugador). Partidos abiertos ("Falta Uno") fuera de scope v1 — pendiente de eliminar del schema/código (ver Multi-tenancy).
- `doc4` — Monetización: suscripción mensual por canchas (Predio/Complejo/Estadio), MercadoPago

### Capa Funcional
- `doc5` — Requisitos no funcionales (monolito Y1, 99.5% SLA, p95 <500ms)
- `doc6` — Entidades y state machines (19 tablas + system_admins, Booking es la más crítica)
- `doc7` — 9 flujos end-to-end con efectos secundarios detallados
- `doc8` — ~42 user stories con Given/When/Then, edge cases, out-of-scope
- `doc9` — DEPRECADO. Lifecycle SaaS unificado en doc4 §2. No usar.
- `doc10` — Onboarding: wizard 4 pasos, Aha Moment = primera reserva online

### Capa Técnica
- `doc11` — 12 ADRs (RLS, Magic Link, Resend, MercadoPago, pg-boss, monolito, AFIP out-of-scope, +18 declaración jurada). NOTA: ADR-002 (Magic Link) en migración — ver `docs/superpowers/specs/2026-06-16-auth-password-migration-design.md`.
- `doc12` — Tenant isolation: 12 tablas RLS, 6 globales + 1 híbrida + system_admins, SET LOCAL, JWT, RLS dual para jugadores
- `doc13` — SQL completo: 19 tablas + system_admins, ENUMs, exclusion constraints, índices, RLS policies
- `doc14` — Tech stack: Next.js 14, TypeScript, Drizzle ORM, Supabase, pg-boss, shadcn/ui
- `doc15` — API contracts: endpoints, payloads, auth, error codes

### Capa de Calidad & Operaciones
- `doc16` — Testing: ~140 unit, ~50 integration, ~10 e2e. Tests de aislamiento BLOQUEANTES
- `doc17` — Observabilidad: Sentry, logs, métricas
- `doc18` — Privacy/Compliance: Ley 25.326
- `doc19` — Runbook operativo
- `doc20` — Design System: design-system/MASTER.md como fuente de verdad visual

## Stack confirmado
- Next.js 14 (App Router) + TypeScript strict
- PostgreSQL via Supabase (Auth + Realtime + Storage)
- Drizzle ORM + pg-boss (background jobs)
- shadcn/ui + Tailwind CSS
- MercadoPago (Checkout Pro + Suscripciones; OAuth por complejo para señas)
- Resend (email transaccional — WhatsApp descartado para v1, ver ADR-003)
- Web Push API (notificaciones push al admin cuando llega reserva online)
- Vitest + Playwright

## Comandos (una vez iniciado el proyecto)
- `pnpm dev` — desarrollo
- `pnpm typecheck` — verificar tipos
- `pnpm lint` — ESLint
- `pnpm test` — tests unitarios
- `pnpm test:integration` — tests con DB real
- `pnpm db:push` — aplicar schema

## Reglas críticas
- TypeScript strict, nunca `any`
- Server Actions para mutaciones de UI interna (forms del admin, cancelación por jugador)
- Route Handlers solo para: webhooks de MP, endpoints públicos cross-origin (/api/public/*), auth callbacks
- Queries a DB solo desde Server Components o Server Actions
- Montos en centavos de ARS (integer, nunca decimal)
- Timestamps en UTC, conversión a ART solo en el frontend
- UUIDs como primary keys, nunca autoincremental
- `SET LOCAL` para tenant context, nunca `SET` sin LOCAL
- Auth staff: en migración de Magic Link → email+password (spec aprobado). Jugador sigue passwordless (Magic Link + magic link de Google descartado). SuperAdmin: script + MFA TOTP. La identidad sale del JWT (`app_metadata`), no del método de login.
- Correr `pnpm typecheck` después de cada cambio

## Convenciones de comunicación
- Respuestas directas, sin introducciones ni conclusiones
- Código y comandos, no explicaciones previas
- Si hay ambigüedad entre docs, señalarla explícitamente
- Si falta info, preguntar antes de inventar

## Multi-tenancy
- Tablas aisladas (tenant_id + RLS): courts, bookings, abonados, payments, cash_flows, daily_cash_closes, products, tenant_subscriptions, notifications, audit_logs, tenant_player_bans, tenant_staff_members, push_subscriptions
- Tablas globales (sin tenant_id): tenants, players, staff_users, plans, price_versions, processed_webhooks
- Tablas híbridas (tenant_id + RLS por jugador): player_tenant_relationships (dual staff/player), reviews (lectura pública + insert del jugador dueño del booking), player_favorites (solo el jugador, por `app.current_player_id`)
- Tabla operacional: feature_flags (fila con tenant_id NULL = default global; con tenant_id = override por complejo)
- Tabla del sistema (sin RLS, acceso super admin): system_admins
- ⚠️ Pendiente de eliminar (feature fuera de v1): `open_matches` + `open_match_players` y el enum `open_match_status` — todavía en el schema, hay que limpiarlos.
- NOTA: doc6/doc12/doc13 todavía dicen "19 tablas / 12 RLS"; el schema creció (reviews, player_favorites, push_subscriptions, feature_flags). Specs desactualizados respecto al código.
- Players son cross-tenant: un jugador reserva en N complejos
- El JWT del admin tiene tenant_id; el del jugador tiene player_id (sin tenant_id)
- **RLS dual en `bookings` y `player_tenant_relationships`**: policy para admin (por `app.current_tenant_id`), policy para jugador (por `app.current_player_id`). Policy Realtime SOLO en `bookings` (grilla admin). `player_tenant_relationships` no necesita Realtime en v1.
- Background jobs usan rol de servicio separado
- `tenants.mp_access_token` + `mp_refresh_token`: credenciales OAuth MP del complejo para cobrar señas (encriptadas at-rest)
- **Super Admin**: tabla `system_admins`, panel en `/super-admin/*`, puede ver todos los tenants, impersonar, métricas globales

## Convenciones críticas de schema
- ENUMs usan `canceled` (americano, una L). NUNCA `cancelled` (británico, doble L)
- `booking_status`: `canceled_refunded`, `canceled_no_refund` (no `cancelled_*`)
- `abonado_status`: `canceled` (no `cancelled`)
- `payment_status`: `canceled` (no `cancelled`)
- `tenant_status` tiene 8 estados: trialing, active, past_due, suspended, blocked, canceled, churned, deleted
- `player_status`: active, banned, anonymized. `banned` = ban global del sistema (no de un complejo). `anonymized` = eliminación ARCO Ley 25.326. Bans per-tenant via `tenant_player_bans`.
- `player_tenant_relationships.balance`: saldo deudor en centavos. Si > 0, jugador bloqueado para reservar online en ese complejo.
- `players.agreed_to_terms_at` + `terms_version`: declaración jurada +18 (ADR-012)
- Consentimiento v1: `players.agreed_to_terms_at` + `audit_logs`; NO existe tabla `consent_records` (se evalúa en v1.5)
- Facturación AFIP: fuera de scope v1 (ADR-011), responsabilidad del complejo
- Planes SaaS: Predio (1-3 canchas), Complejo (4-6), Estadio (7+). Sin límite de cantidad de staff.
- `staff_role`: **2 roles** — `admin` (dueño, acceso total) y `manager` (encargado: grilla/reservas/caja, sin precios ni config). El uso de `manager` es opcional por complejo. ⚠️ El enum en código todavía incluye `read_only` (eliminado por decisión) — pendiente de quitar.
- `court_status`: `online` | `offline` (no active/maintenance/inactive)
- `deposit_mode`: configurable por complejo (on/off + porcentaje global). Sin modo garantía.
- Duración de turno: 60 minutos fijo (constante global `SLOT_DURATION_MINUTES` en `src/shared/constants.ts`). El campo configurable `booking_duration_minutes` se eliminó (dead code, cambio #14).
- Anticipación de reserva: default 6 días (como ATC).
- Precios por cancha: JSONB con reglas de puntos de corte horarios flexibles + precio por duración.
- NO hay billetera virtual del jugador. Reembolsos/no-shows se resuelven entre jugador y complejo.
- Gestión de caja completa (decisión actualizada): incluye stock/cantina (productos con precio, stock y alertas; ventas → CashFlow categoría `product_sale`) y control de gastos (`cashflow_type` = `expense`, categoría `operating_expense`). `cashflow_type`: `income` | `adjustment` | `expense`. Más cierre de caja diario.
- Realtime Supabase: solo para admin (grilla). Jugador NO tiene Realtime en v1 (polling/refresh).
- Push notifications: Web Push API al admin cuando llega reserva online (sonido fijo, no configurable).
- NO hay recordatorio 24hs al jugador en v1 (descartado en P9.2 por costo de email masivo; worker/template eliminados, cambio #18). Se reconstruye con WhatsApp post-v1.
- DB columns de cancelación: `canceled_reason`, `canceled_by`, `canceled_at` (sin doble L)
- Middleware SET LOCAL: `app.current_tenant_id` para admin, `app.current_player_id` para jugador

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
