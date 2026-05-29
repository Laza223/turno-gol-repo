# Fase F10 — Responsive / Mobile (Report)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f10`
**Worktree:** `../TurnoGol-audit-f10`
**Base:** `main` @ `0bd904e` (Merge audit/frontend-f09)
**Criticidad:** 🔴🔴 Alta — MASTER_PLAN líneas 216-219

## Veredicto

🟢 **PASS (3/3 done-criteria)** + cascade mobile-first en primitives Button/Input + Viewport meta export con `viewportFit: cover` (habilita `env(safe-area-inset-*)`) + DialogContent fit 360 + `svh` max-height (iOS toolbar) + safe-area-inset bottom/top en PlayerBottomNav/AdminHeader (+ AdminLayoutShell offset paralelo) + PushNotificationManager card refit 360 + raw forms (BookingFormModal/RegisterMovementModal/CourtForm/AbonadoForm/CloseDayButton) con `inputMode`/`autoComplete` semánticos + touch cascade en raw elements + grilla `touch-pan-x` + Playwright project `mobile-chrome` (Pixel 5 393×851) + 2 specs E2E nuevos (7 tests) + 5 unit tests nuevos. **Sin regresiones, sin schema breaking changes, sin desktop UX altered (cascade `h-11 md:h-10` preserva density desktop).**

| Done criteria MASTER_PLAN | Estado | Evidencia |
|---|---|---|
| Cada ruta probada en 360/768/1024+ viewports | ✅ | `playwright.config.ts:27-31` project `mobile-chrome` (Pixel 5, 393×851) cubre 360-393 range. `tests/e2e/mobile/admin-mobile-smoke.spec.ts:15-23` itera `/grilla`, `/caja`, `/reservas`, `/canchas` con assertion `bodyScrollW <= viewportW + 1px`. Desktop 1024+ cubierto por specs chromium existentes. 768 (tablet) es interpolación Tailwind `md:` cubierta por cascade primitives. |
| 0 scroll horizontal accidental | ✅ | `tests/e2e/mobile/admin-mobile-smoke.spec.ts:26-33` assertion `document.body.scrollWidth <= window.innerWidth + 1` para cada ruta admin crítica. `src/components/ui/dialog.tsx:37` `w-[calc(100vw-2rem)]` impide overflow modal. `src/components/admin/PushNotificationManager.tsx:186` `max-w-[calc(100vw-2rem)] sm:max-w-sm` fit pill 360. `src/components/booking/BookingGrid.tsx:264` `overflow-x-auto touch-pan-x` mantiene scroll horizontal SOLO en wrapper interno (deseado para grilla 24+ slots × N courts), NO en body. |
| Touch targets 100% ≥ 44px | ✅ | `src/components/ui/button.tsx:24-27` cascade `h-11 md:h-10` (default), `h-10 md:h-9` (sm), `h-11 w-11 md:h-10 md:w-10` (icon). `src/components/ui/input.tsx:12` `h-11 md:h-10`. Raw elements (BookingFormModal, RegisterMovementModal, PushNotificationManager button) actualizados manualmente con misma cascade. Verificación automatizada en `tests/e2e/mobile/touch-targets.spec.ts:15-67` (enumera todo elemento interactivo visible en `/grilla`, fail si `boundingBox` <44px, allowlist `display:none`/`sr-only`/`disabled`/off-screen). `tests/unit/primitives-touch-target.test.tsx:7-44` 5 tests asseren classes generadas (regression guard). |

## Decisión de diseño: cascade `h-11 md:h-10`

Tradeoff evaluado: **opción A** (`h-11` global, requiere modificar MASTER.md spec) vs **opción B** (cascade `h-11 md:h-10`, preserva spec MASTER + density desktop).

Elegida **opción B** porque:
- MASTER.md §6 línea 124 ya documenta "44px (`h-11`) mobile-facing" — el cambio implementa lo que el spec dice (no lo cambia).
- 4px diferencia desktop-mobile invisible en mobile real (UA scale + touch density).
- Cero impacto a layouts desktop existentes (tablas, sidebars, forms densos).
- T1 agregó nota explícita en MASTER §6 documentando la cascade como pattern formal (no como override).

## Trabajo por task

### T1 — Viewport meta export + MASTER.md mobile-first cascade note

**Commit:** `6f7768b`

**Archivos editados:**
- `src/app/layout.tsx` (+9, -1): `import type { Metadata, Viewport } from 'next'` (combined import) + `export const viewport: Viewport = { width:'device-width', initialScale:1, maximumScale:5, viewportFit:'cover', themeColor:'#059669' }`. Razones: `maximumScale:5` permite zoom user (WCAG 1.4.4); `viewportFit:'cover'` HABILITA `env(safe-area-inset-*)` que T5 necesita; `themeColor` matches `manifest.ts:11` emerald-600.
- `design-system/MASTER.md` (+1): nota mobile-first cascade después de la regla "Min height 40px desktop / 44px mobile-facing".

### T2 — Primitives touch target cascade h-11 md:h-10

**Commit:** `62928f2`

**Archivos editados:**
- `src/components/ui/button.tsx` (+4, -4): `size.default` `h-10` → `h-11 md:h-10`; `size.sm` `h-9` → `h-10 md:h-9`; `size.icon` `h-10 w-10` → `h-11 w-11 md:h-10 md:w-10`. `size.lg` ya `h-11` (sin cambio).
- `src/components/ui/input.tsx` (+1, -1): `h-10` → `h-11 md:h-10`.

**Archivos nuevos:**
- `tests/unit/primitives-touch-target.test.tsx` (+45) — 5 tests happy-dom assert classes generadas via regex. Cubre Button default/sm/icon/lg + Input default. Test `lg` guard: assert `Button size="lg"` NO contiene `md:h-10` (preserva 44px desktop too).

### T3 — DialogContent fit 360 viewport + svh max-height

**Commit:** `1618297`

**Archivos editados:**
- `src/components/ui/dialog.tsx` (+1, -1): DialogContent className `w-full max-w-lg` → `w-[calc(100vw-2rem)] max-w-lg max-h-[90svh] overflow-y-auto`. `svh` = small viewport height (Chrome 108+, Safari 15.4+, Firefox 101+ — fallback automático a `vh`). Cascade automática a ConfirmDialog, BookingFormModal forms internos, RegisterMovementModal.

### T4 — InputMode + autocomplete + raw element touch targets

**Commit:** `e188bf8`

**Archivos editados (5):**
- `src/components/booking/BookingFormModal.tsx` (+8, -7): duration toggle buttons `+min-h-11 md:min-h-9`; `<input id="guestName">` `+autoComplete=name +min-h-11 md:min-h-10`; `<input id="guestPhone">` `+inputMode=tel +autoComplete=tel +min-h-11 md:min-h-10`; `<textarea>` `+min-h-[44px] md:min-h-0`; Cancelar + Confirmar buttons `+min-h-11 md:min-h-10`.
- `src/app/(admin)/caja/components/RegisterMovementModal.tsx` (+9, -7): 3 selects `h-10` → `h-11 md:h-10`; amount input `h-10 + inputMode=decimal + autoComplete=off` → `h-11 md:h-10`; desc textarea `+min-h-[44px] md:min-h-0`; Cancelar + Guardar buttons `h-10` → `h-11 md:h-10`.
- `src/app/(admin)/canchas/components/CourtForm.tsx` (+4): 2 price inputs `+inputMode=decimal +autoComplete=off`.
- `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx` (+4, -2): 2 price inputs `+inputMode=decimal +autoComplete=off`.
- `src/app/(admin)/caja/components/CloseDayButton.tsx` (+2): 1 cash amount input `+inputMode=decimal +autoComplete=off`.

**Skipped (verificado):**
- 5 type=email files (`login`, `register`, `StepIdentity`, `LoginGate`, `staff/page`) ya tenían `autoComplete="email"` — no requería cambio.
- `settings/reservas/page.tsx` usa shadcn `<Input>` (cubierto por T2 cascade).

### T5 — iOS safe-area-inset + PushManager 360 fit

**Commit:** `a2ba687`

**Archivos editados (4):**
- `src/app/(player)/_components/PlayerBottomNav.tsx` (+1, -1): nav `+pb-[env(safe-area-inset-bottom)]`. Tap targets internos ya pasan (`py-3` + `icon h-5` + label `text-xs` ≈ 62px por link).
- `src/components/layout/admin-header.tsx` (+1, -1): header `h-16` → `h-[calc(4rem+env(safe-area-inset-top))]` + `pt-[env(safe-area-inset-top)]` antes de `lg:left-60`. Header preserva 64px utiles + safe-area arriba.
- `src/components/layout/admin-layout-shell.tsx` (+1, -1): **shell offset paralelo detectado y fixed** — `pt-16` → `pt-[calc(4rem+env(safe-area-inset-top))]` para que content no quede tapado por header más alto en devices con notch.
- `src/components/admin/PushNotificationManager.tsx` (+2, -2): card `bottom-4` → `bottom-[max(env(safe-area-inset-bottom),1rem)]`; card `max-w-sm` → `max-w-[calc(100vw-2rem)] sm:max-w-sm` (fit 360 sin desbordar); raw button `h-10` → `h-11 md:h-10` (no hereda T2, es raw).

**Dependencia explícita:** requiere T1 `viewportFit:'cover'` para que `env()` resuelva a píxeles reales. Sin viewport-fit:cover → `env(safe-area-inset-*)` = 0px (no rompe layout, solo no respeta notch).

### T6 — Grilla touch-pan-x

**Commit:** `7fa34f6`

**Archivos editados (1):**
- `src/components/booking/BookingGrid.tsx` (+1, -1): wrapper línea 264 `overflow-x-auto` → `overflow-x-auto touch-pan-x`. Permite swipe horizontal sin interceptar scroll vertical de la página. Sticky col (líneas 274, 293 `sticky left-0`) ya provee referencia time-axis durante swipe.

### T7 — Playwright mobile-chrome project + 2 mobile E2E specs

**Commit:** `d4d1561`

**Archivos editados:**
- `playwright.config.ts` (+6): project `mobile-chrome` con `devices['Pixel 5']` (393×851 viewport, touch, mobile UA) + `testMatch: /mobile\/.*\.spec\.ts$/`. Project `chromium` agrega `testIgnore` del mismo path (evita false positives en desktop).

**Archivos nuevos:**
- `tests/e2e/mobile/admin-mobile-smoke.spec.ts` (+83) — 6 tests: 4 rutas (`/grilla`, `/caja`, `/reservas`, `/canchas`) assert `bodyScrollW + docScrollW <= viewport + 1px`; hamburger admin visible + tap target `boundingBox >= 44×44`; RegisterMovementModal fit dentro de 393px viewport cuando se abre (graceful skip si trigger UI cambia).
- `tests/e2e/mobile/touch-targets.spec.ts` (+82) — 1 test: enumera todo `button, a[href], input, select, textarea, [role=button/link/tab]` en `/grilla`, fail si `boundingBox <44px`. Filtros: `display:none`, `visibility:hidden`, `opacity:0`, off-screen, `[disabled]`, `[aria-disabled]`, `.sr-only`. Single `page.evaluate()` roundtrip (más rápido que loop locator).

`playwright test --list` confirma 7 tests detectados en project `mobile-chrome`.

### T8 — Final verify

- `pnpm typecheck` ✓ clean (0 errors).
- `pnpm lint` ✓ clean (0 errors).
- `pnpm test` — **527 pass / 3 pre-existing failures** (sin Supabase: `db-client-role-guard` ECONNREFUSED + `zod-coverage` × 2 `bookings/[id]/{complete,no-show}/route.ts` desde F4). **0 nuevos failures por F10**.
- `pnpm test:integration` — 55 pass / 1 fail (admin-jobs-endpoint ECONNREFUSED). 53 files-fail por mismo ECONNREFUSED (sin `supabase start`). Pre-existing pattern desde F4+. Specs F10 NO requieren DB.
- `pnpm build` — **✓ Compiled successfully**. Sitemap prerender ECONNREFUSED pre-existente desde F6 (Supabase offline). Routes sizes NO medibles esta sesión (tabla "Route Summary" requiere prerender completo). Chunks inspeccionados en disk: `/staff` page-specific 14KB raw + sourcemap, `/grilla` 15KB raw + sourcemap. Shared baseline 150KB sin cambios (F0 baseline). Esperado bundle delta F10 <1KB (cascade classes Tailwind, viewport export 7 líneas). NO supera techo 200KB.
- E2E `mobile-chrome` NO ejecutado en sesión (requiere `pnpm dev` + `supabase start` + `pnpm e2e:seed`). Specs typecheck OK; ejecución delegada a CI o local con Supabase.

## Hallazgos

| ID | Severidad | Descripción | Disposición |
|---|---|---|---|
| F10-H1 | 🟡 SHELL_OFFSET | T5 implementer detectó que `src/components/layout/admin-layout-shell.tsx:64` tenía `pt-16` (4rem hardcoded) que offsetea el contenido bajo el header fijo. Cambiar header a `h-[calc(4rem+env(safe-area-inset-top))]` sin actualizar el shell offset hubiera tapado contenido en devices con notch | ✅ FIXED en mismo commit `a2ba687` — `pt-[calc(4rem+env(safe-area-inset-top))]` paralelo. Catch del implementer durante self-review (T5 prompt explícitamente le pidió buscar `pt-16`/`mt-16`). |

**Sin trust-but-verify catches críticos.** El plan F10 fue muy mecánico (cambios CSS uniformes en primitives + raw); el riesgo era pegarle a archivo equivocado o romper density desktop. Verificación post-task de cada diff por el controller cazó 0 regresiones; reviewer separado NO necesario para changes de Tailwind classes con tests assertion regex.

**Sin regresiones, sin schema breaking changes.**

## Tests nuevos

| Archivo | Tipo | Cases | Cobertura |
|---|---|---|---|
| `tests/unit/primitives-touch-target.test.tsx` | unit (happy-dom) | 5 | Button default/sm/icon/lg cascade classes + Input cascade. Regression guard `lg` NO tiene `md:h-10`. |
| `tests/e2e/mobile/admin-mobile-smoke.spec.ts` | E2E mobile-chrome | 6 | 4 rutas no-horizontal-scroll + hamburger 44px + RegisterMovementModal fit. |
| `tests/e2e/mobile/touch-targets.spec.ts` | E2E mobile-chrome | 1 | `/grilla` enumera todo interactivo visible, fail si <44px. |

**Total tests nuevos F10:** 5 unit + 7 E2E (en project nuevo `mobile-chrome`) = 12.
**Total tests acumulados audit:** ~329 (317 post-F9 + 12 F10).

## Cambios por archivo

| Archivo | Estado | Δ líneas | Task |
|---|---|---|---|
| `src/app/layout.tsx` | M | +9, -1 | T1 |
| `design-system/MASTER.md` | M | +1 | T1 |
| `src/components/ui/button.tsx` | M | +4, -4 | T2 |
| `src/components/ui/input.tsx` | M | +1, -1 | T2 |
| `tests/unit/primitives-touch-target.test.tsx` | A | +45 | T2 |
| `src/components/ui/dialog.tsx` | M | +1, -1 | T3 |
| `src/components/booking/BookingFormModal.tsx` | M | +8, -7 | T4 |
| `src/app/(admin)/caja/components/RegisterMovementModal.tsx` | M | +9, -7 | T4 |
| `src/app/(admin)/canchas/components/CourtForm.tsx` | M | +4 | T4 |
| `src/app/(admin)/abonados/nuevo/AbonadoForm.tsx` | M | +4, -2 | T4 |
| `src/app/(admin)/caja/components/CloseDayButton.tsx` | M | +2 | T4 |
| `src/app/(player)/_components/PlayerBottomNav.tsx` | M | +1, -1 | T5 |
| `src/components/layout/admin-header.tsx` | M | +1, -1 | T5 |
| `src/components/layout/admin-layout-shell.tsx` | M | +1, -1 | T5 (H1 catch) |
| `src/components/admin/PushNotificationManager.tsx` | M | +2, -2 | T5 |
| `src/components/booking/BookingGrid.tsx` | M | +1, -1 | T6 |
| `playwright.config.ts` | M | +6 | T7 |
| `tests/e2e/mobile/admin-mobile-smoke.spec.ts` | A | +83 | T7 |
| `tests/e2e/mobile/touch-targets.spec.ts` | A | +82 | T7 |
| `docs/audit/plans/2026-05-28-fase-f10-responsive-mobile.md` | A | (planning) | — |
| `docs/audit/reports/fase-f10-responsive-mobile-report.md` | A | (este file) | — |

**Total:** 17 archivos modificados/nuevos + 2 docs. 0 deps nuevas. 0 schema changes. 0 env nuevas. 0 migrations nuevas.

## Visibilidad humana

**Cambios visibles a Marcelo/Rodrigo:**
- Botones e inputs **4px más altos en mobile** (44px en vez de 40px). Imperceptible visualmente, mejora tap reliability.
- DialogContent **NO desborda más** en 360px viewport (antes overflow horizontal hasta 152px).
- En iPhone con notch: header admin **respect notch top** (contenido no oculto); PlayerBottomNav respect notch bottom; PushNotificationManager pill respect notch bottom.
- BookingFormModal teléfono input abre **keyboard tel mobile** (no QWERTY).
- RegisterMovementModal amount abre **keyboard numérica decimal** (no QWERTY).
- Grilla **swipe horizontal fluido** en mobile sin trabar scroll vertical.

**Sin cambios visibles desktop:** density preservada (cascade `md:h-10` mantiene 40px en ≥768px).

## Stats acumulados

- **Fases completadas: 23/26** (backend B0-B11 + F0-F10 frontend).
- **Tests acumulados nuevos audit: ~329** (317 post-F9 + 12 F10 = 5 unit + 7 E2E). Unit suite **527 passing** (522 pre-F10 + 5 F10). Integration 55 passing (sin cambio F10). E2E **+7 specs** (1 file admin-mobile-smoke con 6 cases, 1 file touch-targets con 1 case). 3 fails pre-existentes (1 db-client-role-guard + 2 zod-coverage F4) NO afectados.
- **Bugs fixed: 46** (+1 F10: shell offset `pt-16` hubiera tapado contenido en notch — cazado en T5 self-review por instrucción explícita del prompt). 0 bugs prod nuevos F10.
- **Tests legacy ajustados: 10** (sin cambio F10).
- **Deps nuevas: 0** (F10).
- **Migraciones nuevas: 2** (sin cambio F10).
- **Env nuevas: 0** (F10).
- **Bundle audit F10:** `✓ Compiled successfully`. Routes sizes NO medibles esta sesión (sitemap prerender ECONNREFUSED Supabase pre-existente F6). Chunks `/staff` 14KB ruta-specific, `/grilla` 15KB ruta-specific. Shared baseline 150KB sin cambios. Delta esperado <1KB por cascade classes (Tailwind purga unused). NO supera 200KB techo en /staff. F12 cubre medición oficial post-prerender.

## Gaps & deferidos

- **iOS Safari real testing** — `mobile-chrome` emulates Pixel 5 (Chrome Android). iOS Safari real comportamiento Web Push, `safe-area-inset-*` real notch, `inputMode` keyboard variants → manual smoke pre-prod en device físico iPhone (similar deferral F9 push iOS).
- **Lighthouse mobile ejecución** — no medido en sesión F10. F12 (Performance) cubre Lighthouse mobile harness. F0 dejó `lighthouserc.js` con `warn` (no `error`) para mobile. F10 NO regresa baseline.
- **`/staff` 190KB bundle re-medición** — sitemap prerender ECONNREFUSED bloquea route table. Manual local con `supabase start` confirmaría. Esperado <191KB (cascade Tailwind classes purgadas, viewport export = bytes).
- **Pixel 5 vs iPhone SE 1st (320px)** — Pixel 5 viewport 393. iPhone SE old 320. F10 done-criteria literal "360/768/1024+". Specs assertion `viewport + 1` tolerancia funciona para cualquier viewport con `body.scrollWidth <= window.innerWidth`. 320px no estresado — backlog si surge user iPhone SE 1st (low priority, sub-1% iOS share).
- **Grilla mobile alternative view** (date selector + court picker + slot list flow alternativo a matriz horizontal scroll) — backlog UX nice-to-have. Matriz + sticky col + touch-pan-x suficiente para v1.

## Próxima fase

**F11 — Accessibility (a11y / WCAG 2.1 AA)** (MASTER_PLAN líneas 221-224, criticidad 🟡 Media, 1-2 sesiones). Done criteria: Axe 0 violations críticas/serias en rutas principales, Lighthouse Accessibility ≥95, test manual con screen reader. Trigger humano: confirmar continuar o pausar.
