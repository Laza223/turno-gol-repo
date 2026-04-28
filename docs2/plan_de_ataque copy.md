# TurnoGol — Plan de Ataque (Claude Code)

> **Propósito**: lista secuencial y quirúrgica de prompts para construir TurnoGol desde cero en Claude Code (VS Code).
> **Fuente de verdad**: `docs/doc1` a `docs/doc20` + `CLAUDE.md` + `DECISIONES_SISTEMA.md` + `_archive/audits/audit_opus4.7-1.md` (+ las dos auditorías posteriores, preservadas en memoria).
> **No generar absolutamente nada que contradiga esos documentos.** Si hay ambigüedad, Claude Code debe señalarla antes de escribir código.
> **Skills activas**: Superpowers (`obra/superpowers`) + UI UX Pro Max (`nextlevelbuilder/ui-ux-pro-max-skill`). Caveman se agrega después de P2.

---

## Metodología operativa — Reglas de la casa

Estas reglas se aplican **en cada prompt**. No se negocian.

### 1. Contexto Quirúrgico (`@` files)
- Cargar docs con `@docs/docXX.md` **solo** cuando el prompt los necesita.
- Nunca cargar el repo entero con `@/`. Nunca cargar los 20 docs de una.
- Cuando un prompt requiere 3+ docs, cargarlos explícitamente con el comentario "por qué".
- `CLAUDE.md` + `@_archive/audits/audit_opus4.7-1.md` (y sus sucesoras) se cargan al inicio de cada sesión larga via `/memory`.

### 2. Plan Mode Obligatorio (potenciado por Superpowers)
- **Todos los prompts de implementación** empiezan con:  
  `> Entrá en Plan Mode. NO escribas código hasta que valide tu plan.`
- Con **Superpowers instalado**, el agente entra automáticamente en modo brainstorming → planning → ejecución. La instrucción explícita de Plan Mode sigue como safety net por si Superpowers no se activa.
- El plan debe enumerar: archivos a crear/editar, orden, dependencias, tests. Claude Code frena tras presentar el plan y espera OK.
- Solo los prompts de **lectura, verificación o diagnóstico** omiten Plan Mode.
- Superpowers descompone cada tarea en subtareas de 2-5 minutos ejecutadas por subagentes con revisión en 2 etapas (cumplimiento del spec + calidad de código).

### 3. Hitos de limpieza
- **`/compact`** al cierre de cada fase (preserva decisiones, comprime contexto).
- **`/clear`** al saltar entre módulos grandes (ej. de Bookings a Billing).
- **`/memory`** recarga `CLAUDE.md` tras cada `/clear`.
- Los archivos `_archive/audits/audit_opus4.7-*.md` se mencionan explícitamente en el prompt cada vez que se toca un módulo afectado por esos hallazgos, porque `/compact` puede perder el detalle.

### 4. Foco en Hallazgos
Los prompts que toquen código afectado por las 3 auditorías deben **citar textualmente** las correcciones. Los 4 pilares no negociables son:

- **Pilar A — RLS Dual y RLS Relacional**: `players` y `staff_users` tienen RLS relacional (Fix #5). `bookings` y `player_tenant_relationships` tienen RLS dual (staff por `app.current_tenant_id`, jugador por `app.current_player_id`). Policy Realtime **solo** en `bookings` con `TO authenticated`. `system_admins` usa una 3ª variable `app.current_system_admin_id`.
- **Pilar B — Idempotencia de pagos**: `payments.mp_payment_id UNIQUE`. Tabla `processed_webhooks` con `UNIQUE(mp_event_id)`. Transición `pending_payment → confirmed/expired` con `UPDATE ... WHERE status = 'pending_payment' RETURNING id` y chequeo de `rowCount = 1` antes de disparar efectos secundarios (Fix #9).
- **Pilar C — State machine de bookings**: trigger unificado `enforce_booking_invariants` (Fix #2) + guard atómico en el service (Fix #9). Estados terminales inmutables. `price_snapshot` siempre inmutable. Exclusion constraint `no_overlapping_bookings` con `btree_gist`.
- **Pilar D — Bans y correcciones de Fase 3**: `uq_tenant_player_active_ban` **NO EXISTE** — fue reemplazado por trigger `enforce_single_active_ban` (Fix #10 Fase 2). `courts.status DEFAULT 'online'` (no `'active'`). `courts.pricing` usa estructura `{rules:[{days,from,to,prices:{60,120}}]}`. CashFlow **sin `expense`**; reembolsos viven en `payments` con `type='refund'`, no en `cash_flows`.

### 5. Convenciones de cada prompt
- Idioma: español.
- Cada prompt incluye: hito de limpieza (si aplica), contexto a cargar, instrucción Plan Mode, criterio de aceptación.
- El criterio de aceptación es **binario**: `pnpm typecheck && pnpm test:X` pasa, o no.

### 6. Skills de Claude Code
- **Superpowers** (`obra/superpowers`) se instala ANTES de P0. Proporciona brainstorming, planning, subagent-driven-development, TDD y code review automáticos.
- **UI UX Pro Max** (`nextlevelbuilder/ui-ux-pro-max-skill`) se instala ANTES de P0. Se activa automáticamente en prompts que involucren UI. En particular: P5 (página pública), P9 (grilla admin), P15 (app jugador), P19 (dashboard admin).
- **Caveman** (`JuliusBrussee/caveman`) se instala DESPUÉS de P2 (parada obligatoria 1). Reduce tokens de salida ~75%. Usar `/caveman lite` al principio.
- **Cavemem** (`JuliusBrussee/cavemem`) es OPCIONAL. Instalar después de Fase 5 si las sesiones se acumulan.

### 7. Selección de modelo por prompt
- **Sonnet** (`/model sonnet`) es el default. Rápido, barato, excelente para implementación de features bien definidas.
- **Opus** (`/model opus`) se usa SOLO en prompts marcados con 🧠. Son los que involucran lógica cruzada compleja, state machines, concurrencia o race conditions.
- Antes de cada prompt marcado 🧠: escribir `/model opus`. Después del prompt: `/model sonnet`.
- Si Sonnet no puede resolver algo → escalar a Opus en el momento. Si Opus tampoco → dividir el prompt en partes más chicas.
- **Haiku** (`/model haiku`) solo para consultas triviales de referencia.

---

## Mapa de fases

| # | Fase | Prompts | Modelo | Módulo principal |
|---|---|---|---|---|
| -1 | Setup de skills | Pre-P0 | — | Plugins de Claude Code |
| 0 | Setup del repo | P0 | Sonnet | Infra local, pnpm, env |
| 1 | DB + RLS blindado | P1, P2 | 🧠 **Opus** (P1), Sonnet (P2) | `shared/db/`, migrations, tests |
| 2 | Auth + Middleware | P3 | 🧠 **Opus** | `modules/auth/`, `shared/middleware/` |
| 3 | Tenants + Onboarding | P4, P5 | Sonnet | `modules/tenants/` + wizard |
| 4 | Courts | P6 | Sonnet | `modules/courts/` |
| 5 | Bookings (core) | P7, P8, P9 | 🧠 **Opus** (P7), Sonnet (P8, P9) | `modules/bookings/` |
| 6 | Payments + MP | P10, P11 | 🧠 **Opus** (ambos) | `modules/payments/` |
| 7 | Cancellations | P12 | Sonnet | `modules/bookings/` + refunds |
| 8 | Cash Flows + Cierre | P13 | Sonnet | `modules/cashflow/` |
| 9 | Abonados + PTR | P14 | Sonnet | `modules/abonados/` |
| 10 | Player-facing | P15, P16 | Sonnet | `app/(player)/`, bans |
| 11 | Notifications + Jobs | P17 | Sonnet | `modules/notifications/`, pg-boss |
| 12 | Billing SaaS + Dunning | P18 | 🧠 **Opus** | `modules/billing/` |
| 13 | Admin UI + Realtime | P19, P20 | Sonnet | `app/(admin)/`, grilla |
| 14 | Observabilidad + Deploy | P21 | Sonnet | Sentry, CI/CD |

> **Resumen**: 🧠 Opus en 6 prompts (P1, P3, P7, P10, P11, P18) — Sonnet en los otros 16.

---

# PROMPTS

---

## 🟩 Fase -1 — Setup de Skills (ANTES de todo)

> **Hito**: Claude Code instalado y abierto en la carpeta del repo.
> **Prerrequisitos**: Node.js 18+, pnpm, Python 3.x (para UI UX Pro Max)

### Pre-P0 — Instalar skills en Claude Code

Ejecutar estos comandos **dentro de Claude Code** (no en la terminal normal):

```
# PASO 1: Instalar Superpowers (metodología de desarrollo)
/plugin install superpowers@claude-plugins-official

# PASO 2: Instalar UI UX Pro Max (inteligencia de diseño)
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill

# PASO 3: Verificar instalación
/help
# Deberías ver: /superpowers:brainstorm, /superpowers:write-plan, /superpowers:execute-plan

# PASO 4 (OPCIONAL): Generar design system base para TurnoGol
# Requiere Python 3.x instalado
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "sports booking management SaaS" --design-system -p "TurnoGol"
```

**NO instalar Caveman todavía.** Se instala después de P2 (primera parada obligatoria).

**Criterio de aceptación**: `/help` muestra los comandos de Superpowers. Claude Code responde con flujo de brainstorming al pedirle que construya algo.

---

## 🟦 Fase 0 — Setup

### P0 — Inicialización del monorepo y entorno local

> **Modelo**: Sonnet — configuración estándar, no requiere razonamiento profundo.
> **Hito**: Repo vacío. Arranque limpio.
> **Contexto**: `@CLAUDE.md` `@docs/doc14_tech_stack.md`

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto: @CLAUDE.md @docs/doc14_tech_stack.md

Objetivo: dejar el repo en estado "pnpm dev funciona y el tsc está en 0 errores".

Tu plan debe cubrir:
1. `package.json` con las dependencias exactas de doc14 §4.1 y §4.2, pnpm como package manager.
2. `tsconfig.json` con strict=true, paths `@/*` → `./src/*`.
3. `next.config.js` con los security headers de doc14 §9.2.
4. `tailwind.config.ts` + `postcss.config.js` con el preset base de shadcn.
5. `drizzle.config.ts` apuntando a `src/shared/db/schema` y migrations a `src/shared/db/migrations/`.
6. `.env.example` con TODAS las env vars requeridas (Supabase URL/keys, MP, Resend, Sentry, DATABASE_URL).
7. Estructura de carpetas EXACTA según doc14 §3.1 (monolito modular). NO creemos aún los módulos; solo la estructura de directorios vacíos con `.gitkeep`.
8. Scripts de `package.json`: `dev`, `build`, `typecheck`, `lint`, `test`, `test:integration`, `test:isolation`, `test:e2e`, `db:push`, `db:migrate`, `db:generate`.
9. `.eslintrc.json`, `.prettierrc`, `.gitignore`.
10. `CLAUDE.md` ya existe — no tocarlo. El archivo `_archive/audits/audit_opus4.7-1.md` también existe, debe quedar en el repo.

NO instales nada aún. Presentá el plan con la lista de archivos y el contenido conceptual. Espero tu OK antes de escribir.

Criterio de aceptación: tras ejecutar, `pnpm install && pnpm typecheck` devuelve 0 errores y el scaffold de carpetas matchea doc14 §3.1 línea por línea.
```

---

## 🟦 Fase 1 — Base de datos y blindaje RLS

> **Esta fase es la más sensible.** Aquí se materializan las tres rondas de auditoría. Cualquier desviación de los hallazgos rompe el modelo.

### P1 — Schema completo, ENUMs, triggers, RLS policies

> 🧠 **Modelo**: **OPUS** — `/model opus` — el prompt más crítico del proyecto. 21 hallazgos, RLS dual, triggers interconectados, 8 archivos SQL. Errores aquí propagan a todo.
> **Hito**: `/clear` previo para contexto limpio. `/memory` para recargar CLAUDE.md.
> **Contexto**: `@CLAUDE.md` `@docs/doc13_database_schema.md` `@docs/doc12_tenant_isolation.md` `@_archive/audits/audit_opus4.7-1.md`

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto cargado:
- @CLAUDE.md (reglas del proyecto)
- @docs/doc13_database_schema.md (schema autoritativo)
- @docs/doc12_tenant_isolation.md (modelo de aislamiento)
- @_archive/audits/audit_opus4.7-1.md (hallazgos de Fase 1)

Objetivo: generar el SQL completo del schema siguiendo EXACTAMENTE doc13 + los 21 hallazgos de Fase 3 (resumidos al final de este prompt). CERO desviaciones.

Archivos a crear en `src/shared/db/migrations/`:
- `001_extensions.sql` — uuid-ossp, btree_gist, pg_trgm
- `002_enums.sql` — todos los ENUMs de doc13 §1 (incluyendo `payment_status` CON `in_process` y `cashflow_type` SIN `expense`)
- `003_global_tables.sql` — plans, tenants, players, staff_users, price_versions, processed_webhooks, system_admins (orden exacto de doc13 §10)
- `004_isolated_tables.sql` — courts, tenant_staff_members, tenant_subscriptions, products, tenant_player_bans, player_tenant_relationships, abonados, bookings, payments (con ALTER para FK circular), cash_flows, daily_cash_closes, notifications, audit_logs
- `005_triggers.sql` — `trigger_set_updated_at`, `enforce_booking_invariants_fn` (unificado — Fix #2 Fase 2), `prevent_duplicate_active_ban` (reemplaza el índice inválido — Fix #10 Fase 2), `validate_notification_recipient` (Fix #19 Fase 3)
- `006_rls_policies.sql` — policies de TODAS las tablas + RLS relacional en `players` y `staff_users` (Fix #5) + policy `player_self_insert` en bookings (Fix #3) + policy `player_own_bans_select` (Fix #7) + policy `player_self_ptr_insert` (Fix #8) + policy `realtime_tenant_select TO authenticated` (Fix #4) + policies de `system_admins` con `app.current_system_admin_id`
- `007_seed_data.sql` — los 3 planes (Predio/Complejo/Estadio) con precios en centavos + price_versions inicial
- `008_revokes.sql` — `REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app` + mismo revoke en `daily_cash_closes`

Además crear `src/shared/db/schema/*.ts` (archivos Drizzle ORM) que reflejen 1:1 el SQL. Re-export todo desde `src/shared/db/schema.ts`.

HALLAZGOS CRÍTICOS A RESPETAR (cualquier violación bloquea el deploy):

🔴 CRÍTICOS DE FASE 3:
1. `courts.status` DEFAULT 'online' (NO 'active' — el ENUM es `('online','offline')`).
2. NO incluir `COMMENT ON INDEX uq_tenant_player_active_ban` — ese índice NO EXISTE. En su lugar: `COMMENT ON FUNCTION prevent_duplicate_active_ban()`.
3. `courts.pricing` JSONB DEFAULT usa estructura `{"rules":[{"days":[...],"from":"...","to":"...","prices":{"60":...,"120":...}}]}` (NO la estructura plana weekday_morning/weekday_afternoon).
4. Listar `system_admins` en el orden de migración (§3.7 de global tables).

🔴 CRÍTICOS DE FASE 2 (verificar que siguen aplicados):
5. `tenant_staff_members.role` DEFAULT 'admin' (NO 'readonly' — el ENUM staff_role solo tiene 'admin').
6. `enforce_booking_invariants` cubre TODOS los estados terminales (no solo 3). Reemplaza los triggers viejos `enforce_booking_immutability` y `enforce_price_snapshot_immutability`.
7. `cash_flows` con `CHECK (type+category)`: income→(booking|product_sale|other), adjustment→(other|no_show_correction). NADA de 'expense'.
8. `daily_cash_closes` tiene `total_adjustments` (NO `total_expense`). REVOKE UPDATE, DELETE.
9. `uq_tenant_player_active_ban` como índice parcial con NOW() NO SE CREA (NOW() no es IMMUTABLE). El trigger `enforce_single_active_ban BEFORE INSERT` hace la validación dinámica.
10. `system_admins` existe con RLS por `app.current_system_admin_id` + MFA fields.
11. `bookings.payment_method` como columna nullable + `chk_booking_payment_consistency CHECK`.

🔴 CRÍTICOS DE FASE 1:
12. `payment_status` ENUM INCLUYE 'in_process' (para CBU/transferencia 48hs).
13. `bookings` tiene policy `player_self_insert` para el flujo B2C.
14. `bookings.realtime_tenant_select` tiene `TO authenticated` (fail-safe).
15. `players` y `staff_users` ENABLE ROW LEVEL SECURITY con policies relacionales.
16. `tenant_player_bans` policy `player_own_bans_select` por `app.current_player_id`.
17. `player_tenant_relationships` policy `player_self_ptr_insert`.

Presentá el plan. Para cada archivo, indicá el número de líneas aproximado y qué secciones de doc13 lo respaldan. Espero OK.

Criterio de aceptación: `pnpm db:push` a Supabase local corre sin error, TODOS los hallazgos arriba se pueden verificar con grep en los .sql, y las 20 tablas (19 negocio + system_admins) quedan creadas con RLS activo.
```

---

### P2 — Tests de aislamiento BLOQUEANTES

> **Modelo**: Sonnet — `/model sonnet` — tests bien definidos en doc16, solo implementar.
> **Hito**: no saltar esta fase. Es la red de seguridad.
> **Contexto**: `@CLAUDE.md` `@docs/doc16_testing_strategy.md` `@docs/doc12_tenant_isolation.md`

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc16_testing_strategy.md (§3.2 — tests bloqueantes)
- @docs/doc12_tenant_isolation.md (§10 — el guardián)

Objetivo: implementar la suite de tests de isolation que BLOQUEA el deploy si falla.

Estructura:
- `tests/helpers/tenant.ts` — `createTestTenant`, `setTenantContext`, `setPlayerContext`, `resetTenantContext`
- `tests/helpers/seed.ts` — `seedIsolationData(tenantId)` que inserta 1 fila en CADA tabla aislada (16 total: 12 RLS puras + `bookings` RLS dual + `player_tenant_relationships` + 2 con RLS relacional `players`/`staff_users`)
- `tests/helpers/factories.ts` — builders con faker para tenant/player/booking/etc.
- `tests/integration/isolation.test.ts` — el test generado automáticamente para las 12 tablas puras + 4 tests específicos para las casos dual/relacional:
  1. Tenant A no lee filas de Tenant B (para cada tabla)
  2. Tenant A no inserta con tenant_id de B
  3. Tenant A no puede UPDATE/DELETE filas de B
  4. Sin contexto seteado → 0 filas (fail-safe verificado)
  5. Player A no ve bookings de Player B
  6. Realtime policy con JWT wrong tenant → 0 filas
  7. Staff de Tenant A no ve emails de staff de Tenant B (Fix #5)
  8. Staff de Tenant A no ve PII de players sin PTR (Fix #5)
  9. Jugador baneado en Tenant A → la verificación detecta el ban (Fix #7)

Scripts de package.json:
- `test:isolation` corre SOLO este archivo
- Se agrega al job obligatorio de CI

Presentá el plan con la lista de archivos y cuántos tests en total. Espero OK.

Criterio de aceptación: `pnpm test:isolation` corre en <30s, 100% verde. Si se comenta cualquier policy RLS crítica en los .sql, al menos 1 test falla.
```

---

**Cierre Fase 1**: `/compact` para preservar la estructura DB + tests aislamiento en memoria comprimida.

---

### 🪨 Post-P2 — Instalar Caveman (ahora que te sentís cómodo)

> **Hito**: tests de aislamiento verdes (parada obligatoria 1 superada).

```
# Instalar Caveman para reducir tokens de salida
claude plugin marketplace add JuliusBrussee/caveman
claude plugin install caveman@caveman

# Activar en modo lite (para ir acostumbrándote)
/caveman lite

# Si querés más brevedad después: /caveman full o /caveman ultra
# Para desactivar: "stop caveman" o "normal mode"
```

**Nota**: Caveman NO afecta al código generado, solo a las explicaciones del agente. El código sigue siendo igual de completo y preciso.

---

## 🟦 Fase 2 — Autenticación y middleware de tenant context

### P3 — Auth + Middleware + SET LOCAL

> 🧠 **Modelo**: **OPUS** — `/model opus` — SET LOCAL multi-tenant, JWT claims cruzados, OAuth callback con resolución de N tenants.
> **Hito**: `/clear` opcional si la fase 1 dejó el contexto saturado.
> **Contexto**: `@CLAUDE.md` `@docs/doc12_tenant_isolation.md` `@docs/doc11_adrs.md` (solo §ADR-002)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc12_tenant_isolation.md (middleware, SET LOCAL, JWT, §4 — §9.4)
- @docs/doc11_adrs.md (ADR-002 — Magic link + OAuth)

Objetivo: construir `src/modules/auth/` y `src/shared/middleware/` completos.

Archivos a crear:
- `src/modules/auth/auth.service.ts` — signInWithMagicLink, verifyMagicLink, getCurrentUser
- `src/modules/auth/auth.middleware.ts` — validación de JWT con Supabase
- `src/shared/middleware/with-auth.ts` — HOF que exige autenticación
- `src/shared/middleware/with-tenant.ts` — HOF que setea `SET LOCAL app.current_tenant_id` para staff
- `src/shared/middleware/with-player.ts` — HOF que setea `SET LOCAL app.current_player_id` para jugador
- `src/shared/middleware/with-role.ts` — HOF que valida rol (v1 solo `admin`)
- `src/shared/middleware/with-pin.ts` — HOF que valida PIN para zonas sensibles (decisión P2.1)
- `src/shared/db/client.ts` — Drizzle client + helper `withTenantContext(tenantId, fn)` que usa TRANSACCIÓN + SET LOCAL
- `src/lib/supabase/server.ts` + `src/lib/supabase/admin.ts` (service role)
- `src/app/api/auth/callback/route.ts` — OAuth/magic-link callback que:
  * Verifica sesión
  * Busca staff_users o crea uno
  * Resuelve `tenant_id` via tenant_staff_members (puede haber N tenants — pantalla de selección)
  * Setea JWT con claim `tenant_id` en `app_metadata`
  * Redirige a wizard o dashboard según estado

REGLAS CRÍTICAS:
- `SET LOCAL` SIEMPRE, nunca `SET` sin LOCAL (doc12 §3.3).
- Para endpoints de jugador: NO setear `app.current_tenant_id`, solo `app.current_player_id` (doc12 §4.1).
- Para endpoints PÚBLICOS del complejo (`/api/public/complex/[slug]`): derivar `tenant_id` del slug y setear `SET LOCAL` temporalmente (doc12 §9.3).
- Nunca usar service role key en endpoints user-facing.

Presentá el plan. Espero OK.

Criterio de aceptación: 
- `pnpm typecheck` verde.
- Test unit: el middleware rechaza requests sin JWT con 401.
- Test integration: tras `withTenantContext(A, () => db.select().from(bookings))`, las policies RLS filtran correctamente.
```

---

**Cierre Fase 2**: `/compact` para guardar la capa auth/middleware.

---

## 🟦 Fase 3 — Tenants, Onboarding y Courts

### P4 — Módulo Tenants + Wizard de onboarding

> **Modelo**: Sonnet — `/model sonnet` — CRUD + wizard de UI con specs claros.
> **Hito**: `/clear`. Arrancamos módulo de negocio.
> **Contexto**: `@CLAUDE.md` `@docs/doc6_entidades.md` (solo Entidad 1 Tenant) `@docs/doc10_onboarding_design.md` `@docs/doc8_user_stories.md` (solo US-ONB-001 a 005)

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto (minimal):
- @CLAUDE.md
- @docs/doc6_entidades.md (leer SOLO §ENTIDAD 1: Tenant)
- @docs/doc10_onboarding_design.md
- @docs/doc8_user_stories.md (leer SOLO US-ONB-001 a US-ONB-005)

Objetivo: `src/modules/tenants/` + wizard de onboarding completo (4 pasos, Aha Moment).

Archivos:
- `src/modules/tenants/tenant.service.ts` — CRUD, `createTenantWithTrial`, `generateUniqueSlug` (sanitización + sufijo numérico)
- `src/modules/tenants/tenant.schema.ts` — Zod schemas para create/update/settings
- `src/modules/tenants/tenant.types.ts`
- `src/app/api/tenant/route.ts` — GET (datos del complejo), PATCH
- `src/app/api/tenant/settings/route.ts` — PATCH settings (con with-pin para zonas sensibles)
- `src/app/(admin)/onboarding/page.tsx` — wizard shell (4 pasos, progress bar, guardado automático en DB)
- `src/app/(admin)/onboarding/components/StepIdentity.tsx` — paso 1: nombre/dirección/ciudad/provincia → crea tenant
- `src/app/(admin)/onboarding/components/StepCourts.tsx` — paso 2: primera cancha (delegado a módulo courts — lo hace P6)
- `src/app/(admin)/onboarding/components/StepSchedule.tsx` — paso 3: opening_hours + closed_dates
- `src/app/(admin)/onboarding/components/StepPayments.tsx` — paso 4: conectar MP (OAuth) o skip
- Server Actions para cada paso (NO route handlers — regla CLAUDE.md).

REGLAS CRÍTICAS:
- Tenant arranca en status='trialing', trial_ends_at = NOW() + 30 días (doc4 §3).
- El `admin_pin` se setea hasheado con bcrypt en `tenant.settings.admin_pin` (decisión P2.1).
- El wizard guarda progreso en DB por step, NUNCA en localStorage (US-ONB-002).
- `slug` se genera desde `name` con slugify, y si colisiona agrega sufijo numérico.
- OAuth MP: redirige a MP, recibe `access_token` + `refresh_token`, los encripta at-rest antes de guardar en tenants.mp_access_token/mp_refresh_token.

Presentá el plan. Espero OK.

Criterio de aceptación:
- `pnpm typecheck` verde.
- `pnpm test:unit` incluye tests de `generateUniqueSlug` (happy + collision + caracteres especiales).
- E2E Playwright (smoke): registro → wizard paso 1 → paso 2 → paso 3 → paso 4 skip MP → dashboard con checklist.
```

---

### P5 — Ruta pública del complejo (`turnogol.com.ar/[slug]`)

> **Modelo**: Sonnet — Server Component + queries simples.
> **Contexto**: `@docs/doc12_tenant_isolation.md` (§9.3) `@docs/doc8_user_stories.md` (solo US-ONB-005)
> **🎨 Skill activa**: UI UX Pro Max — se activa automáticamente para el diseño de la página pública. Si generaste `design-system/MASTER.md`, mencionalo en el prompt para que Claude lo use como referencia visual.

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc12_tenant_isolation.md (SOLO §9.3 — página pública)
- @docs/doc8_user_stories.md (SOLO US-ONB-005)

Objetivo: página pública del complejo que un jugador anónimo puede ver.

Archivos:
- `src/app/(public)/[slug]/page.tsx` — Server Component que:
  1. Busca tenant por slug (query SIN RLS — tenants es global)
  2. Setea SET LOCAL app.current_tenant_id con el tenant_id resuelto
  3. Lee courts con status='online' + grilla de disponibilidad del día
  4. Renderiza con <Suspense> para la grilla
- `src/app/api/public/complex/[slug]/route.ts` — GET público (sin auth) para grilla AJAX
- `src/app/api/public/availability/route.ts` — GET con filtros de fecha/court
- Edge cases de US-ONB-005:
  * Tenant status='suspended' o 'churned' → "Este complejo no está disponible temporalmente."
  * Sin canchas activas → muestra info sin grilla
  * settings.allow_online_booking=false → grilla visible pero botón dice "Contactar al complejo"
  * Slug inexistente → 404 amigable

REGLA CRÍTICA:
- El handler SETEA tenant context derivado del slug (nunca del JWT, porque no hay JWT).
- Retorna SOLO campos públicos del tenant: name, slug, address, city, phone, opening_hours, photos. NO emails de contacto, NO mp_* tokens, NO admin_pin.

Presentá el plan. Espero OK.

Criterio de aceptación: E2E: abrir `/complejo-test` sin cookies muestra la grilla con los slots del día. Tenant con status='churned' muestra el mensaje correcto.
```

---

### P6 — Módulo Courts + CRUD

> **Modelo**: Sonnet — CRUD + `calculatePrice` con lógica clara.
> **Contexto**: `@docs/doc6_entidades.md` (solo Entidad 2 Court) `@docs/doc8_user_stories.md` (US-ADM-001) `@docs/doc15_api_contracts.md` (§5.2)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc6_entidades.md (SOLO §ENTIDAD 2: Court)
- @docs/doc8_user_stories.md (SOLO US-ADM-001)
- @docs/doc15_api_contracts.md (SOLO §5.2 Courts API)

Objetivo: `src/modules/courts/` + UI admin de canchas.

Archivos:
- `src/modules/courts/court.service.ts` — CRUD, `toggleStatus(id, 'online'|'offline')`, `calculatePrice(pricing, datetime, duration)` (evalúa las `rules[]`), `validatePricingRulesCoverage(rules, openingHours)` (Court Invariante 3).
- `src/modules/courts/court.schema.ts` — Zod para la estructura `{rules:[{days:number[],from:string,to:string,prices:{"60":number,"120":number}}]}`
- `src/app/api/courts/route.ts` + `src/app/api/courts/[id]/route.ts` + `src/app/api/courts/[id]/status/route.ts`
- `src/app/(admin)/canchas/page.tsx` + form de creación/edición
- Plan limit enforcement: al crear cancha, verificar `tenant.plan.max_courts` y devolver `403 PLAN_LIMIT_EXCEEDED` con `{limit, current, upgrade_to}` (doc15 §5.2).

REGLAS CRÍTICAS (hallazgos Fase 3):
- `status` SIEMPRE se valida contra ENUM `('online','offline')`. Jamás aceptar 'active' ni 'maintenance' ni 'inactive'. Si el cliente manda un valor distinto → 422.
- `pricing` usa EXCLUSIVAMENTE la estructura `rules[]` (P6.3). Rechazar payloads con formato viejo plano.
- `calculatePrice` debe manejar durations 60 y 120 minutos (NO 90 — decisión P5.x).
- Reservas existentes se mantienen cuando la cancha pasa a offline; solo se bloquean reservas NUEVAS.

Presentá el plan. Espero OK.

Criterio de aceptación:
- `pnpm test:unit` para `calculatePrice` cubre: weekday mañana 60min, weekend noche 120min, hora en borde de regla, duración no soportada.
- `pnpm test:integration` verifica: crear cancha → status='online'; plan Predio con 3 canchas rechaza la 4ta con 403.
```

---

**Cierre Fase 3**: `/compact`.

---

## 🟦 Fase 4 — Bookings (el módulo más crítico)

### P7 — Módulo Bookings: schema service, state machine, pricing snapshot

> 🧠 **Modelo**: **OPUS** — `/model opus` — state machine + concurrencia + `transitionFromPendingPayment` + exclusion constraint. El corazón del sistema.
> **Hito**: `/clear` obligatorio. Este es el corazón del sistema.
> **Contexto**: `@CLAUDE.md` `@docs/doc6_entidades.md` (SOLO §ENTIDAD 3 Booking) `@docs/doc7_flujos_e2e.md` (SOLO Flujos 2, 3 y 4) `@_archive/audits/audit_opus4.7-1.md`

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto cargado QUIRÚRGICAMENTE:
- @CLAUDE.md
- @docs/doc6_entidades.md (SOLO Entidad 3: Booking — leer state machine, invariantes, transiciones)
- @docs/doc7_flujos_e2e.md (SOLO Flujos 2, 3 y 4)
- @_archive/audits/audit_opus4.7-1.md

Objetivo: `src/modules/bookings/` sin cancelación aún (eso va en P12) y sin pagos integrados aún (P10-11).

Archivos:
- `src/modules/bookings/booking.service.ts` — `createManualBooking`, `createOnlineBooking`, `completeBooking`, `markNoShow`, `expirePendingBooking`, `getAvailableSlots`
- `src/modules/bookings/booking.state-machine.ts` — matriz de transiciones válidas + función `canTransition(from, to, context)`
- `src/modules/bookings/booking.concurrency.ts` — `transitionFromPendingPayment(bookingId, newStatus, db)` con UPDATE CONDICIONAL + chequeo de rowCount (Fix #9)
- `src/modules/bookings/booking.schema.ts` — Zod
- `src/modules/bookings/booking.types.ts`

PILAR C — State machine de bookings (hallazgos que se deben respetar):

1. **Concurrencia (Fix #9 — Fase 1)**: TODA transición desde `pending_payment` usa el patrón:
   ```typescript
   const result = await tx.execute(sql`
     UPDATE bookings SET status = ${newStatus}, updated_at = NOW()
     WHERE id = ${bookingId} AND status = 'pending_payment'
     RETURNING id
   `);
   if (result.rowCount === 0) {
     // Otro worker ganó la carrera. NO disparar efectos secundarios.
     return { won: false };
   }
   // rowCount === 1 → disparar emails, cashflow, audit.
   ```
   **Regla inviolable**: el webhook handler de MP y el job de expiración DEBEN implementarlo. Sin excepciones.

2. **Inmutabilidad (Fix #2 — Fase 2)**: el trigger `enforce_booking_invariants` en DB ya valida:
   - `price_snapshot` nunca cambia (cualquier estado)
   - estados terminales solo aceptan cambio en `notes_internal`
   El service NO debe intentar modificar `price_snapshot` bajo ninguna circunstancia.

3. **Concurrencia doble booking**: `SELECT FOR UPDATE` + verificación dentro de transacción + exclusion constraint `no_overlapping_bookings` como safety net. Patrón del doc14 §5.1 pero CON `court.status !== 'online'` (NO 'active' — Fix #4 Fase 3).

4. **Creación online (Flujo 2)**:
   - Status arranca en `pending_payment` (timer 15min, 48hs si MP `in_process`).
   - `price_snapshot` se captura DENTRO de la transacción atómica, no del modal previo.
   - Crear PTR via trigger AFTER INSERT o en el mismo service (P14 cubre PTR completo).

5. **Creación manual (Flujo 3)**:
   - Status arranca directamente en `confirmed`.
   - `created_by_staff` = staff_user_id.
   - Si el admin no usa `player_id`, popular `guest_name` + `guest_phone`.

6. **Auto-complete (Flujo 4D)**: job cron a los 30 min post time_end → status='completed' (NO 'no_show' — eso requiere acción humana).

Presentá el plan. Espero OK.

Criterio de aceptación:
- `pnpm test:unit` para state machine: cubre TODAS las transiciones de doc6 §3 (matriz completa).
- `pnpm test:integration` incluye test de race condition: 2 workers concurrentes intentan transicionar el mismo booking desde pending_payment → solo 1 gana, solo 1 dispara side effects.
- `pnpm test:integration` para exclusion constraint: intentar 2 bookings overlap → el 2do falla con `no_overlapping_bookings`.
```

---

### P8 — API handlers de Bookings

> **Modelo**: Sonnet — `/model sonnet` — endpoints que delegan al service de P7.
> **Contexto**: `@docs/doc15_api_contracts.md` (§5.1) `@docs/doc8_user_stories.md` (US-RES-001 a 007)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc15_api_contracts.md (SOLO §5.1 Bookings)
- @docs/doc8_user_stories.md (SOLO US-RES-001 a US-RES-007)

Objetivo: endpoints REST + Server Actions del admin para bookings.

Archivos:
- `src/app/api/bookings/route.ts` — GET (lista con filtros date/court_id/status, paginación cursor), POST (crear manual)
- `src/app/api/bookings/[id]/route.ts` — GET (detalle), PATCH (actualizar notas + estado con validación de transiciones)
- `src/app/api/bookings/[id]/complete/route.ts` — POST
- `src/app/api/bookings/[id]/no-show/route.ts` — POST (con evaluación de no_show_penalty)
- `src/app/api/player/bookings/route.ts` — POST (endpoint del JUGADOR, flujo online, con player_self_insert policy)
- Server Actions en `src/app/(admin)/reservas/actions.ts` — para la grilla del admin

REGLAS CRÍTICAS:
- Endpoint `POST /api/bookings`: runs con `with-tenant` → seteo automático de `app.current_tenant_id`.
- Endpoint `POST /api/player/bookings`: runs con `with-player` → solo setea `app.current_player_id`. Para insertar booking, el handler DEBE popular `tenant_id` explícitamente (derivado de slug validado) para que matchee `player_self_insert WITH CHECK`.
- 409 SLOT_UNAVAILABLE incluye `suggested_alternatives[]` (doc15 §5.1).
- 422 BUSINESS_RULE_VIOLATION: fecha pasada, court.status='offline', player baneado.
- Todos los side effects (email, cashflow, audit) van en la MISMA transacción via pg-boss `boss.send(..., { db: tx })`.

Presentá el plan. Espero OK.

Criterio de aceptación:
- E2E: admin hace click en slot libre → modal → confirma → booking aparece en grilla (status='confirmed').
- Test integration: player reserva online con contexto de jugador → booking queda en pending_payment + PTR creada.
```

---

### P9 — Grilla admin + Realtime

> **Modelo**: Sonnet — componentes React + Supabase Realtime.
> **Contexto**: `@docs/doc6_entidades.md` (SOLO lookup de "Realtime") `@docs/doc8_user_stories.md` (US-RES-001) `@docs/doc20_design_system.md` (solo tokens)
> **🎨 Skill activa**: UI UX Pro Max — la grilla es el componente visual más crítico del admin. Agregar al prompt: `Leé design-system/MASTER.md y doc20 para los tokens visuales. La grilla debe sentirse premium y responsive.`

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc8_user_stories.md (SOLO US-RES-001)
- @docs/doc20_design_system.md (leer tokens de color + spacing)

Objetivo: grilla del admin con actualización en tiempo real.

Archivos:
- `src/app/(admin)/grilla/page.tsx` — Server Component que carga data inicial
- `src/components/booking/booking-grid.tsx` — Client Component con Supabase Realtime subscription
- `src/components/booking/booking-card.tsx`
- `src/components/booking/booking-form-modal.tsx`

REGLAS CRÍTICAS:
- El Realtime subscription se hace con cliente Supabase que usa el JWT del staff (rol `authenticated`).
- La policy `realtime_tenant_select TO authenticated` (Fix #4) filtra por `app_metadata.tenant_id` del JWT — NO por `current_setting`. Esto es intencional.
- El backend (rol `turnogol_app`) sigue exclusivamente bajo policies de `current_setting` para fail-safe.
- Fallback a polling cada 30s si Realtime no conecta (doc11 ADR-006).

Presentá el plan. Espero OK.

Criterio de aceptación: abrir 2 browsers, crear reserva en uno, se ve en el otro en <5s.
```

---

**Cierre Fase 4**: `/compact`. Preservar el patrón del Pilar C (state machine + concurrencia).

---

## 🟦 Fase 5 — Payments y MercadoPago

### P10 — Gateway MP + schemas + servicio de pagos

> 🧠 **Modelo**: **OPUS** — `/model opus` — idempotencia, `in_process`, refunds, consistency checks. Pilar B completo.
> **Hito**: `/clear`. Dinero real entra al sistema.
> **Contexto**: `@CLAUDE.md` `@docs/doc11_adrs.md` (SOLO ADR-004) `@docs/doc6_entidades.md` (SOLO Entidad 8 Payment) `@_archive/audits/audit_opus4.7-1.md`

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc11_adrs.md (SOLO ADR-004 — MercadoPago)
- @docs/doc6_entidades.md (SOLO Entidad 8: Payment)
- @_archive/audits/audit_opus4.7-1.md (hallazgos #1 `in_process` y #13 consistencia payment_method)

Objetivo: `src/modules/payments/` + gateway abstracto.

Archivos:
- `src/modules/payments/mp-gateway.ts` — interfaz `PaymentGateway` (createPreference, processWebhook, createRefund, getPaymentStatus)
- `src/modules/payments/mp-gateway.implementation.ts` — implementación MP real con OAuth por complejo (el access_token viene de `tenants.mp_access_token` desencriptado)
- `src/lib/mercadopago.ts` — SDK config
- `src/modules/payments/payment.service.ts` — `createDepositPayment(bookingId)`, `processPaymentApproved`, `createRefund(paymentId, amount)`, `handleInProcess(paymentId)` (extiende timer del booking a 48hs)
- `src/modules/payments/payment.schema.ts`

PILAR B — Idempotencia de pagos (reglas inviolables):

1. **`payments.mp_payment_id` UNIQUE**: al recibir webhook, primer paso es `INSERT INTO processed_webhooks (mp_event_id, ...) ON CONFLICT DO NOTHING RETURNING id`. Si no inserta → ya procesado → return 200 sin side effects.

2. **Transición atómica**: aprobación de pago → `transitionFromPendingPayment(bookingId, 'confirmed', db)` del Pilar C. Solo si rowCount=1 se envía email de confirmación.

3. **Estado `in_process` (Fix #1 Fase 1)**: cuando MP devuelve status='in_process' (CBU/transferencia), NO confirmar booking. Actualizar `payment.status = 'in_process'` y programar nuevo job de expiración a las 48hs en vez de 15min. El booking sigue en `pending_payment` con timer extendido.

4. **Refunds**: NUEVA fila en payments con `type='refund'`, `amount=original_amount`. NO editar el payment original (inmutabilidad post-aprobación — Payment Invariante 1).

5. **Reembolsos NO generan cash_flow** (hallazgo #9 Fase 3): la seña nunca entró a la caja física; MP procesa refund directo. Solo se registra en `payments`.

6. **Consistency booking.payment_method + payment_id (Fix #13 Fase 2)**: el service que crea el payment de MP actualiza el booking con `payment_method='mercadopago' + payment_id=<nuevo_payment_id>` en la MISMA transacción. El CHECK constraint lo valida.

Presentá el plan. Espero OK.

Criterio de aceptación:
- `pnpm test:unit` para gateway mock: createPreference devuelve init_point + preference_id.
- `pnpm test:integration` simula webhook duplicado → segundo webhook NO dispara side effects.
- `pnpm test:integration`: flujo in_process → booking extiende timer, luego status='approved' → booking se confirma.
```

---

### P11 — Webhook handler de MercadoPago

> 🧠 **Modelo**: **OPUS** — `/model opus` — webhooks fuera de orden, race conditions, audit de pagos tardíos.
> **Contexto**: `@docs/doc15_api_contracts.md` (webhooks) `@docs/doc11_adrs.md` (SOLO ADR-004) `@_archive/audits/audit_opus4.7-1.md`

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc15_api_contracts.md (SOLO §ruta /api/webhooks/mercadopago)
- @_archive/audits/audit_opus4.7-1.md

Objetivo: endpoint de webhook que recibe notificaciones de MP.

Archivos:
- `src/app/api/webhooks/mercadopago/route.ts` — POST handler, valida firma, encola job
- `src/shared/jobs/workers/process-mp-webhook.worker.ts` — consumer pg-boss que procesa el payload
- `src/modules/payments/mp-webhook.handler.ts` — la lógica

REGLAS CRÍTICAS:
- Validar header `X-Webhook-Secret` o firma HMAC de MP.
- Idempotencia: `INSERT INTO processed_webhooks ON CONFLICT DO NOTHING`. Si ya existe → 200 OK sin procesar.
- Event types soportados: `payment.created`, `payment.updated`, `subscription.preapproval`, `subscription.authorized_payment`.
- Para `payment.approved` de una seña → `transitionFromPendingPayment(bookingId, 'confirmed')` (Pilar C).
- Para `payment.refunded` → crear payment tipo 'refund', NO cashflow.
- Para `payment.in_process` → extender timer, NO confirmar.
- Webhooks fuera de orden: si llega `payment.approved` pero el booking ya está en `expired` (porque expiró primero), registrar `booking.late_payment_attempt` en audit_logs y NO resucitar el booking.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: enviar mismo webhook 3 veces → 1 sola confirmación de booking.
- Test integration: booking ya expirado + webhook approved → booking sigue expired, audit log registrado.
- Test unit: firma inválida → 401.
```

---

**Cierre Fase 5**: `/compact`.

---

## 🟦 Fase 6 — Cancelaciones

### P12 — Las 4 variantes de cancelación + refunds

> **Modelo**: Sonnet — `/model sonnet` — 4 variantes claras en doc7, lógica derivada de P7+P10.
> **Contexto**: `@docs/doc7_flujos_e2e.md` (SOLO Flujo 4) `@docs/doc8_user_stories.md` (US-CAN-001 a 004)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc7_flujos_e2e.md (SOLO FLUJO 4 completo — variantes A/B/C/D)
- @docs/doc8_user_stories.md (SOLO US-CAN-001 a US-CAN-004)

Objetivo: cancelación (jugador + admin, en plazo + fuera de plazo + no-show).

Archivos:
- `src/modules/bookings/booking.cancellation.ts` — `cancelByPlayer(bookingId, reason)`, `cancelByAdmin(bookingId, reason, shouldRefund)`
- `src/app/api/bookings/[id]/cancel/route.ts` — POST (admin)
- `src/app/api/player/bookings/[id]/cancel/route.ts` — POST (jugador)
- Server Actions para UI admin y UI del jugador

REGLAS CRÍTICAS:
- Política evaluada: `NOW() < booking.date + booking.time_start - tenant.settings.cancellation_policy.hours_before`.
- En plazo + deposit_status='paid' → crear refund en MP + payment tipo 'refund' + deposit_status='refunded'. **NO CREAR CASHFLOW** (hallazgo #9 Fase 3).
- Fuera de plazo → deposit_status='captured', sin refund. **NO CREAR CASHFLOW 'captured'** — esto ya es income natural, no se duplica.
- No-show penalty: ban automático si config.no_show_penalty.type='ban_days' + player acumula threshold no-shows → INSERT en `tenant_player_bans` (el trigger `enforce_single_active_ban` valida).
- Correcciones post-cierre de caja: SI admin cambia `completed → no_show` después de cerrar caja → `cash_flows` con type='adjustment', category='no_show_correction'.
- No se puede cancelar un booking en estado terminal (`completed`, `no_show`, `expired`, `canceled_*`) — el trigger `enforce_booking_invariants` lo valida en DB, el service lo valida primero.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: cada variante (A/B/C/D) termina en el estado correcto + side effects correctos.
- Test integration: cancelación fuera de plazo NO crea cashflow. Cancelación en plazo crea payment tipo 'refund' (sin cashflow).
- Test integration: 3 no-shows → ban automático. 2do ban tras expiración del primero → trigger lo permite.
```

---

## 🟦 Fase 7 — Cash Flows y Cierre de caja

### P13 — Módulo CashFlow + DailyCashClose

> **Modelo**: Sonnet — reglas claras post-auditoría, sin complejidad concurrente.
> **Contexto**: `@docs/doc6_entidades.md` (Entidades 9 y 10) `@docs/doc7_flujos_e2e.md` (Flujo 6) `@docs/doc8_user_stories.md` (US-CAJ-001 a 005)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc6_entidades.md (SOLO Entidades 9 CashFlow y 10 DailyCashClose)
- @docs/doc7_flujos_e2e.md (SOLO FLUJO 6)
- @docs/doc8_user_stories.md (SOLO US-CAJ-001 a US-CAJ-005)

Objetivo: `src/modules/cashflow/` + cierre de caja diario.

REGLAS CRÍTICAS (post-auditoría):
- Solo tipos `income` y `adjustment`. Prohibido `expense` (no existe en ENUM). Cualquier request con type='expense' → 422.
- Categorías permitidas: income→booking|product_sale|other, adjustment→other|no_show_correction. Enforced por CHECK constraint — el service valida primero.
- Vista de caja muestra "total ingresos + total ajustes + balance" (NO "total egresos" — hallazgo #11 Fase 3).
- Reembolsos NO aparecen en cashflow (viven en payments).
- DailyCashClose es INMUTABLE post-close. El rol turnogol_app tiene REVOKE UPDATE/DELETE — cualquier intento va a fallar en DB.
- `uq_daily_close_per_tenant UNIQUE(tenant_id, date)` previene duplicados.
- Si admin quiere reabrir caja cerrada: NO se permite. Correcciones = nuevos cashflows compensatorios (adjustment).

Archivos:
- `src/modules/cashflow/cashflow.service.ts`
- `src/modules/cashflow/daily-close.service.ts`
- `src/app/api/cash-flows/route.ts` + `/summary/route.ts`
- `src/app/(admin)/caja/page.tsx`

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test unit: `type='expense'` rechazado con 422.
- Test integration: cerrar caja con movimientos → daily_cash_close creado + intentar insertar cashflow de esa fecha falla.
- Test integration: reembolso MP NO crea fila en cash_flows.
```

---

**Cierre Fase 7**: `/compact`.

---

## 🟦 Fase 8 — Abonados y PTR

### P14 — Abonados + Player Tenant Relationships

> **Modelo**: Sonnet — generación rolling + PTR idempotente, lógica directa.
> **Hito**: `/clear`.
> **Contexto**: `@CLAUDE.md` `@docs/doc6_entidades.md` (Entidades 4 Abonado, 6 PTR) `@docs/doc7_flujos_e2e.md` (Flujo 5) `@docs/doc8_user_stories.md` (US-ABO-001 a 004)

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc6_entidades.md (SOLO Entidades 4 y 6)
- @docs/doc7_flujos_e2e.md (SOLO FLUJO 5)
- @docs/doc8_user_stories.md (SOLO US-ABO-001 a 004)

Objetivo: turnos fijos + relación cross-tenant del jugador.

Archivos:
- `src/modules/abonados/abonado.service.ts`
- `src/modules/abonados/slot-generator.ts` — genera N semanas de bookings futuros con type='fixed'
- `src/shared/jobs/workers/generate-abonado-slots.worker.ts` — cron diario 03:00 ART, genera +4 semanas si quedan <4
- `src/modules/relationships/ptr.service.ts` — `ensurePTR(playerId, tenantId)` (idempotente)
- `src/app/api/abonados/*` + UI admin

REGLAS CRÍTICAS:
- PTR se crea en la primera reserva de un jugador en un complejo. Para el flujo del jugador (sin `app.current_tenant_id` seteado), la policy `player_self_ptr_insert` (Fix #8) permite el INSERT populando `tenant_id` explícitamente.
- Exclusion constraint `no_overlapping_abonados` previene 2 abonados en el mismo slot.
- Pago del abonado es 100% MANUAL en v1 (no MP). Solo `contact_name`, `contact_phone`, `price_per_session`, `monthly_price`.
- Generación rolling: si tenant.status='suspended' → saltear.
- Si se cancela abonado desde fecha X → eliminar bookings con type='fixed' posteriores a X. Las pasadas se mantienen.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: crear abonado → 8 bookings type='fixed' en grilla.
- Test integration: job rolling con abonado que tiene 3 semanas futuras → genera 4 más.
- Test integration: primera reserva online → PTR creada por el jugador.
```

---

## 🟦 Fase 9 — App del jugador

### P15 — Player auth, mis reservas, perfil

> **Modelo**: Sonnet — `/model sonnet` — UI mobile + queries cross-tenant simples.
> **Contexto**: `@docs/doc8_user_stories.md` (US-JUG-001 a 004) `@docs/doc12_tenant_isolation.md` (§7 — RLS jugador)
> **🎨 Skill activa**: UI UX Pro Max — la app del jugador es mobile-first. Agregar al prompt: `Leé design-system/MASTER.md. La app del jugador debe ser mobile-first con diseño premium. Priorizá usabilidad táctil y tiempos de carga.`

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc8_user_stories.md (SOLO US-JUG-001 a 004)
- @docs/doc12_tenant_isolation.md (SOLO §7 — queries del jugador)

Objetivo: app del jugador (/mis-reservas, /perfil).

Archivos:
- `src/app/(player)/layout.tsx`
- `src/app/(player)/mis-reservas/page.tsx` — cross-tenant (jugador ve sus bookings en N complejos)
- `src/app/(player)/perfil/page.tsx`
- `src/app/api/player/bookings/route.ts` (GET — lista propia), `/[id]/route.ts` (GET, cancel)
- `src/app/api/player/profile/route.ts`

REGLAS CRÍTICAS:
- Middleware `with-player` setea SOLO `app.current_player_id`.
- Query de "mis reservas": `SELECT * FROM bookings WHERE player_id = $1` sin filtro de tenant (policy `player_own_bookings_select` autoriza).
- Ley 26.061 + Ley 25.326: al registrarse, jugador acepta TyC → `players.agreed_to_terms_at = NOW()`.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: jugador A registrado → ve SUS bookings en 2 complejos distintos, NO ve bookings de jugador B.
- E2E: jugador loguea con magic link → ve /mis-reservas → cancelar reserva en plazo → refund procesado.
```

---

### P16 — Verificación de bans en flujo de reserva

> **Modelo**: Sonnet — `/model sonnet` — verificación de bans, lógica directa.
> **Contexto**: `@docs/doc13_database_schema.md` (SOLO §3.11 tenant_player_bans) `@_archive/audits/audit_opus4.7-1.md` (Fix #7)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc13_database_schema.md (SOLO §3.11)
- @_archive/audits/audit_opus4.7-1.md (Fix #7 — verificación de ban en contexto de jugador)

Objetivo: que el endpoint POST /api/player/bookings rechace correctamente bans globales y per-tenant.

Archivos:
- `src/modules/bans/ban.service.ts` — `checkPlayerBanned(playerId, tenantId)` retorna { bannedGlobal, bannedTenant, reason, until }
- Integración en `bookingService.createOnlineBooking`

REGLAS CRÍTICAS (Fix #7):
- El endpoint del jugador corre con `app.current_player_id` seteado (sin tenant_id).
- Para verificar ban:
  1. Global: `SELECT status FROM players WHERE id = $playerId` — funciona porque policy `player_update_self` o `staff_can_see_related_players` OR lo permite.
  2. Per-tenant: `SELECT * FROM tenant_player_bans WHERE player_id = $playerId AND tenant_id = $tenantId AND (banned_until IS NULL OR banned_until > NOW())` — funciona gracias a policy `player_own_bans_select` (Fix #7).
- Si baneado → NO crear booking, devolver 403 con motivo + until.
- El trigger `enforce_single_active_ban` es la red de seguridad final en DB.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: jugador con ban vigente en tenant A intenta reservar en tenant A → 403 sin crear booking.
- Test integration: jugador con ban expirado en tenant A → puede reservar.
- Test integration: jugador con status='banned' global → rechazado en TODO tenant.
```

---

**Cierre Fase 9**: `/compact`.

---

## 🟦 Fase 10 — Notificaciones y background jobs

### P17 — Resend, templates, pg-boss workers

> **Modelo**: Sonnet — `/model sonnet` — pg-boss workers + templates, bien definido.
> **Hito**: `/clear`.
> **Contexto**: `@CLAUDE.md` `@docs/doc11_adrs.md` (ADR-003 y ADR-005) `@docs/doc13_database_schema.md` (SOLO §3.11 notifications)

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc11_adrs.md (SOLO ADR-003 Resend + ADR-005 pg-boss)
- @docs/doc13_database_schema.md (SOLO §3.11 notifications)

Objetivo: pg-boss + Resend + todas las notificaciones de v1.

Archivos:
- `src/shared/jobs/boss.ts` — pg-boss instance
- `src/shared/jobs/definitions.ts` — queue definitions + retry config (3 intentos con backoff exponencial)
- Workers en `src/shared/jobs/workers/`:
  * `send-email.worker.ts`
  * `expire-trials.worker.ts`
  * `auto-complete-bookings.worker.ts` (30 min post time_end → completed)
  * `generate-abonado-slots.worker.ts` (ya creado en P14)
  * `booking-reminder.worker.ts` (recordatorio 24hs antes)
  * `dunning-retry.worker.ts` (P18)
  * `data-retention-cleanup.worker.ts` (P18)
- `src/modules/notifications/notification.service.ts` — `enqueueNotification(recipient, template, data)`
- `src/modules/notifications/email.provider.ts` — interfaz + implementación Resend
- `src/modules/notifications/templates/*` — 10+ templates (booking_confirmed, booking_canceled, trial_day_N, dunning_N, etc.)

REGLAS CRÍTICAS (hallazgo #19 Fase 3):
- El INSERT en `notifications` tiene trigger de validación que verifica `recipient_type` coincide con la tabla destino (player o staff). Service debe respetar.
- pg-boss corre en proceso SEPARADO (no en Vercel serverless — doc14 §8 nota sobre Vercel).
- Retry policy: exponential backoff, max 3 intentos. Si falla: `notifications.status='failed'` + `last_error`.

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: enqueue notification → worker procesa → Resend API mock llamado → `sent_at` poblado.
- Test integration: Resend API falla → retry 3 veces → `status='failed'`.
- Test unit: validator de recipient rechaza `recipient_type='player' + recipient_id=<staff_user_id>`.
```

---

## 🟦 Fase 11 — Billing SaaS y dunning

### P18 — Suscripciones MP + dunning + lifecycle tenant

> **Modelo**: **OPUS** — `/model opus` — state machine de 8 estados, prorrateo, data retention, lógica de negocio compleja.
> **Contexto**: `@CLAUDE.md` `@docs/doc4_monetizacion.md` `@docs/doc8_user_stories.md` (US-SAS-001 a 005)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @CLAUDE.md
- @docs/doc4_monetizacion.md (lifecycle + dunning completos)
- @docs/doc8_user_stories.md (SOLO US-SAS-001 a 005)

Objetivo: `src/modules/billing/` + lifecycle tenant completo.

Archivos:
- `src/modules/billing/billing.service.ts` — subscribe, upgrade (con prorrateo), downgrade (schedule), cancel
- `src/modules/billing/dunning.service.ts` — state machine trial→active→past_due→suspended→blocked→churned→deleted
- `src/modules/billing/lifecycle.service.ts` — transiciones automáticas
- Worker `dunning-retry.worker.ts` — reintentos día 0, 2, 5
- Worker `data-retention-cleanup.worker.ts` — elimina tenants churned → deleted a día 97 (doc18 privacy)
- `src/app/api/billing/*` — 6 endpoints

REGLAS CRÍTICAS:
- Preapproval en MP para suscripción recurrente. Webhook `subscription.authorized_payment` → `current_period_end` extendido.
- Dunning: fallo día 0 → past_due + email + retry; día 2 → retry + email; día 5 → último retry + email; día 7 → suspended (admin r/o, jugadores siguen viendo reservas); día 14 → blocked; día 90 → churned; día 97 → deleted + wipe de datos (Ley 25.326 derecho al olvido).
- Durante suspended: jugadores siguen accediendo a sus reservas existentes pero NO se generan nuevas instancias de abonados (doc4 §2).
- Prorrateo en upgrade: calcular diferencia × días restantes, cobrar vía MP immediate.
- Downgrade: schedule para fin de período (no inmediato).

Presentá el plan. Espero OK.

Criterio de aceptación:
- Test integration: 3 cobros fallidos consecutivos → tenant en blocked.
- Test integration: upgrade mid-period → prorrateo correcto cobrado.
- Test unit: cada transición del lifecycle respeta doc4 §2.
```

---

**Cierre Fase 11**: `/compact`.

---

## 🟦 Fase 12 — Admin UI final y Realtime

### P19 — Dashboard admin + checklist onboarding

> **Hito**: `/clear`.
> **Contexto**: `@docs/doc8_user_stories.md` (US-ONB-003) `@docs/doc20_design_system.md`
> **🎨 Skill activa**: UI UX Pro Max — el dashboard es la cara principal del admin. Agregar al prompt: `Leé design-system/MASTER.md y doc20. El dashboard debe sentirse como un SaaS premium moderno. Usá los tokens de color, tipografía y spacing definidos.`

```
/clear
/memory

Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc8_user_stories.md (SOLO US-ONB-003 + US-ADM-* que falten)
- @docs/doc20_design_system.md

Objetivo: dashboard admin completo.

Archivos:
- `src/app/(admin)/dashboard/page.tsx` — checklist de onboarding + métricas del día (bookings hoy, revenue hoy, abonados activos)
- `src/app/(admin)/layout.tsx` — sidebar + header + banner de trial/past_due
- `src/app/(admin)/staff/page.tsx` — CRUD staff con validación "al menos 1 admin"
- `src/app/(admin)/settings/*` — polichas de reserva, seña, horarios, PIN
- `src/components/layout/admin-sidebar.tsx`, `admin-header.tsx`
- Banners de estado: trial day N, past_due, service degraded (doc17 §8.2)

REGLAS CRÍTICAS:
- Zonas sensibles (precios, suscripción, configuración, desactivar canchas, reportes) detrás de `with-pin` middleware.
- Banner de trial muestra días restantes y CTA "Elegir plan".
- Banner de past_due muestra "Tu pago falló, regularizá en X días".

Presentá el plan. Espero OK.

Criterio de aceptación: E2E tras P4+P19 → registro → onboarding → dashboard → checklist visible → todos los ítems cliqueables.
```

---

### P20 — Reportes básicos

> **Modelo**: Sonnet — queries de agregación + CSV export.
> **Contexto**: `@docs/doc8_user_stories.md` (US-CAJ-005)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto: @docs/doc8_user_stories.md (SOLO US-CAJ-005)

Objetivo: reportes financieros mensuales.

Archivos:
- `src/modules/reports/report.service.ts`
- `src/app/api/reports/revenue/route.ts`
- `src/app/(admin)/reportes/page.tsx`

Reporte: ingreso total, desglose por cancha, desglose por método de pago, cantidad de reservas, tasa de ocupación, comparativa mes anterior, export CSV.

Criterio de aceptación: E2E: admin ve reporte del mes, exporta CSV.
```

---

## 🟦 Fase 13 — Observabilidad y deploy

### P21 — Sentry + CI/CD + smoke production

> **Modelo**: Sonnet — configuración de infra, GitHub Actions, deploy.
> **Hito**: `/compact`. Último push.
> **Contexto**: `@docs/doc17_observabilidad.md` `@docs/doc19_runbook.md` `@docs/doc16_testing_strategy.md` (§10 CI/CD)

```
Entrá en Plan Mode. NO escribas código hasta que valide tu plan.

Contexto:
- @docs/doc17_observabilidad.md
- @docs/doc19_runbook.md
- @docs/doc16_testing_strategy.md (SOLO §10)

Objetivo: Sentry + GitHub Actions + deploy a Vercel + Supabase migrations en producción.

Archivos:
- `src/lib/sentry.ts` — config
- `sentry.client.config.ts` + `sentry.server.config.ts` + `sentry.edge.config.ts`
- `.github/workflows/ci.yml` — 4 jobs (lint+types, unit, integration+isolation BLOQUEANTE, e2e en PRs a main)
- `.github/workflows/deploy.yml` — solo main, solo si CI verde
- `src/app/api/status/route.ts` — endpoint de service status
- Documentar en `README.md`: cómo hacer un deploy, cómo correr migrations manualmente, cómo restaurar backup.

REGLAS CRÍTICAS:
- isolation tests BLOQUEAN deploy (doc16 §10.3).
- Sentry recibe errors de backend + frontend.
- Webhook secret, MP tokens, Resend key, Supabase service role → todos en Vercel encrypted env vars.
- Supabase backups: Pro plan daily + point-in-time recovery (doc19 §4).

Presentá el plan. Espero OK.

Criterio de aceptación: PR a main → pipeline verde → deploy automático → /api/status responde { mercadopago: operational, email: operational }.
```

---

# Checklist de validación global

Después de cada fase, verificar que estos puntos siguen verdes:

## Pilar A — RLS Dual y Relacional
- [ ] `players` y `staff_users` tienen `ENABLE ROW LEVEL SECURITY`
- [ ] `bookings` tiene 3 policies: staff por tenant, player por player_id, realtime TO authenticated
- [ ] `tenant_player_bans` tiene policy `player_own_bans_select`
- [ ] `player_tenant_relationships` tiene policy `player_self_ptr_insert`
- [ ] `system_admins` usa `app.current_system_admin_id`
- [ ] Tests de isolation cubren las 16 tablas con RLS

## Pilar B — Idempotencia de pagos
- [ ] `payments.mp_payment_id` es UNIQUE en DB
- [ ] `processed_webhooks` se consulta ANTES de procesar cualquier webhook
- [ ] Toda transición desde `pending_payment` usa `UPDATE ... WHERE status='pending_payment' RETURNING id` + check rowCount
- [ ] Refunds crean fila nueva en payments (type='refund'), NO editan el payment original
- [ ] Refunds NO generan cashflow

## Pilar C — State machine bookings
- [ ] Trigger `enforce_booking_invariants` está instalado y cubre todos los estados terminales
- [ ] `price_snapshot` se captura dentro de la transacción atómica
- [ ] Exclusion constraint `no_overlapping_bookings` está activo (btree_gist)
- [ ] `court.status !== 'online'` se valida (NO 'active')
- [ ] Service de bookings usa `SELECT FOR UPDATE` para el check de disponibilidad

## Pilar D — Correcciones Fase 3
- [ ] `courts.status DEFAULT 'online'` (verificar con `\d courts`)
- [ ] Trigger `enforce_single_active_ban` existe; índice `uq_tenant_player_active_ban` NO existe
- [ ] `courts.pricing` DEFAULT con estructura `{rules:[...]}`
- [ ] CashFlow type solo acepta income|adjustment
- [ ] Search global: sin `'active'` en contexto de cancha, sin `'expense'` en contexto cashflow, sin `readonly`/`receptionist`, sin `weekday_morning` en código, sin `'maintenance'` en court status

---

# Reglas operativas al trabajar con Claude Code

1. **No saltear Plan Mode**. Si un prompt da error, vuelve a Plan Mode y pedile que reanalice. Con Superpowers instalado, el brainstorming se activa automáticamente.
2. **Después de cada P-N verde**: commit con mensaje `feat(P-N): <descripción>` + `git tag fase-X-p-N`.
3. **Si Claude Code sugiere algo que contradice los 4 pilares o CLAUDE.md**: rechazar y citar el hallazgo. No ceder por "simplicidad".
4. **Ante ambigüedad entre docs**: CLAUDE.md y doc12 ganan. Si Claude Code invoca algo más viejo, forzarle lectura de ambos.
5. **`/clear` no borra archivos**: solo limpia el contexto de la sesión. Usar generosamente.
6. **`/compact` al final de cada fase**: el modelo conserva lo aprendido en forma comprimida.
7. **`/memory`** recarga CLAUDE.md. Hacelo tras cada `/clear`.
8. **Si algún prompt genera >500 líneas de código**: pedile que lo parta en sub-prompts. Prefiere 3 PRs de 200 líneas que 1 de 800. Con Superpowers, los subagentes ya descomponen en tareas de 2-5 minutos automáticamente.
9. **Cambio de modelo**: antes de cada prompt 🧠 escribir `/model opus`. Al terminar, volver con `/model sonnet`. Si Sonnet no resuelve algo → escalar a Opus en el momento.

---

# Skills — Resumen de instalación

| Momento | Skill | Comando |
|---|---|---|
| **Pre-P0** | Superpowers | `/plugin install superpowers@claude-plugins-official` |
| **Pre-P0** | UI UX Pro Max | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` → `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| **Post-P2** | Caveman (lite) | `claude plugin marketplace add JuliusBrussee/caveman` → `claude plugin install caveman@caveman` → `/caveman lite` |
| **Post-Fase 5** | Cavemem (opcional) | `npm install -g cavemem` → `cavemem install` |

---

# Modelos — Referencia rápida

| Prompt | Modelo | Razón |
|---|---|---|
| P0, P2, P4, P5, P6 | Sonnet | Config / CRUD / tests bien definidos |
| **P1** | 🧠 **Opus** | Schema + RLS + 21 hallazgos |
| **P3** | 🧠 **Opus** | Auth multi-tenant + JWT cruzados |
| **P7** | 🧠 **Opus** | State machine + concurrencia |
| P8, P9 | Sonnet | API handlers + UI React |
| **P10** | 🧠 **Opus** | Idempotencia de pagos (Pilar B) |
| **P11** | 🧠 **Opus** | Webhooks + race conditions |
| P12, P13, P14 | Sonnet | Lógica derivada, bien definida |
| P15, P16, P17 | Sonnet | UI + workers + bans |
| **P18** | 🧠 **Opus** | Dunning 8 estados + prorrateo |
| P19, P20, P21 | Sonnet | Dashboard + reportes + deploy |

> **Flujo práctico**: `/model sonnet` → trabajar → llegar a prompt 🧠 → `/model opus` → ejecutar → `/model sonnet` → continuar.

---

**Cuando termines P21 verde y el `/api/status` responda operational, arrancaste oficialmente el MVP de TurnoGol.** 🚀
