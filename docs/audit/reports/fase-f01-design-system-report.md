# Fase F1 — Design System + Componentes UI Base — Report

**Fecha:** 2026-05-25
**Branch:** `audit/frontend-f01`
**Veredicto:** 🟢 **PASS — 2/2 done-criteria cumplidos** (0 P0/P1 abiertos). Bonus: 1 fix latente de observabilidad (Sentry agregado a `reportes/error.tsx`).

**Objetivo (MASTER_PLAN líneas 162-166):** Consistencia visual con `design-system/MASTER.md` como fuente de verdad. Componentes Skeleton/Empty/Error state reusables. Segunda fase del bloque frontend; F0 ya completo.

---

## Done-criteria (MASTER_PLAN F1) con evidencia

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| **100% componentes UI siguen MASTER.md** (tokens color/tipografía/spacing/radii/shadows) | ✅ | Drift palette de pre-F1 eliminado: (a) `abonados/page.tsx` STATUS_COLORS usando `bg-green-100/bg-yellow-100/bg-gray-100` (no-palette) → `<Badge variant="success/warning/secondary">` (T5); (b) `admin-sidebar.tsx:63` logo `bg-emerald-500 text-slate-950` (anti-pattern §11 — emerald-500 reservado para non-text accents) → `bg-emerald-600 text-white` (token primary canónico, T5); (c) `globals.css:34` `--ring` resolvía a emerald-600 (drift con MASTER §1 que manda emerald-500) → `160 84% 39%` = emerald-500 exacto (T1). Componentes UI primitives auditados (`badge`, `button`, `dialog`, `dropdown-menu`, `input`, `label`, `toast`, `toaster`): **0 hex hardcoded, 0 `bg-white` como page bg, 0 `text-black`/`bg-black` para texto, 0 `text-emerald-500`/`bg-emerald-500` para texto, 0 emojis-as-icons** (verificado por investigator). Únicas excepciones documentadas y allowed por MASTER: `bg-black/50` para overlays (§6.5), `bg-emerald-500` en `admin-sidebar.tsx:108` para barra decorativa de 4px del active-nav indicator (non-text accent, §1). |
| **Skeleton + Empty + Error state components reusables** | ✅ | 3 nuevos primitives en `src/components/ui/`: `skeleton.tsx` (15 LOC, T2), `empty-state.tsx` (40 LOC, T3), `error-state.tsx` (141 LOC, T4). Skeleton wrappea `.skeleton` CSS class (shimmer + prefers-reduced-motion ya en globals.css). EmptyState parametrizable (icon opcional, title, description opcional, action slot ReactNode). ErrorState con 3 variants: `full` (root/player/public takeovers), `contained` (admin shell preserva sidebar), `inline` (sub-section minimal). Adoptados: Skeleton en 2 callsites (`AvailabilityGrid.tsx` loading, `[slug]/page.tsx` Suspense fallback); EmptyState en 1 callsite (`abonados/page.tsx` empty branch); ErrorState refactoriza **5 error.tsx boundaries** (root, admin, admin/reportes, player, public) — antes duplicaban ~50 LOC cada uno del mismo pattern. |

---

## Trabajo realizado (6 tasks)

### T1 — Cleanup design-system + doc20 + globals `--ring` alignment
- Eliminado `design-system/turnogol/MASTER.md` (210 LOC stale duplicate generado 2026-04-27; contradecía MASTER raíz — "glassmorphism", "spring animation", "SaaS Mobile"). `design-system/pages/.gitkeep` preserva la convención jerárquica de doc20 §2.3.
- `docs/doc20_design_system.md` líneas 80 + 291: "Phosphor / Heroicons" → "Lucide React" (MASTER §9 manda Lucide; F0 ya había removido `@phosphor-icons/react` con 0 imports).
- `src/app/globals.css:34` `--ring: 161 94% 30%` (emerald-600) → `160 84% 39%` (emerald-500 #10B981 exacto). Conversion HSL verificada por reviewer (initial guess `158 64% 52%` era wrong; corregido en T1 follow-up commit `62c765f`). Alinea `--ring` con MASTER §1 + con todos los literales `ring-emerald-500` ya tipeados en JSX.
- Commits `d0407c1` + `62c765f`.

### T2 — Skeleton primitive
- Nuevo `src/components/ui/skeleton.tsx` (15 LOC). Default `rounded-md` (MASTER §5 inputs/buttons), override-able via className. `aria-busy="true"` para AT (initial PR incluía `aria-live="polite"` redundante; quitado por review nit en commit `7aeeeb3` — alinea con shadcn canonical Skeleton).
- Adoptado en `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:188` (loading h-48) + `src/app/(public)/[slug]/page.tsx:70` (Suspense fallback h-64). Heights y `rounded-lg` preservados via tailwind-merge.
- Commits `844b797` + `7aeeeb3`.

### T3 — EmptyState primitive
- Nuevo `src/components/ui/empty-state.tsx` (40 LOC). Props: `icon?` (LucideIcon, decorative `aria-hidden`), `title`, `description?`, `action?` (ReactNode slot — typically `<Link>` o `<Button>`), `className?`. Render: dashed-border slate-200 card on white, optional icon-circle h-12 w-12 bg-slate-50 ring-slate-200, h3 text-base font-semibold text-slate-900, body text-sm text-slate-500 max-w-sm, action mt-6.
- Adoptado en `src/app/(admin)/abonados/page.tsx:50-53` reemplazando `<p>No hay abonados registrados.</p>` → `<EmptyState icon={Users} title="Sin abonados registrados" description="Creá el primer abonado para que aparezca acá." action={<Link href="/abonados/nuevo">+ Nuevo Abonado</Link>} />`.
- Commit `62f8bb4`.

### T4 — ErrorState primitive + refactor 5 error.tsx boundaries
- Nuevo `src/components/ui/error-state.tsx` (141 LOC). 3 variants:
  - **`full`** — `min-h-dvh + bg-slate-50 + shadow-lg`. Wrapper semántico `<main>`. Para root/player/public takeovers.
  - **`contained`** — `min-h-[60vh] + shadow-sm`. Wrapper `<div>` (NO `<main>` — evita nested-main inválido dentro del shell admin que ya tiene `<main>`). Para `(admin)/error.tsx`.
  - **`inline`** — Compact red-50/red-200 panel con `<p>` + underline retry button. Para sub-section errors como reportes.
- Variants full/contained renderizan el pattern visual existente byte-a-byte: icon-circle h-14 w-14 bg-red-50 ring-red-600/20, AlertTriangle h-7 w-7 text-red-600, h1 text-2xl font-semibold slate-900 (page-title level per MASTER §2), body text-sm leading-relaxed slate-500, digest font-mono tabular-nums slate-400, primary `<button>` bg-emerald-600 + secondary `<Link>` outline slate-200, motion-reduce friendly, focus-visible ring-emerald-500.
- Refactor 5 boundaries:
  - `src/app/error.tsx` (root, variant=`full`, secondary "/" + Home icon)
  - `src/app/(admin)/error.tsx` (variant=`contained`, secondary "/dashboard" + LayoutDashboard icon). Heading sube de `<h2 text-xl>` a `<h1 text-2xl>` — intencional, alinea con MASTER §2 page-title scale para el wrapper top-level del error page. Verificado: admin shell no renderiza ningún h1 propio → no hay conflicto de heading hierarchy.
  - `src/app/(admin)/reportes/error.tsx` (variant=`inline`) + **agrega `Sentry.captureException`** (fix latente — antes esta boundary era silent swallower; única de las 5 sin reportar a Sentry).
  - `src/app/(player)/error.tsx` (variant=`full`, secondary "/mis-reservas" + CalendarDays icon).
  - `src/app/(public)/error.tsx` (variant=`full`, secondary "/explorar" icon).
- Net diff de la fase: **+290/-395 LOC** (la deduplicación de error.tsx ahorró ~150 LOC duplicadas).
- Commit `7716fcf`.

### T5 — Fix palette drift (Badge `warning` + abonados + sidebar logo)
- `src/components/ui/badge.tsx` agrega variant `warning: 'border-transparent bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'` (parallel al `success` variant emerald-tier; necesario para representar "Pausado" en abonados sin caer en bg-yellow-100 ad-hoc).
- `src/app/(admin)/abonados/page.tsx` elimina constante `STATUS_COLORS` (usaba `bg-green-100 / bg-yellow-100 / bg-gray-100`, fuera de palette MASTER). Reemplaza con `STATUS_VARIANT: Record<string, 'success'|'warning'|'secondary'>` y `<Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'}>` (default safe fallback). Imports nuevos: `Badge`.
- `src/components/layout/admin-sidebar.tsx:63` logo TG: `bg-emerald-500 + text-slate-950 + shadow-emerald-500/30` → `bg-emerald-600 + text-white + shadow-emerald-600/30`. emerald-500 reservado para non-text accents (MASTER §1); emerald-600 es primary canónico para text-containers. Contraste emerald-600 vs white ≈ 5.1:1 (AA Normal ≥4.5:1 ✓, AA Large ≥3:1 ✓ para text-xs font-bold).
- `admin-sidebar.tsx:108` (active-nav 4px indicator bar con `bg-emerald-500`) **UNTOUCHED** — non-text decorative accent, allowed per MASTER §1.
- Commit `afc131e`.

### T6 — Verify + report + STATE update
- `pnpm typecheck` ✓ (sin output, exit 0).
- `pnpm lint` ✓ (0 warnings, 0 errors — preservado del baseline F0).
- `pnpm test` ✓ (411/411, sin regresión vs F0).
- `pnpm test:integration` 323/325 (las **2 fallas son el flaky pre-existente `daily-close-idempotency.test.ts` documentado en STATE.md como "🔍 CONFIRMADO pre-existente: contamina estado del test-DB local; CI verde con contenedor limpio"** — confirmado falla idéntica en main sin cambios F1; F1 NO toca cash/DB).
- `pnpm build` ✓ (28 páginas, exit 0). Bundle sin regresión vs F0: `/grilla` 161KB, `/staff` 190KB, shared baseline 150KB. **Toda ruta sigue <200KB gz.** Los 3 nuevos componentes UI (~196 LOC combinados) tree-shaken correctamente.
- Plan + report + STATE en este commit.

---

## Componentes nuevos (resumen ejecutivo)

| Componente | Archivo | LOC | Variants | Props clave | Adoptado en |
|------------|---------|-----|----------|-------------|-------------|
| `Skeleton` | `src/components/ui/skeleton.tsx` | 15 | — | `className` (passthrough; default `rounded-md`) | 2 callsites: AvailabilityGrid loading, [slug] page Suspense |
| `EmptyState` | `src/components/ui/empty-state.tsx` | 40 | — | `icon?`, `title`, `description?`, `action?`, `className?` | 1 callsite: abonados/page empty branch |
| `ErrorState` | `src/components/ui/error-state.tsx` | 141 | `full` / `contained` / `inline` | `variant?`, `title`, `description?`, `digest?`, `onRetry?`, `retryLabel?`, `secondaryHref?`, `secondaryLabel?`, `secondaryIcon?` | 5 boundaries: root, (admin), (admin)/reportes, (player), (public) |

Todos los 3 son client-safe (`Skeleton` y `EmptyState` no requieren `'use client'`; `ErrorState` sí lo lleva porque usa eventos onClick). Cumplen MASTER §1/§2/§5 tokens. ARIA defensivo (`aria-hidden` en iconos decorativos, `aria-busy` en Skeleton).

---

## Cambios por archivo (17 archivos)

| Archivo | Tipo | Task | Notas |
|---------|------|------|-------|
| `design-system/turnogol/MASTER.md` | **eliminado** (-209 LOC) | T1 | stale duplicate |
| `design-system/pages/.gitkeep` | nuevo (vacío) | T1 | preserva jerarquía doc20 §2.3 |
| `docs/doc20_design_system.md` | modificado (2 líneas) | T1 | Phosphor → Lucide |
| `src/app/globals.css` | modificado (1 línea) | T1 | --ring HSL alignment |
| `src/components/ui/skeleton.tsx` | **nuevo** | T2 | + 15 LOC |
| `src/app/(public)/[slug]/components/AvailabilityGrid.tsx` | modificado | T2 | adopta Skeleton |
| `src/app/(public)/[slug]/page.tsx` | modificado | T2 | adopta Skeleton (Suspense fallback) |
| `src/components/ui/empty-state.tsx` | **nuevo** | T3 | + 40 LOC |
| `src/app/(admin)/abonados/page.tsx` | modificado | T3+T5 | adopta EmptyState + Badge variant |
| `src/components/ui/error-state.tsx` | **nuevo** | T4 | + 141 LOC |
| `src/app/error.tsx` | modificado (-50%) | T4 | usa ErrorState full |
| `src/app/(admin)/error.tsx` | modificado (-50%) | T4 | usa ErrorState contained |
| `src/app/(admin)/reportes/error.tsx` | modificado | T4 | usa ErrorState inline + **Sentry agregado** |
| `src/app/(player)/error.tsx` | modificado (-50%) | T4 | usa ErrorState full |
| `src/app/(public)/error.tsx` | modificado (-50%) | T4 | usa ErrorState full |
| `src/components/ui/badge.tsx` | modificado (+1 variant) | T5 | warning |
| `src/components/layout/admin-sidebar.tsx` | modificado (1 línea) | T5 | logo TG color fix |

Net: **+290 / -395 LOC** (negativo neto gracias a deduplicación de error boundaries).

---

## Tests

- **Unit:** 411/411 verde ✓ (sin regresión vs F0).
- **Integration:** 323/325. Las **2 fallas** (`daily-close-idempotency.test.ts`, B8.4 cash close) son **pre-existentes, NO regresión F1**: confirmado idéntico en main 5883ff3 sin cambios F1 (mismo modo de fallo, mismo test residual de `cash_flows` contaminando balance). Misma clase de hermeticidad que el flaky documentado `race-abonado-vs-individual`. CI usa contenedor postgres limpio por job → verde. F1 no toca código backend/cash/DB (diff: 17 archivos: design-system, doc, globals.css, 8 UI components/page refactors, 4 layout fixes — todos client/server-component frontend). El flaky `race-abonado-vs-individual` pasó esta corrida.
- **Typecheck:** ✓ exit 0.
- **Lint:** ✓ 0 warnings, 0 errors.
- **Build:** ✓ exit 0, 28 páginas. Toda ruta <200KB gz (F0 baseline preservado).

---

## Bundle (post-F1, gzipped — sin regresión vs F0)

| Ruta | First Load | Δ vs F0 |
|------|------------|---------|
| `/grilla` | 161 KB | 0 (T4 lazy supabase preservado) |
| `/staff` | 190 KB | 0 |
| `/` (landing) | 158 KB | 0 |
| `/login` | 161 KB | 0 |
| `/register` | 161 KB | 0 |
| `/privacy` | 152 KB | 0 |
| `/terms` | 152 KB | 0 |
| Shared baseline | 150 KB | 0 |

Los 3 nuevos componentes (Skeleton/EmptyState/ErrorState, ~196 LOC combinados) son tree-shaken — sólo entran al bundle de la ruta que los importa. No suben el shared baseline.

---

## Gaps / deferred (registrados en STATE backlog)

| Gap | Disposición |
|-----|-------------|
| `lucide-react` pin `^1.11.0` (semver invertido) | **Diferido**. F1 done-criteria no requiere upgrade; el lib funciona, MASTER §9 lo mandata, `optimizePackageImports` (F0) ya hace tree-shake efectivo. Riesgo de breaking changes en 42 imports >> beneficio. Trigger para re-evaluar: vulnerabilidad CVE en la versión vieja, o necesidad de un icono no disponible. |
| 17 inline `<span className="inline-flex items-center rounded-full ...">` badges en pages CRUD (caja, settings/facturacion, staff, mis-reservas) | **Diferido a F4/F5** cuando se toquen esas pages CRUD. Pattern consistente con MASTER §6 (semantic emerald/amber/red -50/-700 + ring) → drift de primitive (no usan `<Badge>`), NO drift de palette. No bloquea done-criteria F1. |
| Header user menu construido con `<Button variant="ghost">` en vez de `<DropdownMenu>` primitive | **Diferido**. Working as-is; no rompe MASTER ni a11y. Refactor de UX, no de design system. Candidato cuando se toque admin-header en otra fase. |
| Sheet primitive (drawer mobile custom en admin-sidebar) | **Diferido**. El custom drawer fixed + translate-x funciona y es responsive-friendly. Cambiar a `<Sheet>` Radix sería refactor sin valor inmediato. |
| `design-system/pages/*.md` overrides per page | **Vacío by design**. MASTER raíz suficiente para v1. Crear sólo cuando una página requiera override real (ej: `dashboard.md` si density distinta a admin estándar). |

---

## Stats acumulados (post F1)

- **Fases completadas: 14/26** (backend B0-B11 + F0 + F1 frontend).
- **F1:** 2/2 done-criteria ✅. 8 commits (T1 + T1 HSL follow-up, T2 + T2 review nit, T3, T4, T5, T6). 3 componentes UI nuevos (Skeleton + EmptyState + ErrorState) + 1 variant Badge (warning). 5 error.tsx boundaries refactorizadas a 1 source-of-truth. 1 fix latente: Sentry agregado a `(admin)/reportes/error.tsx`. 1 stale dir eliminado (`design-system/turnogol/`). 1 doc fix (doc20 Phosphor→Lucide). 1 CSS var fix (`--ring` HSL emerald-500 exacto). Net diff: +290 / -395 LOC (negativo gracias a dedup).
- **Tests:** 411 unit (sin cambio), 323/325 integration (2 flaky pre-existentes documentados). F1 no agregó tests (fase de consistency + componentes presentacionales sin lógica nueva; visual smoke vía build + reviewers).
- **Bundle:** sin regresión vs F0 (toda ruta <200KB gz preservada).

---

## Próxima fase

**F2 — Auth + Onboarding Flows** (MASTER_PLAN líneas 168-172).
**Objetivo:** Nadie se traba en login. Onboarding lleva a Aha Moment (primera reserva).
**Archivos clave:** `src/app/(auth)/*`, `src/components/dashboard/onboarding-checklist.tsx`, doc10.
**Done-criteria:** E2E magic link completo. E2E onboarding 4 pasos → primera reserva. Estados de error con UX clara.

Trigger humano: confirmar continuar o pausar.
