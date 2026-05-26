# Fase F0 — Baseline + Build Health — Report

**Fecha:** 2026-05-25
**Branch:** `audit/frontend-f00`
**Veredicto:** 🟢 **PASS — 4/4 done-criteria cumplidos** (0 P0/P1 abiertos). Bonus: 2 dead-weight removidos.

**Objetivo (MASTER_PLAN líneas 157-160):** Build OK, bundle controlado, Lighthouse baseline. Primera fase del bloque frontend; backend B0-B11 completo.

---

## Done-criteria (MASTER_PLAN F0) con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Bundle JS inicial < 200KB **gzipped** por ruta | ✅ | `pnpm build` final: **toda ruta < 200KB**. Más alta `/staff` 190KB (pre-existente, fuera de scope F0). `/grilla` **235→161KB** (fix T4). Unidad verificada empíricamente: la columna "First Load JS" de Next es gzipped (chunk medido raw 320KB → gzip 91KB ≈ reportado 93.3KB). |
| Lighthouse Performance ≥ 90 mobile | ✅ | Corrida real (Chrome 148, mobile throttle simulate) sobre las 5 rutas públicas estáticas: `/` 94-95, `/login` 96, `/register` 94, `/privacy` 96, `/terms` 94. **Todas ≥ 90.** Tooling LHCI nuevo (T5). |
| 0 `'use client'` innecesarios | ✅ | Auditadas las **36 directivas** `'use client'` (investigator): todas justificadas (error boundaries, form pages useFormState, hooks, primitives Radix, layout shell, componentes interactivos). 30/34 páginas son server components. 0 convertibles. Criterio cumplido as-is. |
| `pnpm build` limpio sin warnings críticos | ✅ | `pnpm lint`: **0 warnings, 0 errors** (los 4 `@next/next/no-img-element` cerrados en T2). `pnpm build` exit 0. |

---

## Trabajo realizado (5 tasks)

### T1 — next.config: bundle analyzer + optimizePackageImports + images
`@next/bundle-analyzer` opt-in (`ANALYZE=true`, script `pnpm analyze` con `cross-env` para Windows), `experimental.optimizePackageImports: ['lucide-react','date-fns']`, `images.formats: ['image/avif','image/webp']` + `remotePatterns` para `images.unsplash.com`. Sentry wrapper preservado outermost. Commits `dda4c1f` + `8e27d0c`.

### T2 — Convertir 4 `<img>` → `next/image` (cierra 4 warnings)
Los 4 backgrounds full-bleed (`login`/`register` HERO_IMG unsplash; `page.tsx` hero local + showcase unsplash) → `<Image fill>`. Hero local `/hero-bg.png` (765KB) ahora re-optimizado a AVIF/WebP por next/image (motor del salto Lighthouse). `sizes` afinado para los panes desktop-only (`(min-width:1024px) 50vw, 0vw`). Commits `9495ec1` + `a96ba50`.

### T3 — Remover dead weight
`@phosphor-icons/react` (instalado, **0 imports**) removido. `public/logo-turno-gol.png` (777KB, **0 referencias** en código/metadata/manifest — verificado whole-repo) eliminado. `lucide-react` (icon lib real, 42 archivos) intacto. Commit `0acaf52`.

### T4 — Reducir `/grilla` < 200KB gzipped (era 235KB)
Dos palancas:
1. `BookingFormModal` vía `next/dynamic({ssr:false})` — el modal sólo carga al abrir un slot, no en first paint (`365600a`, 235→222KB).
2. **Lazy-load del cliente Supabase realtime** (`use-booking-realtime.ts`): `await import('@/lib/supabase/client')` dentro del `useEffect` en vez de import estático. La grilla renderiza `initialBookings` (data SSR del server) en first paint sin el cliente; realtime se conecta post-hydration (sub-segundo, imperceptible; fallback polling 30s intacto). Lógica de payload INSERT/UPDATE/DELETE + status + cleanup preservada byte-a-byte; race de unmount manejado con flag `cancelled` + `teardown` (`9ec9ee6`, 222→**161KB**). Reorder cosmético de imports (`f9f968e`).
   **Resultado: route-specific 65.6→4.75KB, First Load 235→161KB (74KB / 31% menos).**

### T5 — Lighthouse baseline tooling + medición
`@lhci/cli` + `lighthouserc.json` (mobile, 5 rutas estáticas públicas, `numberOfRuns:1`, assert `performance` ≥0.9 **warn** — F12 lo subirá a `error`), script `pnpm lighthouse`, upload filesystem. `.gitignore` excluye artefactos HTML/JSON voluminosos; `RESULTS.md` con scores commiteado. Corrida real ejecutada. Commit `cccc8a4`.

---

## Bundle: antes / después (First Load JS gzipped)

| Ruta | Antes | Después | Δ |
|------|-------|---------|---|
| `/grilla` | **235 KB** ❌ | **161 KB** ✅ | −74 KB |
| `/` (landing) | 153 KB | 158 KB | +5 (next/image runtime; payload de imagen ↓↓) |
| `/login` | 155 KB | 161 KB | +6 (idem) |
| `/register` | 155 KB | 161 KB | +6 (idem) |
| `/staff` | 190 KB | 190 KB | sin cambio (no F0) |
| Shared baseline | 150 KB | 150 KB | sin cambio |

Nota: las rutas con imágenes ganaron ~5-6KB de runtime de `next/image`, pero el **peso real de imagen** bajó drásticamente (PNG 765KB → AVIF de decenas de KB), que es lo que mueve LCP/Lighthouse. Todas siguen <200KB.

---

## Lighthouse baseline (mobile, simulate throttle, Chrome 148)

| Ruta | Performance | LCP | TBT | CLS |
|------|-------------|-----|-----|-----|
| `/` | 94-95 | 2.9-3.0s | 40-60ms | 0.01 |
| `/login` | 96 | 2.7s | 60ms | 0 |
| `/register` | 94 | 3.0s | 100ms | 0.017 |
| `/privacy` | 96 | 2.7s | 80ms | 0.003 |
| `/terms` | 94 | 2.8s | 70ms | 0.076 |

Sólo rutas estáticas públicas (prerendered `○`, sin DB/auth). Rutas dinámicas (`/grilla`, `/dashboard`, `/explorar`, `/[slug]`) requieren auth+DB → medición a F3/F6/F12 con servidor seedeado.

---

## Tests

- **Unit:** 411/411 verde (sin regresión vs B11 baseline).
- **Integration:** 323/325. Las 2 fallas (`daily-close-idempotency.test.ts`, B8.4 cash close) son **pre-existentes, NO regresión F0**: confirmado corriendo el mismo test aislado en el worktree main (687cccd, sin cambios F0) → falla idéntica (2 failed | 3 passed). Causa: contaminación de estado del test-DB local persistente (residual `cash_flows` de corridas previas; el test espera DB limpia con `balance=1000000`). Misma clase de hermeticidad que el flaky documentado `race-abonado-vs-individual` (P2 backlog). CI usa contenedor postgres limpio por job → verde. **F0 no toca código backend/cash/DB** (diff: next.config, page components, client hook, deps, lighthouse). El flaky `race-abonado` pasó esta corrida.
- **Typecheck:** verde.
- **Lint:** **0 warnings, 0 errors** (4 `<img>` cerrados; era 4 warnings en B11).
- **Build:** exit 0, toda ruta <200KB gzipped.

---

## Cambios por archivo

| Archivo | Tipo | Task |
|---------|------|------|
| `next.config.js` | modificado (analyzer + optimizePackageImports + images) | T1 |
| `package.json` | modificado (+devDeps analyzer/cross-env/lhci; +scripts; −phosphor) | T1/T3/T5 |
| `src/app/(auth)/login/page.tsx` | modificado (`<img>`→`<Image>`) | T2 |
| `src/app/(auth)/register/page.tsx` | modificado (`<img>`→`<Image>`) | T2 |
| `src/app/page.tsx` | modificado (2× `<img>`→`<Image>`) | T2 |
| `public/logo-turno-gol.png` | **eliminado** (777KB orphan) | T3 |
| `src/components/booking/BookingGrid.tsx` | modificado (dynamic modal) | T4 |
| `src/hooks/use-booking-realtime.ts` | modificado (lazy supabase client) | T4 |
| `lighthouserc.json` | nuevo | T5 |
| `.gitignore` | modificado (artefactos LHCI) | T5 |
| `docs/audit/reports/fase-f00-raw/lhci/RESULTS.md` | nuevo | T5 |

---

## Gaps / deferred (registrados en STATE backlog)

| Gap | Disposición |
|-----|-------------|
| `lucide-react` pinned a `^1.11.0` (release 2021; la línea mantenida es 0.4xx, semver invertido) | **Dep-upgrade task** — toca imports en 42 archivos con riesgo de cambios de API. Fuera de F0. Backlog (candidato F1 Design System). `optimizePackageImports` ya mejora su tree-shaking. |
| Shared baseline 150KB (Sentry SDK ~pesado en el chunk común) | F12 Performance si se necesita bajar más. F0 sólo aseguró que toda ruta pase <200KB. |
| `/staff` 190KB (route-specific 27KB) — la más cercana al techo | Watch / candidato F12. No sobre presupuesto, no tocada en F0. |
| Lighthouse assertion `error` (bloqueante) + corrida en CI Linux | F12/F14. F0 dejó assertion en `warn` + config lista. |
| Medición Lighthouse de rutas dinámicas (grilla/dashboard/explorar) | Requiere servidor con DB seedeada — F3/F6/F12. |
| Windows EPERM en cleanup de temp-dir de Chrome (`chrome-launcher`) | Benigno (LHR guardado antes del cleanup). Workaround: `lhci collect --additive` por-URL. Linux CI corre `lhci autorun` limpio. |

---

## Stats acumulados (post F0)

- **Fases completadas: 13/26** (todo backend B0-B11 + F0 frontend).
- **F0:** 4/4 done-criteria ✅. 9 commits. 1 bug de bundle corregido (`/grilla` 235→161KB). 2 dead-weight removidos (1 dep + 1 asset 777KB). 4 lint warnings cerrados. 0 tests nuevos (fase de build-health, no de lógica).
- **Tooling nuevo:** `@next/bundle-analyzer`, `@lhci/cli` + `lighthouserc.json`.

## Próxima fase

`F1 — Design System + Componentes UI Base`. Trigger humano: confirmar continuar o pausar. `design-system/MASTER.md` como fuente de verdad; Skeleton/Empty/Error states reusables; candidato para resolver el pin de `lucide-react`.
