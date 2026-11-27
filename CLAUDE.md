# CLAUDE.md

Guía para Claude Code en este repositorio. Acá va solo dominio: qué es, invariantes, vetos y advertencias. Los gotchas de cada zona viven en `.claude/rules/` y se cargan solos al tocar esos archivos. **Si algo aplica solo cuando tocás X, va a la rule de X, no acá.**

# TurnoGol

SaaS B2B de gestión para complejos de fútbol en Argentina (solo fútbol, nada multi-deporte). Monolito Next.js multi-tenant con aislamiento por RLS. **El repo es público**: commits y PRs sin nombres de clientes, precios especiales ni números de un cliente.

## Lo que un modelo suele errar acá

- **Pasarela de pago: solo MercadoPago. No hay Stripe** ni otra pasarela.
- **MercadoPago son DOS aplicaciones, una por circuito de plata.** **Suscripciones** cobra el plan SaaS con el token master del env (`MP_TURNOGOL_ACCESS_TOKEN`). **Checkout Pro** es el OAuth por complejo para las señas (`MP_CLIENT_ID` / `MP_CLIENT_SECRET`). Las dos notifican al mismo buzón y MP genera una clave de firma por aplicación: `webhook-auth.ts` valida contra `MP_WEBHOOK_SECRET` **y** `MP_WEBHOOK_SECRET_CHECKOUT`.
- **`canceled` (una L) en todo lo propio** (enums, columnas, estados): `booking_status` tiene `canceled_refunded` / `canceled_no_refund`; igual `abonado_status` y `payment_status`; columnas `canceled_reason`, `canceled_by`, `canceled_at`. **Excepción: los strings de la API de MercadoPago son `cancelled` (dos L)**: `mp-gateway.implementation.ts`, `payment.types.ts`, `subscription-reconcile.service.ts`, `billing.service.ts`. No "corregirlos".
- **Montos en centavos de ARS, `integer`.** Nunca decimal ni float.
- **Migraciones: SQL a mano** en `src/shared/db/migrations/NNN_nombre.sql` (incluyen RLS, triggers y grants que drizzle-kit no genera), **copiado a mano e idéntico** a `supabase/migrations/20260424<NNN en 6 dígitos>_nombre.sql`; `pnpm supabase:reset` lo aplica en local. Nunca modificar una existente. `db:push`, `db:sync-supabase` y `db:migrate` están **DENEGADOS** (`.claude/settings.json`); ojo con el nombre: **`pnpm db:migrate` ejecuta `drizzle-kit push`**. Al mergear a `main`, un cambio en `supabase/migrations/` se aplica solo a producción.
- **TurnoGol NO reembolsa por API.** El scope `payments:refunds` solo funcionó con la cuenta dueña de las dos apps; con la cuenta de cualquier cliente real devuelve 403. La devolución la hace el complejo y el sistema solo la registra y la lista en `/caja/cuentas`. No perseguir el token con permiso. Detalle: `docs/planning/2026-08-22-dos-apps-mercadopago.md`.

## Invariantes globales

- **Timestamps UTC en DB**, conversión a ART solo en el frontend. **UUIDs como PK**. TypeScript strict, nunca `any` (`unknown` + type guard).
- **El día nunca se deriva en UTC**: `new Date().toISOString().slice(0,10)` devuelve mañana entre las 21:00 y medianoche ART. Usar `artTodayStr()` (`@/shared/dates/art`), `artDateOf` (`@/shared/time/art-date`) u `operatingDateOf` (`@/shared/time/operating-day`). Lo bloquea ESLint.
- **Día operativo** (`tenants.closes_next_day`): en complejos que cierran pasada la medianoche, `bookings.date` es el día operativo, no el calendario; el slot 23:00→00:00 se guarda con `time_end='24:00'`. Usar los helpers de `src/shared/time/operating-day.ts`, nunca reimplementar esa aritmética: un `close <= open` calculado a mano da una ventana vacía y **descarta el día entero sin ningún error** (antes de escribir una ventana horaria, `effectiveCloseMins`). Las franjas de precio también se etiquetan por día operativo.
- **Instantes físicos**: `bookings.starts_at` / `ends_at` (TIMESTAMPTZ) son la única fuente para lógica ("ya pasó / falta X"); `date` + `time_start` / `time_end` son día operativo y display.
- **Turno de 60 min fijo** (`SLOT_DURATION_MINUTES`, `src/shared/constants.ts`) para la reserva online y la reprogramación (`assertSlotDuration`). Excepción del staff: desde la grilla se agenda un evento de N horas enteras (`type='spontaneous'`, `assertWholeHours`) con precio = suma de cada hora, editable o 0; un `block` nunca carga plata. Precios por cancha: JSONB con puntos de corte horarios, un precio por franja (no hay precio por duración).
- Mutaciones de UI = **Server Actions**. Route Handlers solo para webhooks (MP y WhatsApp), `/api/public/*` y auth callbacks. Queries a DB solo desde Server Components o Server Actions.
- Contexto de tenant con **`SET LOCAL`, nunca `SET` sin `LOCAL`**. Nunca hardcodear credenciales, tokens ni URLs de producción.

## Comandos y Definition of Done

**Antes de dar por terminado un cambio**, los cuatro del required check *Lint & Types*:

```bash
pnpm format:check   # NO `pnpm format`: ese reescribe, este falla
pnpm lint           # Oxlint + ESLint recortado sobre src/, tests/ y scripts/ (completo: `pnpm lint:eslint`)
pnpm typecheck
pnpm knip           # un export usado solo en su propio archivo voltea el job
```

- Solo pnpm (nunca npm ni npx).
- `pnpm dev` (localhost:3000) · `pnpm test` / `test:integration` / `test:isolation` / `test:e2e` — entorno y gotchas: skill `protocolo-testing`. Integración sin las variables de entorno **trunca la base local**.
- `pnpm supabase:start|stop|reset` (DB `:54322`, API `:54331`, Inbucket `:54324`) · `pnpm jobs:start` (workers) · `pnpm db:studio`
- `pnpm sentry:issues [24h|14d|todo]` — errores de prod. Necesita `SENTRY_READ_TOKEN` con scope `event:read` (el `SENTRY_AUTH_TOKEN` del build devuelve 403).
- CI: `e2e-tests` y `visual-regression` **no corren en PRs** (solo push a main o `workflow_dispatch`).

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict
- PostgreSQL vía Supabase (Auth + Realtime) · Drizzle ORM · Zod 4 · pg-boss
- shadcn/ui + Tailwind CSS v4 · Vitest + Playwright + Storybook
- **Imágenes: Cloudflare R2** (`src/shared/storage/r2.ts`), no Supabase Storage
- Resend (email transaccional) · Web Push (VAPID)
- **WhatsApp: solo el bot con IA del complejo** (extra pago, coexistencia vía Kapso, OpenAI `gpt-6.2-sol` en `whatsapp-bot.agent.ts`; flag `whatsapp_bot`). Sin mensajes masivos ni recordatorios. Decisión base: `docs/decisions/2026-10-20-bot-whatsapp.md`

## Arquitectura

Feature-modules + shared por capas. **La lógica de negocio no vive en el App Router.**

- `src/modules/*` — 27 slices de dominio, cada uno con `*.service.ts` / `*.schema.ts` (Zod) / `*.types.ts` / `*.errors.ts`.
- `src/app/*` — presentación y ruteo. Route groups: `(admin)` (rutas en español: `grilla`, `caja`, `jugadores`…), `(player)`, `(public)`, `(auth)`, `(business)`, `(super-admin)`. Server Actions co-locadas en `actions.ts` con sufijo `Action`: guard → service.
- `src/shared/` — infraestructura (`db/`, `jobs/`, `time/`, `security/`, `observability/`, `rate-limit/`). `src/lib/` — adapters de terceros. `src/components/`, `src/hooks/` — UI.
- `src/server/` — composition root del runtime web (`with-auth`, `with-player`, `with-role`, `with-tenant`). Importa dominio a propósito; está al lado de `app`. Por eso `@/shared` no puede importar `@/modules` (regla `turnogol/capas-shared`) pero `@/server` sí.

**Aislamiento: `src/shared/db/client.ts`.** `getDb()` = rol `turnogol_app`, con RLS; `getWorkerDb()` = BYPASSRLS (`turnogol_worker`) para barridos cross-tenant. Contexto: `withTenantContext` / `withPlayerContext` / `withSystemAdminContext`.
Request de staff: `withTenant()` → `extractAuthUser` → `getStaffRole()` relee el rol de `tenant_staff_members` (**el claim `role` del JWT nunca se confía**) → `withTenantContext` → queries bajo RLS.

**Guards.** `src/modules/staff/guards.ts`: `requireAdminStaff()` (pages), `requireOperatorStaff()` / `requireAdminStaffAction()` (Server Actions). `src/modules/auth/system-admin.guards.ts`: triple check (claim del JWT + fila en `system_admins` + `SYSTEM_ADMIN_EMAILS`). `middleware.ts` (edge): anti-CSRF, rate-limit y request-id.

**Jobs.** Proceso aparte: `src/shared/jobs/run-workers.ts` (`Dockerfile.worker` / `railway.toml`). 21 workers en `src/shared/jobs/workers/`; colas en `definitions.ts` / `queue-names.ts`; pg-boss 12 en el schema `pgboss_v12`, todo con `retryLimit: 0` (el reintento es el próximo tick).

## Multi-tenancy

- Qué tabla vive bajo qué régimen: `.claude/rules/tablas-y-rls.md`. Cómo setear contexto y checklist de tabla nueva: `.claude/rules/rls-multi-tenant.md`.
- Players son cross-tenant. El JWT del admin tiene `tenant_id`; el del jugador, `player_id` sin `tenant_id`.
- `tenants.mp_access_token` / `mp_refresh_token` van cifrados y `tenants` es global y sin RLS: **el cifrado es la única barrera**. Jamás loguearlos ni devolverlos.
- Super Admin (`/super-admin/*`) ve todos los tenants y puede impersonar (cookie HMAC `tg_sa_impersonate`, TTL 1 h).

## Dominio

- `tenant_status` en el código: trialing, active, past_due, suspended, blocked, canceled, churned, deleted, free (ver "Modelo comercial": `free` se elimina). `player_status`: active, banned (ban global), anonymized (ARCO, Ley 25.326); los bans por complejo van en `tenant_player_bans`. `court_status`: `online` | `offline`.
- **`staff_role` tiene 2 roles**: `admin` (dueño) y `manager` (Encargado; no entra a Configuración, Equipo ni Métricas).
- Auth: staff con email + password; jugador passwordless (Magic Link); SuperAdmin por `seed:system-admin` + allowlist (MFA TOTP todavía no se exige).
- Seña: opcional por complejo (`settings.requires_deposit` + `settings.deposit_percentage`, default 30). Sin modo garantía. Anticipación: `settings.booking_advance_days`, default 6.
- **Cancelación tardía (solo sin seña)**: `settings.late_cancel_hours` (0 = apagado, default). En 60 días: 1ª aviso, 2ª 7 días y 3ª+ 30 días sin reservar online (`tenant_player_bans`). Es otro mecanismo que las ausencias (2 faltas en 90 días = 14 días).
- **Caja y cantina**: caja usa su propio cutoff de día operativo; son 2 destinos (Cuentas y Productos; vender es de Hoy). `DaySummary` tiene dos desgloses por método.

## Modelo comercial y precios (decisión 2026-11-27)

[`docs/decisions/2026-11-27-prueba-30-dias-y-precios.md`](docs/decisions/2026-11-27-prueba-30-dias-y-precios.md). **El código lo refleja en parte**: la prueba de 30 días y el precio del bot ya están; sacar el plan gratis y `trial_expired` faltan. No "arreglarlo" de paso: es una tarea propia.

- **Sin freemium: prueba de 30 días y después se paga.** `TRIAL_DAYS = 30` (`src/shared/constants.ts`), pero el código tiene el plan gratis vivo (estado `free`, `isFreePlan()` / `allowFree`, `transitionToFree`). Quedan superadas las decisiones de freemium del 2026-11-08 y 2026-11-15 y la del 2026-11-16 de "se vende gratis".
- **Fin de prueba**: estado nuevo `trial_expired` (todavía no existe): ficha pública sin horarios y panel en solo lectura, salvo operar reservas ya confirmadas; bot mudo; al final del buscador.
- **Precio del plan: por cantidad exacta de canchas**, decreciente por cancha, 1 a 7, 20% anual prepago, 8+ cotización. Fuente: `src/modules/billing/pricing.ts` y [la decisión del 23/11](docs/decisions/2026-11-23-precio-por-cantidad.md). Las suscripciones viejas conservan su catálogo.
- **Bot de WhatsApp: $50.000 por mes fijo por complejo**, sin importar las canchas (provisorio, se están evaluando costos). `PLUS_LIST_MONTHLY_CENTS` en `pricing.ts`. Un precio especial por complejo pisa la lista (`plus_price_per_court_cents`: el nombre de la columna quedó viejo, guarda el monto mensual).
- **Copy**: "Probalo 30 días gratis, sin tarjeta" está habilitado y es lo que da el alta. "Sin permanencia" prohibido → "cancelás cuando querés" o "sin contratos". Nunca "fútbol 5, 7 y 11": sirve de fútbol 4 a fútbol 11.
- Cualquier cambio de precio, seña por defecto o lifecycle necesita decisión escrita del dueño.

## Vetos de producto (no reproponer)

Decisiones tomadas que un modelo tendería a re-proponer. Se cambian solo con decisión escrita del dueño. Sin feature freeze desde el 2026-10-22.

- **RIVAL** es el lado jugador de TurnoGol, no solo "buscar rival" ([`2026-10-29`](docs/decisions/2026-10-29-rival-cultura-de-turnogol.md); visión en [`docs/rival/README.md`](docs/rival/README.md); v1 en [`2026-10-22-rival-v1.md`](docs/decisions/2026-10-22-rival-v1.md), flag `rival`). Contacto por link `wa.me` solo tras aceptar. Se pueden diseñar tablas, media, figura, perfil público y push, cada uno con su condición (solo partido oficial verificado, opt-in, lo negativo nunca público). Vetados: texto libre sobre personas, notas entre personas, escrache, karma canjeable, plata entre jugadores, feed, chat y geolocalización. Las tablas viejas de partidos abiertos no se resucitan.
- **Nunca texto libre sobre personas** (Ley 25.326). Etiquetas: enum cerrado de 5 (`src/modules/relationships/player-tags.ts`); `abonados.notes` se eliminó por esto. Una sexta etiqueta es aditiva; texto libre se reabre con el dueño. Única excepción: nombre de club de RIVAL, moderado.
- **Abonados: solo `price_per_session`**: ni saldo a favor ni precio mensual.
- **No-show no es deuda**: `player_tenant_relationships.balance` no existe. Es softban por reincidencia vía `tenant_player_bans` (`handleNoShow` → `applyNoShowStrike`); no inventar otro gate.
- **`/jugadores` no tiene tabla de contactos, a propósito**: el contacto se deriva de abonados con `player_id NULL`. Sin cuenta no hay etiquetas. Vinculación siempre manual, sin softbans retroactivos. Fuera: invitados de `guest_name` y deudores de `canteen_tabs`.
- **Caja/Cantina**: catálogo en tablas, no volver a `tenants.settings`. Cierres legacy con `expected_cash NULL`: nunca reinterpretarlos.
- **Torneos**: detrás del flag `tournaments` (global `false`), chequeado en páginas y en cada Server Action. Todo lo que ocupa cancha es una fila en `bookings`.
- **No hay billetera virtual del jugador**: los reembolsos se resuelven entre jugador y complejo.
- **Recordatorio de turno al jugador: no es una función de la web a promover ni ampliar** (2026-11-27, deja sin efecto la del 16/11). Queda como idea para la app oficial iOS/Android ([`docs/planning/2026-11-27-app-nativa-ideas.md`](docs/planning/2026-11-27-app-nativa-ideas.md)). El worker `player-reminders` (push 24 h y 2 h) **sigue en el código**: no apagarlo ni extenderlo sin pedido.
- **El jugador no tiene Realtime** (polling/refresh): Realtime es solo para la grilla admin.
- Push al staff respeta el **horario silencioso** (00–08 → `startAfter` a las 08:00, `push-quiet-hours.ts`).
- **Facturación AFIP fuera de scope v1** (ADR-011). Consentimiento = `players.agreed_to_terms_at` + `audit_logs`; **no existe `consent_records`**. +18: ADR-012.

## Producción

- Hay complejos reales usando la app. **Lo que llega a prod: avisar el efecto sobre ellos y esperar el OK del dueño.**
- Migraciones se aplican solas al mergear a `main` (ver arriba). Un `DROP COLUMN` en el mismo release que el código rompe la ventana de deploy: expand & contract (`docs/operations/MIGRATIONS.md`).
- Operación y credenciales: `docs/operations/`.

## UX y texto

Tan simple que un niño lo entienda (regla del dueño). Portal jugador: cero fricción, tipo ecommerce, **mobile primero (390px)**. Admin: denso pero obvio. [`DESIGN.md`](DESIGN.md) es la única autoridad de diseño; [`PRODUCT.md`](PRODUCT.md) el contexto de producto. El panel se refina, no se rediseña; un "mejor diseño" acá es menos pasos y menos cosas en pantalla. Portal de vidrio en claro y oscuro ([decisión](docs/decisions/2026-11-13-portal-vidrio.md)). Nada de configurabilidad "por las dudas".

**Texto visible**: usar la skill `turnogol-copy` si está disponible. Antes de redactar, verificar quién lo lee, en qué estado aparece y qué hace el botón; leer título, descripción y botón juntos. Voz de empresa ("Escribinos"), rioplatense, sin jerga interna. Marketing agresivo sí; datos inflados o cupos falsos, nunca.

## Documentación (se lee bajo demanda)

`docs/spec/` es la especificación canónica (19 documentos); decisiones en `docs/decisions/`; mapa en `docs/README.md` y `.claude/rules/mapa-docs.md`. Los planes, specs de implementación y auditorías viejas (`docs/superpowers/`, `docs/audit/`, `docs/archive/`, `docs/qa/`) se sacaron del árbol el 2026-11-27: si un comentario o un doc los cita, están en el historial de git. doc6/doc12/doc13 todavía dicen "19 tablas / 12 RLS". Ante contradicción entre docs, señalarla en vez de elegir en silencio.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
