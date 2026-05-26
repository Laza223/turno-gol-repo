# Fase F0 — Baseline + Build Health (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Establecer la línea base de salud de build del frontend. Done-criteria MASTER_PLAN (líneas 157-160):
1. Bundle JS inicial **< 200KB gzipped por ruta**.
2. Lighthouse Performance **≥ 90 mobile**.
3. **0 `'use client'` innecesarios**.
4. `pnpm build` limpio **sin warnings críticos**.

**Architecture:** Next.js 14 App Router + TS strict + Tailwind + shadcn/ui. Worktree `audit/frontend-f00`. F0 NO toca schema → la convención dual-tree de migrations (`docs/MIGRATIONS.md`) no aplica.

**Tech Stack:** Next.js 14, `@next/bundle-analyzer`, `next/image`, `next/dynamic`, `@lhci/cli` (Lighthouse CI), lucide-react, date-fns, @supabase/supabase-js (realtime).

---

## Hallazgos del baseline (investigator + build real)

Build real ejecutado en worktree (`pnpm build`, exit 0). **Unidades verificadas empíricamente:** la columna "First Load JS" de Next.js es **gzipped** (chunk medido: raw 320kB → gzip 91kB ≈ reportado 93.3kB). Por lo tanto la tabla de rutas se compara 1:1 contra el criterio de <200KB gz.

### 1. Bundle por ruta (gzipped, del build real)

- **Shared baseline (todas las rutas): 150 kB gz** (`53.7kB` framework + `93.3kB` chunk 8380 = React+Next+Sentry+supabase + `2.58kB` otros).
- Mayoría de rutas: **150–160 kB gz → PASA**.
- `/staff`: 190 kB gz → PASA (ajustado).
- **`/grilla`: 235 kB gz → FALLA** (route-specific 65.6 kB). Única ruta sobre presupuesto. Ratio 1.18x (NO absurdo, NO requiere refactor estructural — fixable con code-splitting).

`/grilla` = server page (`src/app/(admin)/grilla/page.tsx`) que renderiza `<BookingGrid>` (client). `BookingGrid` (`src/components/booking/BookingGrid.tsx:1`) importa `useBookingRealtime` (supabase realtime client, ~40kB), `BookingCard`, y `BookingFormModal`. El modal NO se necesita en first paint (sólo al abrir slot) → candidato a `next/dynamic`.

### 2. `'use client'` — 36 directivas, **0 innecesarias** (criterio YA cumplido)

Investigator clasificó las 36: error boundaries (6, useEffect+Sentry), form pages (login/register, useFormState), hooks (use-booking-realtime, use-toast), shadcn/ui primitives (Radix), layout shell (useState/usePathname/useTransition), componentes interactivos (forms/grids/handlers). Ninguna marcada como convertible a server. **30/34 páginas son server components.** Este criterio pasa as-is; sólo se documenta.

### 3. Lighthouse — **tooling ausente**

No hay `lighthouserc.*`, `.lighthouseci/`, ni `@lhci/cli`/`lighthouse` en deps/scripts, ni GitHub Action. F0 debe establecer el tooling + baseline.

### 4. Build warnings — **4 `<img>` (0 errors)** (lint ground-truth)

| # | Archivo:línea | src | loading | Notas |
|---|---------------|-----|---------|-------|
| 1 | `src/app/(auth)/login/page.tsx:27` | unsplash externo (`HERO_IMG`) | eager | ImagePane full-bleed `absolute inset-0 object-cover` |
| 2 | `src/app/(auth)/register/page.tsx:27` | unsplash externo (`HERO_IMG`) | eager | idéntico patrón |
| 3 | `src/app/page.tsx:112` | **local `/hero-bg.png` (765KB)** (`HERO_BG`) | eager | Hero LCP, full-bleed |
| 4 | `src/app/page.tsx:239` | unsplash externo (`FEATURE_BG`) | lazy | ShowcaseStrip full-bleed |

Los 4 son backgrounds full-bleed (`absolute inset-0 h-full w-full object-cover`) → conversión limpia a `<Image fill>`. Cierra los 4 warnings + re-optimiza el PNG local de 765KB (→ AVIF/WebP). Estaban diferidos a F12; cerrarlos en F0 = ganancia neta (build limpio + LCP).

### 5. Dead weight (oportunista)

- **`@phosphor-icons/react@2.1.10` instalado pero 0 imports en `src/`** → dead dependency. `lucide-react@1.11.0` es el lib real (42 archivos). Remover phosphor.
- **`public/logo-turno-gol.png` (777KB) — 0 referencias en `src/`** → asset huérfano. Remover tras confirmar 0 refs (incluyendo metadata/manifest/favicon/og).

### 6. next.config (`next.config.js`)

Actualmente sólo security headers + Sentry wrapper. **Sin** `@next/bundle-analyzer`, `experimental.optimizePackageImports`, `images.remotePatterns`, ni `images.formats`. CSP ya permite `images.unsplash.com` + `*.supabase.co`.

### Deferidos (NO F0)

- **lucide-react pinned a `^1.11.0` (release 2021).** La línea mantenida es 0.4xx (semver invertido de lucide). Upgrade tocaría imports en 42 archivos con riesgo de cambios de API → **dep-upgrade task, fuera de F0.** Registrar en STATE backlog. `optimizePackageImports` igual mejora tree-shaking de la versión actual.
- Consolidación de icon libs → resuelta parcialmente al remover phosphor (dead). Resto = F1 Design System.
- Reducción del shared baseline 150kB (Sentry SDK pesado) → F12 Performance si hace falta; F0 sólo baja lo necesario para que toda ruta pase <200KB.

---

## File Structure

**Crear:**
- `lighthouserc.json` — config LHCI, preset mobile, assert Performance ≥ 0.9
- `docs/audit/reports/fase-f00-baseline-report.md`
- `docs/audit/reports/fase-f00-raw/` — outputs build/lint/lighthouse

**Modificar:**
- `next.config.js` — `@next/bundle-analyzer` (opt-in `ANALYZE=true`), `experimental.optimizePackageImports: ['lucide-react','date-fns']`, `images: { formats:['image/avif','image/webp'], remotePatterns:[{protocol:'https',hostname:'images.unsplash.com'}] }`
- `package.json` — +devDep `@next/bundle-analyzer`, `@lhci/cli`; +scripts `analyze`, `lighthouse`; **−dep `@phosphor-icons/react`**
- `src/app/(auth)/login/page.tsx` — `<img>` → `<Image fill priority>`
- `src/app/(auth)/register/page.tsx` — idem
- `src/app/page.tsx` — 2× `<img>` → `<Image fill>` (hero `priority`, showcase lazy)
- `src/components/booking/BookingGrid.tsx` — `BookingFormModal` vía `next/dynamic` (ssr:false)

**Eliminar:**
- `public/logo-turno-gol.png` (tras verificar 0 refs)

---

## Tasks

### Task 1 — next.config: bundle analyzer + optimizePackageImports + images config

**Context:** `next.config.js` (33 líneas, `module.exports = withSentryConfig(nextConfig, {...})`) sólo tiene `headers()`. Necesitamos preparar la base para: (a) medir bundles on-demand, (b) tree-shaking de barrels (lucide/date-fns), (c) habilitar `next/image` con remotos unsplash (Task 2 lo requiere — debe ir DESPUÉS de Task 1).

**Cambios:**
1. `pnpm add -D @next/bundle-analyzer` en el worktree.
2. En `next.config.js`:
   - `const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' })`
   - Agregar a `nextConfig`:
     ```js
     experimental: { optimizePackageImports: ['lucide-react', 'date-fns'] },
     images: {
       formats: ['image/avif', 'image/webp'],
       remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
     },
     ```
   - Componer wrappers: `module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {...sentryOpts})` — mantener TODAS las opciones Sentry actuales intactas (org/project/authToken/silent/hideSourceMaps/tunnelRoute/disableLogger).
3. `package.json` scripts: `"analyze": "ANALYZE=true next build"`.

**Success criteria:**
- `pnpm build` exit 0, sin nuevos warnings.
- `pnpm typecheck` verde.
- Sentry wrapper sigue siendo el outermost (source maps + tunnel intactos).
- `ANALYZE=true pnpm build` genera reportes del analyzer (no romper si no se setea).

### Task 2 — Convertir 4 `<img>` → `next/image` (cierra 4 warnings)

**Context:** Depende de Task 1 (remotePatterns unsplash). Los 4 `<img>` son backgrounds full-bleed (ver tabla Hallazgo 4). Patrón actual en cada uno: contenedor `relative` (login/register: `<div className="relative hidden lg:block">`; page.tsx hero: `<section className="relative isolate overflow-hidden">`) con `<img className="absolute inset-0 h-full w-full object-cover">` + overlay gradients hermanos.

**Cambios (por archivo):**
- `login/page.tsx` + `register/page.tsx`: `import Image from 'next/image'`; reemplazar `<img>` por `<Image src={HERO_IMG} alt="..." fill priority className="object-cover" sizes="50vw" />` (mantener el `alt` existente; el contenedor ya es `relative` con `hidden lg:block`). `priority` porque es eager actualmente.
- `page.tsx` hero (`:112`): `<Image src={HERO_BG} alt="" aria-hidden fill priority sizes="100vw" className="object-cover" />` (HERO_BG = `/hero-bg.png` local, 765KB; next/image lo re-optimiza a AVIF/WebP). El contenedor `<section>` ya es `relative isolate overflow-hidden`.
- `page.tsx` showcase (`:239`): `<Image src={FEATURE_BG} alt="" aria-hidden fill sizes="100vw" className="object-cover" />` (sin `priority`, era `loading="lazy"`; default lazy de next/image lo cubre).
- Conservar todos los overlay `<div>` hermanos y el `alt`/`aria-hidden` existente.

**Success criteria:**
- `pnpm lint` → **0 warnings** (los 4 `@next/next/no-img-element` desaparecen).
- `pnpm build` exit 0; el build NO falla por remoto no permitido (Task 1 ya agregó remotePatterns).
- `pnpm typecheck` verde.
- Visualmente equivalente: backgrounds full-bleed con overlays (no romper layout — `fill` requiere contenedor `relative`/`absolute`, ya presente).

### Task 3 — Remover dead weight (dep + asset)

**Context:** `@phosphor-icons/react` (2.1.10) instalado, **0 imports en `src/`** (verificado por grep). `public/logo-turno-gol.png` (777KB), **0 refs en `src/`**.

**Cambios:**
1. **Verificar antes de borrar el asset:** grep `logo-turno-gol` en TODO el repo (no sólo src): incluir `public/manifest*`, metadata en `src/app/layout.tsx`, `app/icon*`, `app/apple-icon*`, cualquier `og:image`. Si aparece CUALQUIER referencia → NO borrar, reportar `DONE_WITH_CONCERNS`. Si 0 refs → `rm public/logo-turno-gol.png`.
2. `pnpm remove @phosphor-icons/react` (actualiza package.json + pnpm-lock.yaml).

**Success criteria:**
- `pnpm install --frozen-lockfile` (o el lockfile post-remove) consistente.
- `pnpm build` exit 0.
- `pnpm typecheck` + `pnpm lint` verdes (ningún import roto).
- Si el asset tenía refs ocultas → no se borró, se reportó.

### Task 4 — Reducir `/grilla` bundle < 200KB gzipped

**Context:** `/grilla` = 235 kB gz (única ruta sobre presupuesto). Route-specific 65.6 kB. `BookingGrid.tsx` (client) importa `BookingFormModal` que sólo se usa al abrir un slot (no en first paint). Code-split el modal vía `next/dynamic` saca su peso del First Load JS.

**Cambios:**
1. En `src/components/booking/BookingGrid.tsx`: reemplazar `import { BookingFormModal } from './BookingFormModal'` por:
   ```ts
   import dynamic from 'next/dynamic'
   const BookingFormModal = dynamic(() => import('./BookingFormModal').then(m => m.BookingFormModal), { ssr: false })
   ```
   (Si `BookingFormModal` es default export, ajustar. Verificar named vs default.)
2. Re-build y medir `/grilla` First Load JS. Si sigue ≥200KB, investigar el siguiente subtree pesado (p.ej. `BookingCard` si es lazy-able, o deferir la suscripción realtime). NO romper la funcionalidad de la grilla (es la vista crítica del admin — el grid + realtime deben seguir cargando en first paint; sólo se difiere el modal).

**Success criteria:**
- `pnpm build`: `/grilla` First Load JS **< 200 kB**.
- `pnpm typecheck` + `pnpm lint` verdes.
- La grilla sigue funcionando: render inicial de bookings + realtime intacto; el modal abre on-demand (verificar que `dynamic` con `ssr:false` no rompe el render del trigger).
- Reportar el número antes/después.

### Task 5 — Lighthouse baseline tooling + medición

**Context:** No existe tooling Lighthouse. F0 debe establecer config + baseline. Correr Lighthouse real requiere Chrome headless + app servida (`next start`).

**Cambios:**
1. `pnpm add -D @lhci/cli`.
2. `lighthouserc.json` en root:
   ```json
   {
     "ci": {
       "collect": {
         "numberOfRuns": 1,
         "settings": { "preset": "desktop", "emulatedFormFactor": "mobile" }
       },
       "assert": {
         "assertions": {
           "categories:performance": ["warn", { "minScore": 0.9 }]
         }
       }
     }
   }
   ```
   (Ajustar a sintaxis LHCI vigente; `preset` mobile o `emulatedFormFactor: 'mobile'` + throttling mobile. Performance ≥ 0.9 como `warn` para baseline, no bloqueante aún — F12 lo sube a `error`.)
3. `package.json` script: `"lighthouse": "lhci autorun"`.
4. **Intentar** correr `pnpm lighthouse` contra `next start` (build de prod) sobre rutas clave (`/`, `/login`, `/explorar`). Si Chrome no está disponible en el entorno → documentar el procedimiento en el report + dejar la config lista para CI/local. Registrar el score si se obtiene.

**Success criteria:**
- `lighthouserc.json` válido (LHCI lo parsea sin error).
- `pnpm lighthouse` script presente.
- Baseline medido O procedimiento documentado (si el entorno no tiene Chrome).
- `pnpm typecheck` + `pnpm build` siguen verdes.

---

## Verificación final (post-tasks)

```
pnpm typecheck
pnpm lint              # esperado: 0 warnings (4 <img> cerrados)
pnpm test              # unit — sin regresión
pnpm test:integration  # flaky conocido race-abonado-vs-individual NO es regresión
pnpm build             # esperado: toda ruta < 200KB gz, incl. /grilla
```

Confirmar tabla de rutas final: todas <200KB gz. Documentar antes/después de `/grilla` y del shared baseline. Generar report + actualizar STATE.md (F0 → completed, próxima F1).

## Out-of-scope (registrar en STATE backlog)

- Upgrade lucide-react 1.11.0 → línea mantenida (toca 42 archivos, riesgo API). 
- Reducción del shared baseline 150kB (Sentry SDK) → F12.
- Consolidación final de icon system → F1.
- Lighthouse assertion `error` (bloqueante) + corrida en CI → F12/F14.
