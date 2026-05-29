# Fase F10 — Responsive / Mobile (Plan)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f10`
**Worktree:** `../TurnoGol-audit-f10`
**Base:** `main` @ `0bd904e` (Merge audit/frontend-f09: Fase F9 Notificaciones)
**Criticidad:** 🔴🔴 Alta — MASTER_PLAN líneas 216-219

## Done criteria (MASTER_PLAN literal)

- Cada ruta probada en 360/768/1024+ viewports.
- 0 scroll horizontal accidental.
- Touch targets 100% ≥ 44px.

## Hallazgos del investigator (file:line)

1. **Viewport meta ausente** — `src/app/layout.tsx` sin `export const viewport`. Defaults Next.js aplican pero no se documenta `maximumScale` (a11y) ni `themeColor`. `manifest.ts:11` ya tiene `theme_color: '#059669'` ✓.
2. **Touch targets <44px (40+ instancias)** — Primitives `button.tsx:24` default `h-10` (40px), `:25` sm `h-9` (36px), `:27` icon `h-10` (40px). `input.tsx:12` `h-10` (40px). MASTER.md §6 línea 124 declara "h-11 mobile-facing" — spec violado por impl.
3. **DialogContent desborda 360** — `dialog.tsx:37` `max-w-lg` (32rem=512px) sin override mobile. ConfirmDialog/RegisterMovementModal/BookingFormModal heredan automaticamente.
4. **Inputs sin `inputMode` en forms críticos** — `BookingFormModal.tsx:142,160,184` phone/email/textarea, `RegisterMovementModal.tsx:115` amount sin `inputMode="numeric"`. PIN inputs ya OK (`pin-gate.tsx:119-130`).
5. **0 safe-area-inset** — `PlayerBottomNav.tsx:23` fixed bottom-0 sin `env(safe-area-inset-bottom)`. AdminHeader sin safe-area top.
6. **0 tests responsive** — Playwright `playwright.config.ts` projects solo `chromium` desktop. Sin `devices['Pixel 5']` o viewport mobile.
7. **PlayerBottomNav `py-3`** (36px FAIL) — `PlayerBottomNav.tsx:23`.
8. **Hamburger admin h-10** — `admin-header.tsx:22` `size="icon"` heredando h-10. Cascade T2 resuelve.
9. **Grilla mobile** — `BookingGrid.tsx:264` `overflow-x-auto` con sticky col, sin `touch-pan-x`. Funciona pero swipe puede mejorarse.
10. **Manifest theme_color OK** — `manifest.ts:11` ya tiene `#059669`. Sin acción.

## Decisión de diseño: touch target cascade `h-11 md:h-10`

**Por qué:** MASTER.md §6 línea 124 dice "h-10 desktop / h-11 mobile-facing". Done-criteria F10 = "100% ≥44px". Opción más limpia: primitives cambian a cascada mobile-first (`h-11 md:h-10`) — mobile cumple ≥44px, desktop preserva density 40px del spec. NO modifica MASTER.md (mantiene spec intacto). NO requiere pausa de aprobación visual (4px diff invisible en mobile, desktop sin cambio).

**Tradeoff descartado:** `h-11` global (cambia spec MASTER + density desktop). `h-11 md:h-10` es preferible: cumple criterio sin tocar UX desktop ni el spec doc.

## Plan de tareas

### T1 — Viewport meta export + nota mobile-first en MASTER.md

**Archivos:**
- `src/app/layout.tsx` — agregar `export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, themeColor: '#059669' }`. Tipo import desde `next`. `maximumScale: 5` permite zoom user (a11y).
- `design-system/MASTER.md` — agregar nota en §6 después de "Min height: 40px (`h-10`) desktop / 44px (`h-11`) mobile-facing": "Primitives use cascade `h-11 md:h-10` to enforce 44px on mobile viewports without sacrificing desktop density."

**Tests:** ninguno nuevo (cambio cosmético/metadata).

### T2 — Primitives touch target cascade (button + input)

**Archivos:**
- `src/components/ui/button.tsx`:
  - `size.default`: `'h-10 px-4 py-2'` → `'h-11 px-4 py-2 md:h-10'`
  - `size.sm`: `'h-9 rounded-md px-3'` → `'h-10 rounded-md px-3 md:h-9'`
  - `size.icon`: `'h-10 w-10'` → `'h-11 w-11 md:h-10 md:w-10'`
  - `size.lg`: ya `h-11` (sin cambio)
- `src/components/ui/input.tsx`:
  - `'flex h-10 w-full ...'` → `'flex h-11 w-full md:h-10 ...'`

**Tests:** `tests/unit/primitives-touch-target.test.tsx` (nuevo) — assert que el render del `<Button />` default y `<Input />` incluyen `h-11` y `md:h-10` en classes (regex match). 4 tests: button default, button sm, button icon, input.

### T3 — DialogContent fit 360 + svh max-height

**Archivos:**
- `src/components/ui/dialog.tsx` (línea 37): `'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 bg-white p-6 ...'` → `'fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-lg max-h-[90svh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 bg-white p-6 ...'`. `w-[calc(100vw-2rem)]` evita overflow (1rem margin cada lado). `max-h-[90svh]` usa small viewport height (iOS toolbar respect). `overflow-y-auto` scroll interno si content excede.

**Tests:** Ya cubierto en E2E mobile (T7).

### T4 — InputMode + autocomplete en forms críticos

**Archivos:**
- `src/components/booking/BookingFormModal.tsx`:
  - Input phone (`type="tel"`): agregar `inputMode="tel"` + `autoComplete="tel"`
  - Input email: `inputMode="email"` + `autoComplete="email"`
  - Input guests/count si existe: `inputMode="numeric"` + `pattern="[0-9]*"`
- `src/app/(admin)/caja/RegisterMovementModal.tsx`:
  - Input amount (`type="number"`): `inputMode="decimal"` (acepta ".", "," según locale)
- Audit grep `<input type="number"` en `src/app/**` y agregar `inputMode="numeric"` o `inputMode="decimal"` según semántica.

**Tests:** Cubierto en E2E mobile assertion (T7) + unit assertion de attrs.

### T5 — iOS safe-area-inset (PlayerBottomNav + AdminHeader)

**Archivos:**
- `src/app/(player)/_components/PlayerBottomNav.tsx`:
  - Wrapper `<nav>`: agregar `pb-[max(env(safe-area-inset-bottom),0px)]` al padding bottom.
  - Cambiar `py-3` → `py-2 pt-3` o explícito por lado para mantener tap target ≥44px en cada link (links ya `flex-col items-center` con icon+label; agregar `min-h-[3rem]` = 48px).
- `src/components/layout/admin-header.tsx`:
  - Agregar `pt-[env(safe-area-inset-top)]` al wrapper si es sticky/fixed.
- `src/components/admin/PushNotificationManager.tsx`:
  - El pill `fixed bottom-4 left-4`: agregar `bottom-[max(env(safe-area-inset-bottom),1rem)]` para respect notch.

**Tests:** Cubierto en E2E mobile (T7) via screenshot diff opcional, sino visual smoke.

### T6 — Grilla touch-pan-x + smoke mobile

**Archivos:**
- `src/components/booking/BookingGrid.tsx` (o ruta encontrada por investigator: `src/components/booking/BookingGrid.tsx:264`): wrapper con `overflow-x-auto` → agregar `touch-pan-x` (asegura panning horizontal sin interfere con vertical scroll). Sticky col ya está.

**Tests:** E2E mobile en T7 valida no scroll horizontal en `body` (acepta scroll en wrapper interno).

### T7 — Playwright mobile project + E2E specs

**Archivos:**
- `playwright.config.ts`: agregar segundo project:
  ```ts
  {
    name: 'mobile-chrome',
    use: { ...devices['Pixel 5'] }, // 393x851 viewport, Chrome Android emulation
    testMatch: /mobile\/.*\.spec\.ts$/,
  },
  ```
- `tests/e2e/mobile/admin-mobile-smoke.spec.ts` (nuevo): 
  - Test 1: login admin (storageState reuse), navega `/grilla`, assert `document.body.scrollWidth <= window.innerWidth` (no horizontal scroll), assert hamburger visible (`button[aria-label*="menú" i]`), assert no error console.
  - Test 2: navega `/caja`, mismo assert no horizontal scroll, abre RegisterMovementModal, verifica modal fit (`getBoundingClientRect().right <= 360`).
  - Test 3: navega `/reservas`, no horizontal scroll, table en `overflow-x-auto` wrapper (assert wrapper has computed style overflow-x = auto).
- `tests/e2e/mobile/touch-targets.spec.ts` (nuevo):
  - Test: navega `/grilla`, query todos `button, a[href], input, select, [role="button"]`, para cada uno: `getBoundingClientRect().height >= 44` salvo si está dentro de `<header>` desktop-hidden (`hidden md:*`). Listar fails con selector + height.

**Tests legacy:** ninguno se rompe (project mobile es additivo, runs en match path).

### T8 — Final verify + bundle assert

**Comandos:**
- `pnpm typecheck` (worktree) → 0 errors.
- `pnpm lint` → 0 errors nuevos.
- `pnpm test` (unit) → todos pasan salvo 3 pre-existentes (db-client-role-guard sin Supabase, 2 zod-coverage F4).
- `pnpm test:integration` → todos pasan en suite (4 push files F9 guarded `dbAvailable` skip sin Supabase).
- `pnpm build` → 0 errors. Inspect `.next/static/chunks` rutas críticas:
  - `/admin/grilla` <200KB First Load JS
  - `/admin/staff` <200KB (190KB pre-F10, watch)
  - `/admin/dashboard` <200KB
  - `/(player)` rutas <200KB
- Manual run Playwright mobile spec local: `pnpm test:e2e -- --project=mobile-chrome` (puede requerir supabase start; deferred CI).

**Documentación:**
- `docs/audit/reports/fase-f10-responsive-mobile-report.md` (formato F9): veredicto, done-criteria con evidencia file:line, trabajo por task, hallazgos, tests nuevos, archivos modificados, stats acumulados 23/26.
- `docs/audit/STATE.md` actualizar: F10 → completed, próxima F11, stats, backlog.

## Riesgos & precauciones

- **`maximumScale: 5`** (no `1`) preserva a11y zoom. Apple permite zoom igual; bloqueo es WCAG violation.
- **Cascade `h-11 md:h-10` breaks F1 spec implicit?** No: MASTER §6 línea 124 explicitamente declara "44px mobile-facing". Esta task cumple el spec (no lo viola).
- **Bundle puede subir** por classes adicionales en primitives. Esperado <1KB total — Tailwind purga unused. Verificar T8.
- **Tests legacy heights**: si algún test unit chequea exactamente `h-10` en Button render, va a fallar. Buscar pre-impl con grep `"h-10"` en `tests/unit/*`. Probable 0 — F1 no tested heights así.
- **iOS notch safe-area**: `env(safe-area-inset-bottom)` solo aplica si viewport meta tiene `viewport-fit=cover`. Agregar en T1 viewport export: `viewportFit: 'cover'` via Next 14 Viewport type.
- **Modal `max-h-[90svh]`**: `svh` (small viewport height) browser support — Chrome 108+, Safari 15.4+, Firefox 101+ (todos OK 2024+). Fallback automático a `vh` si engine viejo.
- **Playwright mobile project**: Pixel 5 device emulation incluye touch + user-agent mobile. NO ejecuta iOS real (Safari iOS = manual pre-prod smoke).
- **PlayerBottomNav z-index** (F8 ya `z-40`) vs `PushNotificationManager` pill (F9 `z-?`): PlayerBottomNav solo en `/(player)/*`, PushManager solo en `/(admin)/*`. NO colisión.

## Stats esperados

- Archivos modificados: ~8-10 (button, input, dialog, layout root, admin-header, PlayerBottomNav, BookingFormModal, RegisterMovementModal, BookingGrid, playwright.config + MASTER.md doc).
- Archivos nuevos: 3 (tests primitives + 2 specs mobile).
- Tests nuevos: ~10-15 (4 unit primitives + ~6 E2E mobile).
- Bundle delta: <1KB (cascade classes).
- Deps nuevas: 0 (Tailwind `@tailwindcss/container-queries` NO necesario — `md:` ya cubre).

## Próxima fase

F11 — Accessibility (WCAG 2.1 AA), MASTER_PLAN líneas 221-224. Criticidad 🟡 Media. Done: Axe 0 critical/serious, Lighthouse a11y ≥95, manual screen reader.
