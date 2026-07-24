# TurnoGol — Master Audit Plan

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` para ejecutar cada fase. Cada fase tiene un plan detallado en `docs/audit/plans/` que se genera bajo demanda al arrancar la fase.

**Goal:** Llevar TurnoGol a estado "production-ready responsable" mediante auditoría sistemática de 26 fases (12 backend + 14 frontend), eliminando bugs catastróficos conocidos (data leak entre tenants, doble cobro, doble booking, corrupción de datos, incumplimiento Ley 25.326). **Wave 2 (agregada 2026-07-22, post-26/26):** 8 fases de datos (D1–D8) — schema/índices, RLS performance, queries bajo rol real, integridad dinámica, infra de datos, volumen/carga y migraciones en prod vivo. Ver §"Auditoría de Datos — Wave 2".

**Architecture:** Auditoría dirigida por riesgo, no por cobertura. Cada fase trabaja en worktree aislado (`audit/backend-bXX` o `audit/frontend-fXX`). Subagent implementer ejecuta + dos subagents reviewers (spec + quality) validan. Hallazgos persisten en `docs/audit/reports/`. Estado global en `docs/audit/STATE.md`.

**Tech Stack:** Next.js 14, TypeScript strict, Drizzle ORM, Supabase (Postgres + Auth + Realtime), pg-boss, Vitest, Playwright, MercadoPago, Resend, Sentry, Upstash Redis.

---

## Estructura de archivos de auditoría

```
docs/audit/
  MASTER_PLAN.md                ← este archivo
  STATE.md                      ← estado actual (qué fase, qué pendiente)
  plans/
    2026-05-24-fase-b00-baseline.md       ← plan detallado de Fase B0
    YYYY-MM-DD-fase-bXX-nombre.md         ← se generan al arrancar cada fase
  reports/
    fase-b00-baseline-report.md           ← hallazgos por fase
    fase-bXX-<nombre>-report.md
```

## Convenciones

- **Worktrees**: `audit/backend-bXX` para fases backend, `audit/frontend-fXX` para frontend. 1 worktree por fase.
- **Commits**: prefix `audit(bXX):` o `audit(fXX):` + descripción.
- **Reports**: cada fase genera `docs/audit/reports/fase-XX-report.md` con: hallazgos, fixes aplicados, tests agregados, gaps remanentes.
- **State**: actualizar `STATE.md` al iniciar y completar cada fase.
- **Done criterion**: fase no se marca done sin evidencia (test output verde, screenshots, logs).

## Orden de ejecución recomendado

**Bloque 1 — Fundamentos** (obligatorio en orden):
- B0 Baseline → debe correr primero, dicta resto

**Bloque 2 — Backend Crítico** (orden recomendado, paralelizable B1+B2+B3 si recursos):
- B1 Motor Bookings
- B2 RLS Multi-tenancy
- B3 MercadoPago

**Bloque 3 — Backend Operacional** (paralelizable B4-B6):
- B4 Billing SaaS
- B5 Background Jobs
- B6 Auth/Sesiones/Seguridad

**Bloque 4 — Backend Restante** (paralelizable B7-B11):
- B7 API Contracts
- B8 Money/Cashflow
- B9 Privacy/Compliance
- B10 Observabilidad
- B11 Operativo/Backups

**Bloque 5 — Frontend Crítico** (orden):
- F0 Baseline frontend
- F1 Design System
- F3 Grilla + Realtime
- F7 Booking flow jugador

**Bloque 6 — Frontend Funcional** (paralelizable):
- F2 Auth + Onboarding
- F4 Admin CRUDs core
- F5 Admin CRUDs secundarios
- F6 Public + SEO
- F8 Player area
- F9 Notificaciones

**Bloque 7 — Frontend Calidad** (paralelizable, después de funcional):
- F10 Responsive
- F11 Accessibility
- F12 Performance
- F13 Cross-browser
- F14 E2E final

**Bloque 8 — Wave 2 Datos** (2026-07-22, post-auditoría 26/26; **D8 ✅ 2026-07-23 → todo desbloqueado**):
- D2 RLS performance → D1 → D3 → D5 → D4 → D6 → D7

---

## Backend — 12 Fases

### B0 — Baseline + Smoke
**Criticidad:** 🔴 Alta | **Tiempo:** 1 sesión
**Objetivo:** Saber qué funciona HOY antes de tocar nada. Correr todos los tests/scripts existentes, documentar baseline.
**Done:** Todo verde o gaps documentados con prioridad. `docs/audit/reports/fase-b00-baseline-report.md` generado.

### B1 — Motor de Reservas
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2-3 sesiones
**Objetivo:** Imposibilitar doble booking, transiciones de estado válidas, expiry consistente, idempotencia.
**Archivos clave:** `src/modules/bookings/*.ts`, migrations bookings, `src/modules/abonados/slot-generator.ts`.
**Done:** Race tests verdes en 1000 iteraciones. State machine completa con transiciones inválidas rechazadas. Exclusion constraint a nivel DB verificado. Expiry idempotente.

### B2 — RLS Multi-tenancy
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2-3 sesiones
**Objetivo:** Imposibilitar leak entre complejos (problema legal). Matriz tabla × operación × rol auditada.
**Archivos clave:** `src/shared/db/client.ts`, `src/modules/auth/auth.middleware.ts`, migrations 006_rls_policies.sql, doc12.
**Done:** Matriz 12 tablas × 4 ops × 4 roles testeada. Pool poisoning probado. Realtime policy verificada.

### B3 — Pagos MercadoPago
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2-3 sesiones
**Objetivo:** Cobrar sin doble-cobrar, refunds correctos, webhooks idempotentes, OAuth no se rompe.
**Archivos clave:** `src/modules/payments/*.ts`, `src/app/api/mp/*`, tabla `processed_webhooks`.
**Done:** Replay 1000 webhooks → 1 efecto. Refunds parciales/totales auditados. Token refresh testeado. Circuit breaker validado. Tokens encrypted at-rest.

### B4 — Billing SaaS
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Cobrar a complejos correctamente. Transiciones de estado tenant (8 estados) válidas.
**Archivos clave:** `src/modules/billing/*.ts`.
**Done:** Matriz 8×8 transiciones auditada. Dunning idempotente. Lifecycle flow completo testeado con simulación temporal.

### B5 — Background Jobs / pg-boss
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Jobs idempotentes, no se pierden, no se duplican.
**Archivos clave:** `src/shared/jobs/*.ts`, definiciones de jobs.
**Done:** Cada job documentado con: idempotencia OK, timeout, retry policy, dead letter. Test de kill worker + recovery. Dashboard de cola.

### B6 — Auth / Sesiones / Seguridad
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Nadie accede a lo que no le corresponde. PIN robusto, magic link seguro.
**Archivos clave:** `src/modules/auth/*.ts`, middleware Next, cookie config.
**Done:** PIN lockout testeado. Magic link TTL + single-use. Headers seguridad A+ en securityheaders.com. Rate limits fail-closed verificados.

### B7 — API Contracts / Endpoints Públicos
**Criticidad:** 🟡 Media | **Tiempo:** 1-2 sesiones
**Objetivo:** API consistente, valida inputs, rechaza basura, no leakea info.
**Archivos clave:** `src/app/api/**/route.ts`, doc15.
**Done:** Cada endpoint con Zod input + output + tests positivos y negativos. Inputs adversariales rechazados. Mensajes de error sin info sensible.

### B8 — Money Handling / Cashflow / Reportes
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1 sesión
**Objetivo:** Ningún centavo desaparece. Reportes coinciden con realidad.
**Archivos clave:** `src/modules/cashflow/*.ts`, endpoints reports.
**Done:** 0 ocurrencias de float math con dinero. Daily close idempotente. 10 escenarios sintéticos: reporte == cálculo manual.

### B9 — Privacy / Compliance Ley 25.326
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Cumplir ley argentina de datos personales. Multas reales si falla.
**Archivos clave:** doc18, flows de eliminación, `player-anonymization` test.
**Done:** Endpoint ARCO funcional + testeado. Política retención documentada e implementada (job purga). Sentry beforeSend scrubbea PII. Sub-procesadores listados.

### B10 — Observabilidad / Logs / Sentry
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Cuando rompa, sabés qué/cuándo/dónde/por qué.
**Archivos clave:** Sentry config, logger, `/api/health`.
**Done:** 0 `console.log` en src/. Logs JSON estructurados con request_id. Sentry con tag tenant_id/user_id/release. Health endpoint + monitor externo.

### B11 — Operativo / Backups / Runbook
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Cuando rompa, sabés QUÉ HACER. Recuperás de incidentes.
**Archivos clave:** doc19, `scripts/launch-check.ts`, Supabase backup config.
**Done:** Backup restaurado exitosamente al menos 1 vez. Runbook con 5+ incidentes paso a paso. Staging environment espejo de prod. CI gate (tests + lint + typecheck obligatorios).

---

## Frontend — 14 Fases

### F0 — Baseline + Build Health
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Build OK, bundle controlado, Lighthouse baseline.
**Done:** Bundle JS inicial < 200KB gzipped por ruta. Lighthouse Performance ≥ 90 mobile. 0 `'use client'` innecesarios.

### F1 — Design System + Componentes UI Base
**Criticidad:** 🟡 Media | **Tiempo:** 1-2 sesiones
**Objetivo:** Consistencia visual. `design-system/MASTER.md` fuente de verdad.
**Archivos clave:** `design-system/`, `src/components/ui/*`, `src/components/layout/*`.
**Done:** 100% componentes UI siguen MASTER.md. Skeleton + Empty + Error state components reusables.

### F2 — Auth + Onboarding Flows
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Nadie se traba en login. Onboarding lleva a Aha Moment.
**Archivos clave:** `src/app/(auth)/*`, `src/components/dashboard/onboarding-checklist.tsx`, doc10.
**Done:** E2E magic link completo. E2E onboarding 4 pasos → primera reserva. Estados de error con UX clara.

### F3 — Admin Grilla + Realtime
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2-3 sesiones
**Objetivo:** Vista principal del admin. Si rompe, negocio no funciona.
**Archivos clave:** `src/app/(admin)/grilla/`, `BookingGrid.tsx`, `use-booking-realtime.ts`.
**Done:** E2E 2 admins distintos browsers — uno crea, otro ve < 2s. Catch-up post-desconexión. Mobile usable. Lighthouse ≥ 90.

### F4 — Admin Bookings + Cashflow + Canchas (CRUDs core)
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 2 sesiones
**Objetivo:** Operativa diaria sin trabas.
**Archivos clave:** `src/app/(admin)/reservas/`, `caja/`, `canchas/`, `BookingFormModal.tsx`.
**Done:** Cada CRUD happy path + 3 edge cases E2E. Confirmaciones destructivas escalonadas. Optimistic updates donde aplique.

### F5 — Admin Reportes + Settings + Abonados + Staff
**Criticidad:** 🟡 Media | **Tiempo:** 1-2 sesiones
**Objetivo:** CRUDs secundarios pulidos.
**Archivos clave:** `src/app/(admin)/reportes/`, `settings/`, `abonados/`, `staff/`, `pin-gate.tsx`.
**Done:** Reportes con datos sintéticos sin errores. PIN lockout funcional. Abonados con preview de slots.

### F6 — Public Landing + Search + Portal Complejo
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** SEO + performance. Jugadores te encuentran.
**Archivos clave:** `src/app/(public)/explorar/`, `[slug]/`, root landing, `site/*`.
**Done:** Lighthouse SEO 100, Performance ≥ 90 mobile. Schema.org LocalBusiness validado. sitemap + robots.

### F7 — Booking Flow Jugador End-to-End
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2 sesiones
**Objetivo:** Jugador reserva sin trabarse. Conversión = $.
**Archivos clave:** `src/app/(public)/[slug]/disponibilidad/`, `reservar/`, integración MP.
**Done:** E2E completo: search → complejo → slot → form → pago MP mock → confirmación. E2E cancelación MP → reintenta. E2E timeout webhook → polling actualiza.

### F8 — Player Area
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Retención jugador.
**Archivos clave:** `src/app/(player)/*`.
**Done:** Player puede: ver reservas, cancelar válidas, editar perfil, descargar datos, eliminar cuenta. E2E player.

### F9 — Notificaciones (Toast + Push Web)
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Admin se entera de reservas en tiempo real.
**Archivos clave:** `src/components/ui/toast.tsx`, `use-toast.ts`, Service Worker, Web Push setup.
**Done:** Push web funcional Chrome + Safari + Firefox. Sonido con interacción previa. Multi-tab dedupe.

### F10 — Responsive / Mobile
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Admin usa celular para gestionar.
**Done:** Cada ruta probada en 360/768/1024+. 0 scroll horizontal accidental. Touch targets 100% ≥ 44px.

### F11 — Accessibility (a11y / WCAG 2.1 AA)
**Criticidad:** 🟡 Media | **Tiempo:** 1-2 sesiones
**Objetivo:** Cumplir estándar mínimo, evita demanda.
**Done:** Axe 0 violations críticas/serias en rutas principales. Lighthouse Accessibility ≥ 95. Test manual con screen reader.

### F12 — Performance / Core Web Vitals
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** App rápida. Cada 100ms = X% conversión perdida.
**Done:** Web Vitals 75th percentile en verde (LCP < 2.5s, CLS < 0.1, INP < 200ms). 0 memory leaks.

### F13 — Cross-Browser + Cross-Device
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Funciona donde tus usuarios viven.
**Done:** Smoke manual en Chrome desktop, Safari Mac, Safari iOS real, Chrome Android real, Firefox. Browsers soportados documentados.

### F14 — E2E Coverage Final
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 2 sesiones
**Objetivo:** Tests E2E cubren happy paths críticos. CI gate antes de deploy.
**Done:** 10+ flows críticos cubiertos E2E. CI E2E gate antes prod. 0 flaky tests (10x rerun verde).

---

## Auditoría de Datos — Wave 2 (D1–D8)

> Agregada 2026-07-22 tras cierre 26/26 de wave 1. Foco: DB, flujos de datos y performance de queries — "óptimo sin perder robustez" (primero correctitud, después performance, después higiene). Convenciones idénticas a wave 1: worktree `audit/data-dXX`, commits `audit(dXX):`, report `docs/audit/reports/fase-dXX-<nombre>-report.md`, plan detallado on-demand en `docs/audit/plans/`.

### Hallazgos pre-cargados (verificados en código, 2026-07-22)

Entrada directa a las fases — no re-derivar:

1. 🟡 **RLS per-row**: policies usan `current_setting('app.current_tenant_id', true)` desnudo (`006_rls_policies.sql:84` y ~70 ocurrencias más, incl. EXISTS anidados en :38/:60). Postgres lo re-evalúa por fila; wrap `(SELECT current_setting(...))` = InitPlan cacheado. → D2a
2. 🟡 **Haversine manual por fila**: `src/modules/tenants/search.service.ts:129` (`6371 * acos(...)`), sin índice posible. Fix por etapas: bounding box + índice lat/long antes del acos; PostGIS recién a miles de tenants. → D3
3. **Timeouts de sesión ausentes**: `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout` no configurados en código. → D5
4. **`pg_stat_statements` no verificado activo** en prod (solo mencionado en doc19). → D5
5. **`sslmode` no explícito**: vive en DSNs de env; verificar `WORKER_DATABASE_URL` (Railway). → D5
6. **Drift Drizzle↔SQL sin test**: `schema.ts` y migraciones a mano son doble fuente. → D5
7. **pg-boss sin housekeeping auditado** (archive/retention de tablas internas, alerta de jobs `failed`). → D5
8. **Reconciliación contable parcial**: existe `reconcile-pending-payments` (`definitions.ts:17`); falta cruce completo MP↔payments↔cash_flows. → D4

**Ya implementado (solo confirmar vigencia, NO re-auditar desde cero):** exclusion constraints anti-doble-booking (`004:216/289` + `041:13`), UNIQUE webhook `mp_event_id` (`003:204`), expiry worker+sweep (`definitions.ts:14-15`, 6 min), `prepare:false` para pooler (`client.ts:56,153`), trigger `enforce_booking_invariants` (`005_triggers.sql:81`), invalidación de caché extensa (85 `revalidatePath/Tag` en 21 archivos — falta la matriz, no el mecanismo).

### D1 — Schema físico e índices
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Cada query caliente tiene el índice que necesita y ningún índice/columna muerta paga costo de write gratis.
**Scope:** Cobertura de índices (FKs, predicados RLS `tenant_id`/`player_id`, compuestos según patrones reales `bookings(tenant_id, date)`, `cash_flows(tenant_id, created_at)`) + índices parciales (`WHERE status IN (...)` para grilla/disponibilidad); `ON DELETE` de cada FK (trap CASCADE del retention worker ya mordió una vez); JSONB (`settings`, `pricing`) solo escrito vía Zod — grep de writes crudos; barrido de columnas/enums muertos; tipos (centavos integer, TIMESTAMPTZ, enums `canceled` una L).
**Archivos clave:** `src/shared/db/migrations/0*.sql`, `src/shared/db/schema/*.ts`.
**Done:** Matriz índice↔query documentada. 0 FKs sin índice sin justificación escrita. Incluye las 4 tablas del rediseño de caja (D8 ✅).

### D2 — RLS performance + cobertura
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** RLS aislando igual que hoy pero sin pagar re-evaluación por fila; tablas nuevas con el pack completo.
**Scope:** Migración nueva que wrappea `(SELECT current_setting(...))` en TODAS las policies vivas (incluye las 4 tablas del rediseño de caja — D8 confirmó que llegaron con el pack RLS completo pero el patrón desnudo) + corrida de `get_advisors` (Supabase MCP) contra prod — security + performance lints. Set vivo derivado de `pg_policies` en DB local migrada, NO de archivos históricos (018 open_matches está dropeada desde 028). **Nota D8:** la ex-D2b (pack canteen) quedó vacía — RLS+FORCE+policies+isolation test+retention worker ya existían (`048:138-235`, `049:35-68`, `isolation.test.ts:765+`, `data-retention-cleanup.worker.ts:238-243`).
**Archivos clave:** `src/shared/db/migrations/006_rls_policies.sql` (referencia), migración nueva, `tests/integration/isolation.test.ts`.
**Done:** EXPLAIN de query representativa muestra InitPlan (no filter per-row). Advisors sin findings críticos abiertos. Isolation tests 1:1 con la lista real de tablas aisladas.

### D3 — Queries reales bajo rol real
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** Saber qué planes ejecuta prod DE VERDAD — con RLS activo y volumen realista — y matar los caros.
**Scope:** T0: seed sintético ~1 año de complejo activo (~15k bookings, ~30k cash_flows; compartido con D6). EXPLAIN (ANALYZE, BUFFERS) de hot paths **como `turnogol_app` con `SET LOCAL` de contexto, nunca superusuario** (los planes con RLS difieren; el repo ya se comió esa trampa — local enmascaraba con DSN superusuario): grilla del día, disponibilidad pública cross-tenant, dashboard KPIs, caja del día. N+1 (loops de queries en Server Components/services), over-fetch (`select()` completo), paginación faltante (historial, audit_logs, jugadores). `pg_stat_user_indexes` (índices con idx_scan=0) + seq scans injustificados. Fix Haversine (hallazgo #2). Matriz de invalidación de caché: mutación → qué `revalidatePath/Tag` dispara (85 usos en 21 archivos sin mapa).
**Archivos clave:** `src/modules/*/**.service.ts`, `src/app/(admin)/**/page.tsx`, `src/modules/tenants/search.service.ts`.
**Done:** Hot paths con plan documentado bajo rol real. 0 seq scans injustificados en tablas grandes. Matriz de caché escrita.

### D4 — Flujos de integridad dinámica
**Criticidad:** 🔴🔴🔴 Crítica | **Tiempo:** 2 sesiones
**Objetivo:** Ningún flujo de plata pierde/duplica bajo concurrencia, retry o fallo a mitad de camino.
**Scope:** Grep sistemático de mutaciones multi-tabla de plata fuera de transacción (booking+payment+cash_flow; venta+stock+cash_flow; fiado+cobro). Carreras de la clase nueva (desbloqueado por D8 ✅: decremento de stock concurrente, cobro de fiado doble-click, cierre de caja concurrente con ventas — mismo patrón FOR UPDATE que cerró B5-billing). Idempotencia de CADA worker pg-boss bajo retry (re-ejecución sin duplicar efectos). Clase Saga: nunca llamar MP dentro de tx abierta (el fix de `createDepositPayment` fue la instancia; buscar la clase). Completitud de la matriz de transiciones del state machine (corrección D4 2026-07-24: `completed→no_show` 24h SÍ está implementada — trigger migr. 045/030 + test `bookings.test.ts:631-666`; el gap real es el sentido INVERSO `no_show→completed`, que doc6 §3 especifica y se autodeclara pendiente — **REQUIERE INPUT**: ¿se implementa o se descarta del spec?). Día operativo en ventas de cantina de madrugada (¿venta 1 AM cae en la caja de qué día?). Job de reconciliación contable MP↔payments↔cash_flows (hallazgo #8; el bug del mock amount=1 lo habría cazado solo).
**Archivos clave:** `src/modules/canteen/`, `src/modules/cashflow/`, `src/modules/payments/`, `src/shared/jobs/workers/*.ts`.
**Done:** Race tests de la clase nueva verdes (patrón B1: iteraciones concurrentes). Matriz de transiciones completa o gaps decididos por el dueño. Reconciliación diseñada (implementación puede diferirse con REQUIERE INPUT de prioridad).

### D5 — Infra de datos
**Criticidad:** 🔴🔴 Alta | **Tiempo:** 1-2 sesiones
**Objetivo:** La capa entre el código y Postgres configurada a propósito, no por default.
**Scope:** Timeouts por rol (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` — hoy un lock colgado espera infinito, hallazgo #3). Pooling: límites de conexiones Supabase vs pool sizes app+workers; `SET LOCAL` siempre dentro de tx. Activar y verificar `pg_stat_statements` en prod + `log_min_duration_statement` (~300ms) (hallazgo #4). `sslmode` explícito en DSNs (hallazgo #5). Autovacuum/bloat en tablas calientes + retención de `audit_logs`/`notifications` (crecen sin techo). Housekeeping pg-boss (hallazgo #7). **Test CI de drift Drizzle↔SQL** (hallazgo #6: introspect de DB migrada vs `schema.ts`). Realtime publication sigue siendo solo `bookings`. PITR: definir RPO objetivo → **REQUIERE INPUT** (plata: add-on Supabase; ¿cuántas horas de datos tolerás perder?).
**Archivos clave:** `src/shared/db/client.ts`, `src/shared/jobs/run-workers.ts`, `scripts/launch-check.ts` (patrón para checks nuevos), config Supabase prod.
**Done:** Timeouts activos y testeados. `pg_stat_statements` reportando en prod. Drift test corriendo en CI. Decisiones de plata elevadas como REQUIERE INPUT, no resueltas en silencio.

### D6 — Volumen y carga
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** El requisito p95 <500ms de doc5 medido de verdad, no asumido.
**Scope:** Sobre el seed de D3: load test k6 de los 2 endpoints calientes (disponibilidad pública — la pega el jugador — y webhook MP). Medir p95/p99 bajo carga realista de hora pico (viernes 18-22hs).
**Archivos clave:** seed de D3, script k6 nuevo en `scripts/`.
**Done:** Report con p95 real vs requisito doc5. Si falla: hallazgos accionables con el plan de la query culpable (insumo directo de D3).

### D7 — Higiene de migraciones en prod vivo
**Criticidad:** 🟡 Media | **Tiempo:** 1 sesión
**Objetivo:** Prod está en el aire: cada migración futura aplica sin lockear tablas ni cortar servicio.
**Scope:** `CREATE INDEX CONCURRENTLY` como default para índices nuevos sobre tablas pobladas + verificar si el runner psql de CI envuelve cada archivo en transacción (CONCURRENTLY no corre dentro de tx — necesita excepción en el runner o convención de archivo separado). Documentar expand & contract (expand → dual-write → backfill → contract) como convención para cambios de columna en caliente.
**Archivos clave:** workflow CI que aplica `0*.sql`, `docs/MIGRATIONS.md`.
**Done:** Convención escrita en `docs/MIGRATIONS.md`. Runner compatible con CONCURRENTLY (o excepción documentada).

### D8 — Checkpoint post-merge caja/cantina
**Criticidad:** ⏸ Gate (no es fase de auditoría) | **Tiempo:** <1 sesión
**Objetivo:** El refactor de caja (`feat/caja-cantina-redesign`, migr. 048) cambia el schema que D1/D2/D4 auditan — no auditar un blanco móvil.
**Trigger:** merge de `feat/caja-cantina-redesign` a main.
**Scope:** Re-validar contra el schema FINAL mergeado: índices de las tablas nuevas (D1), pack RLS completo + retention worker (habilita D2b), carreras stock/fiados/cierre + día operativo en ventas (habilita sub-ítems D4). Ajustar este plan si la migración 048 cambió en el camino.
**Done:** Diff del schema mergeado revisado. D2b y sub-ítems canteen de D4 desbloqueados (o plan ajustado).
**Resultado (2026-07-23): ✅ EJECUTADO** contra PR #50 mergeado (04:50Z). Eran **4 tablas nuevas**, no 3 (+ `daily_cash_opens`, migr. 049). Pack RLS completo ya presente en las 4 (ENABLE+FORCE+policies) → **D2b eliminada, absorbida por D2**. Isolation tests (sección N + checklist) y retention worker (orden FK correcto) cubren las 4. Policies nuevas con `current_setting` desnudo → entran al scope D2 (84 CREATE POLICY históricas en 9 archivos; set vivo vía `pg_policies`). Secciones D2/D1/D4 ajustadas.

---

## Resumen ejecutivo

| Bloque | Fases | Tiempo estimado |
|--------|-------|-----------------|
| Backend Fundamentos | B0 | 1 sesión |
| Backend Crítico | B1, B2, B3 | 6-9 sesiones |
| Backend Operacional | B4, B5, B6 | 3-6 sesiones |
| Backend Restante | B7, B8, B9, B10, B11 | 5-8 sesiones |
| Frontend Crítico | F0, F1, F3, F7 | 6-9 sesiones |
| Frontend Funcional | F2, F4, F5, F6, F8, F9 | 7-12 sesiones |
| Frontend Calidad | F10, F11, F12, F13, F14 | 6-9 sesiones |
| Wave 2 — Datos | D1–D7 + D8 checkpoint | 8-11 sesiones |
| **TOTAL** | **34 fases** (26 wave 1 + 8 wave 2) | **42-65 sesiones** |

## Garantías (qué SÍ podemos asegurar al completar)

- ✅ Cero bugs catastróficos conocidos (data leak, double-charge, double-booking, corrupción)
- ✅ Recuperación de fallos comunes (MP cae, DB lenta, job falla)
- ✅ Compliance Ley 25.326 (ARCO, consentimientos)
- ✅ Trazabilidad completa (Sentry + audit_logs)
- ✅ Reversibilidad (rollback rápido sin pérdida data)

## Lo que NO garantizamos (honestidad)

- ❌ "100% sin bugs en producción" — imposible, ningún software lo tiene
- ❌ Cobertura 100% — mito, ROI negativo
- ❌ Bugs por cambios externos (MP cambia API, Supabase update breaking, etc.)
- ❌ Bugs por casos no-pensados (interacciones emergentes)

Lo que sí: **reducción drástica de riesgo de eventos catastróficos**. Bugs cosméticos los caza el primer usuario, fix en horas.
