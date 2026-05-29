# Fase F12 — Performance / Core Web Vitals — Report

**Fecha:** 2026-05-29
**Branch:** `audit/frontend-f12`
**Veredicto:** 🟡 **PASS con 2 reservas** — 1/2 done-criteria pleno + 1 parcial + harness y código-base mejorados. **Memory leaks: 0 (verificado por investigator)** ✓. **Web Vitals p75 verde**: no medible en sesión (sin tráfico prod ni Supabase up para Lighthouse re-run); harness Sentry web-vitals + Lighthouse error gate + métricas LCP/CLS dejados listos. Diff aporta optimizaciones reales: O(slots×courts) en BookingGrid (era O(N²)), `React.memo` en BookingCard, 2 dynamic imports nuevos, Web Vitals SDK integrado con Sentry, Lighthouse assertions estrictas. Bonus: 1 leak F9 pre-existente (`push-broadcast-dedupe.test.tsx`) wrappeado con beforeAll/afterAll para hygiene.

**Objetivo (MASTER_PLAN líneas 226-229):** App rápida. Cada 100ms = X% conversión perdida. Done-criteria literales: Web Vitals 75th percentile en verde (LCP <2.5s, CLS <0.1, INP <200ms); 0 memory leaks.

---

## Done-criteria con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| **Web Vitals p75 verde (LCP <2.5s / CLS <0.1 / INP <200ms)** | 🟡 **Harness completo + medición diferida** | Código-base optimizado (T1+T2+T3 reducen render cost + bundle eager). Tracking listo: `src/components/perf/WebVitalsReporter.tsx` con `useReportWebVitals` (Next 14 built-in, **0 deps nuevas**) → Sentry.captureMessage prod-only sample 25% con tags `metric`+`rating` + extras `value/delta/id/navigationType`. Lighthouse gate listo: assertions `categories:performance ["error", 0.9]` + `largest-contentful-paint ["error", 2500]` + `cumulative-layout-shift ["error", 0.1]` + `total-blocking-time ["warn", 300]` en ambos lighthouserc. **Re-run real diferido**: requiere Supabase + seed activo (no disponible en sesión). p75 INP no medible por Lighthouse simulated, solo por RUM (Sentry web-vitals acumulará 1+ semana post-deploy). |
| **0 memory leaks** | ✅ | Investigator audit (read-only) verificó cleanup en cada candidato: `ExpiryCountdown.tsx:12` `setInterval`+return `clearInterval` ✓; `PaymentStatusWatcher.tsx:50` idem ✓; `use-booking-realtime.ts:75-76,168` pollRef+reconcileRef cleared in return ✓; `pin-gate.tsx:32,42-60` intervalRef cleared ✓; `PushNotificationManager.tsx:53,88-130` BroadcastChannel `bc.close()` in return ✓. 0 `setInterval` sin `clearInterval`. 0 `addEventListener` sin `removeEventListener` cross-file. Tests de regression intentaron entregar 4 guards pero singleThread leak forzó deferral (sección T6 abajo); cobertura es estática, no dinámica. |

---

## Trabajo realizado (6 tasks)

### T1 — Memoize BookingGrid + BookingCard (P0 perf bottleneck)
**Hallazgo investigator:** `computeCells` (`BookingGrid.tsx:76-123,165`) corría **O(slots × courts × bookings²)** por usar `bookings.find()` dentro del loop principal. Sin `useMemo` en `slots`/`cells`. `BookingCard` sin `React.memo`. Render tree ~360 celdas × N courts. Cada evento realtime → re-render full grid.

**Fix:**
- Nuevo `src/lib/booking/grid-cells.ts` (128 líneas) — extracción pura de `timeToMins`, `minsToTime`, `addDays`, `generateTimeSlots`, `computeCells`, `buildBookingsIndex`, tipos `GridBooking`+`CellState`, `DAY_KEYS`. `computeCells` ahora toma `bookingsByKey: Map<string, GridBooking>` → **O(1) lookup** vía `Map.get()`. Total: O(slots × courts).
- `buildBookingsIndex` con **first-wins** (`if (!index.has(key)) index.set(...)`) preserva semántica original de `Array.find()` ante duplicados teóricos (race realtime; DB tiene exclusion constraint en prod).
- `BookingGrid.tsx`: 4× `useMemo` (`slots`, `bookingsByKey`, `cells`, `dateLabel`) + 3× `useCallback` (`isSlotPast`, `handleSlotClick`, `handleBookingSuccess`).
- `BookingCard.tsx`: refactor de props (`onClick` → `onSlotClick(courtId, slotTime)` + `courtId` separado) para que celdas libres pasen referencias estables. `export const BookingCard = React.memo(BookingCardComponent)`.
- **Cazado por reviewer (BLOCKER en T1 inicial):** override silencioso de duplicados en index (último gana vs first como original) → fix en commit `c2174d0` agregó test de duplicados.
- **Cazado por reviewer (RISK):** `onClick={() => handleSlotClick(court, slotTime)}` inline rompía memo en celdas libres → fix mismo commit refactor a `onSlotClick`+`courtId` separados → memo efectivo en BOOKING + FREE cells.
- JSX byte-identical. Sin cambio de comportamiento observable.

**Tests:**
- `tests/unit/grid-cells.test.ts` (6 casos): rowSpan=1, rowSpan=2+skip, `canceled_refunded` stays free, `expired` stays free, key strips seconds, **duplicado first-wins**.
- `tests/unit/booking-card-memo.test.tsx` (1 caso): `BookingCard.$$typeof === Symbol.for('react.memo')`.

**Commits:** `f321763` (initial) + `c2174d0` (2 reviewer fixes).

### T2 — Sentry Replay integration filter (bundle hygiene)
**Hallazgo investigator:** `sentry.client.config.ts:11` `replaysOnErrorSampleRate: 0.5` mantenía la Replay integration activa. Sentry 7.x bundlea `@sentry/replay` eagerly si la integration es parte del default array.

**Fix:**
- Removidas `replaysSessionSampleRate` y `replaysOnErrorSampleRate`.
- Agregada función pura exportada `filterReplay<T extends {name:string}>(integrations: T[]): T[]` que filtra `'Replay'` Y `'ReplayIntegration'` (ambos naming variants en 7.x).
- Cableada vía `Sentry.init({ ..., integrations: filterReplay })`.

**Reserva honesta (post-build verification):** Inspeccionando chunk pesado `.next/static/chunks/8380-*.js` (322KB raw), strings `Replay` aparecen 4×. El `integrations(cb)` de Sentry 7.x corre AFTER default integrations son instanciadas — el filter las desregistra del runtime pero no tree-shakea bytes. La ganancia real de bundle requiere Sentry 8.x `lazyLoadIntegration` o `webpack.IgnorePlugin` custom. **Lo que SÍ se gana en F12:** zero llamadas a `Replay.start()` en runtime + session replay desactivado (Marcelo no usaba). Net bundle delta exacto requiere `pnpm analyze` con comparación lado-a-lado (delegado).

**Tests:**
- `tests/unit/sentry-client-integrations.test.ts` (2 casos): filtra `Replay`, filtra `ReplayIntegration`, preserva `BrowserTracing`+`GlobalHandlers`.

**Commit:** `ffe938b`.

### T3 — Dynamic imports (RegisterMovementModal + PushNotificationManager)
**Hallazgo investigator:** Único dynamic import existente era `BookingFormModal` (F0). `RegisterMovementModal` (caja) y `PushNotificationManager` (admin layout) se cargaban eagerly.

**Fix:**
- `src/app/(admin)/caja/components/CajaActions.tsx`: `RegisterMovementModal` via `next/dynamic({ssr:false})`. Modal solo se carga al click del botón "Registrar movimiento" → first paint de `/caja` sin el modal.
- `src/app/(admin)/layout.tsx`: `PushNotificationManager` via `next/dynamic({ssr:false, loading: () => null})`. NotificationCenter + permission flow son post-LCP UX → 0 impacto en first paint admin.

**Tests:** ninguno nuevo (dynamic imports validados por Next.js en build).

**Commit:** `ead4083`.

### T4 — Web Vitals tracking integrado con Sentry
**Hallazgo investigator:** 0 imports de `web-vitals` o `reportWebVitals`. Sin instrumentación de LCP/CLS/INP.

**Fix:**
- `src/components/perf/WebVitalsReporter.tsx` (27 líneas, `'use client'`) — usa `useReportWebVitals` de `next/web-vitals` (**Next 14 built-in, 0 deps nuevas**). Filtros: `NODE_ENV !== 'production'` → skip + sample 25% (`Math.random() > 0.25` → skip). Envía a `Sentry.captureMessage('web-vital:LCP|CLS|INP|FCP|TTFB', { level:'info', tags:{metric, rating}, extra:{value, delta, id, navigationType} })`. `metric.rating` ya viene clasificado `'good'|'needs-improvement'|'poor'` por umbrales web.dev oficiales.
- `src/app/layout.tsx`: `<WebVitalsReporter />` adentro de `<body>` (post-Toaster). Renderiza `null`, 0 impacto CLS.

**Tests:**
- `tests/unit/web-vitals-reporter.test.tsx` (3 casos): dev → no Sentry call; prod sample miss (random=0.5) → no call; prod sample hit (random=0.1) → Sentry called con payload completo.

**Commit:** `20b62ad`.

### T5 — Lighthouse harness: error gate + métricas explícitas
**Hallazgo investigator:** Ambos `lighthouserc.{grilla,public}.json` tenían `categories:performance ["warn", 0.9]` → no falla CI. Sin assertions sobre LCP/CLS/TBT individuales. F12 done-criteria son sobre **métricas**, no solo score agregado.

**Fix:**
- Ambos lighthouserc:
  - `categories:performance` → `["error", { "minScore": 0.9 }]` (gate hard).
  - `largest-contentful-paint` → `["error", { "maxNumericValue": 2500 }]` (LCP <2.5s literal).
  - `cumulative-layout-shift` → `["error", { "maxNumericValue": 0.1 }]` (CLS <0.1 literal).
  - `total-blocking-time` → `["warn", { "maxNumericValue": 300 }]` (TBT proxy de INP en simulated; INP real solo Chrome UX Report).
- `accessibility error 0.95` (F11) y `seo error 1.0` (F6) intactos.

**Re-ejecución diferida:** `pnpm lighthouse:grilla` + `pnpm lighthouse:public` requieren Supabase + seed activos. F3 ya documentó el harness honesto (corrida 88-89 con LCP 3.8s); F12 dejó assertions estrictas listas para validar el delta post-cambios. Si el LCP `/grilla` no baja a 2.5s por estructura (banner offline en headless), el gate falla intencional y obliga a un fix arquitectónico real (no gameado).

**Commit:** `d95a8e2`.

### T6 — Memory leak regression guards → diferido por leak en singleThread suite
**Plan original:** 4 tests `tests/unit/cleanup-regression.test.tsx` cubriendo `ExpiryCountdown`, `PaymentStatusWatcher`, `PinGate`, `PushNotificationManager`.

**Hallazgo en verify:** los 4 tests pasaban aislados pero **rompían `confirm-dialog.test.tsx` y `staff-actions.test.tsx`** en la corrida completa. Vitest config (F11) usa `singleThread:true` para curar DOM pollution previa — `globalThis` se comparte entre archivos del mismo worker. El setup de cleanup-regression incluía:
- `Object.defineProperty(globalThis, 'Notification'/'PushManager'/'localStorage', ...)`.
- `Object.defineProperty(navigator, 'serviceWorker', ...)`.
- `Object.defineProperty(HTMLMediaElement.prototype, 'play'/'pause', ...)`.
- `vi.stubGlobal('BroadcastChannel', MockBC)` dentro del Test 4.
- `vi.useFakeTimers()` en `beforeEach`.
- `vi.setSystemTime(fakeNow)` dentro del Test 3 (PinGate).
- Spies en `globalThis.setInterval`+`clearInterval`.

**Iteración 1 (commit `f63a65a`):** moví TODOS los `Object.defineProperty` a `beforeAll` + `afterAll` con restore via `Object.getOwnPropertyDescriptor`. Persistían 2 fails.

**Iteración 2 (commit `f7372b8`):** descubrí que `tests/unit/push-broadcast-dedupe.test.tsx` (F9) tiene **el mismo patrón module-level** que cleanup-regression. Wrappee F9 file con beforeAll/afterAll para hygiene. **Beneficio neto F12: el F9 leak ya no es bomba latente para futuros tests.** Pero los 2 fails F12-originados persistían.

**Iteración 3 (commit `b755c58`):** bisect identificó que aún reducidos a Tests 1+2 (sin PinGate ni PushNotificationManager), `cleanup-regression` leak'ea a `confirm-dialog`. Posibles causas: `vi.spyOn(globalThis, 'setInterval')` no fully restored por `vi.restoreAllMocks()` en este combo; o Radix Dialog usa setTimeout que entra en conflicto con `vi.useFakeTimers()` residual. **Decisión:** drop el archivo entero.

**Cobertura sustituta:** done-criteria #2 PASA via **audit estático del investigator** (read-only, vista enumerada arriba). Cualquier futuro PR que rompa los cleanups se detectará en code review + Sentry RUM (T4) si hay leak en prod.

**Commit final del archivo:** ninguno (eliminado en `b755c58`). Plan en `docs/audit/plans/2026-05-29-fase-f12-performance.md` lo documenta como deferred-con-trigger ("aislar en pool:'forks' o mover a E2E").

---

## Hallazgos (severidad + disposición)

| # | Hallazgo | Sev | Disposición |
|---|----------|-----|-------------|
| H1 | BookingGrid `computeCells` O(slots×courts×bookings²) sin memo → re-render full grid en cada evento realtime | 🔴 P0-fase | ✅ FIXED T1 (extract pure lib + index Map O(1) + 4 useMemo + 3 useCallback + React.memo) |
| H2 | T1 reviewer: `buildBookingsIndex` con `Map.set` cambiaba semántica (last-wins vs Array.find first-wins) | 🟡 P1 | ✅ FIXED T1 `c2174d0` (`if (!index.has(key)) set`) + test |
| H3 | T1 reviewer: `onClick={() => handleSlotClick(...)}` inline rompía memo en celdas libres | 🟡 P1 | ✅ FIXED T1 `c2174d0` (refactor `onSlotClick`+`courtId` props) |
| H4 | Sentry Replay integration eager-loaded (sin lazyLoad disponible en 7.x) | 🟡 P2 | ✅ MITIGATED T2 (runtime filter; bytes ahorrados requieren 8.x o webpack ignore — gap documentado) |
| H5 | Solo 1 dynamic import (BookingFormModal F0); RegisterMovementModal + PushNotificationManager eager | 🔵 P3 | ✅ FIXED T3 (2 dynamic imports nuevos) |
| H6 | Sin tracking de Web Vitals (LCP/CLS/INP) | 🟡 P2 | ✅ FIXED T4 (useReportWebVitals + Sentry; sample 25% prod) |
| H7 | Lighthouse `categories:performance` en `warn` no `error`; sin assertions individuales LCP/CLS | 🟡 P2 | ✅ FIXED T5 (`error` 0.9 + LCP/CLS error gates + TBT warn) |
| H8 | F9 `push-broadcast-dedupe.test.tsx` module-level `Object.defineProperty(globalThis...)` (latent leak en singleThread) | 🔵 P3 | ✅ FIXED `f7372b8` (wrapped en beforeAll/afterAll con descriptor restore) |

---

## Tests nuevos / modificados

| Archivo | Tipo | Tests | Cubre |
|---------|------|-------|-------|
| `tests/unit/grid-cells.test.ts` | **nuevo** | 6 | `computeCells` rowSpan/skip/canceled/expired/keys; `buildBookingsIndex` first-wins |
| `tests/unit/booking-card-memo.test.tsx` | **nuevo** | 1 | `React.memo` wrapping (`$$typeof === Symbol.for('react.memo')`) |
| `tests/unit/sentry-client-integrations.test.ts` | **nuevo** | 2 | `filterReplay` filtra `Replay` y `ReplayIntegration`, preserva otros |
| `tests/unit/web-vitals-reporter.test.tsx` | **nuevo** | 3 | dev→no call, prod sample miss→no call, prod sample hit→Sentry payload |
| `tests/unit/push-broadcast-dedupe.test.tsx` | **modificado** | sin cambio nº | wrap globals en beforeAll/afterAll con restore |
| `tests/unit/cleanup-regression.test.tsx` | **deferred** | 0 | T6 dropped por singleThread leak; cobertura estática via investigator |

Unit suite: **554 → 566 passing** (+12 F12). 3 fails pre-existentes inalterados (`db-client-role-guard` requiere Supabase, `zod-coverage × 2` F4). Integration: 53 file ECONNREFUSED + 1 actual fail pre-existentes (idéntico a F11 baseline). E2E sin cambio.

---

## Cambios por archivo

| Archivo | Tipo | Task |
|---------|------|------|
| `src/lib/booking/grid-cells.ts` | **nuevo** (128 líneas pure) | T1 |
| `src/components/booking/BookingGrid.tsx` | modificado (-189 +180 memos/callbacks/import) | T1 |
| `src/components/booking/BookingCard.tsx` | modificado (React.memo + onSlotClick API) | T1 |
| `tests/unit/grid-cells.test.ts` | **nuevo** (6 tests) | T1 |
| `tests/unit/booking-card-memo.test.tsx` | **nuevo** (1 test) | T1 |
| `sentry.client.config.ts` | modificado (export filterReplay + integrations cb) | T2 |
| `tests/unit/sentry-client-integrations.test.ts` | **nuevo** (2 tests) | T2 |
| `src/app/(admin)/caja/components/CajaActions.tsx` | modificado (dynamic RegisterMovementModal) | T3 |
| `src/app/(admin)/layout.tsx` | modificado (dynamic PushNotificationManager) | T3 |
| `src/components/perf/WebVitalsReporter.tsx` | **nuevo** (27 líneas) | T4 |
| `src/app/layout.tsx` | modificado (+WebVitalsReporter en body) | T4 |
| `tests/unit/web-vitals-reporter.test.tsx` | **nuevo** (3 tests) | T4 |
| `lighthouserc.grilla.json` | modificado (perf error + LCP/CLS/TBT) | T5 |
| `lighthouserc.public.json` | modificado (perf error + LCP/CLS/TBT) | T5 |
| `tests/unit/push-broadcast-dedupe.test.tsx` | modificado (beforeAll/afterAll wrap) | T6 hygiene |
| `docs/audit/plans/2026-05-29-fase-f12-performance.md` | **nuevo** | — |

---

## Visibilidad humana

- **0 cambios de schema.** Sin migración nueva. RLS intacto.
- **0 deps nuevas prod ni dev.** `useReportWebVitals` viene en Next 14 built-in.
- **0 env vars nuevas.**
- **Sentry Replay session recording desactivado** (no se usaba; recuperar si Marcelo/soporte requieren video debugging — trade-off doc en `sentry.client.config.ts:6-13`).
- **BookingGrid + BookingCard memoizados** → reducción de CPU bajo realtime intenso (multi-tab admin con 6+ canchas y 60+ slots). 0 cambio visual.
- **2 modales lazy** (`RegisterMovementModal`, `PushNotificationManager`) → reducción de JS en first paint de `/caja` y `/admin/*`.
- **Sentry recibirá web-vitals en prod** con sample 25% — tablero `web-vital:LCP` etc. en Sentry mostrará distribución p75 después de ~1 semana de tráfico.

---

## Verificación (corridos por el lead en el worktree)

- `pnpm typecheck` → verde ✓
- `pnpm lint` → 0 warnings ✓
- `pnpm test` → **566 passing | 3 fails pre-existentes** (`db-client-role-guard` × 1 + `zod-coverage` × 2) — idéntico al baseline F11 ✓
- `pnpm test:integration` → 53 file ECONNREFUSED + 1 fail + 55 passing — idéntico baseline F11 (Supabase no running) ✓
- `pnpm build` → **`✓ Compiled successfully`** + types validados + 34 static pages generated. Exit 1 únicamente por `/sitemap.xml` prerender ECONNREFUSED (Supabase no running en build env, pre-existente desde F6) ✓
- `pnpm lighthouse:grilla` → **diferido** (requiere Supabase + seed + `pnpm dev` running). Harness con assertions estrictas listo.
- `pnpm lighthouse:public` → **diferido** (idem).
- `pnpm analyze` → no ejecutado; pre/post bundle comparison requiere correr en ambos branches con misma node_modules.

---

## Stats acumulados (post F12)

- **Fases completadas: 25/26** (backend B0-B11 + F0-F12 frontend). Solo F13 (Cross-Browser/Device) + F14 (E2E Coverage Final) restan.
- **Tests acumulados nuevos audit: ~371** (~359 post-F11 + F12 +12 unit [grid-cells 6 + booking-card-memo 1 + sentry-integrations 2 + web-vitals 3]). Unit suite **566 passing** (554 pre-F12 + 12). Integration sin cambio. E2E sin cambio.
- **Bugs prod nuevos F12: 0.** (Optimizaciones de render + bundle, no cambian comportamiento.)
- **Tests legacy ajustados: 11** (+1 F12: `push-broadcast-dedupe.test.tsx` wrap en beforeAll/afterAll — hygiene de leak F9 pre-existente).
- **Deps nuevas: 0.** (Next 14 trae `useReportWebVitals` built-in.)
- **Migraciones nuevas: 0.**
- **Env nuevas: 0.**
- **Performance hot path (BookingGrid):** complejidad render reducida de **O(slots×courts×bookings²)** a **O(slots×courts)** con lookup O(1) por celda. React.memo + useCallback minimizan re-renders entre eventos realtime. Sin medición numérica de FPS deltas (requiere DevTools Performance con grilla real seedeada).
- **Bundle baseline:** sin números nuevos en sesión (build OK pero sitemap prerender ECONNREFUSED cortó el route table dump). Pre/post comparison requiere `pnpm analyze` en ambos branches.

## Gaps / deferred (registrados en STATE backlog)

| Gap | Disposición |
|-----|-------------|
| **Lighthouse re-run real `/grilla` + `/public`** | Requiere `supabase start && pnpm e2e:seed && pnpm dev` background. Harness con LCP error 2500 + CLS error 0.1 + perf error 0.9 listo. F3 mantuvo este patrón de medición honesta; F12 lo profundizó. CI pre-launch o local dev session. |
| **Bundle delta numérico post-T2** | Requiere `pnpm analyze` en main + en post-merge, comparar HTML bundle visualizer. F12 confirmó por inspección de chunk que `Replay` STRINGS persisten — el filter desregistra runtime pero Sentry 7.x bundlea Replay como default integration. Trigger upgrade Sentry 8.x para `lazyLoadIntegration` + bundle thin real. |
| **Memory leak regression tests** | T6 diferido por singleThread leak; investigator audit estático cubre done-criteria #2. Re-trigger si Sentry RUM (T4) muestra heap growth en prod. Strategy: archivo separado con `pool:'forks'` en vitest config. |
| **Web Vitals p75 medición real** | Sentry web-vitals (T4) acumula data en prod tras deploy. Tablero `tags:metric/rating` distribución después de ~1 semana de tráfico real. Hasta entonces, Lighthouse simulated es proxy. |
| **INP real (event-based)** | Lighthouse simulated mide TBT como proxy. INP real solo de Chrome UX Report o Sentry web-vitals (T4) en prod. |
| **Sentry Replay re-enable** | Trade-off documentado en `sentry.client.config.ts:6-13`. Trigger: feedback de Marcelo/soporte queriendo ver "qué clicked el usuario" en errores. v1.5. |
| **`/staff` 190 KB re-medición** | Sin route table en sesión por prerender error. Verificar pre-prod cuando Supabase up. |
| **`pnpm analyze` HTML bundle visualizer en CI** | Trigger: si shared baseline excede 160KB de nuevo. |

---

## Próxima fase: F13 — Cross-Browser + Cross-Device

MASTER_PLAN líneas 231-234, criticidad 🟡 Media, 1 sesión.
**Done:** Smoke manual en Chrome desktop, Safari Mac, Safari iOS real, Chrome Android real, Firefox. Browsers soportados documentados.

Trigger humano: confirmar continuar o pausar.
