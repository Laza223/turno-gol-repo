# TurnoGol

SaaS B2B de gestión para complejos de fútbol en Argentina. Competidor vertical de ATC Sports, exclusivo para fútbol.

## Documentación

La carpeta `docs/` contiene 19 documentos vigentes (doc9 deprecado) que son la fuente de verdad del proyecto. Están numerados del 1 al 20 y cubren todas las capas:

### Capa de Negocio
- `doc1` — Problema y mercado objetivo (complejos de fútbol, Argentina)
- `doc2` — Competitive teardown vs ATC Sports
- `doc3` — 3 Personas: Marcelo (Owner), Rodrigo (Staff), Tomás (Jugador). Partidos abiertos deferidos a v1.5.
- `doc4` — Monetización: suscripción mensual por canchas (Básico/Estándar/Full), MercadoPago

### Capa Funcional
- `doc5` — Requisitos no funcionales (monolito Y1, 99.5% SLA, p95 <500ms)
- `doc6` — Entidades y state machines (19 tablas, Booking es la más crítica)
- `doc7` — 9 flujos end-to-end con efectos secundarios detallados
- `doc8` — ~42 user stories con Given/When/Then, edge cases, out-of-scope
- `doc9` — DEPRECADO. Lifecycle SaaS unificado en doc4 §2. No usar.
- `doc10` — Onboarding: wizard 4 pasos, Aha Moment = primera reserva online

### Capa Técnica
- `doc11` — 12 ADRs (RLS, Magic Link, Resend, MercadoPago, pg-boss, monolito, AFIP out-of-scope, +18 declaración jurada)
- `doc12` — Tenant isolation: 12 tablas RLS, 7 globales, SET LOCAL, JWT, RLS dual para jugadores
- `doc13` — SQL completo: 19 tablas, ENUMs, exclusion constraints, índices, RLS policies
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
- Correr `pnpm typecheck` después de cada cambio

## Convenciones de comunicación
- Respuestas directas, sin introducciones ni conclusiones
- Código y comandos, no explicaciones previas
- Si hay ambigüedad entre docs, señalarla explícitamente
- Si falta info, preguntar antes de inventar

## Multi-tenancy
- **19 tablas totales**: 12 aisladas con RLS + 6 globales + 1 híbrida
- Tablas aisladas: courts, bookings, abonados, payments, cash_flows, daily_cash_closes, products, tenant_staff_members, tenant_subscriptions, notifications, audit_logs, tenant_player_bans
- Tablas globales (sin tenant_id): tenants, players, staff_users, plans, price_versions, processed_webhooks
- Tabla híbrida (tiene tenant_id + RLS dual staff/player): player_tenant_relationships
- Players son cross-tenant: un jugador reserva en N complejos
- El JWT del staff tiene tenant_id; el del jugador tiene player_id (sin tenant_id)
- **RLS dual en `bookings` y `player_tenant_relationships`**: policy para staff (por `app.current_tenant_id`), policy para jugador (por `app.current_player_id`). Policy Realtime SOLO en `bookings` (grilla de staff). `player_tenant_relationships` no necesita Realtime en v1.
- Background jobs usan rol de servicio separado
- `tenants.mp_access_token` + `mp_refresh_token`: credenciales OAuth MP del complejo para cobrar señas (encriptadas at-rest)

## Convenciones críticas de schema
- ENUMs usan `canceled` (americano, una L). NUNCA `cancelled` (británico, doble L)
- `booking_status`: `canceled_refunded`, `canceled_no_refund` (no `cancelled_*`)
- `abonado_status`: `canceled` (no `cancelled`)
- `payment_status`: `canceled` (no `cancelled`)
- `tenant_status` tiene 8 estados: trialing, active, past_due, suspended, blocked, canceled, churned, deleted
- `player_status`: active, banned, anonymized. `banned` = ban global del sistema (no de un complejo). `anonymized` = eliminación ARCO Ley 25.326. Bans per-tenant via `tenant_player_bans`.
- `players.agreed_to_terms_at` + `terms_version`: declaración jurada +18 (ADR-012)
- Consentimiento v1: `players.agreed_to_terms_at` + `audit_logs`; NO existe tabla `consent_records` (se evalúa en v1.5)
- Facturación AFIP: fuera de scope v1 (ADR-011), responsabilidad del complejo
- Planes SaaS: Básico (1-3 canchas, 2 staff), Estándar (4-6, 5 staff), Full (7+, staff ilimitado)
- Realtime Supabase: solo para staff (grilla). Jugador NO tiene Realtime en v1 (polling/refresh).
- DB columns de cancelación: `canceled_reason`, `canceled_by`, `canceled_at` (sin doble L)
- Middleware SET LOCAL: `app.current_tenant_id` para staff, `app.current_player_id` para jugador

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
