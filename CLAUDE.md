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
- Auth staff: email+password. Jugador sigue passwordless (Magic Link). SuperAdmin: script + MFA TOTP. La identidad sale del JWT (`app_metadata`), no del método de login.
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
- NOTA: doc6/doc12/doc13 todavía dicen "19 tablas / 12 RLS"; el schema creció (reviews, player_favorites, push_subscriptions, feature_flags). Specs desactualizados respecto al código.
- Players son cross-tenant: un jugador reserva en N complejos
- El JWT del admin tiene tenant_id; el del jugador tiene player_id (sin tenant_id)
- **RLS dual en `bookings` y `player_tenant_relationships`**: policy para admin (por `app.current_tenant_id`), policy para jugador (por `app.current_player_id`). Policy Realtime SOLO en `bookings` (grilla admin). `player_tenant_relationships` no necesita Realtime en v1.
- Background jobs usan rol de servicio separado
- `tenants.mp_access_token` + `mp_refresh_token`: credenciales OAuth MP del complejo para cobrar señas (encriptadas at-rest)
- **Super Admin**: tabla `system_admins`, panel en `/super-admin/*`, puede ver todos los tenants, métricas globales. Fase 2 (Impersonación) diferida.

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
- `staff_role`: **2 roles** (Modelo ATC; migr. 029 quitó `read_only`) — `admin` (dueño, acceso total: Configuración, Equipo, MP/facturación, config de productos, métricas de sistema) y `manager` (Encargado: grilla, reservas, caja, jugadores). El manager NO accede a Configuración ni a gestión de Equipo. Guards: `requireOperatorStaff` (admin+manager) para operación; `requireAdminStaff`/`requireAdminStaffAction` (solo admin) para config/equipo. `/metricas` lo ve el manager pero sin las métricas de sistema. Sin sistema de PIN.
- `court_status`: `online` | `offline` (no active/maintenance/inactive)
- Seña: configurable por complejo vía `settings.requires_deposit` (on/off) + `settings.deposit_percentage` (porcentaje global, default 30). Sin modo garantía.
- Duración de turno: 60 minutos fijo (constante global `SLOT_DURATION_MINUTES` en `src/shared/constants.ts`). El campo configurable `booking_duration_minutes` se eliminó (dead code, cambio #14).
- **Día operativo** (`tenants.closes_next_day`, migr. 035): para complejos que cierran después de medianoche. Si `true`, un día de `opening_hours` cuyo `close <= open` (ej. open 08:00, close 02:00) cierra en la madrugada del día calendario siguiente; sin el flag ese cierre es inválido (cero slots). `bookings.date` = día OPERATIVO (no calendario): los slots post-medianoche pertenecen a la noche anterior, así caja/cierre/reportes agrupan la noche junta. El slot 23:00→00:00 se guarda con `time_end='24:00'` (TIME válido y `> '23:00'` → pasa `chk_time_valid`; `'00:00'` lo violaría). Helper único `src/shared/time/operating-day.ts` (`effectiveCloseMins`/`endLabelFromMins`/`normalizeRangeToOpenDay`), consumido por TODOS los generadores de slots (grilla admin, perfil público, semanal, búsqueda cross-tenant, `getAvailableSlots`).
- Anticipación de reserva: `settings.booking_advance_days`, default 6 días (como ATC).
- Precios por cancha: JSONB con reglas de puntos de corte horarios flexibles, **un precio por franja** (`rule.price`). Turnos de 60 min fijos: no hay precio por duración (cambios #6/#13).
- NO hay billetera virtual del jugador. Reembolsos se resuelven entre jugador y complejo.
- **No-show = deuda (cambio #5, modelo ATC)**: marcar no-show captura la seña pagada (`deposit_status='captured'`) y suma `price_snapshot − seña` a `player_tenant_relationships.balance`; el jugador queda bloqueado para reservar online en ese complejo hasta saldarla. Se eliminó el ban temporal por días (`no_show_penalty` ya no existe en settings, migr. 034); los bans manuales (`tenant_player_bans`) siguen para otros motivos. Lógica en `handleNoShow` (`booking.cancellation.ts`), incremento atómico vía `addNoShowDebt`.
- **Saldo a favor de abonados (modelo ATC, cambio #4)**: `abonados.credit_balance` (centavos, CHECK >= 0). Se carga con un `CashFlow` `income`/`abonado_payment` + `abonado_id` (entra a caja) y se consume al destildar "Mantener saldo" en el booking `fixed` (setea `bookings.credit_applied`; NO genera CashFlow). Invariante recalculado desde fuentes: `credit_balance = Σ(abonado_payment) − Σ(credit_applied)`. El saldo vive en el abonado (no se transfiere). Distinto de `player_tenant_relationships.balance` (deuda por no-show).
- **Módulo Jugadores** (`/jugadores`, cambio #9): vista admin de jugadores vinculados al complejo (vía `player_tenant_relationships`, NUNCA guests). Ficha = stats + Deudas (cobrar `balance` → reduce PTR.balance + CashFlow) + Abonados (cargar saldo) + historial. Protegido con `requireOperatorStaff()` (admin + manager).
- Gestión de caja completa (decisión actualizada): incluye stock/cantina (productos con precio, stock y alertas; ventas → CashFlow categoría `product_sale`) y control de gastos (`cashflow_type` = `expense`, categoría `operating_expense`). `cashflow_type`: `income` | `adjustment` | `expense`. Más cierre de caja diario.
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
