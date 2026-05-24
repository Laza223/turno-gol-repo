# TurnoGol — Master Audit Plan

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` para ejecutar cada fase. Cada fase tiene un plan detallado en `docs/audit/plans/` que se genera bajo demanda al arrancar la fase.

**Goal:** Llevar TurnoGol a estado "production-ready responsable" mediante auditoría sistemática de 26 fases (12 backend + 14 frontend), eliminando bugs catastróficos conocidos (data leak entre tenants, doble cobro, doble booking, corrupción de datos, incumplimiento Ley 25.326).

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
| **TOTAL** | **26 fases** | **34-54 sesiones** |

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
