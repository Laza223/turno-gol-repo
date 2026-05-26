# Fase F1 — Design System + Componentes UI Base (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Consistencia visual end-to-end. `design-system/MASTER.md` única fuente de verdad. Done-criteria MASTER_PLAN (líneas 162-166):
1. **100% componentes UI siguen MASTER.md** (tokens de color/tipografía/spacing/radii/shadows — sin drift hardcoded).
2. **Skeleton + Empty + Error state components reusables** (faltan los 3 hoy).

**Architecture:** Next.js 14 App Router + TS strict + Tailwind + shadcn/ui. Worktree `audit/frontend-f01`. F1 NO toca schema → la convención dual-tree de migrations (`docs/MIGRATIONS.md`) no aplica.

**Tech Stack:** Next.js 14, Tailwind CSS, shadcn/ui (Radix bajo el capó), `lucide-react`, `class-variance-authority` (CVA, ya en deps via shadcn), `@sentry/nextjs` (preservar en error boundaries).

---

## Hallazgos del baseline (investigator + lectura directa de archivos clave)

### 1. design-system/ — duplicate stale en subdir

- `design-system/MASTER.md` (raíz, 318 líneas) = **fuente de verdad** real (per doc20). Tokens completos: colores, type scale, spacing 4px grid, shadows, radii, specs por componente, animation, layout, icons, a11y, anti-patterns §11, checklist §12.
- `design-system/turnogol/MASTER.md` (210 líneas, 6KB, generado 2026-04-27 13:09) = **duplicate stale**. Contradice MASTER raíz (card bg `#F8FAFC` en vez de white; menciona "SaaS Mobile" / "glassmorphism" / "spring animation" que no aplican). Confunde futuros lectores.
- `design-system/pages/` vacío. `design-system/turnogol/pages/` vacío. OK.

### 2. doc20 — drift con MASTER §9 (icons)

- `docs/doc20_design_system.md:80` y `:291` mencionan **"Phosphor / Heroicons"** como librería de iconos.
- MASTER §9 (línea 250) manda **Lucide React** únicamente.
- F0 removió `@phosphor-icons/react` (0 imports). En código real **NO hay Phosphor** — confirmado. Drift es sólo de doc.

### 3. globals.css ↔ MASTER §1 — `--ring` mismatch

- `src/app/globals.css:34` define `--ring: 161 94% 30%` = **emerald-600** (#059669).
- MASTER §1 línea 31 dice `Ring (focus) → emerald-500` (#10B981).
- MASTER §10 línea 275: `focus-visible:ring-emerald-500 focus-visible:ring-offset-2` — JSX usa literal `ring-emerald-500` en muchos sitios.
- Resultado: drift real. La clase semántica `ring-ring` (shadcn) resuelve a emerald-600; las clases literales `ring-emerald-500` están dispersas en código. Hay que **alinear**: o MASTER → emerald-600 (matches primary) o globals.css → emerald-500 (matches MASTER y los literales del código). **Decisión:** ajustar `--ring` a emerald-500 en globals.css (alinea con MASTER §1 + con todos los `ring-emerald-500` ya tipeados en componentes). Cero cambios en JSX.

### 4. Componentes UI primitives — 8 archivos, **todos tokenizados ✓**

`src/components/ui/`: button, badge, dialog, dropdown-menu, input, label, toast, toaster. **0 hex hardcoded en JSX**. Convención semántica `bg-primary`, `text-foreground`, `border-input`, `ring-ring` aplicada consistentemente.

- `button.tsx:55` — 5 variants (default/destructive/outline/secondary/ghost/link). default = `bg-emerald-600 hover:bg-emerald-500 hover:-translate-y-0.5 shadow-md shadow-emerald-600/20`. (emerald-500 hover es OK — non-text accent, glow.)
- `badge.tsx:32` — 5 variants (default/secondary/destructive/success/outline). success usa `bg-emerald-50 text-emerald-700 ring-emerald-200`. Diferente al "green-50/green-700" del MASTER §6 badge spec pero **consistente con palette emerald del proyecto** — válido.

### 5. Componentes Layout — 4 archivos, **1 drift real**

- `admin-layout-shell.tsx:80` ✓ (bg-slate-50 page).
- `admin-header.tsx:50` ✓.
- `status-banner.tsx:96` ✓ (bg-amber-50/-200 + bg-emerald-50/-200 + bg-red-50/-200 — semantic tiers OK).
- **`admin-sidebar.tsx:63`** — logo `<span className="...bg-emerald-500 text-xs font-bold text-slate-950 shadow-sm shadow-emerald-500/30">TG</span>`. **Borderline anti-pattern §11**: emerald-500 reservado para non-text accents, acá se usa como container DE TEXTO. Aunque slate-950 sobre emerald-500 da ~9.8:1 (AAA), la regla MASTER es estricta. Fix: `bg-emerald-600 text-white` (alinea con primary canónico).

### 6. Componentes faltantes — **3 críticos (DONE-CRITERIA #2)**

- **Skeleton**: NO existe `<Skeleton>` componente. `.skeleton` class CSS definida en `globals.css:69-78` (shimmer animation 1.5s, ya respeta `prefers-reduced-motion` en :81). Uso ad-hoc: `AvailabilityGrid.tsx:187` y `[slug]/page.tsx:70` la consumen vía `<div className="skeleton h-XX rounded-lg" />`. Pattern reusable pero sin componente.
- **EmptyState**: NO existe. Uso ad-hoc: `abonados/page.tsx:50-53` (`<p className="text-sm text-muted-foreground">No hay abonados...</p>`). Otros pages probablemente similar.
- **ErrorState**: NO existe componente compartido. 5 `error.tsx` boundaries duplican UI casi idéntica:
  - `src/app/error.tsx` (root, 60 líneas, Sentry, full-screen, botones Reintentar+Inicio)
  - `src/app/(admin)/error.tsx` (57 líneas, Sentry, contained, botones Reintentar+Dashboard)
  - `src/app/(admin)/reportes/error.tsx` (27 líneas, **sin Sentry**, inline pattern minimal)
  - `src/app/(player)/error.tsx` (54 líneas, Sentry, full-screen, botones Reintentar+Mis reservas)
  - `src/app/(public)/error.tsx` (53 líneas, Sentry, full-screen, botones Reintentar+Explorar)
  Pattern repetido: icon-circle red-50/red-600 + AlertTriangle + título + descripción + ref digest + botón primary + link secundario. Refactor → `<ErrorState variant="full"|"contained"|"inline">` parametrizable.

### 7. Drift de paleta en pages — **1 violación real**

- `abonados/page.tsx:21-25` define:
  ```ts
  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    canceled: 'bg-gray-100 text-gray-500',
  }
  ```
  **Drift**: usa Tailwind green/yellow/gray base en vez de emerald/amber/slate de la palette MASTER §1, **y** bypassea el `<Badge>` primitive que ya tiene `variant="success|secondary|destructive"`. Fix: reemplazar con `<Badge variant="success|warning|secondary">` (agregar `warning` variant a badge.tsx si no existe).
- Resto de pages: el investigator identificó 17 inline `<span className="...rounded-full px-2...">` badges dispersos por las pages admin (caja, settings/facturacion, staff, mis-reservas). Pattern consistente con MASTER §6 (semantic emerald/amber/red -50/-700 + ring) → **NO son drift de palette, son drift de primitive**. Refactor a `<Badge>` no es bloqueante para F1 done-criteria. **Deferred a F4/F5** cuando se toquen esas pages CRUD (registrado en backlog).

### 8. Patrones correctos (NO tocar)

- 0 hex hardcoded en JSX ✓
- 0 `bg-white` como page bg ✓ (todos usan `bg-slate-50`)
- 0 `text-black` o `bg-black` ✓ (sólo `bg-black/50` para overlays — allowed MASTER §6)
- 0 `text-emerald-500` para texto ✓
- 0 emojis como iconos ✓
- Lucide-only ✓
- Responsive padding `px-4 sm:px-6 lg:px-8` consistente ✓
- `prefers-reduced-motion` respetado (globals.css + Tailwind variants) ✓

### 9. lucide-react upgrade — **diferido**

`package.json:51` pin `^1.11.0` (release 2021, línea mantenida es 0.4xx, semver invertido — F0 backlog). Tocar 42 archivos con riesgo de cambios de API. **F1 done-criteria no requiere upgrade**; el lib funciona, MASTER lo mandata, `optimizePackageImports` ya hace tree-shake (F0). Mantener diferido — fix > breakage. Decisión documentada en report F1.

---

## File structure (post F1)

```
src/components/ui/
  badge.tsx               # +variant="warning"
  button.tsx              # sin cambios
  dialog.tsx              # sin cambios
  dropdown-menu.tsx       # sin cambios
  empty-state.tsx         # NEW
  error-state.tsx         # NEW
  input.tsx               # sin cambios
  label.tsx               # sin cambios
  skeleton.tsx            # NEW
  toast.tsx               # sin cambios
  toaster.tsx             # sin cambios

src/app/
  error.tsx                       # refactor → usa ErrorState variant=full
  (admin)/error.tsx               # refactor → usa ErrorState variant=contained
  (admin)/reportes/error.tsx      # refactor → usa ErrorState variant=inline + Sentry
  (player)/error.tsx              # refactor → usa ErrorState variant=full
  (public)/error.tsx              # refactor → usa ErrorState variant=full
  (admin)/abonados/page.tsx       # STATUS_COLORS → <Badge variant=...>
  globals.css                     # --ring: 161 94% 30% → 158 64% 52% (emerald-500)

src/components/layout/
  admin-sidebar.tsx               # :63 logo bg-emerald-500 → bg-emerald-600

design-system/
  MASTER.md                       # sin cambios (ya es source of truth)
  turnogol/                       # DELETE entire dir (stale duplicate)
  pages/                          # sin cambios (placeholder)

docs/
  doc20_design_system.md          # fix líneas 80, 291: "Phosphor / Heroicons" → "Lucide React"
```

---

## Tasks

### T1 — Cleanup design-system + doc20 + globals.css `--ring` alignment

**What to do:**

1. **Eliminar** `design-system/turnogol/` (dir completo, stale duplicate de MASTER.md). El MASTER raíz (`design-system/MASTER.md`) queda como única source of truth, ya consistente con doc20 jerarquía.
2. **Actualizar** `docs/doc20_design_system.md`:
   - Línea 80: `| **Iconos** | Librería de iconos seleccionada (Phosphor / Heroicons) |` → `| **Iconos** | Librería de iconos seleccionada (Lucide React, ver MASTER §9) |`
   - Línea 291 (dentro del box ASCII): `│    • Librería de iconos (Phosphor / Heroicons)               │` → `│    • Librería de iconos (Lucide React)                       │` (ajustar padding/alignment del box ASCII si cambia el ancho).
3. **Alinear `--ring`** en `src/app/globals.css:34` de `161 94% 30%` (emerald-600) a `158 64% 52%` (emerald-500) — alinea con MASTER §1 línea 31 y con todos los literales `ring-emerald-500` ya tipeados en componentes. Agregar comentario inline: `/* emerald-500 #10B981 — matches MASTER §1 + literal ring-emerald-500 in JSX */`.

**Success criteria:**
- `design-system/turnogol/` no existe (`ls design-system/` muestra sólo `MASTER.md` y `pages/`).
- `grep -n "Phosphor" docs/doc20_design_system.md` → 0 hits.
- `grep -n "ring: 161" src/app/globals.css` → 0 hits; `grep -n "ring: 158" src/app/globals.css` → 1 hit.
- `pnpm typecheck` verde.
- `pnpm lint` verde.
- `pnpm build` verde (visual smoke: focus rings ahora resuelven a emerald-500 vía ring-ring; no afecta runtime de classes literales).

**Commit prefix:** `audit(f01):`

---

### T2 — Crear `<Skeleton>` componente reusable + adoptar en 2 callsites existentes

**What to do:**

1. Crear `src/components/ui/skeleton.tsx`:
   ```tsx
   import { cn } from '@/lib/utils'

   export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
     /** Tailwind shape utilities — pass through (e.g. "h-48 rounded-lg w-full") */
   }

   export function Skeleton({ className, ...props }: SkeletonProps) {
     return (
       <div
         className={cn('skeleton rounded-md', className)}
         aria-busy="true"
         aria-live="polite"
         {...props}
       />
     )
   }
   ```
   - Wrap CSS class `.skeleton` (definida en `globals.css:69-78`) — preserva shimmer + `prefers-reduced-motion` ya implementado.
   - Default `rounded-md` (MASTER §5 inputs/buttons radius); override-able vía className.
   - a11y: `aria-busy="true"` + `aria-live="polite"` para screen readers (loading announcement).
2. Adoptar en los 2 callsites existentes que usan la class CSS directamente:
   - `src/app/(public)/[slug]/components/AvailabilityGrid.tsx:188`: `<div className="skeleton h-48 rounded-lg" aria-busy="true" />` → `<Skeleton className="h-48" />` (rounded-md default es OK; quitar `rounded-lg` o cambiar a `rounded-lg` explícito).
   - `src/app/(public)/[slug]/page.tsx:70`: `<Suspense fallback={<div className="skeleton h-64 rounded-lg" />}>` → `<Suspense fallback={<Skeleton className="h-64" />}>`.

   **Nota:** preservar la altura exacta (`h-48`, `h-64`) y forma redondeada (`rounded-lg` si el original lo usaba — overridear el default `rounded-md`).

**Success criteria:**
- `src/components/ui/skeleton.tsx` existe, exporta `Skeleton`.
- 2 callsites refactorizados (`grep -rn "Skeleton" src/app/(public)/[slug]/` muestra los imports + uso).
- `pnpm typecheck` verde, `pnpm lint` verde, `pnpm build` verde.
- Visual smoke (dev/build): el shimmer sigue animando, los placeholders mantienen dimensiones idénticas.

**Commit prefix:** `audit(f01):`

---

### T3 — Crear `<EmptyState>` componente + adoptar en abonados/page.tsx

**What to do:**

1. Crear `src/components/ui/empty-state.tsx`:
   ```tsx
   import { cn } from '@/lib/utils'
   import type { LucideIcon } from 'lucide-react'

   export interface EmptyStateProps {
     icon?: LucideIcon
     title: string
     description?: string
     action?: React.ReactNode  // typically <Link> or <Button>
     className?: string
   }

   export function EmptyState({
     icon: Icon,
     title,
     description,
     action,
     className,
   }: EmptyStateProps) {
     return (
       <div
         className={cn(
           'flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center',
           className,
         )}
       >
         {Icon ? (
           <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200">
             <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
           </div>
         ) : null}
         <h3 className="text-base font-semibold text-slate-900">{title}</h3>
         {description ? (
           <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
             {description}
           </p>
         ) : null}
         {action ? <div className="mt-6">{action}</div> : null}
       </div>
     )
   }
   ```
   - Tokens MASTER: `border-slate-200`, `bg-white` (card), `text-slate-900` h3, `text-slate-500` body, `rounded-lg` (MASTER §5 panels), `border-dashed` para distinguir de cards reales.
   - Spacing `px-6 py-12` (MASTER §3 spacing scale).
   - Type scale: h3 `text-base font-semibold` (MASTER §2 card title), body `text-sm` (MASTER §2 body).
   - Icon opcional (a11y `aria-hidden="true"` — decorativo).
2. Adoptar en `src/app/(admin)/abonados/page.tsx:50-53`:
   ```tsx
   // ANTES
   {abonados.length === 0 ? (
     <p className="text-sm text-muted-foreground">
       No hay abonados registrados. Creá el primero con el botón de arriba.
     </p>
   ) : (...)}

   // DESPUÉS
   {abonados.length === 0 ? (
     <EmptyState
       icon={Users}
       title="Sin abonados registrados"
       description="Creá el primer abonado para que aparezca acá."
       action={
         <Link
           href="/abonados/nuevo"
           className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700"
         >
           + Nuevo Abonado
         </Link>
       }
     />
   ) : (...)}
   ```
   - Import `Users` de `lucide-react` (ya en deps).
   - Preserve la ruta `/abonados/nuevo` exacta.

**Success criteria:**
- `src/components/ui/empty-state.tsx` existe, exporta `EmptyState` + `EmptyStateProps`.
- `src/app/(admin)/abonados/page.tsx` usa `<EmptyState>` (imports nuevos visibles).
- `pnpm typecheck` verde, `pnpm lint` verde, `pnpm build` verde.

**Commit prefix:** `audit(f01):`

---

### T4 — Crear `<ErrorState>` + refactorizar 5 error.tsx boundaries

**What to do:**

1. Crear `src/components/ui/error-state.tsx`:
   ```tsx
   'use client'

   import Link from 'next/link'
   import { AlertTriangle, RefreshCw } from 'lucide-react'
   import type { LucideIcon } from 'lucide-react'
   import { cn } from '@/lib/utils'

   export type ErrorStateVariant = 'full' | 'contained' | 'inline'

   export interface ErrorStateProps {
     variant?: ErrorStateVariant  // default 'contained'
     title: string
     description?: string
     digest?: string
     onRetry?: () => void
     retryLabel?: string  // default 'Reintentar'
     secondaryHref?: string
     secondaryLabel?: string
     secondaryIcon?: LucideIcon
   }

   export function ErrorState({
     variant = 'contained',
     title,
     description,
     digest,
     onRetry,
     retryLabel = 'Reintentar',
     secondaryHref,
     secondaryLabel,
     secondaryIcon: SecondaryIcon,
   }: ErrorStateProps) {
     const wrapper = {
       full: 'flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12',
       contained: 'flex min-h-[60vh] items-center justify-center px-4 py-12',
       inline: '',
     }[variant]

     if (variant === 'inline') {
       return (
         <div className="rounded-lg border border-red-200 bg-red-50 p-6">
           <p className="text-sm text-red-700">{title}{description ? `. ${description}` : ''}</p>
           {onRetry ? (
             <button
               onClick={onRetry}
               className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline"
               type="button"
             >
               {retryLabel}
             </button>
           ) : null}
         </div>
       )
     }

     const cardShadow = variant === 'full' ? 'shadow-lg' : 'shadow-sm'

     return (
       <main className={wrapper}>
         <div className={cn('w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center', cardShadow)}>
           <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-1 ring-inset ring-red-600/20">
             <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden="true" />
           </div>
           <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
           {description ? (
             <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
           ) : null}
           {digest ? (
             <p className="mt-3 text-xs text-slate-400">
               Código de referencia:{' '}
               <span className="font-mono tabular-nums">{digest}</span>
             </p>
           ) : null}
           <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
             {onRetry ? (
               <button
                 type="button"
                 onClick={onRetry}
                 className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
               >
                 <RefreshCw className="h-4 w-4" aria-hidden="true" />
                 {retryLabel}
               </button>
             ) : null}
             {secondaryHref && secondaryLabel ? (
               <Link
                 href={secondaryHref}
                 className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
               >
                 {SecondaryIcon ? <SecondaryIcon className="h-4 w-4" aria-hidden="true" /> : null}
                 {secondaryLabel}
               </Link>
             ) : null}
           </div>
         </div>
       </main>
     )
   }
   ```
   - 3 variants: `full` (full-dvh + bg + shadow-lg, para root/player/public), `contained` (min-h-60vh + shadow-sm, para admin shell que mantiene sidebar), `inline` (red panel minimal, para reportes-like).
   - Heading: `<h1>` para full/contained (tope de página jerárquicamente), `<p>` para inline (minimal).
   - Preserva el patrón visual existente byte-a-byte (icon-circle red-50/red-600, AlertTriangle, botón primary emerald-600 + secondary outline, motion-reduce friendly).
   - `onRetry` opcional (algunos casos pueden no tener retry), `secondaryHref+Label+Icon` opcional.
   - `digest` opcional para mostrar Next.js error.digest.

2. Refactorizar los 5 `error.tsx`:

   **`src/app/error.tsx`** (root, variant=full):
   ```tsx
   'use client'
   import { useEffect } from 'react'
   import { Home } from 'lucide-react'
   import * as Sentry from '@sentry/nextjs'
   import { ErrorState } from '@/components/ui/error-state'

   export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
     useEffect(() => { Sentry.captureException(error) }, [error])
     return (
       <ErrorState
         variant="full"
         title="Algo salió mal"
         description="Tuvimos un problema inesperado. Ya quedó registrado y lo estamos revisando. Podés reintentar en unos segundos o volver al inicio."
         digest={error.digest}
         onRetry={reset}
         secondaryHref="/"
         secondaryLabel="Volver al inicio"
         secondaryIcon={Home}
       />
     )
   }
   ```

   **`src/app/(admin)/error.tsx`** (admin contained):
   - variant=`contained`, title="Error en el panel de administración", description preservada, secondary=Dashboard+`LayoutDashboard` icon, href=`/dashboard`.

   **`src/app/(player)/error.tsx`** (player full):
   - variant=`full`, preservar titles/descriptions/secondary (mis-reservas link + icon).

   **`src/app/(public)/error.tsx`** (public full):
   - variant=`full`, preservar (link a explorar).

   **`src/app/(admin)/reportes/error.tsx`** (inline + agregar Sentry):
   ```tsx
   'use client'
   import { useEffect } from 'react'
   import * as Sentry from '@sentry/nextjs'
   import { ErrorState } from '@/components/ui/error-state'

   export default function ReportesError({ error, reset }: { error: Error; reset: () => void }) {
     useEffect(() => { Sentry.captureException(error) }, [error])
     return (
       <div className="space-y-4">
         <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>
         <ErrorState
           variant="inline"
           title="Error al cargar el reporte"
           description={error.message}
           onRetry={reset}
         />
       </div>
     )
   }
   ```
   **Importante:** reportes/error.tsx originalmente NO reportaba a Sentry — el refactor lo agrega (fix latente). Documentar este sub-fix en el commit message.

**Success criteria:**
- `src/components/ui/error-state.tsx` existe.
- Los 5 `error.tsx` importan `ErrorState`; ninguno duplica el icon-circle / botones / shell anymore.
- Visual smoke: ningún cambio perceptible (mismo layout, mismos textos, mismos íconos, mismas rutas secundarias). Verify abriendo cualquier error.tsx old vs new — diff debe ser estructural, no visual.
- Sentry sigue capturando en los 4 que ya lo hacían + ahora también en reportes/error.tsx.
- `pnpm typecheck` verde, `pnpm lint` verde, `pnpm build` verde.

**Commit prefix:** `audit(f01):`

---

### T5 — Fix palette drift: abonados STATUS_COLORS + sidebar logo

**What to do:**

1. **Agregar variant `warning` a `src/components/ui/badge.tsx`** (no existe hoy; se necesita para "Pausado" en abonados):
   - En el CVA del badge, agregar entrada: `warning: 'border-transparent bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'`.
   - Mantener todas las otras variants intactas (default, secondary, destructive, success, outline).

2. **Refactorizar `src/app/(admin)/abonados/page.tsx:21-25` + uso en :80-84:**
   ```tsx
   // Eliminar STATUS_COLORS const completo.
   // Import:
   import { Badge } from '@/components/ui/badge'

   // Map status → variant (puede ser inline en el render):
   const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
     active: 'success',
     paused: 'warning',
     canceled: 'secondary',
   }

   // Render (reemplaza el <span>):
   <Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'}>
     {STATUS_LABELS[a.status] ?? a.status}
   </Badge>
   ```
   - El default fallback `'secondary'` evita undefined si se agrega un status nuevo sin actualizar el map.
   - Elimina el className concat manual `px-2 py-0.5 text-xs rounded-full` — el primitive ya lo encapsula.

3. **Fix `src/components/layout/admin-sidebar.tsx:63`** logo TG:
   ```tsx
   // ANTES
   <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-slate-950 shadow-sm shadow-emerald-500/30">
     TG
   </span>

   // DESPUÉS
   <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-xs font-bold text-white shadow-sm shadow-emerald-600/30">
     TG
   </span>
   ```
   - `bg-emerald-500` → `bg-emerald-600` (primary canónico, allowed para text containers).
   - `text-slate-950` → `text-white` (mejor contraste sobre emerald-600 — emerald-600 #059669 vs white da ~6.7:1 AA Large; emerald-600 vs slate-950 da ~4.6:1, también AA pero peor para texto pequeño bold).
   - `shadow-emerald-500/30` → `shadow-emerald-600/30` (consistente con bg).

**Success criteria:**
- `grep -n "warning:" src/components/ui/badge.tsx` → 1 hit (nuevo variant).
- `grep -n "STATUS_COLORS" src/app/(admin)/abonados/page.tsx` → 0 hits (eliminado).
- `grep -n "<Badge" src/app/(admin)/abonados/page.tsx` → ≥1 hit.
- `grep -n "bg-emerald-500" src/components/layout/admin-sidebar.tsx` → 0 hits (todos los emerald-500 ahí refieren a la barra activa decorativa que sí es non-text accent — el único cambio es el logo TG).
  - **Excepción documentada:** `admin-sidebar.tsx:108` (`bg-emerald-500` del active-nav indicator bar) **NO se toca** — es non-text accent puro (barra decorativa de 4px sin texto encima), válido per MASTER §1.
- `pnpm typecheck` verde, `pnpm lint` verde, `pnpm build` verde.

**Commit prefix:** `audit(f01):`

---

### T6 — Verify + report

**What to do:**

1. **Run suite completo** desde el worktree:
   - `pnpm typecheck` — debe pasar verde.
   - `pnpm lint` — debe pasar verde (0 warnings post-F0 baseline).
   - `pnpm test` — unit suite (debe seguir 411/411 — F1 no toca lógica de backend).
   - `pnpm test:integration` — debe pasar excepto el flaky pre-existente `daily-close-idempotency` + `race-abonado-vs-individual` (NO regresión F1, esperado por estado residual de DB local).
   - `pnpm build` — debe pasar verde, toda ruta sigue <200KB gz (F0 baseline). El componente Skeleton/EmptyState/ErrorState son tiny (~kB cada uno).
   - `pnpm lighthouse` (opcional, solo si tiempo): re-correr sobre las 5 rutas estáticas para confirmar que no hubo regresión visual >5pt en performance/accessibility.

2. **Generar report** en `docs/audit/reports/fase-f01-design-system-report.md` siguiendo el house-style F0:
   - Header (fecha, branch, veredicto).
   - Tabla de done-criteria (2 criterios MASTER) con evidencia file:line.
   - Trabajo realizado por task (T1-T5) con commits.
   - Componentes nuevos: archivo, líneas, exports, usage examples.
   - Cambios por archivo (tabla).
   - Stats acumulados (14/26 fases post F1).
   - Gaps/deferred: lucide-react upgrade (razón), 17 inline `<span>` badges → F4/F5, sheet primitive (no usado), header user menu → DropdownMenu (no usado).
   - Próxima fase: F2 Auth + Onboarding Flows.

3. **Actualizar `docs/audit/STATE.md`**:
   - Fase actual → F2.
   - Agregar fila F1 a tabla de fases completadas.
   - Stats: +3 componentes UI nuevos, +1 variant Badge, mover el item "lucide-react pin" a "diferido v1.5 si fricción real" (o mantener en backlog), agregar "design-system/turnogol/ eliminado" como cleanup.
   - Próximas decisiones: F2 Auth + Onboarding Flows.

**Success criteria:**
- Suite verifications corridas + evidencia anotada en report.
- Report generado con misma estructura/calidad que `fase-f00-baseline-report.md`.
- STATE.md actualizado consistentemente.

**Commit prefix:** `audit(f01):` (plan + report + STATE en commit final).

---

## Out of scope (NOT F1)

- Lucide upgrade — pin `^1.11.0` permanece, deferred (riesgo > beneficio sin done-criteria que lo requiera).
- 17 inline `<span className="...rounded-full">` badges en pages CRUD (caja, settings, staff, mis-reservas) → diferido a F4/F5 cuando se toquen esas pages.
- Header user menu refactor → DropdownMenu primitive (working as-is).
- Sheet primitive instalación (mobile drawer custom funciona).
- Dark mode (MASTER §11 prohibido en v1).
- Cualquier cambio funcional / lógica de backend / schema.
