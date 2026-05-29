# Plan — Fase F11: Accessibility (a11y / WCAG 2.1 AA)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f11`
**Worktree:** `../TurnoGol-audit-f11`
**Base:** `main` @ `d98f2ee` (Merge audit/frontend-f10)
**Criticidad:** 🟡 Media — MASTER_PLAN líneas 221-224

## Objetivo

Cumplir WCAG 2.1 AA en rutas críticas. Evitar demanda. Axe-core 0 violations críticas/serias, Lighthouse Accessibility ≥95, screen-reader smoke documentado.

## Done criteria (literal MASTER_PLAN 221-224)

| # | Criterio | Cómo se mide |
|---|----------|--------------|
| 1 | Axe 0 violations críticas/serias en rutas principales | Playwright + `@axe-core/playwright` recorre 13 rutas (public + auth + player + admin), assertion `violations.filter(v => ['critical','serious'].includes(v.impact)).length === 0` |
| 2 | Lighthouse Accessibility ≥95 | `lighthouserc.grilla.json` + `lighthouserc.public.json` agregan `categories:accessibility` con `minScore:0.95` hard error en assert phase |
| 3 | Test manual con screen reader | NVDA Windows smoke 30min sobre `/login`, `/explorar`, `/mis-reservas`, `/grilla` documentado en report. Si NVDA no disponible, deferral honesto con próximo trigger explícito |

## Hallazgos del investigator (baseline a11y)

**Críticos (6):**
1. 31× `focus:` en vez de `focus-visible:` en form inputs / buttons raw → keyboard focus ring sobrevive a `:focus-visible` solo si está en `focus-visible:` (sino aparece también en clicks de mouse — anti-pattern).
2. `button.tsx:6` usa `ring-ring` (CSS var resuelve a emerald-500 vía `globals.css:34`, pero MASTER §10 dice literal `ring-emerald-500` — `input.tsx:12` ya cumple).
3. No skip-to-content link en ningún layout (`layout.tsx`, `(admin)`, `(player)`, `(public)`).
4. `Skeleton` (skeleton.tsx) sin `motion-reduce` (animation shimmer `.skeleton` no respeta `prefers-reduced-motion`).
5. `aria-current="page"` ausente en `PlayerBottomNav` + `AdminSidebar` (active link solo color-coded — emerald-700 vs slate, OK para sighted pero no para SR).
6. Toast usa Radix Provider (provee aria-live por default) — confirmado por inspección; no requiere fix.

**Serious (8):**
7. `Input` primitive no expone helper para `aria-invalid` (users lo pasan manual cuando hay error — 3 usos correctos: `login`, `register`, `BookingFormModal`; no es regression bloqueante).
8. No axe-core test suite (creamos en T5).
9. `confirm-dialog.tsx:90` input usa `focus:` (no `focus-visible:`) + raw Cancel/Confirm buttons (líneas 100, 108) sin focus-visible ring.
10. `dialog.tsx:43` `DialogPrimitive.Close` usa `focus:` triple (no `focus-visible:`).
11-12. Onboarding `StepIdentity.tsx` (4) + `ProfileForm.tsx` (4) + `CourtForm.tsx` (8) inputs raw con `focus:` (incluidos en cascade T2).
13. `<nav>` semantic landmarks: `PlayerBottomNav` + `AdminSidebar` ya tienen `<nav>` pero faltan `aria-label`.

**Manual review (sin fix necesario):**
14. `text-slate-500` borderline 4.6:1 sobre slate-50 (AA pasa, AAA falla; design system explícitamente acepta — no fix).
15. Toast Radix Provider aria-live verificado en código.
16. Tab order grilla — manual smoke screen reader (T6).
17. ConfirmDialog focus trap — Radix Dialog (testeado en F4, T6 re-verify).
18. Mobile touch targets — F10 ya cubrió (`tests/e2e/mobile/touch-targets.spec.ts`).

## Tasks

### T1 — Skip-to-content link + main landmark id

**Objetivo:** primer Tab desde page-load salta al main content (skip nav). WCAG 2.4.1 (Bypass Blocks).

**Archivos a editar:**
- `src/app/layout.tsx`: agregar `<a href="#main-content">` antes de `{children}`, sr-only por default, `focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg`. Texto: "Saltar al contenido".
- `src/components/layout/admin-layout-shell.tsx:73`: `<main>` → `<main id="main-content">`.
- `src/app/(player)/layout.tsx`: localizar wrapper de `{children}`, asegurar `<main id="main-content">`.
- `src/app/(public)/layout.tsx`: idem.
- `src/app/(auth)/layout.tsx` (si existe): idem.

**Tests:**
- `tests/unit/skip-to-content.test.tsx`: render root layout, assert link presente con `href="#main-content"` y sr-only classes.
- `tests/e2e/a11y/skip-link.spec.ts`: navigate `/grilla`, press Tab, assert focused element matches skip link, press Enter, assert URL hash `#main-content`.

**Commit prefix:** `audit(f11): T1 add skip-to-content link + main landmark id`

### T2 — Focus-visible cascade (primitives + dialog + 31 raw inputs)

**Objetivo:** keyboard focus ring SOLO aparece en keyboard nav (`:focus-visible`), no en mouse click. WCAG 2.4.7 (Focus Visible).

**Archivos a editar:**

**Primitives:**
- `src/components/ui/button.tsx:6`: `focus-visible:ring-ring` → `focus-visible:ring-emerald-500` (alinear con input.tsx + MASTER.md §10 spec literal).
- `src/components/ui/dialog.tsx:43`: `focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2` → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`.
- `src/components/ui/confirm-dialog.tsx:90`: input cascade `focus:` → `focus-visible:` (3 classes); líneas 100, 108 raw buttons: agregar `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`.

**Raw inputs (11 archivos):**
- `src/app/(admin)/abonados/AbonadosList.tsx:322`
- `src/app/(admin)/canchas/components/CourtForm.tsx:172, 184, 202, 254, 263, 276, 289`
- `src/app/(admin)/reservas/[id]/BookingActions.tsx:134`
- `src/app/(player)/mis-reservas/CancelBookingButton.tsx:69`
- `src/app/(player)/perfil/ProfileForm.tsx:56, 70, 85, 99`
- `src/app/(public)/explorar/components/SearchBar.tsx:66`
- `src/app/(public)/[slug]/reservar/components/LoginGate.tsx:53`
- `src/app/onboarding/components/StepIdentity.tsx:70, 91, 105, 117`

**Cambio mecánico:** cada ocurrencia de `focus:outline-none focus:ring-X focus:ring-emerald-500` (y derivados) se cambia a `focus-visible:` equivalente. NO tocar `hover:` ni otros estados. NO tocar bordes (border state OK). Si la línea tiene solo `focus:border-emerald-600` para color de borde, ese SE QUEDA (no es ring, es border que cambia color en focus — UX feedback fine).

**Tests:**
- `tests/unit/focus-visible-primitives.test.tsx`: render Button + Input + Dialog close button + ConfirmDialog (open) input/buttons, assert classes contienen `focus-visible:` y NO contienen `focus:outline-none focus:ring` standalone.
- No agregar tests por cada raw input file (sobre-cubre — cascade text replace verifica via grep en T6).

**Commit prefix:** `audit(f11): T2 cascade focus-visible:ring-emerald-500 (primitives + 11 raw forms)`

### T3 — Skeleton motion-reduce + role status + aria-label

**Objetivo:** WCAG 2.3.3 (Animation from Interactions — respect prefers-reduced-motion) + WCAG 4.1.3 (Status Messages — anunciar loading).

**Archivos a editar:**
- `src/app/globals.css`: agregar `@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }` debajo de def `.skeleton` (línea 69-77).
- `src/components/ui/skeleton.tsx`: 
  - Agregar prop `label?: string` (default `'Cargando…'`).
  - Render: `<div role="status" aria-label={label} aria-busy="true" ...>`. Si caller pasa `aria-hidden="true"` (skeleton decorativo), no agregar role/label (props override via spread, ya soportado).

**Tests:**
- `tests/unit/skeleton.test.tsx`: render Skeleton, assert `role="status"`, `aria-label="Cargando…"`, `aria-busy="true"`. Render con prop `label="Cargando reservas…"`, assert aria-label cambia. Render con `aria-hidden="true"`, assert no role.

**Commit prefix:** `audit(f11): T3 Skeleton motion-reduce + role status + aria-label`

### T4 — Navigation aria-label + aria-current="page"

**Objetivo:** WCAG 1.3.1 (Info and Relationships — landmark labels) + WCAG 4.1.2 (Name, Role, Value — current page state).

**Archivos a editar:**
- `src/app/(player)/_components/PlayerBottomNav.tsx`:
  - Línea 16: `<nav className="...">` → `<nav aria-label="Navegación del jugador" className="...">`.
  - Línea 20-30 Link: agregar `aria-current={active ? 'page' : undefined}`.
- `src/components/layout/admin-sidebar.tsx`:
  - Línea 89: `<nav className="...">` → `<nav aria-label="Navegación del panel" className="...">`.
  - Línea 96-124 Link: agregar `aria-current={isActive ? 'page' : undefined}`.

**Tests:**
- `tests/unit/navigation-aria.test.tsx` (happy-dom):
  - Render PlayerBottomNav con pathname `/mis-reservas`, assert nav has `aria-label="Navegación del jugador"`, active Link has `aria-current="page"`, inactive Links no.
  - Render AdminSidebar (mocked tenantName), pathname `/grilla`, idem para AdminSidebar.

**Commit prefix:** `audit(f11): T4 nav aria-label + aria-current=page (player+admin)`

### T5 — Axe-core test suite + Lighthouse a11y assertion ≥95

**Objetivo:** done-criteria 1+2 — automated regression guard.

**Dep nueva:**
- `pnpm add -D @axe-core/playwright` (justify: F11 done-criteria 1 hard requirement; standalone audit usage no inflate prod bundle).

**Archivos a editar:**
- `playwright.config.ts`: agregar project `axe-audit` con `testMatch: /a11y\/.*\.spec\.ts$/` + usa `storageState: adminStorageState` o `playerStorageState` según spec. Project `chromium` agrega `testIgnore` correspondiente.
- `lighthouserc.grilla.json`: agregar a `assertions`: `'categories:accessibility': ['error', { minScore: 0.95 }]`.
- `lighthouserc.public.json`: idem (verify si ya existe).

**Archivos nuevos:**
- `tests/e2e/a11y/_helpers.ts`: factory `expectNoAxeViolations(page, { include?, exclude?, disableRules? })` — uses `AxeBuilder`, filters `violations.filter(v => ['critical','serious'].includes(v.impact))`, asserts length 0 con mensaje rico (lista violation IDs + nodes).
- `tests/e2e/a11y/public.spec.ts`: 4 tests — `/`, `/explorar`, `/login`, `/register` (sin auth).
- `tests/e2e/a11y/player.spec.ts`: 3 tests — `/mis-reservas`, `/perfil`, `/configuracion` (playerStorageState).
- `tests/e2e/a11y/admin.spec.ts`: 6 tests — `/dashboard`, `/grilla`, `/reservas`, `/caja`, `/canchas`, `/reportes` (adminStorageState).

Cada test: `page.goto(route)` → `page.waitForLoadState('networkidle')` → `expectNoAxeViolations(page)`.

**Tests:**
- Los 13 specs SON los tests (regression guard intrínseco). No agregar tests sobre tests.

**Commit prefix:** `audit(f11): T5 axe-core a11y suite (13 routes) + Lighthouse a11y ≥95 assert`

### T6 — Verify final + screen reader smoke + report

**Objetivo:** evidence-before-assertion. Ejecutar verify suite + manual smoke + report house-style.

**Steps:**
1. `pnpm typecheck` → 0 errors.
2. `pnpm lint` → 0 new warnings (preexistentes preservados).
3. `pnpm test` → unit suite passing (T2 + T3 + T4 nuevos tests verdes).
4. `pnpm test:integration` → tolerar 3 fails pre-existentes (zod-coverage × 2 + db-client-role-guard × 1).
5. `pnpm build` → `✓ Compiled successfully`.
6. `pnpm playwright test --project axe-audit` → 13 specs verdes.
7. **Screen reader smoke (manual):** intentar NVDA en Windows. Si NVDA instalado: 30min smoke sobre `/login`, `/explorar`, `/mis-reservas`, `/grilla`. Si NVDA no disponible: deferral honesto en report con trigger explícito ("ejecutar pre-launch o cuando NVDA se instale").
8. **Lighthouse:** ejecutar `pnpm lighthouse:grilla` si seed/Supabase disponible. Si no, deferral honesto (harness listo, assert config en place).
9. Generar `docs/audit/reports/fase-f11-accessibility-report.md` (house-style F10).
10. Actualizar `docs/audit/STATE.md` (F11 → completed, próxima F12, stats 24/26).

**Commit prefix:** `audit(f11): T6 verify pass + report`

## Riesgos / Precauciones

- **`ring-ring` → `ring-emerald-500` en button.tsx:** ambos resuelven a `#10B981` (verificado en globals.css:34). Cambio NO altera color renderizado, solo alinea con MASTER spec literal. Sin breaking visual.
- **`focus:` → `focus-visible:` cascade:** algunos browsers viejos (Safari <15.4) no soportan `:focus-visible`. Polyfill innecesario en 2026 (Safari 15.4+ ships 2022). Sin breaking.
- **Skeleton role="status":** caller que pasa `aria-hidden="true"` propaga via spread (Skeleton ...props) y override role inviabiliza announcement — comportamiento deseado para decorative. Sin breaking.
- **PlayerBottomNav active link color-only:** `aria-current="page"` resuelve SR announce sin cambios visuales. Visualmente emerald-700 vs slate-500 ya provee contraste suficiente para sighted (deferral mejora visual a v1.5 si feedback).
- **axe-core Playwright integration:** lib produce reports con `page.evaluate` — works con Next 14 client+server hydration. Run después de `waitForLoadState('networkidle')` evita falsos positivos pre-hydration.
- **Lighthouse a11y ≥95:** target alcanzable post-T1-T4 (baseline ya en 88-89 grilla, gap mayoritariamente perf no a11y). Si <95 detectado en T5, T6 documenta delta.
- **NVDA Windows:** descarga free de nvaccess.org. Si Lazaro no lo tiene, deferral aceptado por scope F11 (axe + Lighthouse cubre ~85%).
- **MP_MOCK_MODE:** F11 NO usa. F7 lo dejó disponible.
- **No schema changes.**
- **No deps prod nuevas** (`@axe-core/playwright` es devDep).

## Estimación

| Task | Estimado |
|------|----------|
| T1 — Skip-link | 30min |
| T2 — Focus-visible cascade | 45min |
| T3 — Skeleton motion-reduce | 20min |
| T4 — Nav aria | 25min |
| T5 — Axe + Lighthouse | 60min |
| T6 — Verify + report | 45min |
| **Total** | **~3.5h** (1-2 sesiones spec) |

## Próxima fase

F12 — Performance / Core Web Vitals (MASTER_PLAN 226-229, criticidad 🔴🔴 Alta).
