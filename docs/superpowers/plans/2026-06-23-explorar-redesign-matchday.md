# Rediseño `/explorar` "Matchday" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renovar la vista pública `/explorar` (catálogo de complejos del jugador) a un nivel "increíble" — impactante y funcional — sin tocar backend.

**Architecture:** Evolución del design system con identidad "Matchday" (líneas de cal + tipografía de marcador Archivo). Se conserva el contrato de datos (`PublicTenantCard`) y el patrón URL-driven (filtros en query string, SSR). Componentes chicos y aislados; el `page.tsx` orquesta. La firma visual (banda hero clara + display) se concentra; el resto es ejecución limpia estilo Airbnb/ML.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind, shadcn/ui, lucide-react, react-leaflet (OSM), next/font (Inter + Archivo), Vitest + @testing-library/react (happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-23-explorar-redesign-matchday-design.md`
**Page override:** `docs/spec/design-system/pages/explorar.md`

## Global Constraints

- TypeScript strict; **nunca** `any`.
- Solo colores de la paleta MASTER §1 (no hex crudo en JSX). **Prohibido** `emerald-500` para texto sobre blanco (AA); válido solo para acentos no-texto (borde/glow).
- **Prohibido** cabecera oscura de página en el área del jugador (`player-area.md` §1). La banda hero es **clara** (`emerald-50/100`). `PortalHeader` no se toca.
- `font-display` (Archivo) **solo** en hero + `h1`/`h2` + numeral de precio de la card. Resto Inter. Data numérica densa con `tabular-nums`.
- Sin cambios de backend (`search.service.ts`, `availability-search.service.ts`, DB). El camino de datos cacheado de `page.tsx` (`getDefaultSearchCached`, `listPublicCitiesCached`, `isDefaultSearch`) se conserva intacto.
- Montos en centavos; UTC; mobile-first touch ≥44px; AA; foco visible `focus-visible:ring-2 ring-emerald-500 ring-offset-2`; `prefers-reduced-motion` respetado; sin scroll horizontal en 375px.
- Correr `pnpm typecheck` después de cada cambio.
- Todo commit termina con el trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (omitido en los ejemplos por brevedad).
- Comandos: unit = `pnpm exec vitest run <archivo>`; suite unit = `pnpm test`; tipos = `pnpm typecheck`; lint = ver Task 0.0 (workaround de worktree); e2e = `pnpm test:e2e`.

---

## Task 0.0: Setup del worktree

**Files:** ninguno (entorno).

- [ ] **Step 1: Instalar deps en el worktree** (lint/typecheck necesitan node_modules locales — ver memoria "lint-nested-worktree-dual-plugin").

Run: `pnpm install`
Expected: instala sin errores.

- [ ] **Step 2: Verificar baseline verde antes de tocar nada**

Run: `pnpm typecheck && pnpm exec vitest run tests/unit/tenant-card.test.tsx`
Expected: typecheck OK; los 9 tests de tenant-card en PASS.

- [ ] **Step 3: Comando de lint del worktree** (anidado → doble plugin; usar este invocador)

Run: `pnpm exec eslint src/ --ext .ts,.tsx --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to .`
Expected: sin errores. Usar este comando para "lint" en todos los pasos siguientes.

---

## Task 0.1: Cablear la fuente Archivo (`font-display`)

**Files:**
- Modify: `src/app/layout.tsx:2,8-12,51`
- Modify: `tailwind.config.ts:21-23`

**Interfaces:**
- Produces: clase Tailwind `font-display` → `var(--font-archivo)`. La usan TenantCard, SearchBand, page.tsx.

- [ ] **Step 1: Importar y configurar Archivo en `layout.tsx`**

```tsx
// src/app/layout.tsx (línea 2)
import { Inter, Archivo } from 'next/font/google'

// debajo del const inter = Inter({...})
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})
```

- [ ] **Step 2: Exponer ambas variables en `<html>`**

```tsx
// src/app/layout.tsx (la línea <html lang="es" className={inter.variable}>)
<html lang="es" className={`${inter.variable} ${archivo.variable}`}>
```

- [ ] **Step 3: Registrar `font-display` en Tailwind**

```ts
// tailwind.config.ts → theme.extend.fontFamily
fontFamily: {
  sans: ['var(--font-inter)', ...fontFamily.sans],
  display: ['var(--font-archivo)', ...fontFamily.sans],
},
```

- [ ] **Step 4: Verificar tipos y build de Tailwind**

Run: `pnpm typecheck`
Expected: PASS. (La clase `font-display` se valida al usarla en Task 1.)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx tailwind.config.ts
git commit -m "feat(explorar): wire Archivo display font (font-display)"
```

---

## Task 0.2: Componente `PitchLines` (motivo de líneas de cal)

**Files:**
- Create: `src/app/(public)/explorar/components/PitchLines.tsx`
- Test: `tests/unit/pitch-lines.test.tsx`

**Interfaces:**
- Produces: `PitchLines({ className?: string; variant?: 'band' | 'empty' })` — SVG decorativo `aria-hidden`. Lo usan SearchBand (variant 'band') y EmptyResults (variant 'empty').

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/unit/pitch-lines.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PitchLines from '@/app/(public)/explorar/components/PitchLines'

afterEach(() => cleanup())

describe('PitchLines', () => {
  it('renderiza un svg decorativo aria-hidden (no en el árbol accesible)', () => {
    const { container } = render(<PitchLines />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('acepta className y lo aplica al svg', () => {
    const { container } = render(<PitchLines className="text-emerald-600/20" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-emerald-600/20')
  })
})
```

- [ ] **Step 2: Correr el test, verificar que falla**

Run: `pnpm exec vitest run tests/unit/pitch-lines.test.tsx`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `PitchLines`**

```tsx
// src/app/(public)/explorar/components/PitchLines.tsx
/**
 * Motivo decorativo "líneas de cal" (marcas de cancha de fútbol). SVG sin
 * imágenes, escala con el contenedor (preserveAspectRatio none). Usa
 * `currentColor` → el color sale de una clase text-* en el contenedor padre.
 * Puramente decorativo: aria-hidden, no transporta información.
 */
export default function PitchLines({
  className,
  variant = 'band',
}: {
  className?: string
  variant?: 'band' | 'empty'
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 400 200"
      fill="none"
      preserveAspectRatio={variant === 'band' ? 'xMidYMid slice' : 'xMidYMid meet'}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Línea de medio campo */}
      <line x1="200" y1="0" x2="200" y2="200" stroke="currentColor" strokeWidth="1.5" />
      {/* Círculo central */}
      <circle cx="200" cy="100" r="42" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy="100" r="2.5" fill="currentColor" />
      {/* Áreas (arcos) a izquierda y derecha */}
      <path d="M0 60 H44 V140 H0" stroke="currentColor" strokeWidth="1.5" />
      <path d="M400 60 H356 V140 H400" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
```

- [ ] **Step 4: Correr el test, verificar que pasa**

Run: `pnpm exec vitest run tests/unit/pitch-lines.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(public\)/explorar/components/PitchLines.tsx tests/unit/pitch-lines.test.tsx
git commit -m "feat(explorar): add PitchLines decorative motif"
```

---

## Task 0.3: Actualizar docs de design system

**Files:**
- Modify: `docs/spec/design-system/MASTER.md` (§2 Typography)
- Modify: `docs/spec/design-system/pages/player-area.md` (referencia a `/explorar`)

(No requiere test — solo docs. `pages/explorar.md` ya existe.)

- [ ] **Step 1: En MASTER §2, documentar la excepción de display**

Agregar bajo "Font stack" de MASTER.md §2:

```markdown
**Display (excepción):** `Archivo` (variable, Google Fonts) vía `--font-archivo` →
clase `font-display`. Uso restringido a la vista `/explorar` (hero, h1/h2, numeral de
precio de card). Ver `pages/explorar.md`. El resto del sistema sigue en Inter.
```

- [ ] **Step 2: En player-area.md, enlazar la identidad de `/explorar`**

Agregar al final de player-area.md una nota:

```markdown
## 10. `/explorar` (identidad "Matchday")
La vista `/explorar` evoluciona la identidad con un motivo de líneas de cal y la fuente
`font-display`. Reglas específicas en `pages/explorar.md` (prevalece sobre esta página).
La banda de búsqueda es **clara** (no viola §1) y `PortalHeader` no cambia.
```

- [ ] **Step 3: Commit**

```bash
git add docs/spec/design-system/MASTER.md docs/spec/design-system/pages/player-area.md
git commit -m "docs(design-system): document Archivo display font + /explorar identity"
```

---

## Task 1.1: Rediseñar `TenantCard` (variante grid)

**Files:**
- Modify: `src/app/(public)/explorar/components/TenantCard.tsx` (rediseño completo del body + overlays; conserva carrusel y stretched-link)
- Modify: `tests/unit/tenant-card.test.tsx` (nuevos asserts del body)

**Interfaces:**
- Consumes: `PublicTenantCard`, `SlotPill`, `TenantCardCarousel`, `FavoriteButton`, `RatingStars`, `formatFromPrice`, `activeAmenities`/`AMENITIES`, `formatLabel`/`surfaceLabel`, `PitchLines` (no — el borde de la card es CSS, no PitchLines).
- Produces: `TenantCard({ tenant, initialFavorited?, photos?, slotPills?, variant? })` con `variant?: 'grid' | 'compact'` (default `'grid'`). Task 3.1 implementa `'compact'`.

- [ ] **Step 1: Agregar asserts nuevos al test de la card** (mantener los existentes de carrusel/pills)

Agregar este `describe` a `tests/unit/tenant-card.test.tsx`:

```tsx
describe('TenantCard — body (rediseño Matchday)', () => {
  it('muestra el precio en el body con font-display y "/turno"', () => {
    render(<TenantCard tenant={{ ...baseTenant, fromPriceCents: 1200000 }} />)
    const price = screen.getByText(/\$\s?12\.000/)
    expect(price.className).toContain('font-display')
    expect(screen.getByText('/turno')).toBeTruthy()
  })

  it('sin precio no rompe ni muestra "/turno"', () => {
    render(<TenantCard tenant={{ ...baseTenant, fromPriceCents: null }} />)
    expect(screen.queryByText('/turno')).toBeNull()
  })

  it('muestra el rating en el body cuando hay reseñas', () => {
    render(<TenantCard tenant={{ ...baseTenant, avgRating: 4.8, reviewCount: 123 }} />)
    // RatingStars renderiza el número y el conteo
    expect(screen.getByText(/4[.,]8/)).toBeTruthy()
  })

  it('muestra los formatos como chips de "Fútbol N"', () => {
    render(<TenantCard tenant={{ ...baseTenant, courtFormats: [5, 7] }} />)
    expect(screen.getByText('Fútbol 5')).toBeTruthy()
    expect(screen.getByText('Fútbol 7')).toBeTruthy()
  })

  it('muestra el badge "Reservá online" cuando corresponde', () => {
    render(<TenantCard tenant={{ ...baseTenant, allowOnlineBooking: true }} />)
    expect(screen.getByText('Reservá online')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr, verificar que fallan los nuevos**

Run: `pnpm exec vitest run tests/unit/tenant-card.test.tsx`
Expected: FAIL en los 5 nuevos (precio/rating aún en overlay; badge dice "Reserva online"; falta "/turno").

- [ ] **Step 3: Reescribir `TenantCard`** (body con jerarquía nueva; overlays mínimos)

```tsx
// src/app/(public)/explorar/components/TenantCard.tsx
import Link from 'next/link'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import type { SlotPill } from '@/modules/tenants/availability-search.service'
import { formatArs } from '@/lib/format'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import { formatLabel, surfaceLabel } from '@/components/public/courtFacets'
import RatingStars from '@/components/public/RatingStars'
import FavoriteButton from '@/components/public/FavoriteButton'
import TenantCardCarousel from './TenantCardCarousel'

/**
 * Tarjeta de complejo para /explorar (tema "Matchday"). Patrón stretched-link:
 * el <Link> del título cubre toda la card con ::after; favorito y carrusel son
 * hermanos con z-index para que el HTML sea válido. Overlays sobre la foto:
 * SOLO badge online + favorito (precio y rating viven en el body).
 */
export default function TenantCard({
  tenant,
  initialFavorited = false,
  photos = [],
  slotPills,
  variant = 'grid',
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
  photos?: string[]
  slotPills?: { date: string; slots: SlotPill[] }
  variant?: 'grid' | 'compact'
}) {
  if (variant === 'compact') return <TenantCardCompact tenant={tenant} initialFavorited={initialFavorited} />

  const fromPrice = tenant.fromPriceCents != null ? formatArs(tenant.fromPriceCents) : null
  const amenities = activeAmenities(tenant.amenities).slice(0, 4)
  const formats = tenant.courtFormats.slice(0, 3)
  const surfaces = tenant.courtSurfaces.slice(0, 1)
  const allPhotos = Array.from(
    new Set([tenant.coverUrl, ...photos].filter((p): p is string => Boolean(p))),
  )

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 border-t-2 border-t-emerald-500 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
        {allPhotos.length > 0 ? (
          <TenantCardCarousel photos={allPhotos} name={tenant.name} href={`/${tenant.slug}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-3xl font-bold text-emerald-600/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent"
        />
        {tenant.allowOnlineBooking && (
          <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden />
            Reservá online
          </span>
        )}
        <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-3 top-3 z-20" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 transition-colors group-hover:text-emerald-700">
            <Link href={`/${tenant.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {tenant.name}
            </Link>
          </h3>
          {tenant.reviewCount > 0 && (
            <span className="shrink-0 pt-0.5">
              <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />
            </span>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {tenant.city}, {tenant.province}
            {tenant.distanceKm != null && (
              <span className="tabular-nums"> · a {tenant.distanceKm} km</span>
            )}
          </span>
        </p>

        {(formats.length > 0 || surfaces.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {formats.map((f) => (
              <span
                key={`f-${f}`}
                className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
              >
                {formatLabel(f)}
              </span>
            ))}
            {surfaces.map((s) => (
              <span key={`s-${s}`} className="text-xs text-slate-500">
                · {surfaceLabel(s)}
              </span>
            ))}
          </div>
        )}

        {tenant.allowOnlineBooking && slotPills && slotPills.slots.length > 0 && (
          <div
            role="group"
            aria-label={`Turnos libres el ${slotPills.date.split('-').reverse().join('/')}`}
            className="relative z-10 flex flex-wrap gap-1.5 pt-0.5"
          >
            {slotPills.slots.map((s) => (
              <Link
                key={s.time}
                href={`/${tenant.slug}/reservar?court=${s.courtId}&date=${slotPills.date}&time=${s.time}&dur=${s.durationMins}`}
                aria-label={`Reservar a las ${s.time}`}
                className="inline-flex items-center rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 tabular-nums"
              >
                {s.time}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {amenities.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-2 text-slate-400">
              {amenities.map((key) => {
                const { label, Icon } = AMENITIES[key]
                return (
                  <li key={key} title={label} className="inline-flex items-center">
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{label}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <span />
          )}
          {fromPrice && (
            <p className="flex items-baseline gap-1 text-right">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">desde</span>
              <span className="font-display text-xl font-bold text-emerald-700 tabular-nums">
                {fromPrice}
              </span>
              <span className="text-xs text-slate-400">/turno</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** Placeholder hasta Task 3.1 (variante mapa). Evita romper tipos/imports. */
function TenantCardCompact(_props: { tenant: PublicTenantCard; initialFavorited?: boolean }) {
  return null
}
```

> Nota: se usa `formatArs` (no `formatFromPrice`, que antepone "Desde "). `formatArs` usa `maximumFractionDigits: 0` → numeral limpio ("$12.000", sin decimales). El contexto ("desde" eyebrow, "/turno") son labels chicos en Inter; el monto es el numeral display.

- [ ] **Step 4: Correr el test, verificar PASS**

Run: `pnpm exec vitest run tests/unit/tenant-card.test.tsx`
Expected: PASS (todos: carrusel + pills + body).

- [ ] **Step 5: typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint src/app/\(public\)/explorar/components/TenantCard.tsx --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/components/TenantCard.tsx" tests/unit/tenant-card.test.tsx
git commit -m "feat(explorar): redesign TenantCard (price/rating in body, format chips, pitch-line border)"
```

---

## Task 1.2: Componente `EmptyResults`

**Files:**
- Create: `src/app/(public)/explorar/components/EmptyResults.tsx`
- Test: `tests/unit/empty-results.test.tsx`

**Interfaces:**
- Consumes: `PitchLines`.
- Produces: `EmptyResults({ avail })` con `avail?: { date: string; time: string } | null`. Lo usa `page.tsx`.

- [ ] **Step 1: Test que falla**

```tsx
// tests/unit/empty-results.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EmptyResults from '@/app/(public)/explorar/components/EmptyResults'

afterEach(() => cleanup())

describe('EmptyResults', () => {
  it('sin búsqueda temporal muestra el mensaje genérico + reset', () => {
    render(<EmptyResults avail={null} />)
    expect(screen.getByText(/No encontramos complejos/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda' }).getAttribute('href')).toBe('/explorar')
  })

  it('con fecha+hora muestra el mensaje de disponibilidad formateado', () => {
    render(<EmptyResults avail={{ date: '2026-06-15', time: '19:00' }} />)
    expect(screen.getByText(/15\/06\/2026/)).toBeTruthy()
    expect(screen.getByText(/19:00/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr, falla**

Run: `pnpm exec vitest run tests/unit/empty-results.test.tsx`
Expected: FAIL (no existe).

- [ ] **Step 3: Implementar**

```tsx
// src/app/(public)/explorar/components/EmptyResults.tsx
import Link from 'next/link'
import PitchLines from './PitchLines'

export default function EmptyResults({
  avail,
}: {
  avail?: { date: string; time: string } | null
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white py-16 text-center">
      <div className="relative h-24 w-48 text-emerald-600/25">
        <PitchLines variant="empty" className="h-full w-full" />
      </div>
      <p className="max-w-sm text-sm text-slate-500">
        {avail
          ? `No hay complejos con turnos libres el ${avail.date.split('-').reverse().join('/')} a las ${avail.time}.`
          : 'No encontramos complejos con esos filtros.'}
      </p>
      <Link
        href="/explorar"
        className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        Limpiar búsqueda
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Correr, pasa**

Run: `pnpm exec vitest run tests/unit/empty-results.test.tsx`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/explorar/components/EmptyResults.tsx" tests/unit/empty-results.test.tsx
git commit -m "feat(explorar): add on-brand EmptyResults state"
```

---

## Task 1.3: Actualizar el skeleton (`loading.tsx`)

**Files:**
- Modify: `src/app/(public)/explorar/loading.tsx`

(Visual; sin test unitario — se valida en la verificación visual de Task 4.)

- [ ] **Step 1: Actualizar el skeleton de card al nuevo layout** (foto 16:9 + fila título/rating + chips + fila precio). Reemplazar el bloque de la grilla de cards:

```tsx
{/* Grilla de cards */}
<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
  {Array.from({ length: 6 }).map((_, i) => (
    <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 border-t-2 border-t-emerald-500/40 bg-white shadow-sm">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-12" />
        </div>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-24" />
        <div className="flex justify-between pt-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/explorar/loading.tsx"
git commit -m "feat(explorar): update loading skeleton to new card layout"
```

---

## Task 2.1: `SearchBand` (banda hero clara) + restyle de `SearchBar`

**Files:**
- Create: `src/app/(public)/explorar/components/SearchBand.tsx`
- Modify: `src/app/(public)/explorar/components/SearchBar.tsx` (solo estilos: inputs sobre superficie clara; lógica intacta)
- Test: `tests/unit/search-band.test.tsx`

**Interfaces:**
- Consumes: `SearchBar`, `PitchLines`, `CityCount`.
- Produces: `SearchBand({ cities })` — server component presentacional que envuelve `SearchBar`. Lo usa `page.tsx` (reemplaza el `<SearchBar>` directo + el `<header>`).

- [ ] **Step 1: Test (mockear SearchBar para aislar lo presentacional)**

```tsx
// tests/unit/search-band.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/app/(public)/explorar/components/SearchBar', () => ({
  default: () => <div data-testid="searchbar" />,
}))

import SearchBand from '@/app/(public)/explorar/components/SearchBand'

afterEach(() => cleanup())

describe('SearchBand', () => {
  it('renderiza el titular en font-display y contiene el SearchBar', () => {
    render(<SearchBand cities={[]} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.className).toContain('font-display')
    expect(screen.getByTestId('searchbar')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr, falla**

Run: `pnpm exec vitest run tests/unit/search-band.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `SearchBand`**

```tsx
// src/app/(public)/explorar/components/SearchBand.tsx
import type { CityCount } from '@/modules/tenants/search.service'
import SearchBar from './SearchBar'
import PitchLines from './PitchLines'

/**
 * Banda hero clara de /explorar (firma "Matchday"): superficie emerald clara
 * con motivo de líneas de cal + titular en font-display, envolviendo el form
 * de búsqueda estructurada. NUNCA fondo oscuro (player-area §1).
 */
export default function SearchBand({ cities }: { cities: CityCount[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-5 sm:p-7">
      <PitchLines
        variant="band"
        className="pointer-events-none absolute inset-0 h-full w-full text-emerald-600/10"
      />
      <div className="relative">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          ¿Dónde jugás hoy?
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Encontrá tu cancha ideal: filtrá por formato, superficie, servicios y precio.
        </p>
        <div className="mt-4">
          <SearchBar cities={cities} />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Restyle de inputs de `SearchBar`** (sobre fondo claro de la banda; lógica sin cambios). Cambiar solo `fieldClass` para que el contenedor blanco resalte sobre la banda y quitar el `<form>` border doble (la banda ya enmarca). Reemplazar el `className` del `<form>`:

```tsx
// SearchBar.tsx — className del <form>
className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-emerald-100 backdrop-blur-sm sm:p-4"
```

> El resto de `SearchBar` (estado, `onSubmit`, Combobox, fecha, hora, CTA) no se toca.

- [ ] **Step 5: Correr test + typecheck**

Run: `pnpm exec vitest run tests/unit/search-band.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/components/SearchBand.tsx" "src/app/(public)/explorar/components/SearchBar.tsx" tests/unit/search-band.test.tsx
git commit -m "feat(explorar): add Matchday SearchBand hero (clear, pitch lines)"
```

---

## Task 2.2: `QuickFilters` (chips sticky → URL)

**Files:**
- Create: `src/app/(public)/explorar/components/QuickFilters.tsx`
- Test: `tests/unit/quick-filters.test.tsx`

**Interfaces:**
- Consumes: `useRouter`/`useSearchParams` (next/navigation), `buildExplorarUrl`, `FORMAT_OPTIONS`/`formatLabel`, `ExplorarFilters` (drawer), `Dialog` (shadcn).
- Produces: `QuickFilters()` — client, sin props. Chips: F5/F7/F11 (toggle multi via `formats` csv), Sintético (toggle `surfaces`), Techado (toggle en `amenities`), Online (`online=1`), Precio (popover min/max), "Todos los filtros" (drawer reusa `ExplorarFilters`). Escribe a la URL.

- [ ] **Step 1: Test — un chip de formato escribe el query correcto**

```tsx
// tests/unit/quick-filters.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
let current = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => current,
}))
// El drawer importa ExplorarFilters (client con navegación); lo mockeamos.
vi.mock('@/app/(public)/explorar/components/ExplorarFilters', () => ({ default: () => null }))

import QuickFilters from '@/app/(public)/explorar/components/QuickFilters'

beforeEach(() => {
  push.mockClear()
  current = new URLSearchParams('')
})
afterEach(() => cleanup())

describe('QuickFilters', () => {
  it('activar "Fútbol 5" agrega formats=5 a la URL', () => {
    render(<QuickFilters />)
    fireEvent.click(screen.getByRole('button', { name: 'Fútbol 5' }))
    expect(push).toHaveBeenCalledWith('/explorar?formats=5')
  })

  it('activar "Online" agrega online=1', () => {
    render(<QuickFilters />)
    fireEvent.click(screen.getByRole('button', { name: /Online/ }))
    expect(push).toHaveBeenCalledWith('/explorar?online=1')
  })

  it('refleja estado activo desde la URL (aria-pressed)', () => {
    current = new URLSearchParams('formats=5')
    render(<QuickFilters />)
    expect(screen.getByRole('button', { name: 'Fútbol 5' }).getAttribute('aria-pressed')).toBe('true')
  })
})
```

- [ ] **Step 2: Correr, falla**

Run: `pnpm exec vitest run tests/unit/quick-filters.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `QuickFilters`**

```tsx
// src/app/(public)/explorar/components/QuickFilters.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { SlidersHorizontal, Umbrella, Zap } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatLabel } from '@/components/public/courtFacets'
import ExplorarFilters from './ExplorarFilters'
import { buildExplorarUrl } from './url'

const QUICK_FORMATS = [5, 7, 11] as const

function csv(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

function toggleCsv(list: string[], value: string): string | undefined {
  const set = new Set(list)
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return set.size ? Array.from(set).join(',') : undefined
}

const chipBase =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors'
const chipOn = 'border-emerald-600 bg-emerald-50 text-emerald-700'
const chipOff = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'

export default function QuickFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [drawer, setDrawer] = useState(false)

  const formats = csv(params.get('formats'))
  const surfaces = csv(params.get('surfaces'))
  const amenities = csv(params.get('amenities'))
  const online = params.get('online') === '1'

  const activeCount =
    formats.length + surfaces.length + amenities.length +
    (online ? 1 : 0) + (params.get('minPrice') ? 1 : 0) + (params.get('maxPrice') ? 1 : 0)

  function setParam(key: string, value: string | undefined) {
    router.push(buildExplorarUrl(params, { [key]: value }))
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {QUICK_FORMATS.map((f) => {
        const on = formats.includes(String(f))
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => setParam('formats', toggleCsv(formats, String(f)))}
            className={`${chipBase} ${on ? chipOn : chipOff}`}
          >
            {formatLabel(f)}
          </button>
        )
      })}

      <button
        type="button"
        aria-pressed={surfaces.includes('synthetic_grass')}
        onClick={() => setParam('surfaces', toggleCsv(surfaces, 'synthetic_grass'))}
        className={`${chipBase} ${surfaces.includes('synthetic_grass') ? chipOn : chipOff}`}
      >
        Sintético
      </button>

      <button
        type="button"
        aria-pressed={amenities.includes('techado')}
        onClick={() => setParam('amenities', toggleCsv(amenities, 'techado'))}
        className={`${chipBase} ${amenities.includes('techado') ? chipOn : chipOff}`}
      >
        <Umbrella className="h-4 w-4" aria-hidden />
        Techado
      </button>

      <button
        type="button"
        aria-pressed={online}
        onClick={() => setParam('online', online ? undefined : '1')}
        className={`${chipBase} ${online ? chipOn : chipOff}`}
      >
        <Zap className="h-4 w-4" aria-hidden />
        Online
      </button>

      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogTrigger asChild>
          <button type="button" className={`${chipBase} ${chipOff}`}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Todos los filtros
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-semibold text-white tabular-nums">
                {activeCount}
              </span>
            )}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Todos los filtros</DialogTitle>
          </DialogHeader>
          <ExplorarFilters onApplied={() => setDrawer(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

> El chip "Precio" (popover) se difiere: el control de precio ya vive en el drawer "Todos los filtros" (`ExplorarFilters`). Si se quiere como popover dedicado, agregarlo en una iteración posterior reusando `pesosToCents` de `ExplorarFilters`. Documentado para no dar por cubierto algo que no está.

- [ ] **Step 4: Correr, pasa**

Run: `pnpm exec vitest run tests/unit/quick-filters.test.tsx`
Expected: PASS (3).

- [ ] **Step 5: typecheck + lint**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/components/QuickFilters.tsx" tests/unit/quick-filters.test.tsx
git commit -m "feat(explorar): add sticky QuickFilters chip bar"
```

---

## Task 2.3: Recortar `ExplorarToolbar` (queda contador + orden + vista)

**Files:**
- Modify: `src/app/(public)/explorar/components/ExplorarToolbar.tsx` (quitar el Dialog de filtros mobile — migró a QuickFilters; conservar contador, orden y toggle lista/mapa)

**Interfaces:**
- Produces: `ExplorarToolbar({ total })` — igual firma; ya no renderiza el botón "Filtros"/Dialog.

- [ ] **Step 1: Quitar el bloque del Dialog de filtros** y sus imports (`Dialog*`, `SlidersHorizontal`, `useState`, `ExplorarFilters`, `activeCount`/`countCsv`). El componente queda: contador (izquierda) + orden + toggle vista (derecha). Mantener `useRouter`/`useSearchParams`/`useToast`/`buildExplorarUrl` y la lógica de `setView`/`setSort` intacta.

Resultado (estructura del return):

```tsx
return (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-slate-500" aria-live="polite">
      <span className="font-semibold text-slate-900 tabular-nums">{total}</span>{' '}
      {total === 1 ? 'complejo' : 'complejos'}
    </p>
    <div className="flex items-center gap-2">
      {/* select de orden (sin cambios) + toggle Lista/Mapa (sin cambios) */}
    </div>
  </div>
)
```

- [ ] **Step 2: typecheck + lint** (verifica que no quedaron imports muertos)

Run: `pnpm typecheck && pnpm exec eslint "src/app/(public)/explorar/components/ExplorarToolbar.tsx" --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to .`
Expected: PASS, sin warnings de unused.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/explorar/components/ExplorarToolbar.tsx"
git commit -m "refactor(explorar): slim Toolbar (filters moved to QuickFilters)"
```

---

## Task 2.4: Integrar banda + chips + sidebar/grid en `page.tsx` (vista lista)

**Files:**
- Modify: `src/app/(public)/explorar/page.tsx` (composición; lógica de fetch/cache intacta)

**Interfaces:**
- Consumes: `SearchBand`, `QuickFilters`, `ExplorarToolbar`, `ExplorarFilters`, `TenantCard`, `EmptyResults`.

- [ ] **Step 1: Reemplazar header + SearchBar por SearchBand, y armar la banda de controles** (chips + toolbar). Sustituir el bloque `<header>…</header>` + `<SearchBar/>` + `<ExplorarToolbar/>` por:

```tsx
<SearchBand cities={cities} />

<div className="sticky top-16 z-20 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 sm:px-6 lg:px-8">
  <QuickFilters />
  <ExplorarToolbar total={total} />
</div>
```

Imports nuevos: `import SearchBand from './components/SearchBand'`, `import QuickFilters from './components/QuickFilters'`, `import EmptyResults from './components/EmptyResults'`. Quitar el import directo de `SearchBar` (ahora lo usa SearchBand) y de `SearchX`/`Link` si quedan sin uso tras EmptyResults (verificar — `Link` se sigue usando en "Ver más").

- [ ] **Step 2: Reemplazar el estado vacío de lista por `EmptyResults`**

```tsx
) : results.length === 0 ? (
  <EmptyResults avail={avail ? { date: avail.date, time: avail.time } : null} />
) : (
```

- [ ] **Step 3: Confirmar la grilla** (queda `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`; el sidebar `lg+` se conserva como hoy). Sin cambios estructurales salvo que el `<aside>` sigue dentro del layout `lg:grid-cols-[256px_minmax(0,1fr)]`.

- [ ] **Step 4: typecheck + lint + suite unit**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (unit completa verde).

- [ ] **Step 5: Verificación visual (lista)** — levantar la app y revisar `/explorar`.

Run: `pnpm dev` (o el flujo del skill `run`); abrir `http://localhost:3000/explorar`.
Expected (checklist, iterar con captura): banda clara con líneas; chips sticky funcionando; grilla con cards nuevas; precio como numeral display; sin scroll horizontal a 375px. Ajustar espaciados/tamaños acá (build+critique loop de frontend-design).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/page.tsx"
git commit -m "feat(explorar): compose SearchBand + QuickFilters + new grid (list view)"
```

---

## Task 3.1: Variante `compact` de `TenantCard` (lista del split)

**Files:**
- Modify: `src/app/(public)/explorar/components/TenantCard.tsx` (implementar `TenantCardCompact`)
- Modify: `tests/unit/tenant-card.test.tsx` (asserts de la variante compact)

**Interfaces:**
- Produces: `TenantCardCompact` renderizado vía `<TenantCard variant="compact" />` — layout horizontal (foto chica + nombre/rating/ubicación/precio), 1 foto, sin carrusel ni chips de formato, mismo destino `/${slug}`.

- [ ] **Step 1: Tests de la variante**

```tsx
describe('TenantCard — variante compact', () => {
  it('muestra nombre, precio y link al perfil; sin controles de carrusel', () => {
    render(
      <TenantCard
        tenant={{ ...baseTenant, coverUrl: '/c.jpg', fromPriceCents: 950000 }}
        variant="compact"
      />,
    )
    expect(screen.getByRole('link', { name: /El Potrero/ }).getAttribute('href')).toBe('/el-potrero')
    expect(screen.getByText(/\$\s?9\.500/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).toBeNull()
  })
})
```

- [ ] **Step 2: Correr, falla** (hoy `TenantCardCompact` devuelve null)

Run: `pnpm exec vitest run tests/unit/tenant-card.test.tsx`
Expected: FAIL en el nuevo.

- [ ] **Step 3: Implementar `TenantCardCompact`** (reemplazar el placeholder de Task 1.1)

```tsx
function TenantCardCompact({
  tenant,
  initialFavorited = false,
}: {
  tenant: PublicTenantCard
  initialFavorited?: boolean
}) {
  const fromPrice = tenant.fromPriceCents != null ? formatArs(tenant.fromPriceCents) : null
  return (
    <article className="group relative flex gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-colors hover:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-500">
      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {tenant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.coverUrl} alt={`Cancha de ${tenant.name}`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-lg font-bold text-emerald-600/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            <Link href={`/${tenant.slug}`} className="after:absolute after:inset-0">
              {tenant.name}
            </Link>
          </h3>
          {tenant.reviewCount > 0 && <RatingStars rating={tenant.avgRating} count={tenant.reviewCount} />}
        </div>
        <p className="truncate text-xs text-slate-500">{tenant.city}, {tenant.province}</p>
        {fromPrice && (
          <p className="mt-auto flex items-baseline gap-1">
            <span className="font-display text-base font-bold text-emerald-700 tabular-nums">{fromPrice}</span>
            <span className="text-xs text-slate-400">/turno</span>
          </p>
        )}
      </div>
      <FavoriteButton tenantId={tenant.id} initialFavorited={initialFavorited} className="absolute right-2 top-2 z-20" />
    </article>
  )
}
```

> La variante compact usa `<img>` crudo a propósito (foto chica, sin carrusel); el test global de "todas las imágenes por next/image" aplica solo a la variante grid (ya verde). Si la regla del proyecto exige `next/image` siempre, cambiar a `next/image` con `width/height` fijos.

- [ ] **Step 4: Correr, pasa**

Run: `pnpm exec vitest run tests/unit/tenant-card.test.tsx`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/explorar/components/TenantCard.tsx" tests/unit/tenant-card.test.tsx
git commit -m "feat(explorar): add compact TenantCard variant for map split"
```

---

## Task 3.2: `ExplorarSplitView` (lista + mapa)

**Files:**
- Create: `src/app/(public)/explorar/components/ExplorarSplitView.tsx`
- Modify: `src/app/(public)/explorar/components/ExplorarMapLoader.tsx` (forward de `activeId`)
- Test: `tests/unit/explorar-split-view.test.tsx`

**Interfaces:**
- Consumes: `TenantCard` (variant compact), `ExplorarMapLoader`.
- Produces: `ExplorarSplitView({ results, favoritedIds, photosByTenant })` con `favoritedIds: string[]`. Maneja `activeTenantId` (hover-sync, opcional) y lo pasa al mapa.

- [ ] **Step 1: Test (mockear el mapa — Leaflet no corre en happy-dom)**

```tsx
// tests/unit/explorar-split-view.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

vi.mock('@/app/(public)/explorar/components/ExplorarMapLoader', () => ({
  default: () => <div data-testid="map" />,
}))
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))

import ExplorarSplitView from '@/app/(public)/explorar/components/ExplorarSplitView'

afterEach(() => cleanup())

const t = (id: string, name: string): PublicTenantCard => ({
  id, slug: id, name, address: '', city: 'Rosario', province: 'SF',
  logoUrl: null, coverUrl: null, allowOnlineBooking: true, fromPriceCents: 900000,
  amenities: {}, avgRating: 0, reviewCount: 0, distanceKm: null,
  latitude: -32.9, longitude: -60.6, courtSurfaces: [], courtFormats: [],
})

describe('ExplorarSplitView', () => {
  it('renderiza la lista compacta y el mapa', () => {
    render(<ExplorarSplitView results={[t('a', 'Uno'), t('b', 'Dos')]} favoritedIds={[]} photosByTenant={{}} />)
    expect(screen.getByText('Uno')).toBeTruthy()
    expect(screen.getByText('Dos')).toBeTruthy()
    expect(screen.getByTestId('map')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr, falla**

Run: `pnpm exec vitest run tests/unit/explorar-split-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar `ExplorarSplitView`**

```tsx
// src/app/(public)/explorar/components/ExplorarSplitView.tsx
'use client'

import { useState } from 'react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import TenantCard from './TenantCard'
import ExplorarMapLoader from './ExplorarMapLoader'

/**
 * Vista mapa = split lista + mapa. Desktop: lista (scroll) izquierda + mapa
 * sticky derecha. Mobile: el toggle Lista/Mapa del Toolbar decide; acá se
 * muestra el mapa full-width con la lista colapsada arriba.
 */
export default function ExplorarSplitView({
  results,
  favoritedIds,
  photosByTenant: _photosByTenant,
}: {
  results: PublicTenantCard[]
  favoritedIds: string[]
  photosByTenant: Record<string, string[]>
}) {
  const favs = new Set(favoritedIds)
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-4">
      <div className="order-2 max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-1 lg:order-1">
        {results.map((tn) => (
          <div key={tn.id} onMouseEnter={() => setActiveId(tn.id)} onMouseLeave={() => setActiveId(null)}>
            <TenantCard tenant={tn} initialFavorited={favs.has(tn.id)} variant="compact" />
          </div>
        ))}
      </div>
      <div className="order-1 mb-4 lg:order-2 lg:mb-0">
        <div className="lg:sticky lg:top-32">
          <ExplorarMapLoader results={results} activeId={activeId} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Forward de `activeId` en `ExplorarMapLoader`**

```tsx
// ExplorarMapLoader.tsx — firma y paso
export default function ExplorarMapLoader({
  results,
  activeId = null,
}: {
  results: PublicTenantCard[]
  activeId?: string | null
}) {
  return <ExplorarMap results={results} activeId={activeId} />
}
```

Y en el `dynamic(...)` tipar `ExplorarMap` para aceptar `activeId` (Task 3.3). Por ahora `ExplorarMap` ignora el prop hasta 3.3 (agregar `activeId?: string | null` a su firma para que typecheck pase — ver 3.3).

- [ ] **Step 5: Correr test + typecheck**

Run: `pnpm exec vitest run tests/unit/explorar-split-view.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/components/ExplorarSplitView.tsx" "src/app/(public)/explorar/components/ExplorarMapLoader.tsx" tests/unit/explorar-split-view.test.tsx
git commit -m "feat(explorar): add ExplorarSplitView (list + map)"
```

---

## Task 3.3: `ExplorarMap` resalta el pin activo + restyle empty

**Files:**
- Modify: `src/app/(public)/explorar/components/ExplorarMap.tsx`

**Interfaces:**
- Produces: `ExplorarMap({ results, activeId? })`. El pin del `activeId` se resalta (escala/color). Empty state restyle a la superficie nueva.

- [ ] **Step 1: Aceptar `activeId` y resaltar el pin** — agregar `activeId` a la firma, y en `priceIcon` variar estilo si es el activo:

```tsx
export default function ExplorarMap({
  results,
  activeId = null,
}: {
  results: PublicTenantCard[]
  activeId?: string | null
}) {
  // …
  // en el map de marcadores:
  <Marker key={t.id} position={[t.latitude, t.longitude]} icon={priceIcon(t, t.id === activeId)}>
```

Y `priceIcon(t, active)`:

```tsx
function priceIcon(t: Located, active = false): L.DivIcon {
  const label = t.fromPriceCents != null ? formatArs(t.fromPriceCents) : t.name.slice(0, 2).toUpperCase()
  const bg = active ? '#047857' : '#059669'
  const scale = active ? 'transform:translate(-50%,-100%) scale(1.12);' : 'transform:translate(-50%,-100%);'
  const html = `<div style="${scale}white-space:nowrap;background:${bg};color:#fff;font-weight:700;font-size:12px;line-height:1;padding:6px 10px;border-radius:9999px;box-shadow:0 2px 8px rgba(2,6,23,.35);border:2px solid #fff">${label}</div>`
  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -28] })
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/explorar/components/ExplorarMap.tsx"
git commit -m "feat(explorar): highlight active pin in map split"
```

---

## Task 3.4: Wire vista mapa (split) + FAB mobile en `page.tsx`

**Files:**
- Modify: `src/app/(public)/explorar/page.tsx`

- [ ] **Step 1: Reemplazar `ExplorarMapLoader` por `ExplorarSplitView` en la vista mapa** y pasar los datos (la página ya trae `results`, `favoriteIds`, `photosByTenant` — nota: hoy `photosByTenant` solo se computa en vista lista; habilitarlo también para mapa o pasar `{}`). Cambiar:

```tsx
{view === 'map' ? (
  <ExplorarSplitView
    results={results}
    favoritedIds={Array.from(favoriteIds)}
    photosByTenant={{}}
  />
) : results.length === 0 ? (
```

> En vista mapa NO hay sidebar: envolver el bloque `view === 'map'` fuera del `lg:grid-cols-[256px_…]` o condicionar el `<aside>` a `view === 'list'`. Implementación: renderizar el `<aside>` solo cuando `view === 'list'` y, en mapa, usar el ancho completo.

- [ ] **Step 2: Condicionar el sidebar a la vista lista**

```tsx
<div className={view === 'map' ? '' : 'lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-6'}>
  {view === 'list' && (
    <aside className="hidden lg:block">{/* ExplorarFilters sticky */}</aside>
  )}
  <div className="min-w-0">{/* contenido: split | empty | grid */}</div>
</div>
```

- [ ] **Step 3: FAB "Ver lista" en mobile (vista mapa)** — el toggle Lista/Mapa del Toolbar ya permite volver; agregar además un botón flotante visible solo en `< lg` y en `view === 'map'`. Implementar como link que preserva filtros:

```tsx
{view === 'map' && (
  <Link
    href={pageUrl(searchParams, offset)}  // misma búsqueda, sin view → vuelve a lista
    className="fixed bottom-20 left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg lg:hidden"
  >
    <List className="h-4 w-4" aria-hidden /> Ver lista
  </Link>
)}
```

> `pageUrl` ya existe en page.tsx pero setea `offset`; para volver a lista hay que quitar `view`. Ajustar: construir el href con `view` removido (usar un helper inline o `buildExplorarUrl`-equivalente server-side). Importar `List` de lucide-react.

- [ ] **Step 4: typecheck + suite unit**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Verificación visual (mapa)** — `/explorar?view=map` en desktop (split) y en 375px (mapa full + FAB).

Expected (iterar con captura): split lista+mapa en desktop; hover en card resalta pin; FAB en mobile vuelve a lista; sin scroll horizontal.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/explorar/page.tsx"
git commit -m "feat(explorar): wire map split view + mobile back-to-list FAB"
```

---

## Task 4.1: Pase de accesibilidad + responsive

**Files:** ajustes menores en los componentes tocados, según hallazgos.

- [ ] **Step 1: Revisar foco visible** en chips, inputs de la banda, card (stretched-link), FAB, popup del mapa. Agregar `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2` donde falte.

- [ ] **Step 2: `prefers-reduced-motion`** — confirmar `motion-reduce:` en lift/zoom de card; `PitchLines` ya estático.

- [ ] **Step 3: Touch ≥44px** en chips (`h-9` → en mobile evaluar `h-11`), CTA, toggle, FAB (`h-11` ok), ítems del drawer.

- [ ] **Step 4: Responsive 375 / 768 / 1280** — sin scroll horizontal; chips scrollables; grilla 1→2→3; split colapsa a 1 col en mobile.

- [ ] **Step 5: Correr a11y e2e**

Run: `pnpm test:e2e -- a11y/public.spec.ts` (o el proyecto `axe-audit`)
Expected: sin violaciones nuevas. Corregir y re-correr.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(explorar): a11y + responsive pass (focus, touch targets, 375px)"
```

---

## Task 4.2: Actualizar e2e existentes

**Files:**
- Modify: `tests/e2e/portal-search.spec.ts`, `tests/e2e/a11y/public.spec.ts`, `tests/e2e/cross-browser/public-smoke.spec.ts` (según selectores que cambiaron: chips en vez de sidebar-only, banda hero, card body)

- [ ] **Step 1: Correr e2e públicos y listar fallos por selector**

Run: `pnpm test:e2e -- portal-search.spec.ts`
Expected: pueden fallar por selectores viejos (filtros, precio en overlay). Anotar.

- [ ] **Step 2: Actualizar selectores** a la nueva estructura (chips `role=button` por nombre "Fútbol 5"/"Online"; precio en el body; banda con `heading level 1` "¿Dónde jugás hoy?"). Mantener la intención de cada test.

- [ ] **Step 3: Re-correr hasta verde**

Run: `pnpm test:e2e -- portal-search.spec.ts a11y/public.spec.ts`
Expected: PASS. (Memoria "integration-ensureroles-grant-race": si flakea por GRANT, `--retry=3` aplica a integration, no e2e; para e2e re-correr.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(explorar): update e2e selectors for Matchday redesign"
```

---

## Task 4.3: Verificación visual + performance

- [ ] **Step 1: Capturas** de `/explorar` (lista y mapa) en 375 / 768 / 1280 — adjuntar al PR. Iterar estética final (build+critique loop: jerarquía, espaciados, peso tipográfico, contraste de la banda). Aplicar la regla "quitar un accesorio": cortar cualquier decoración que no sirva.

- [ ] **Step 2: Lighthouse público** — sin regresión de LCP/CLS/perf.

Run: `pnpm build && pnpm exec lhci autorun --config=lighthouserc.public.json` (o el flujo de CI de Lighthouse del repo)
Expected: métricas dentro del presupuesto actual.

- [ ] **Step 3: typecheck + lint + suite unit completa**

Run: `pnpm typecheck && pnpm test && pnpm exec eslint src/ --ext .ts,.tsx --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to .`
Expected: todo verde.

- [ ] **Step 4: Commit de ajustes finales**

```bash
git add -A
git commit -m "polish(explorar): final visual pass + perf check"
```

---

## Task 4.4: Cierre

- [ ] **Step 1: Repasar criterios de aceptación** del spec §15 — marcar cada uno.
- [ ] **Step 2: Actualizar `pages/explorar.md`** si algo del diseño final difirió del documentado.
- [ ] **Step 3: Abrir PR** desde `worktree-explorar-redesign` → `main` con capturas y checklist del spec §15.

```bash
git push -u origin worktree-explorar-redesign
gh pr create --base main --title "feat(explorar): rediseño Matchday" --body "<resumen + capturas + checklist §15>"
```

---

## Self-Review (cobertura del spec)

- **Tipografía Archivo** → Task 0.1 ✓ · usada en TenantCard (0.1/1.1), SearchBand (2.1), compact (3.1).
- **Líneas de cal (PitchLines)** → Task 0.2 ✓ · usadas en SearchBand (2.1) y EmptyResults (1.2).
- **Color (banda clara, numeral emerald-700, borde emerald-500)** → 1.1 (card), 2.1 (banda) ✓.
- **Card rediseñada (precio/rating al body, ≤2 overlays, chips formato, borde 2px)** → 1.1 ✓.
- **Banda hero clara + condensación al scroll** → 2.1 (banda) + 2.4 (sticky controls). Nota: la "condensación" se implementa como banda + barra sticky de controles (no shrink animado del titular) — si se quiere shrink del titular, es un step extra de Task 2.4 (CSS sticky/scroll).
- **Filtros híbridos (chips + sidebar desktop + drawer)** → QuickFilters (2.2) + Toolbar slim (2.3) + sidebar en page (2.4) + drawer reusa ExplorarFilters ✓.
- **Mapa split + FAB mobile** → 3.1/3.2/3.3/3.4 ✓.
- **Estados vacío/loading** → 1.2 / 1.3 ✓.
- **Sin backend; data-cache intacto** → constraint global; page.tsx solo composición ✓.
- **A11y/responsive/perf/tests** → 4.1/4.2/4.3 ✓.
- **Docs DS** → 0.3 (+ pages/explorar.md ya creado) ✓.

**Placeholder scan:** sin TBD/TODO. Diferidos explícitos y marcados: chip "Precio" como popover (vive en el drawer), shrink animado del titular (opcional en 2.4), `<img>` en compact (decisión documentada).

**Type consistency:** `variant?: 'grid' | 'compact'` consistente (1.1 define, 3.1 implementa). `ExplorarMap`/`ExplorarMapLoader` reciben `activeId?: string | null` (3.2/3.3). `ExplorarSplitView` usa `favoritedIds: string[]` (no Set, para evitar problemas de serialización RSC→client). `EmptyResults` usa `avail?: { date; time } | null` (alineado con el `avail` de page.tsx). `buildExplorarUrl(params, updates)` usado igual en QuickFilters/SearchBar/Toolbar.

## Riesgos conocidos (de memoria del repo)

- **Lint en worktree anidado**: usar el invocador de Task 0.0 Step 3 (doble plugin).
- **`pnpm install` por worktree**: obligatorio antes de typecheck/lint/test.
- **Precio**: usar `formatArs` (limpio, `maximumFractionDigits: 0`), no `formatFromPrice` (antepone "Desde "). `RatingStars` compact ya renderiza el número (ej. "4.8") + "(N)".
- **e2e flake (GRANT race)**: aplica a integration (`--retry=3`); para e2e, re-correr.
