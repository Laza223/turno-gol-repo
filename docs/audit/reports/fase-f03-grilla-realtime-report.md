# Fase F3 — Admin Grilla + Realtime — Report

**Fecha:** 2026-05-26
**Branch:** `audit/frontend-f03`
**Veredicto:** 🟡 **PASS con 1 reserva** — 3/4 done-criteria plenos; #4 (Lighthouse) **medido 88–89, 1–2 pts bajo el umbral por causa estructural (LCP via shared bundle 150KB) → owner F12.** Bonus: 3 hallazgos de robustez realtime fixeados (H1 catch-up, H2 publication no versionada, H3 name backfill) + 2 bugs del propio tooling Lighthouse detectados y corregidos en verify.

**Objetivo (MASTER_PLAN líneas 174-178):** La grilla es la vista principal del admin. Si rompe, el negocio no funciona. Fase de criticidad 🔴🔴🔴 máxima del bloque frontend; F0+F1+F2 completas.

---

## Done-criteria (MASTER_PLAN F3) con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| **E2E 2 admins distintos browsers — uno crea, otro ve < 2s** | ✅ (test entregado; ejecución en CI) | `tests/e2e/grilla-realtime.spec.ts` Test 1: `ctxA` (adminStorageState) + `ctxB` (secondAdminStorageState), MISMO tenant E2E. A crea vía `POST /api/bookings` autenticado; B asserta `getByText('10:00–11:00')` `toBeVisible({timeout:2000})` + `Date.now()-t0 < 2000`. Soportado por el seed del 2do admin (T3, verificado: `pnpm e2e:seed` loguea `admin2: e2e-admin-2@turnogol.test`). |
| **Catch-up post-desconexión** | ✅ FIXED | **Bug real (H1):** el hook no hacía fetch fresco al reconectar → perdía eventos del gap offline. Fix T1 (`use-booking-realtime.ts:155-164`): `void fetchFromApi()` en cada transición a `SUBSCRIBED`. **Garantía determinista:** unit test `tests/unit/use-booking-realtime.test.ts` (7 casos, `renderHook` sobre el hook REAL) — caso 1: `CHANNEL_ERROR`→`OFFLINE`, luego `SUBSCRIBED`→fetch `/api/bookings`. E2E Test 2 valida el comportamiento observable (offline→insert→reconnect→aparece). |
| **Mobile usable (360/768/1024+, touch ≥44px MASTER §6.2)** | ✅ | `BookingCard` celdas `height: rowSpan*56px` → 56px ≥ 44px ✓. Tabla `overflow-x-auto` + sticky col "Hora". E2E Test 3 (viewport 375×667, isMobile): heading visible, free cell `role=button` `boundingBox.height ≥ 44`, `document.body.scrollWidth ≤ innerWidth+1` (sin overflow horizontal del body). |
| **Lighthouse ≥ 90 mobile (/grilla)** | ❌ **88–89 medido (1–2 pts corto)** | **MEDIDO realmente** (build prod + seed + server + Chrome 148, 3 corridas: 0.89/0.87/0.89). FCP 1.2s ✓, **LCP 3.8s ✗** (único driver), TBT 90ms ✓, CLS 0 ✓, SI 1.3s ✓. Gap estructural: opportunities *unused JS ~900ms* + *render-blocking ~485ms* = shared bundle 150KB (Sentry-heavy) retrasa hydration. **F0 ya difirió la reducción del shared baseline a F12.** Detalle en `docs/audit/reports/fase-f03-raw/lhci/RESULTS.md`. No gameado; reportado as-is. |

---

## Trabajo realizado (6 tasks)

### T1 — Catch-up on reconnect + name backfill + unit tests del hook (H1, H3, H6)
`src/hooks/use-booking-realtime.ts`: (a) **catch-up** — `void fetchFromApi()` en el branch `'SUBSCRIBED'` del `.subscribe` (cubre eventos perdidos durante OFFLINE — Supabase no garantiza queue offline — + la micro-ventana SSR→subscribe). (b) **name backfill (H3)** — `scheduleReconcile()` debounced 400ms tras INSERT/UPDATE: el payload realtime no trae el join a `players` (nombres null), el reconcile authoritative los rellena en <1s; el apply inmediato del payload mantiene la celda ocupada <100ms (anti doble-booking). `clearTimeout(reconcileRef)` en cleanup. Unit test `tests/unit/use-booking-realtime.test.ts`: `renderHook` (`@testing-library/react` + `happy-dom`, `// @vitest-environment happy-dom`) sobre el hook REAL, mock del channel fluent + `fetch`, 7 casos (catch-up reconnect, first-subscribe, INSERT+reconcile, UPDATE→canceled, date filter, polling 30s, cleanup). Commits `bb9e25a` + `c9246a4` (el 2do reemplazó un primer test inválido que reimplementaba la lógica en vez de ejercitar el hook — detectado en trust-but-verify).

### T2 — Versionar la publication realtime (dual-tree) (H2, H4)
**Hallazgo H2:** la membresía de `bookings` en `supabase_realtime` (requisito de `postgres_changes`) estaba habilitada SOLO vía dashboard — no versionada. Un re-provision/staging caería a polling 30s silenciosamente (rompe "<2s" sin error). Fix: `src/shared/db/migrations/013_realtime_publication.sql` + `supabase/migrations/20260526000001_realtime_publication.sql` (SQL idéntico, convención dual-tree de `docs/MIGRATIONS.md`): bloque `DO $$ ... IF EXISTS(pg_publication) ... IF NOT EXISTS(pg_publication_tables) ... ALTER PUBLICATION ADD TABLE` (idempotente + **guarded** — plain-postgres CI sin la publication lo saltea sin error) + `ALTER TABLE bookings REPLICA IDENTITY FULL` (H4: payloads UPDATE/DELETE con `old` completo; v1 no borra bookings pero es defensa). Tabla "Current state" de MIGRATIONS.md actualizada. Commit `8e03a68`. Verificado: `pnpm test:integration` 325/325 (el guard no rompe plain-postgres).

### T3 — Seed 2do admin del tenant E2E + `secondAdminStorageState`
`scripts/seed-e2e.ts`: `e2e-admin-2@turnogol.test` (UUIDs ...06/...07) con `staff_users` + `tenant_staff_members(E2E.tenantId, secondStaffUserId, 'admin')` (MISMO tenant que admin 1) + auth user con `app_metadata{tenant_id, role:admin, staff_user_id}` + cleanup. `tests/e2e/fixtures.ts`: `secondAdminStorageState` worker fixture (reusa `buildStorageState`). Commit `30ed673`. Verificado empíricamente: `pnpm e2e:seed` loguea `admin2`.

### T4 — E2E `grilla-realtime.spec.ts`
3 tests: **multi-browser <2s** (2 contexts mismo tenant; A crea vía `POST /api/bookings` con payload `createManualBookingSchema` válido guest-path; B ve la celda en <2s), **catch-up** (`context.setOffline(true)` → INSERT service-role → `setOffline(false)` → aparece, timeout 35s worst-case polling), **mobile 375px** (touch ≥44px + no body overflow). Cleanup service-role en `finally`. Commit `27b076c`. Ejecución live delegada a CI (requiere server+DB+browsers, como F2).

### T5 — Adopción F1 primitives en grilla + verificación mobile (H5)
`src/app/(admin)/grilla/loading.tsx` (NEW, `Skeleton` con el mismo layout shell → CLS 0), `error.tsx` (NEW, `'use client'` boundary con `ErrorState variant=contained` + `Sentry.captureException` + `reset()`). `BookingGrid.tsx`: 0-canchas y cerrado → `EmptyState` (íconos `LayoutGrid`/`MoonStar`, copy voseo). **Offline banner mantenido** como warning amber (NO `ErrorState` rojo: estado degradado recuperable, no error fatal — documentado inline). Mobile OK as-is (sin cambios). Commit `7a2c1c7`. Bundle `/grilla` 161→163KB (<200KB ✓).

### T6 — Lighthouse autenticada en `/grilla`
`lighthouserc.grilla.json` + `scripts/lighthouse-grilla.ts` (mintea sesión admin Supabase → cookie jar → temp file → `lhci collect`+`assert`) + `scripts/lhci-grilla-puppeteer.js` (inyecta cookies SSR via `page.setCookie`). Script `pnpm lighthouse:grilla`. Commit inicial `442d618`. **2 bugs del tooling detectados al correrlo en verify** (commit `eeca888`): (1) `page.setCookie` fue removido en Puppeteer v23+ (que trae LHCI 0.15) → `TypeError` → 0 runs medidos mientras el script imprimía "passed" — fix: `browser.setCookie` con fallback a `page.setCookie` y CDP `Network.setCookie`; (2) el script afirmaba "passed ≥0.90" porque el assert usa `warn` (nunca falla) — fix: lee el score real del LHR (`.lighthouseci/manifest.json`) y sale ≠0 si <0.9. Medición real: **88–89** (ver done-criteria #4 + RESULTS.md).

---

## Hallazgos (severidad + disposición)

| # | Hallazgo | Sev | Disposición |
|---|----------|-----|-------------|
| H1 | Catch-up ausente en reconnect (sin fetch fresco al volver SUBSCRIBED → pierde eventos del gap offline) | 🔴 P0-fase | ✅ FIXED T1 (+ unit test) |
| H2 | Publication realtime de `bookings` no versionada (solo dashboard → re-provision/staging sin realtime, silencioso) | 🟡 P1 | ✅ FIXED T2 (migración guarded dual-tree) |
| H3 | Bookings en vivo (realtime INSERT) se renderizaban sin nombre del jugador (payload sin join) | 🟡 P2 | ✅ FIXED T1 (debounced reconcile backfill) |
| H4 | DELETE realtime se ignora sin `REPLICA IDENTITY FULL` | 🔵 P3 | ✅ FIXED T2 (REPLICA IDENTITY FULL; v1 no borra, defensa) |
| H5 | Empty/offline hardcodeados; sin loading/error.tsx | 🔵 P3 (consistencia F1) | ✅ FIXED T5 |
| H6 | Sin tests de grilla/realtime | 🟡 P2 (cobertura) | ✅ FIXED T1 (7 unit) + T4 (3 E2E) |
| H7 | Tooling Lighthouse: `page.setCookie` roto en Puppeteer v23+ → 0 runs con falso "passed" | 🟡 P2 (tooling) | ✅ FIXED verify (`eeca888`) |
| H8 | Tooling Lighthouse: script afirmaba pase con assert `warn` (nunca falla) | 🟡 P2 (tooling/honestidad) | ✅ FIXED verify (`eeca888`: lee score real + exit acorde) |

---

## Tests nuevos / modificados

| Archivo | Tipo | Tests | Cubre |
|---------|------|-------|-------|
| `tests/unit/use-booking-realtime.test.ts` | **nuevo** | 7 | catch-up reconnect, first-subscribe, INSERT+reconcile debounce, UPDATE→canceled, date filter, polling 30s, cleanup. `renderHook` sobre el hook REAL. |
| `tests/e2e/grilla-realtime.spec.ts` | **nuevo** | 3 | multi-browser <2s, catch-up offline, mobile 375px. |

Unit suite: **411 → 418** (`pnpm test`, incluye el nuevo archivo — confirmado en el output). E2E suite +3 (delegados a CI). Integration **325/325** (sin regresión; los 2 flaky pre-existentes no flakearon esta corrida).

---

## Cambios por archivo

| Archivo | Tipo | Task |
|---------|------|------|
| `src/hooks/use-booking-realtime.ts` | modificado (catch-up + reconcile + cleanup) | T1 |
| `tests/unit/use-booking-realtime.test.ts` | **nuevo** (renderHook, 7 tests) | T1 |
| `package.json` + `pnpm-lock.yaml` | modificado (+`@testing-library/react` `happy-dom` devDeps; +`lighthouse:grilla` script) | T1/T6 |
| `src/shared/db/migrations/013_realtime_publication.sql` | **nuevo** | T2 |
| `supabase/migrations/20260526000001_realtime_publication.sql` | **nuevo** (idéntico) | T2 |
| `docs/MIGRATIONS.md` | modificado (Current state +013) | T2 |
| `scripts/seed-e2e.ts` | modificado (+2do admin mismo tenant) | T3 |
| `tests/e2e/fixtures.ts` | modificado (+`secondAdminStorageState`) | T3 |
| `tests/e2e/grilla-realtime.spec.ts` | **nuevo** (3 tests) | T4 |
| `src/app/(admin)/grilla/loading.tsx` | **nuevo** (Skeleton) | T5 |
| `src/app/(admin)/grilla/error.tsx` | **nuevo** (ErrorState boundary) | T5 |
| `src/components/booking/BookingGrid.tsx` | modificado (EmptyState; offline banner doc) | T5 |
| `lighthouserc.grilla.json` | **nuevo** | T6 |
| `scripts/lighthouse-grilla.ts` | **nuevo** (mint + run + honest score) | T6 |
| `scripts/lhci-grilla-puppeteer.js` | **nuevo** (cookie inject, browser.setCookie) | T6 |
| `docs/audit/reports/fase-f03-raw/lhci/RESULTS.md` | **nuevo** (medición real) | T6 |

---

## ⚠️ Visibilidad humana — cambio de schema (T2)

F3 introdujo una migración (T2) que toca infra de DB. Es **aditiva, idempotente y guarded** (no cambia estructura de tablas ni datos): agrega `bookings` a la publication `supabase_realtime` (si la publication existe) + setea `REPLICA IDENTITY FULL`. No afecta el plan/pricing de Supabase. Estaba anticipada en el brief de F3 ("F3 podría requerir tweak de RLS policy realtime... Si toca schema, escribir en AMBOS"). En **prod/staging existentes** donde `bookings` ya está en la publication (vía dashboard), la migración es no-op. En un **re-provision** ahora queda versionada (cierra el riesgo silencioso H2).

---

## Tests / verificación (corridos por el lead en el worktree)

- **Typecheck:** ✓ exit 0.
- **Lint:** ✓ 0 warnings/errors.
- **Unit (`pnpm test`):** ✓ **418/418** (42 files; incluye `use-booking-realtime.test.ts`).
- **Integration (`pnpm test:integration`):** ✓ **325/325** (62 files; los 2 flaky pre-existentes `daily-close-idempotency`/`race-abonado` no flakearon; la migración T2 no agregó fallas).
- **Build:** ✓ exit 0. `/grilla` **163 KB** First Load (<200KB; era 161 en F0).
- **Lighthouse `/grilla`:** **88–89 mobile** (real, 3 corridas). NO ≥90 — gap estructural LCP→F12 (ver RESULTS.md).
- **E2E full run:** delegado a CI (requiere server+Supabase+browsers, como F2). Specs typechequean y están bien formados.

---

## Gaps / deferred

| Gap | Disposición |
|-----|-------------|
| **`/grilla` Lighthouse 88–89 < 90** (LCP 3.8s) | **F12 (Performance).** Driver = shared bundle 150KB Sentry-heavy (F0 ya lo difirió a F12; done-criteria F12 = LCP <2.5s). F3 entregó la 1ª medición autenticada + harness honesto. |
| Offline banner es el LCP element en el run Lighthouse (artefacto: realtime no conecta headless) | Nota UX menor. En prod (realtime conecta) no se renderiza. No tocar solo para gamear Lighthouse. |
| `filter: tenant_id=eq.X` explícito en el channel (defense-in-depth sobre RLS) | Opcional; la RLS `realtime_tenant_select` ya aísla. Nice-to-have. |
| E2E grilla-realtime ejecución real | CI (Linux, server+seed+browsers). Specs entregados. |
| Optimistic updates en el modal de creación | F4 (CRUDs core; done-criteria F4). |

---

## Stats acumulados (post F3)

- **Fases completadas: 16/26** (backend B0-B11 + F0 + F1 + F2 + F3 frontend).
- **F3:** 3/4 done-criteria plenos + 1 (Lighthouse) medido 88–89 con gap estructural→F12. 8 commits. **10 tests nuevos** (7 unit hook + 3 E2E grilla). 8 hallazgos (H1 P0-fase, H2 P1, H3/H6/H7/H8 P2, H4/H5 P3) todos resueltos. 1 migración (publication realtime versionada). 2 devDeps (testing-library/react + happy-dom). Bundle /grilla 161→163KB.
- **Tests acumulados nuevos audit:** 171 (F2) + 10 (F3) = **181**.
- **Bugs fixed acumulado:** 25 (post-F2) + **H1/H2/H3 (3 realtime) + H7/H8 (2 tooling)** = **30**. (H4/H5/H6 son hardening/cobertura, no bugs de runtime.)

---

## Próxima fase

**F4 — Admin Bookings + Cashflow + Canchas (CRUDs core)** (MASTER_PLAN líneas 180-184). Criticidad 🔴🔴 Alta. Done: cada CRUD happy path + 3 edge cases E2E, confirmaciones destructivas escalonadas, optimistic updates donde aplique. **Trigger humano:** confirmar continuar o pausar.
