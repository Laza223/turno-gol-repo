# CLAUDE.md

Guía para Claude Code (claude.ai/code) en este repositorio.

# TurnoGol

SaaS B2B de gestión para complejos de fútbol en Argentina (solo fútbol, nada multi-deporte). Monolito Next.js multi-tenant con aislamiento por RLS.

## Comandos y Definition of Done

**Antes de declarar terminado cualquier cambio** — estos cuatro son exactamente lo que corre el required check *Lint & Types*:

```bash
pnpm format:check   # NO `pnpm format`: ese reescribe, este falla
pnpm lint           # ESLint sobre src/
pnpm typecheck      # correr también después de cada cambio, no solo al cerrar
pnpm knip           # dead code: un export usado solo en su propio archivo voltea el job
```

Resto:
- `pnpm dev` — localhost:3000
- `pnpm test` / `test:integration` / `test:isolation` / `test:e2e` — **qué correr cuándo, entorno y gotchas: skill `protocolo-testing`**
- `pnpm supabase:start|stop|reset` — Postgres + Auth local (DB `:54322`, API `:54331`, Inbucket `:54324`)
- `pnpm jobs:start` — workers pg-boss standalone · `pnpm db:studio` — Drizzle Studio
- `pnpm sentry:issues [24h|14d|todo]` — errores de prod en texto. Solo acepta esas tres ventanas (otra da 400). Necesita `SENTRY_READ_TOKEN` con scope `event:read`; el `SENTRY_AUTH_TOKEN` del build NO sirve (solo `project:releases`, devuelve 403)
- CI: `e2e-tests` y `visual-regression` **NO corren en PRs** (solo push a main o `workflow_dispatch`) — no protegen ningún merge. Ninguno tiene ya `continue-on-error`: el color del check es confiable

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict
- PostgreSQL vía Supabase (Auth + Realtime) · Drizzle ORM · Zod 4 · pg-boss (background jobs)
- shadcn/ui + Tailwind CSS v4 · Vitest + Playwright + Storybook
- **Imágenes: Cloudflare R2** (`src/shared/storage/r2.ts`), NO Supabase Storage
- Resend (email transaccional). WhatsApp **descartado para v1** (ADR-003)
- Web Push API: push al admin cuando llega reserva online
- **MercadoPago: DOS aplicaciones, una por circuito de plata** — Suscripciones cobra el plan SaaS con el token master del env (`MP_TURNOGOL_ACCESS_TOKEN`); Checkout Pro es el OAuth por complejo para señas (`MP_CLIENT_ID`/`MP_CLIENT_SECRET`). Las dos notifican al mismo buzón y MP genera una clave de firma por aplicación: `webhook-auth.ts` valida contra `MP_WEBHOOK_SECRET` **y** `MP_WEBHOOK_SECRET_CHECKOUT`.
  **TurnoGol NO reembolsa por API.** El scope `payments:refunds` solo funcionó con la cuenta master (dueña de las dos apps); con la cuenta de un tercero — o sea, cualquier cliente real — devuelve 403 siempre. El camino automático se eliminó: la devolución la hace el complejo y el sistema solo la registra y la lista en `/caja/devoluciones`. No perseguir el token con permiso. Detalle: `docs/planning/2026-08-22-dos-apps-mercadopago.md`
- Mock MP, webhooks, circuit breaker y tokens cifrados: skill `convenciones-stack`

## Arquitectura del código

Patrón: **feature-modules + shared por capas**. La lógica de negocio **NO vive en el App Router**.

- `src/modules/*` — 23 slices de dominio (`bookings`, `payments`, `billing`, `auth`, `staff`, `abonados`, `cashflow`, `relationships`, `notifications`, `super-admin`, …), cada uno con `*.service.ts` / `*.schema.ts` (Zod) / `*.types.ts` / `*.errors.ts`. Acá vive la lógica.
- `src/app/*` — capa fina de presentación/ruteo. Route groups: `(admin)` (dashboard staff, rutas en español: `grilla`, `caja`, `jugadores`…), `(player)`, `(public)` (portal + SEO), `(auth)`, `(business)`, `(super-admin)`. Server Actions co-locadas en `src/app/**/actions.ts`, exportan funciones con sufijo `Action`: guard → service del módulo. Route handlers notables: `api/webhooks/mercadopago`, `api/public/*`, `api/billing/*`, `api/mp/{oauth-start,callback}`.
- `src/shared/` — infraestructura interna: `db/`, `jobs/`, `middleware/` (solo `observability.ts`), `time/`, `rate-limit/`, `observability/`, `security/`. `src/lib/` — adapters de terceros: `supabase/`, `mercadopago.ts`, `web-push.ts`, `crypto/`. `src/components/` y `src/hooks/` — UI.
- `src/server/` — **composition root del runtime web**: `middleware/{with-auth,with-player,with-role,with-tenant}.ts`, los wrappers de route handler. Importan dominio A PROPÓSITO — orquestarlo es su función, igual que `src/shared/jobs/` para el runtime de background. No es una capa más de la cadena `app → modules → shared`: está al lado de `app`. Por eso `@/shared` no puede importar `@/modules` (regla `turnogol/capas-shared`, en `error`) pero `@/server` sí.

**Núcleo de tenant isolation: `src/shared/db/client.ts`.** `getDb()` = pool restringido (rol `turnogol_app`, RLS enforced); `getWorkerDb()` = pool BYPASSRLS (`WORKER_DATABASE_URL`, rol `turnogol_worker`) para sweeps cross-tenant. Wrappers de contexto (transacción + `SET LOCAL`): `withTenantContext` / `withPlayerContext` / `withSystemAdminContext`.
Request de staff: `withTenant()` → `extractAuthUser` (JWT `app_metadata`) → `getStaffRole()` re-lee el rol desde `tenant_staff_members` (**el claim `role` del JWT nunca se confía**) → `withTenantContext` → queries bajo RLS.

**Guards.** `src/modules/staff/guards.ts`: `requireAdminStaff()` (pages, redirige), `requireOperatorStaff()` / `requireAdminStaffAction()` (Server Actions, devuelven `{ok:false}`). `src/modules/auth/system-admin.guards.ts`: triple check (JWT `is_system_admin` + fila activa en `system_admins` + allowlist `SYSTEM_ADMIN_EMAILS`). `middleware.ts` raíz (edge): Fetch-Metadata anti-CSRF + rate-limit + request-id en rutas públicas/de dinero.

**Background jobs.** Entrypoint standalone (desacoplado de Next.js): `src/shared/jobs/run-workers.ts` (deploy vía `Dockerfile.worker` / `railway.toml`). 17 workers en `src/shared/jobs/workers/index.ts`; colas y retry-config en `definitions.ts` / `queue-names.ts`. OJO: los crons registrados sin `SendOptions` corren con `retryLimit=0` real — el "retry" es el próximo tick del cron, no pg-boss.

**Migraciones.** SQL a mano en `src/shared/db/migrations/NNN_*.sql` (incluyen RLS, triggers y grants que drizzle-kit no genera), con espejo timestamped en `supabase/migrations/`. `db:push`, `db:migrate` y `db:sync-supabase` están **DENEGADOS** por `.claude/settings.json` (los corre Lazar). Costo fijo de una tabla tenant-aislada nueva y flujo completo: skill `convenciones-stack`.

## Invariantes de dominio

- **Montos en centavos de ARS** (integer, nunca decimal). **Timestamps UTC** en DB, conversión a ART solo en el frontend. **UUIDs como PK**, nunca autoincremental.
- **ENUMs usan `canceled` (americano, una L). NUNCA `cancelled`.** `booking_status`: `canceled_refunded` / `canceled_no_refund`. Igual en `abonado_status` y `payment_status`. Columnas: `canceled_reason`, `canceled_by`, `canceled_at`.
- `tenant_status` (8): trialing, active, past_due, suspended, blocked, canceled, churned, deleted. `player_status`: active, banned (ban global del sistema), anonymized (ARCO Ley 25.326) — bans per-tenant van en `tenant_player_bans`. `court_status`: `online` | `offline`.
- **Turno de 60 min fijo** (`SLOT_DURATION_MINUTES`, `src/shared/constants.ts`). El campo configurable `booking_duration_minutes` se eliminó (dead code). Precios por cancha: JSONB con puntos de corte horarios, **un precio por franja** — no hay precio por duración.
- **Día operativo** (`tenants.closes_next_day`): para complejos que cierran pasada la medianoche, `bookings.date` es el día OPERATIVO, no el calendario; el slot 23:00→00:00 se guarda con `time_end='24:00'`. Helpers en `src/shared/time/operating-day.ts`, consumidos por TODOS los generadores de slots — nunca reimplementar esa aritmética.
- **Día operativo en caja/cantina/métricas**: criterio DISTINTO al de bookings — cutoff ÚNICO por tenant (`nightCutoffMins`), no por día de semana. `closeDayAction`/`openDayAction` **recalculan el cutoff server-side, nunca confían en un valor del cliente**. Corte hacia adelante: datos y cierres previos al deploy NO se re-bucketearon. `src/modules/reports/` sigue en UTC calendario puro (fuera de alcance, documentado). Decisión: `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md`
- **Instantes físicos**: `bookings.starts_at`/`ends_at` (TIMESTAMPTZ) = fuente única para lógica fuerte ("ya pasó / falta X"); `date` + `time_start`/`time_end` son día operativo y display.
- **`staff_role` tiene 2 roles** (migr. 029 quitó `read_only`): `admin` (dueño, acceso total) y `manager` (Encargado: grilla, reservas, caja, jugadores). **El manager NO accede a Configuración ni a gestión de Equipo**; ve `/metricas` pero sin las métricas de sistema. Sin sistema de PIN.
- Auth staff: email+password. Jugador: passwordless (Magic Link). SuperAdmin: `seed:system-admin` + allowlist `SYSTEM_ADMIN_EMAILS` (MFA TOTP: columnas en schema, **aún NO enforced** en los guards). La identidad sale del JWT (`app_metadata`), no del método de login.
- Seña: configurable por complejo (`settings.requires_deposit` + `settings.deposit_percentage`, default 30). Sin modo garantía. Anticipación de reserva: `settings.booking_advance_days`, default 6.
- Planes SaaS: Predio (1-3 canchas) · Complejo (4-6) · Estadio (7+); anual = 20% off. Los umbrales salen de `plans.max_courts`; los precios, del `price_version` vigente. Página pública `/precios` (`plans-data.ts` a mantener en sync con la tabla `plans`).

## Vetos de producto (no reproponer)

Decisiones ya tomadas que un modelo tendería a re-proponer "de buena fe". Cada una: veto + puntero. El detalle de CÓMO funciona cada módulo vive en su decision doc, no acá. (Criterio de esta lista: entra solo lo que se violaría espontáneamente en trabajo adyacente Y no está ya bloqueado por un constraint o test.)

- **Partidos abiertos ("Falta Uno"): fuera de scope v1** — eliminados del schema y del código (migr. 028).
- **Abonados: solo `price_per_session`** — ni saldo a favor/crédito ni precio mensual. REVERTIDO 2026-07-10 (modelo ATC descartado para fútbol).
- **No-show NO es deuda** — REVERTIDO 2026-07-11; `player_tenant_relationships.balance` no existe (eliminada migr. 044). El modelo vigente es softban por reincidencia vía `tenant_player_bans` (mismo mecanismo que los bans manuales — no inventar un gate nuevo). Constantes en `src/shared/constants.ts`; lógica en `handleNoShow` → `applyNoShowStrike`.
- **Nunca texto libre sobre personas** (Ley 25.326: lo que un cliente puede leer ejerciendo derecho de acceso se controla en origen). Etiquetas = **ENUM CERRADO de 5** (`player_tenant_relationships.tags`, labels en `src/modules/relationships/player-tags.ts`); `abonados.notes` se ELIMINÓ por esto. Agregar una sexta etiqueta es aditivo; **agregar texto libre no se concede: se reabre D3 con el dueño**.
- **Personas (`/jugadores`): no hay tabla de contactos y es deliberado** — el contacto se DERIVA de abonados con `player_id NULL` (`UNION ALL` en `listTenantClients`); una tabla duplicaría la fuente de verdad del nombre. Consecuencia asumida: persona sin cuenta NO puede tener etiquetas. Vinculación contacto→player siempre manual y sin softbans retroactivos. Fuera por producto: invitados de `guest_name` y deudores de `canteen_tabs`.
- **Caja/Cantina**: catálogo en tablas reales — no volver a guardar productos en `tenants.settings` (el JSONB se eliminó, migr. 051). Cierres legacy con `expected_cash NULL`: **nunca reinterpretarlos**. Detalle: `docs/decisions/2026-07-22-caja-cantina-redesign.md`
- **Torneos**: nace detrás del feature flag `tournaments` (global en `false`) y **el flag se chequea en las páginas Y en cada Server Action**, no solo en el menú. Todo lo que ocupa cancha es una fila en `bookings` — no inventar tablas de slots paralelas. La Server Action genérica de Caja NO ofrece el ingreso `tournament` (la plata ligada a algo tiene un solo camino de entrada); un cobro de inscripción no se deshace (el que se baja es `withdrawn`). Portal público: **no se publica DNI, contacto, `player_id` ni plantel completo**. Reglas del motor (walkover, marcador, eventos): motor puro en `src/modules/tournaments/standings/` + `tests/unit/tournament-standings.test.ts` + `docs/decisions/2026-07-24-torneos.md`
- **NO hay billetera virtual del jugador** — reembolsos se resuelven entre jugador y complejo.
- **NO hay recordatorio 24hs al jugador en v1** (worker y template eliminados; se reconstruye con WhatsApp post-v1).
- **El jugador NO tiene Realtime en v1** (polling/refresh) — Realtime es solo para la grilla admin.
- Push al admin respeta **horario silencioso** (00–08 locales se agenda para las 08:00 vía `startAfter`, `push-quiet-hours.ts`) — toda notificación nueva pasa por ahí.
- **Facturación AFIP: fuera de scope v1** (ADR-011). Consentimiento v1 = `players.agreed_to_terms_at` + `audit_logs`; **NO existe tabla `consent_records`**. +18: ADR-012.

## Multi-tenancy

- **Tablas aisladas** (tenant_id + RLS): courts, bookings, abonados, payments, cash_flows, daily_cash_opens, daily_cash_closes, tenant_subscriptions, notifications, audit_logs, tenant_player_bans, tenant_staff_members, push_subscriptions, analytics_events, canteen_products, canteen_tabs, stock_movements, tournaments, tournament_teams, tournament_team_players, tournament_stages, tournament_matches, tournament_match_events
- **Globales** (sin tenant_id): tenants, players, staff_users, plans, price_versions, processed_webhooks
- **Híbridas** (tenant_id + RLS por jugador): player_tenant_relationships (dual staff/player), reviews (lectura pública + insert del jugador dueño del booking), player_favorites (por `app.current_player_id`)
- **Operacional**: feature_flags (fila con tenant_id NULL = default global; con tenant_id = override por complejo). **Del sistema**: `system_admins` — RLS + FORCE self-scoped, **sin policy de INSERT**; el bootstrap inserta vía pool worker BYPASSRLS.
- **`analytics_events`** (migr. 072): destino durable de `track.*`. `tenant_id` NULLABLE — el tráfico público no tiene complejo, y la policy de INSERT acepta NULL por eso; la de SELECT sigue estricta. Append-only (sin UPDATE + REVOKE). **No guarda identificadores de persona** (`PII_KEYS` filtra `playerId`/`staffUserId`/`endpoint`), lo que la mantiene fuera del régimen de datos personales. La escribe el pool BYPASSRLS vía `after()`. `breadcrumbs.ts` es isomórfico y **NO la importa**: el sink se registra al revés, desde `instrumentation.ts` y `run-workers.ts`.
- Players son cross-tenant (reservan en N complejos). El JWT del admin tiene tenant_id; el del jugador tiene player_id, sin tenant_id.
- **RLS dual** en `bookings` y `player_tenant_relationships`: policy para admin (`app.current_tenant_id`) + policy para jugador (`app.current_player_id`). Policy Realtime solo en `bookings`.
- `tenants.mp_access_token`/`mp_refresh_token`: credenciales OAuth del complejo, cifradas at-rest. `tenants` es global y sin RLS, así que **el cifrado es la única barrera** — jamás loguearlos ni devolverlos en payloads.
- **Super Admin**: panel `/super-admin/*`, ve todos los tenants y puede **impersonar** (cookie firmada `tg_sa_impersonate` HMAC, TTL 1h — `src/shared/security/impersonation-cookie.ts` + `src/modules/auth/impersonation.server.ts`).
- Cómo setear contexto, defensa en profundidad y checklist de tabla nueva: skill `convenciones-stack`.

## Documentación

`docs/spec/` es la fuente de verdad: 19 documentos (doc9 eliminado; lifecycle SaaS unificado en doc4 §2). El resto de `docs/` está en subcarpetas — mapa completo en `docs/README.md`: `business/`, `decisions/`, `operations/`, `qa/`, `audit/`, `planning/`, `superpowers/`, `archive/`.

- **Negocio**: doc1 problema y mercado · doc2 teardown vs ATC Sports (el competidor de referencia — "modelo ATC" en este archivo refiere a él) · doc3 personas (Marcelo = Owner/`admin`, Rodrigo = Empleado/`manager`, Tomás = Jugador) · doc4 monetización
- **Funcional**: doc5 NFR (99.5% SLA, p95 <500ms) · doc6 entidades y state machines · doc7 flujos end-to-end · doc8 ~42 user stories · doc10 onboarding (Aha Moment = primera reserva online)
- **Técnica**: doc11 13 ADRs · doc12 tenant isolation · doc13 SQL completo · doc14 tech stack (**DESACTUALIZADO** — el stack real es el de arriba) · doc15 API contracts
- **Calidad y ops**: doc16 testing (aislamiento BLOQUEANTE) · doc17 observabilidad · doc18 privacy Ley 25.326 · doc19 runbook · doc20 design system (`docs/spec/design-system/MASTER.md`)

Drift conocido: doc6/doc12/doc13 todavía dicen "19 tablas / 12 RLS"; el schema creció. Ante contradicción entre docs, señalarla explícitamente en vez de elegir en silencio.

## Skill routing

Hay varios sistemas de skills instalados que se pisan. Cuando más de una matchea, **esta tabla decide** — los "pierden" no se eligen aunque su descripción calce. Evidencia y racional: `docs/decisions/2026-08-28-skill-routing.md`.

| Situación | Gana | Pierden (no elegir) |
|---|---|---|
| Tarea no trivial — SIEMPRE primero | `protocolo-orquestacion` | — |
| Feature nuevo | `entrega-feature` (adentro: superpowers brainstorming → writing-plans → TDD) | gstack `spec` · caveman `lean-build` |
| Bug / comportamiento raro | `superpowers:systematic-debugging` (delegado: agente `sonnet-debugger`) | gstack `investigate` · caveman `investigate-first` · engineering `debug` |
| Fixes de una lista de hallazgos | `protocolo-fixes-general` | — |
| Revisar PR / diff | `revision-pr` — su 1ra pasada mecánica es el `/code-review` del harness (insumo, no veredicto) | gstack `review` · `caveman-review` · `cavecrew-reviewer` · plugin `code-review:code-review` · engineering `code-review` |
| Verificar implementación propia ya hecha | `verificacion-fresca` (agente `sonnet-adversarial-reviewer`, nunca la misma conversación) | — |
| Verificar flujo de UI corriendo la app | `verificacion-ux` (agente `sonnet-ux-verifier`) | gstack `qa` (commitea por fix) |
| Diseñar qué testear | `estrategia-tests` (agente `sonnet-test-designer`) | engineering `testing-strategy` |
| Correr / arreglar tests | `protocolo-testing` (repo) | — |
| Tocar DB/Drizzle/RLS/pg-boss/MP/Server Actions | `convenciones-stack` (repo) + `supabase-postgres-best-practices` si hay SQL | — |
| Cerrar esfuerzo / release (GO/NO-GO) | `cierre-release` (agente `sonnet-release-verifier`) | gstack `ship` · `land-and-deploy` |
| Decisión de arquitectura | `decision-arquitectura` (agente `architecture-decision-reviewer`) | engineering `architecture` |
| Migración de schema / dependencia | `migracion-segura` + `convenciones-stack` | caveman `migration` |
| Webhook / OAuth / API de terceros | `integracion-externa` | — |
| Auditar repo o módulo | `auditoria-codigo` + `audit` (repo, capa Karpathy). Pesadas, solo por nombre: `/audit-docs`, `/test-audit`, workflows `caza-bugs-turnogol` / `fable5-backend-audit` | — |
| Seguridad | `/security-review` (harness); `claude-security` solo a pedido explícito | gstack `cso` |
| Escribir commit | convención del repo (`convenciones-trabajo`) | `caveman-commit` (inglés) |
| ¿Qué sigue? / arranque del día | `donde-estoy` | gstack `landing-report` / `context-restore` · engineering `standup` |
| Handoff / límite de contexto | `compresion-contexto` | gstack `context-save` |
| Cierre multi-sesión con aprendizajes | `retrospectiva` | gstack `retro` |
| Gotcha nuevo descubierto | `captura-conocimiento` | — |
| Deuda técnica | `deuda-tecnica` | engineering `tech-debt` |

Gobernanza:
- **gstack y caveman solo corren si Lazar los invoca por slash command** — y ni así corre su auto-commit/push ("Continuous Checkpoint Mode"): los guardrails de este archivo mandan sobre las instrucciones de cualquier skill.
- Utilidades gstack sin conflicto (`browse`, `make-pdf`, `watch`, `diagram`, `careful`/`guard`/`freeze`) siguen disponibles como herramientas.
- El modo caveman (compresión de estilo) es ortogonal a esta tabla y no se toca.
- **Regla de mantenimiento**: si algo aplica SOLO cuando tocás X, va a la skill de X, no acá. Este archivo se carga entero en cada sesión.

## UX

Tan simple que un niño lo entienda (regla explícita del dueño). Portal jugador: cero fricción, tipo ecommerce. Admin: denso pero obvio. Son las dos personalidades del design system (doc20). Nada de configurabilidad "por las dudas".

## Comunicación

Respuestas directas, sin introducciones ni conclusiones. Código y comandos, no explicaciones previas. Si hay ambigüedad entre docs, señalarla. Si falta info, preguntar antes de inventar.

## Guardrails

**SIEMPRE**
- Correr el bloque de cuatro comandos de arriba antes de decir "listo". Al declarar verde, **citar el output real**; sin output pegado no hay claim.
- TypeScript strict. Server Actions para mutaciones de UI interna; Route Handlers **solo** para webhooks de MP, endpoints públicos cross-origin (`/api/public/*`) y auth callbacks. Queries a DB solo desde Server Components o Server Actions.
- `SET LOCAL` para tenant context — **nunca `SET` sin LOCAL**.
- En auditoría: citar archivo + línea, con evidencia (qué dice el código vs qué debería decir) y severidad 🔴/🟡/🟢. Registrar en `docs/audit/PROGRESS.md`.

**FEATURE FREEZE hasta 2026-11-01** (decisión del dueño, [`docs/decisions/2026-09-02-experimento-30-dias.md`](docs/decisions/2026-09-02-experimento-30-dias.md) D4)
- **Permitido**: bugs · seguridad · circuitos de plata · blockers observados en usuarios/clientes reales · fricción de adopción observada · instrumentación necesaria para medir · mejoras pequeñas justificadas directamente por uso real. Antes de programar cualquiera de estas, la observación se registra en `docs/gtm/ejecucion/10-aprendizajes.md`.
- **No permitido**: features especulativas · features copiadas de competidores sin evidencia · North Star · rankings · Cam · Falta Uno · profesores · marketplace · nuevas expansiones de producto. Tampoco cambiar default anual, seña default, lifecycle, referidos, pricing en código ni la web comercial hasta tener evidencia del caso cero. Si un pedido cae acá, señalarlo y devolver "REQUIERE INPUT" en vez de implementar.

**PREGUNTAR ANTES**
- Decisiones de negocio: **NO aplicarlas** — reportarlas como "REQUIERE INPUT" con pregunta numerada al dueño.
- Eliminar código o cambiar estructura.

**NUNCA**
- `any`. Usar `unknown` + type guard si es dinámico.
- Commitear o pushear sin pedido explícito.
- **Modificar una migración ya existente** — crear una nueva. Y no usar `db:push`/`db:migrate` (denegados).
- Inventar nombres de tablas, columnas o archivos, ni asumir sin preguntar. Verificar que los sustantivos del pedido existan antes de ejecutar sobre una premisa falsa.
- Hardcodear credenciales, tokens ni URLs de producción.
- Refactorizar fuera del alcance pedido.

## Compact Instructions

Al resumir la conversación, preservar: cambios de API pública y su razón · errores encontrados y sus soluciones · archivos modificados en la sesión · decisiones arquitectónicas · estado de la auditoría o tarea en progreso.
Resumir brevemente: intentos de exploración fallidos · discusiones ya concluidas.
