# Fase F12 — Performance / Core Web Vitals — Plan

**Fecha:** 2026-05-29
**Branch:** `audit/frontend-f12`
**Criticidad MASTER_PLAN:** 🔴🔴 Alta
**Done-criteria literal (líneas 226-229):**
- Web Vitals 75th percentile en verde (LCP < 2.5s, CLS < 0.1, INP < 200ms).
- 0 memory leaks.

---

## Baseline heredado (sin tocar)

| Fuente | Métrica | Valor |
|--------|---------|-------|
| F0 | Shared bundle gzipped | 150 KB (Sentry-heavy) |
| F0 | `/grilla` First Load JS | 161 KB (235→161 con dynamic modal + lazy supabase) |
| F0 | `/staff` First Load JS | 190 KB (más cerca del techo 200) |
| F3 | `/grilla` Lighthouse Perf mobile | **88-89** (LCP 3.8s, banner offline = LCP element en run) |
| F3 | `/grilla` opportunities | unused-JS ~900ms + render-blocking ~485ms |
| F0 | Lighthouse rutas públicas estáticas | 94-96 |
| Sentry client | `tracesSampleRate` / `replaysSessionSampleRate` / `replaysOnErrorSampleRate` | `0.1` / `0` / `0.5` |

---

## Hallazgos del investigator (file:line resumen)

1. **BookingGrid.computeCells (`src/components/booking/BookingGrid.tsx:76-123,165`)**: O(slots × courts × bookings) con `bookings.find()` interno → O(slots × courts × bookings²) en worst case. Re-corre en cada render del padre (incluido cada evento realtime). Sin `useMemo`.
2. **BookingCard sin `React.memo`**: cada celda re-renderiza ante cualquier cambio de `BookingGrid`. Props inline functions (`onClick: () => handleSlotClick(...)`, `handleSlotClick` recreado cada render) rompen referencia → memo "sólo" no alcanza, hay que `useCallback`.
3. **Sentry replay `replaysOnErrorSampleRate: 0.5` (`sentry.client.config.ts:11`)**: Replay integration bundled eagerly. Sentry 7.x no soporta `lazyLoadIntegration`. Reducción de muestreo no cambia el bundle. La opción real es **remover Replay del integrations array** (default-on en 7.x; pasar `integrations: []` o filter explícito → −35-45KB minified Replay chunk).
4. **Solo 1 dynamic import** (`BookingFormModal` en `BookingGrid.tsx:14-17`). Gap: `RegisterMovementModal`, `PushNotificationManager` se cargan eagerly en first paint del admin.
5. **No web-vitals tracking**. Next 14 trae `useReportWebVitals` (`next/web-vitals`) → 0-dep, integra con Sentry en cliente.
6. **Lighthouse perf assertion `warn` minScore 0.9** en `lighthouserc.{grilla,public}.json` → F12 sube a `error` + agrega métricas explícitas (LCP/CLS).
7. **Memory leaks: 0 detectados** (investigator verificó `setInterval`, `BroadcastChannel`, refs; todos con cleanup). Done-criteria #2 ya pasa de hecho — F12 agrega regression guard.
8. **`/staff` 190 KB**: investigator no encontró componentes pesados específicos. F12 lo re-mide post-Sentry-thin para confirmar holgura.

---

## Tasks (6)

### T1 — Memoize BookingGrid + BookingCard (P0 perf bottleneck)

**Hallazgo:** computeCells nested loop + bookings.find() = O(slots×courts×bookings²). React tree de 60 slots × 6+ canchas = ~360 cells. Cada realtime event → re-render full tree.

**Cambios:**
- `src/components/booking/BookingGrid.tsx`:
  - `slots` → `useMemo(() => generateTimeSlots(openHhmm, closeHhmm), [openHhmm, closeHhmm, closedToday])`.
  - **Index bookings por `courtId:HH:MM`** antes de loop principal (Map<string, GridBooking>) → eliminar `bookings.find()` interno (O(N) → O(1) lookup).
  - `cells` → `useMemo(() => computeCells(slots, courts, bookingsByKey), [slots, courts, bookingsByKey])`.
  - `bookingsByKey` Map en `useMemo` propio para reusar.
  - `isSlotPast` → `useCallback([artNow, date])`.
  - `handleSlotClick`, `handleBookingSuccess` → `useCallback([])`.
  - `dateLabel` → `useMemo`.
- `src/components/booking/BookingCard.tsx`:
  - `export const BookingCard = React.memo(BookingCardComponent)` con shallow compare default (props son primitivos + GridBooking ref-stable porque viene del Map memoizado + onClick referencialmente estable vía useCallback).
- **Sin cambio de comportamiento observable.** Idéntico DOM + clases + a11y.

**Test T1:**
- `tests/unit/booking-grid-perf.test.ts` (nuevo): unit del `computeCells` factor-out a `lib/booking/grid-cells.ts` para testear pura. Casos: 1 booking 60min, 1 booking 120min (rowSpan 2 + skip), bookings overlap (no double-set), `bookings.find` ya no se llama (index Map cubre). 4 casos.
- `tests/unit/booking-card-memo.test.tsx` (nuevo): renderiza 6 BookingCards con `React.memo`, mock `console.log` en BookingCardComponent (no, mejor `vi.fn()` wrap), confirma render count = 1 por card al cambiar prop irrelevante del padre. 1 caso.

**Commit:** `audit(f12): T1 — memoize BookingGrid + BookingCard for O(1) cell lookup`

---

### T2 — Remover Sentry Replay integration (bundle reduction)

**Hallazgo:** Sentry 7.x bundlea Replay (`@sentry/replay`) eagerly cuando `replaysOnErrorSampleRate > 0`. Reducir el sample NO quita el chunk; hay que filtrar la integration del array.

**Cambios:**
- `sentry.client.config.ts`:
  - Agregar `integrations(integrations) { return integrations.filter((i) => i.name !== 'Replay' && i.name !== 'ReplayIntegration') }`.
  - Quitar `replaysSessionSampleRate` + `replaysOnErrorSampleRate` (irrelevantes sin Replay).
  - Comentario inline: "Replay removido en F12 (audit 2026-05-29) para reducir shared bundle. Sentry seguirá captando errores via beforeSend; recuperar si se necesita session video debugging."
- **Trade-off documentado:** errores de cliente conservan stack + breadcrumbs + tracesSampleRate=0.1; se pierde video replay de la sesión hasta el error. Aceptable v1.
- **NO toca** `sentry.server.config.ts` ni `sentry.edge.config.ts` (Replay es client-only).

**Test T2:**
- `tests/unit/sentry-client-integrations.test.ts` (nuevo): imports config snippet sin Sentry mock — verifica que el callback `integrations(mockArr)` filtra entradas con `.name === 'Replay'`. Mock array = `[{name:'Replay'}, {name:'BrowserTracing'}, {name:'GlobalHandlers'}]` → output sin Replay. 1 caso.

**Commit:** `audit(f12): T2 — remove Sentry Replay integration to thin shared bundle`

---

### T3 — Dynamic imports adicionales (RegisterMovementModal + PushNotificationManager)

**Hallazgo:** Sólo `BookingFormModal` es dynamic. Otros modales/islands se cargan eagerly y agregan al First Load del admin.

**Cambios:**
- `src/components/cash/RegisterMovementModal.tsx` ya está fuera del SSR (`'use client'`). En el padre (probable `src/app/(admin)/caja/page.tsx` o un client wrapper), pasar a `dynamic(() => import('@/components/cash/RegisterMovementModal').then(m => m.RegisterMovementModal), { ssr: false })`. Mantener Skeleton vacío como fallback (botón nav independiente, no critical-render-path).
- **PushNotificationManager**: en lugar de import estático en admin layout/header, envolver con `dynamic(() => import('@/components/admin/PushNotificationManager').then(m => m.PushNotificationManager), { ssr: false, loading: () => null })`. NotificationCenter + permission flow son post-LCP UX → 0 impacto.
- **NO toca** ConfirmDialog (usado en muchas rutas, dynamic-per-call costaría más que el bundle ahorrado).
- **NO toca** AbonadosList (T5 F5 ya es client island, el form sí podría hacerse dynamic pero impacto bajo — backlog F12 deferred si tiempo).

**Test T3:**
- Sin tests nuevos (dynamic import es config, no lógica). Smoke: el typecheck + build + lint deben pasar (Next valida dynamic factories en build).
- E2E existentes (`admin-smoke`, `bookings-cashflow`) deben seguir verde.

**Commit:** `audit(f12): T3 — lazy-load RegisterMovementModal + PushNotificationManager`

---

### T4 — Web Vitals tracking integrado con Sentry

**Hallazgo:** Sin instrumentación de LCP/CLS/INP. Next 14 trae `useReportWebVitals` de `next/web-vitals` (cero deps externas).

**Cambios:**
- `src/components/perf/WebVitalsReporter.tsx` (nuevo, `'use client'`):
  ```tsx
  'use client'
  import { useReportWebVitals } from 'next/web-vitals'
  import * as Sentry from '@sentry/nextjs'
  export function WebVitalsReporter() {
    useReportWebVitals((metric) => {
      if (process.env.NODE_ENV !== 'production') return
      // Sample 25% to keep Sentry quota controlado (~150KB shared)
      if (Math.random() > 0.25) return
      Sentry.captureMessage(`web-vital:${metric.name}`, {
        level: 'info',
        tags: { metric: metric.name, rating: metric.rating },
        extra: {
          value: metric.value,
          delta: metric.delta,
          id: metric.id,
          navigationType: metric.navigationType,
        },
      })
    })
    return null
  }
  ```
- Renderizar en `src/app/layout.tsx` dentro del `<body>` (después de `<main>`, antes de cierre).
- **Sample 25% + prod-only**: Sentry quota safe. `metric.rating` ya viene de web-vitals (`'good'|'needs-improvement'|'poor'` por umbral oficial).
- **0 deps nuevas** (`next/web-vitals` es export de `next` package).

**Test T4:**
- `tests/unit/web-vitals-reporter.test.tsx` (nuevo): mock `useReportWebVitals` + `Sentry.captureMessage`. Casos:
  1. NODE_ENV !== production → no Sentry call.
  2. NODE_ENV production, sample miss (Math.random=0.9) → no Sentry call.
  3. NODE_ENV production, sample hit (Math.random=0.1) → Sentry called con tags={metric,rating}, extra={value,delta,id,navigationType}.
  Stub `Math.random` con `vi.spyOn`. 3 casos.

**Commit:** `audit(f12): T4 — track Web Vitals via Sentry with prod 25% sample`

---

### T5 — Lighthouse harness upgrade (assertions error + métricas explícitas)

**Hallazgo:** `categories:performance` está en `warn` (no falla CI) y sin métricas individuales. F12 done-criteria son sobre LCP/CLS/INP, no sólo el score agregado.

**Cambios:**
- `lighthouserc.grilla.json`:
  - `categories:performance`: `["error", { "minScore": 0.9 }]`.
  - `largest-contentful-paint`: `["error", { "maxNumericValue": 2500 }]` (LCP <2.5s).
  - `cumulative-layout-shift`: `["error", { "maxNumericValue": 0.1 }]` (CLS <0.1).
  - `total-blocking-time`: `["warn", { "maxNumericValue": 300 }]` (TBT proxy de INP en simulated; INP real solo en Chrome UX Report).
- `lighthouserc.public.json`: mismas 4 nuevas assertions. `SEO error 1.0` y `accessibility error 0.95` quedan iguales (F6 + F11).
- **Re-ejecutar `pnpm lighthouse:grilla`** post-T1+T2+T3 con seed activo si Supabase up. Record honesto en `docs/audit/reports/fase-f12-raw/lhci/RESULTS.md`. Si la ejecución no llega al 0.9 score por causa externa (banner offline LCP element con throttling simulate), documentar gap honesto sin gamear y dejar TBT/CLS evidence.
- **Public**: `pnpm lighthouse:public` re-ejecutar si Supabase up; F0 baseline 94-96 + F6 imágenes priorizadas → expectativa >90 sin esfuerzo extra.

**Test T5:**
- Sin tests nuevos (lighthouserc es config). El nuevo umbral SE VALIDA al correr el harness (autotest de F12).
- Smoke: `npx lhci assert` debe parsear JSON sin error (CI lo correrá).

**Commit:** `audit(f12): T5 — Lighthouse error gate + LCP/CLS metric assertions`

---

### T6 — Memory leak regression guards

**Hallazgo:** Investigator verificó 0 leaks en código actual. F12 done-criteria #2 ya pasa de facto. Para no regresar, agregar tests que enforcer cleanup.

**Cambios:**
- `tests/unit/cleanup-regression.test.tsx` (nuevo):
  1. `ExpiryCountdown` unmount → `clearInterval` llamado (mock `global.setInterval` returns fake handle; mock `global.clearInterval`; render+unmount; expect clearInterval(handle) llamado).
  2. `PaymentStatusWatcher` unmount → idem.
  3. `pin-gate` unmount → idem.
  4. `PushNotificationManager` unmount → mock global `BroadcastChannel`; expect `bc.close()` llamado.
  5. `use-booking-realtime` renderHook unmount → channel `unsubscribe` + clearInterval del fallback poll + clearTimeout del reconcile (ya existe parcialmente en `tests/unit/use-booking-realtime.test.ts`; sumamos solo lo que faltase).
- **NO toca código de runtime.** Sólo tests.

**Test T6:** los tests SON la entrega.

**Commit:** `audit(f12): T6 — memory leak cleanup regression tests`

---

## Verificación final (lead)

1. `pnpm typecheck` — verde.
2. `pnpm lint` — 0 warnings.
3. `pnpm test` — suite unit (esperado +9 nuevos: T1 4+1, T2 1, T4 3, T6 5 — pero T1 cells + T1 memo + T2 sentry + T4 vitals 3 + T6 5 = ~15 nuevos).
4. `pnpm test:integration` — pre-existentes 53 file ECONNREFUSED + 1 fail tolerados (F11 stats).
5. `pnpm build` — exit 0 + dump del route table. Compare bundle sizes vs F0 baseline (`/grilla` 161 KB, `/staff` 190 KB, shared 150 KB).
6. **Bundle sizes verificados:**
   - Shared baseline objetivo <140 KB (era 150) — Sentry Replay −~10 KB.
   - `/grilla` objetivo igual o ligeramente menor (memo no cambia bytes, Sentry sí).
   - `/staff` objetivo <190 KB.
7. **Lighthouse re-run** si Supabase disponible:
   - `pnpm lighthouse:grilla` → score real + LCP/CLS evidence.
   - `pnpm lighthouse:public` → score real + LCP/CLS evidence.
   Si no se puede ejecutar (sin seed activo en sesión), deferral honesto a CI/pre-launch con harness listo.
8. **ANALYZE bundle:** `pnpm analyze` → screenshot del chunk de Sentry pre/post si tiempo lo permite. Sino diff de `.next/build-manifest.json` route sizes.

## Stats objetivo
- Bugs prod nuevos: 0 (perf optimization, no logic change).
- Tests nuevos: ~15.
- Deps nuevas prod: 0.
- Deps nuevas dev: 0.
- Migraciones: 0.
- Env nuevas: 0.

## Gaps esperados (documentar honestos)
- INP real (event-based) no medible por Lighthouse simulated; TBT es proxy. Medición p75 real requiere RUM en prod (vía Sentry web-vitals con sample 25% de T4, dará distribución después de 1 semana de tráfico).
- Si `/grilla` Lighthouse no llega a 0.9 por LCP causa banner offline (sin tráfico realtime en headless), documentar como F3 hizo: harness honesto + número real + causa estructural.
- Sentry Replay removido = sin video de sesiones de error. Trigger para reactivar: feedback de Marcelo / soporte queriendo ver "qué clicked el usuario". v1.5.
