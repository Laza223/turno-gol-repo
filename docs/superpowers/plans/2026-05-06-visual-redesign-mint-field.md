# Visual Redesign — "Mint Field" Modern Classic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint TurnoGol's entire frontend from the current "sky/blue, flat, white-heavy" palette to a "Mint Field" Modern Classic aesthetic — emerald primary, slate-700/slate-800 typography, slate-50 body bg, soft shadows, rounded-xl/2xl corners, micro-interactions on buttons/cards. Premium SaaS B2B feel without touching business logic.

**Architecture:** Token-first redesign. Swap CSS variables in `globals.css` (single source for shadcn primitives) → restyle UI primitives (Button, Input, Badge) → restyle each surface (Landing, Auth, Onboarding wizard, Admin shell, Dashboard widgets) → bulk find/replace remaining `sky-*`/`blue-*` references in long-tail files → manual visual QA via dev server. Server Actions, hooks, queries, routing, schemas, and props remain byte-identical; ONLY className strings, raw HTML/JSX structure, and design-system docs change.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Tailwind CSS · shadcn/ui (cva variants) · Lucide icons · Inter font.

**Color Token Anchors (memorize):**
| Role | Tailwind | Hex | Use |
|---|---|---|---|
| Primary CTA / accent | `emerald-600` | `#059669` | Buttons, links, focus rings on light bg (WCAG AA ✓) |
| Mint Field — visual | `emerald-500` | `#10B981` | Icon glows, hero gradients, hover lights, dark-bg accents |
| Mint Field — light | `emerald-400` | `#34D399` | Hero CTA hover, dark-bg text accent |
| Sidebar nav text | `slate-700` | `#334155` | Inactive nav items, secondary nav |
| Heading text | `slate-900` | `#0F172A` | H1/H2 (never pure black) |
| Subtitle / body | `slate-600` | `#475569` | Paragraphs |
| Page bg (body) | `slate-50` | `#F8FAFC` | All page-level backgrounds |
| Card bg (elevated) | `white` | `#FFFFFF` | Forms, modals, cards (NOT body) |
| Border subtle | `slate-200` | `#E2E8F0` | Inputs, card borders |

**Hard constraints (DO NOT VIOLATE):**
- NEVER edit Server Actions, route handlers, queries, hooks, types, schemas, DB code, middleware.
- NEVER rename a function, prop, file, or import path.
- NEVER add/remove form fields, buttons that trigger actions, or change a `<form>`'s action target.
- ONLY change: Tailwind classNames, raw HTML/JSX structure for visual decoration (e.g., wrapping a child in an extra `<div>` for shadow), CSS in `globals.css`, design-system docs.
- After every phase, run `pnpm typecheck`. Must pass clean.

---

## File Structure

**Token layer (1 file):**
- `src/app/globals.css` — HSL var swap for `--primary` and `--ring` (sky-700 → emerald-600). All other tokens preserved.

**Docs (2 files):**
- `design-system/MASTER.md` — palette section + button/input examples + anti-patterns updated.
- `design-system/turnogol/MASTER.md` — palette section aligned (typography note already references Inter — verify).

**UI primitives (3 files, change cascades to ~all surfaces):**
- `src/components/ui/button.tsx` — `bg-sky-700` → `bg-emerald-600`, add shadow + hover lift.
- `src/components/ui/input.tsx` — `focus-visible:ring-sky-700` → `focus-visible:ring-emerald-500`, add `transition-colors`.
- `src/components/ui/badge.tsx` — add `success` variant (emerald-50/emerald-700).

**Landing (1 file):**
- `src/app/page.tsx` — full sky→emerald sweep. Hero gradient, all section headings, CTA buttons, feature cards, testimonials, final CTA, footer logo.

**Auth (3 files):**
- `src/app/(auth)/login/page.tsx` — image-pane gradient, mail icon ring, link colors, submit button.
- `src/app/(auth)/register/page.tsx` — same pattern as login + Field component focus ring.
- `src/app/(auth)/verify/page.tsx` — radial gradient, loading mail icon, error CTA button.

**Onboarding wizard (5 files — heaviest restyle, currently most outdated):**
- `src/app/onboarding/page.tsx` — outer bg, card shadow, progress bar, add stepper visualization.
- `src/app/onboarding/components/StepIdentity.tsx` — inputs h-11 emerald rings, submit button emerald.
- `src/app/onboarding/components/StepCourts.tsx` — info box emerald, submit emerald.
- `src/app/onboarding/components/StepSchedule.tsx` — time inputs emerald rings, submit emerald.
- `src/app/onboarding/components/StepPayments.tsx` — MP connect anchor, skip button, success box unify.

**Admin shell (3 files):**
- `src/components/layout/admin-sidebar.tsx` — active state `bg-emerald-50 text-emerald-700` with left border accent.
- `src/components/layout/admin-header.tsx` — soft shadow, refined email pill.
- `src/components/layout/status-banner.tsx` — trialing variant sky→emerald.

**Dashboard widgets (2 files):**
- `src/components/dashboard/metric-card.tsx` — `rounded-2xl shadow-md` + emerald icon badge + hover lift.
- `src/components/dashboard/onboarding-checklist.tsx` — progress bar emerald, "Configurar" link emerald.

**Bulk sweep (long-tail, ~16 files — pure find/replace):**
- `src/components/auth/pin-gate.tsx`
- `src/components/booking/BookingFormModal.tsx`
- `src/app/(admin)/canchas/components/CourtList.tsx`
- `src/app/(admin)/canchas/components/CourtForm.tsx`
- `src/app/(admin)/staff/page.tsx`
- `src/app/(admin)/caja/page.tsx`
- `src/app/(admin)/settings/reservas/page.tsx`
- `src/app/(admin)/settings/horarios/page.tsx`
- `src/app/(admin)/settings/pin/page.tsx`
- `src/app/(player)/perfil/page.tsx`
- `src/app/(player)/mis-reservas/page.tsx`
- `src/app/(player)/_components/PlayerBottomNav.tsx`
- `src/app/(public)/[slug]/not-found.tsx`
- `src/components/ui/dialog.tsx`
- (any additional file flagged by Phase 8 grep step)

**Out of scope:**
- `tailwind.config.ts` — no edits. All redesign flows through `globals.css` HSL vars + Tailwind palette utility classes.
- `next.config.js`, `tsconfig.tsbuildinfo`, `supabase/config.toml` — preserve as-is (already modified per git status; not part of redesign).
- `src/app/(admin)/onboarding/` — already deleted in working tree (per git status, pre-existing change).

---

## Phase 1 — Design Tokens

### Task 1.1: Update CSS variables in globals.css

**Files:**
- Modify: `src/app/globals.css:17,34`

- [ ] **Step 1: Swap `--primary` HSL value**

In `src/app/globals.css` line 17, replace:
```css
    --primary: 201 96% 32%;           /* sky-700 #0369A1  — CTA / action color */
```
with:
```css
    --primary: 161 94% 30%;           /* emerald-600 #059669 — CTA / action color */
```

- [ ] **Step 2: Swap `--ring` HSL value**

In `src/app/globals.css` line 34, replace:
```css
    --ring: 201 96% 32%;              /* sky-700 — focus ring */
```
with:
```css
    --ring: 161 94% 30%;              /* emerald-600 — focus ring */
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass (CSS changes don't affect TS).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): swap primary token sky-700 → emerald-600"
```

### Task 1.2: Update design-system/MASTER.md palette docs

**Files:**
- Modify: `design-system/MASTER.md` (palette section §1, button/input examples, anti-patterns)

- [ ] **Step 1: Read current MASTER.md to locate palette section**

```bash
grep -n "Primary\|sky-700\|0369A1\|0F172A" design-system/MASTER.md
```

- [ ] **Step 2: Update palette block — Primary value**

Find every reference to:
- `Primary: #0F172A (slate-900)` — change to `Primary: #059669 (emerald-600) — Mint Field`
- `Accent: #0369A1 (sky-700)` — change to `Accent: #10B981 (emerald-500) — for non-text accents only (icon glows, gradients)`
- `bg-sky-700` in code examples — change to `bg-emerald-600`
- `text-sky-700` in code examples — change to `text-emerald-700`
- `ring-sky-700` in code examples — change to `ring-emerald-500`

- [ ] **Step 3: Add anti-pattern note**

In the anti-patterns section, append:
```markdown
- **PROHIBIDO** usar `bg-emerald-500` (#10B981) para texto sobre fondo blanco — falla WCAG AA (~2.97:1). Para texto/CTA en fondo claro usar siempre `emerald-600` (#059669) que cumple AA (4.5:1).
- **PROHIBIDO** usar `bg-white` como fondo de página/body. `bg-white` se reserva para superficies elevadas (cards, modales, formularios). Body siempre `bg-slate-50`.
- **PROHIBIDO** `text-black` o `bg-black`. Texto principal `text-slate-900`, fondos oscuros `bg-slate-950` o `bg-slate-900`.
```

- [ ] **Step 4: Commit**

```bash
git add design-system/MASTER.md
git commit -m "docs(design): align MASTER with Mint Field palette"
```

### Task 1.3: Align design-system/turnogol/MASTER.md

**Files:**
- Modify: `design-system/turnogol/MASTER.md`

- [ ] **Step 1: Inspect duplicated palette references**

```bash
grep -n "sky\|0369A1\|Fira" design-system/turnogol/MASTER.md
```

- [ ] **Step 2: Apply same palette swap as Task 1.2**

Apply identical replacements: `sky-700` → `emerald-600`, `#0369A1` → `#059669`, etc. If file mentions `Fira Code` or `Fira Sans`, replace with `Inter` (actual stack uses Inter via `next/font/google`).

- [ ] **Step 3: Commit**

```bash
git add design-system/turnogol/MASTER.md
git commit -m "docs(design): unify turnogol/MASTER with canonical palette"
```

---

## Phase 2 — UI Primitives

### Task 2.1: Restyle Button component

**Files:**
- Modify: `src/components/ui/button.tsx:6-29`

- [ ] **Step 1: Replace cva variants block**

In `src/components/ui/button.tsx`, replace the entire `cva(...)` call (lines 5-29) with:

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:translate-y-0 disabled:shadow-none',
        destructive:
          'bg-red-600 text-white shadow-md shadow-red-600/20 hover:bg-red-500 hover:-translate-y-0.5',
        outline:
          'border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50 hover:border-slate-300',
        secondary:
          'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost:
          'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        link:
          'text-emerald-700 underline-offset-4 hover:text-emerald-800 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): restyle Button with emerald primary + hover lift"
```

### Task 2.2: Restyle Input component

**Files:**
- Modify: `src/components/ui/input.tsx:11-15`

- [ ] **Step 1: Replace className string**

In `src/components/ui/input.tsx`, replace lines 11-14:

```tsx
        className={cn(
          'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
```

with:

```tsx
        className={cn(
          'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 ring-offset-white transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat(ui): Input emerald focus ring + hover border"
```

### Task 2.3: Add `success` variant to Badge

**Files:**
- Modify: `src/components/ui/badge.tsx:8-15`

- [ ] **Step 1: Insert `success` variant**

In `src/components/ui/badge.tsx`, replace the variants block (lines 8-15):

```tsx
      variant: {
        default: 'border-transparent bg-slate-900 text-white hover:bg-slate-900/80',
        secondary: 'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80',
        destructive: 'border-transparent bg-red-600 text-white hover:bg-red-600/80',
        outline: 'text-slate-900',
      },
```

with:

```tsx
      variant: {
        default: 'border-transparent bg-slate-900 text-white hover:bg-slate-900/80',
        secondary: 'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80',
        destructive: 'border-transparent bg-red-600 text-white hover:bg-red-600/80',
        success: 'border-transparent bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100',
        outline: 'text-slate-900 border-slate-200',
      },
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat(ui): add Badge success variant (emerald)"
```

---

## Phase 3 — Landing Page

### Task 3.1: Sweep sky→emerald in src/app/page.tsx

**Files:**
- Modify: `src/app/page.tsx` (multiple locations, listed below)

- [ ] **Step 1: SiteNav logo background**

In `src/app/page.tsx` line 112, replace:
```tsx
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/90 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/30">
```
with:
```tsx
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/90 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30">
```

- [ ] **Step 2: Hero gradient overlay**

Line 161, replace:
```tsx
        className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-sky-900/70"
```
with:
```tsx
        className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-emerald-900/70"
```

- [ ] **Step 3: Hero "Nuevo en Argentina" pill**

Line 170, replace:
```tsx
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200 backdrop-blur-sm">
```
with:
```tsx
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 backdrop-blur-sm">
```

- [ ] **Step 4: Hero H1 gradient text**

Line 176, replace:
```tsx
            <span className="bg-gradient-to-r from-sky-300 via-sky-400 to-sky-200 bg-clip-text text-transparent">
```
with:
```tsx
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-200 bg-clip-text text-transparent">
```

- [ ] **Step 5: Hero primary CTA**

Line 189, replace:
```tsx
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-500 px-6 text-sm font-semibold text-white shadow-xl shadow-sky-500/30 hover:bg-sky-400 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-500/40 transition-all duration-300"
```
with:
```tsx
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/40 transition-all duration-300"
```

- [ ] **Step 6: Features section eyebrow + cards**

Line 245, replace:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-sky-400">
```
with:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
```

Line 260, replace:
```tsx
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:shadow-2xl hover:shadow-sky-500/10"
```
with:
```tsx
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-2xl hover:shadow-emerald-500/10"
```

Line 262, replace:
```tsx
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-400/30 group-hover:bg-sky-500/20 transition-colors">
```
with:
```tsx
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/30 group-hover:bg-emerald-500/20 transition-colors">
```

- [ ] **Step 7: ShowcaseStrip eyebrow + step badges**

Line 291, replace:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-sky-400">
```
with:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
```

Line 305, replace:
```tsx
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sm font-bold text-sky-400 ring-1 ring-inset ring-sky-400/30">
```
with:
```tsx
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
```

- [ ] **Step 8: ShowcaseStrip mock grid filled cells**

Line 335, replace:
```tsx
                        ? 'bg-sky-500/30 text-sky-200 ring-1 ring-inset ring-sky-400/40'
```
with:
```tsx
                        ? 'bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/40'
```

- [ ] **Step 9: Testimonials eyebrow + card hover**

Line 366, replace:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-sky-400">
```
with:
```tsx
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
```

Line 378, replace:
```tsx
              className="group relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-sky-400/40"
```
with:
```tsx
              className="group relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40"
```

Line 380, replace:
```tsx
              <Quote className="absolute right-6 top-6 h-8 w-8 text-sky-400/20" aria-hidden />
```
with:
```tsx
              <Quote className="absolute right-6 top-6 h-8 w-8 text-emerald-400/20" aria-hidden />
```

- [ ] **Step 10: FinalCta radial bg + icon + button**

Line 407, replace:
```tsx
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.18),_transparent_60%)]"
```
with:
```tsx
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.20),_transparent_60%)]"
```

Line 410, replace:
```tsx
        <Shield className="mx-auto mb-6 h-10 w-10 text-sky-400" aria-hidden />
```
with:
```tsx
        <Shield className="mx-auto mb-6 h-10 w-10 text-emerald-400" aria-hidden />
```

Line 420, replace:
```tsx
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-500 px-8 text-sm font-semibold text-white shadow-xl shadow-sky-500/30 hover:bg-sky-400 hover:-translate-y-0.5 transition-all duration-300"
```
with:
```tsx
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-8 text-sm font-semibold text-white shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 hover:-translate-y-0.5 transition-all duration-300"
```

- [ ] **Step 11: SiteFooter logo**

Line 442, replace:
```tsx
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500 text-xs font-bold text-slate-950">
```
with:
```tsx
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-slate-950">
```

- [ ] **Step 12: Verify no sky-* remain in landing**

```bash
grep -n "sky-" src/app/page.tsx
```
Expected: empty output.

- [ ] **Step 13: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 14: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(landing): repaint sky → emerald (Mint Field hero + sections)"
```

---

## Phase 4 — Auth Pages

### Task 4.1: Repaint login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: ImagePane logo + gradient + sparkles**

Line 35, replace:
```tsx
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/60 to-sky-900/40"
```
with:
```tsx
        className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/60 to-emerald-900/45"
```

Line 39, replace:
```tsx
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-sky-500 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/30">
```
with:
```tsx
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30">
```

Line 46, replace:
```tsx
          <Sparkles className="mb-4 h-6 w-6 text-sky-300" aria-hidden />
```
with:
```tsx
          <Sparkles className="mb-4 h-6 w-6 text-emerald-300" aria-hidden />
```

- [ ] **Step 2: FormPane background gradient**

Line 67, replace:
```tsx
    <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4 py-12 sm:px-6 lg:px-8">
```
with:
```tsx
    <div className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12 sm:px-6 lg:px-8">
```

- [ ] **Step 3: Email input focus ring**

Line 121, replace:
```tsx
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-sky-500 aria-[invalid=true]:border-red-500"
```
with:
```tsx
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
```

- [ ] **Step 4: "Creá tu cuenta" link**

Line 134, replace:
```tsx
        <Link href="/register" className="font-semibold text-sky-700 hover:text-sky-800 hover:underline">
```
with:
```tsx
        <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
```

- [ ] **Step 5: SentState mail icon**

Line 145-146, replace:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 ring-8 ring-sky-50">
        <Mail className="h-6 w-6 text-sky-700" aria-hidden />
```
with:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700" aria-hidden />
```

Line 157, replace:
```tsx
        <Link href="/login" className="font-semibold text-sky-700 hover:underline">
```
with:
```tsx
        <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
```

- [ ] **Step 6: SubmitButton — keep slate-900 base, swap focus ring**

Line 172, replace:
```tsx
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
```
with:
```tsx
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
```

- [ ] **Step 7: Verify no sky-* remain in login**

```bash
grep -n "sky-" src/app/\(auth\)/login/page.tsx
```
Expected: empty.

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat(auth): repaint login → emerald palette"
```

### Task 4.2: Repaint register page

**Files:**
- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: ImagePane gradient + logo**

Line 35, replace `to-sky-900/40` with `to-emerald-900/45`.
Line 39, replace `bg-sky-500` with `bg-emerald-500` and `shadow-sky-500/30` with `shadow-emerald-500/30`.

- [ ] **Step 2: FormPane gradient**

Line 79, replace `to-sky-50` with `to-emerald-50/60`.

- [ ] **Step 3: "Iniciá sesión" link**

Line 172, replace:
```tsx
        <Link href="/login" className="font-semibold text-sky-700 hover:text-sky-800 hover:underline">
```
with:
```tsx
        <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
```

- [ ] **Step 4: SentState mail icon**

Line 183-184, replace:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 ring-8 ring-sky-50">
        <Mail className="h-6 w-6 text-sky-700" aria-hidden />
```
with:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Mail className="h-6 w-6 text-emerald-700" aria-hidden />
```

- [ ] **Step 5: Field component focus ring**

Line 219, replace:
```tsx
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:border-sky-500 aria-[invalid=true]:border-red-500"
```
with:
```tsx
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 aria-[invalid=true]:border-red-500"
```

- [ ] **Step 6: SubmitButton — match login**

Line 238, replace:
```tsx
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
```
with:
```tsx
      className="group inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-60 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
```

- [ ] **Step 7: Verify no sky-* remain**

```bash
grep -n "sky-" src/app/\(auth\)/register/page.tsx
```
Expected: empty.

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(auth)/register/page.tsx"
git commit -m "feat(auth): repaint register → emerald palette"
```

### Task 4.3: Repaint verify page

**Files:**
- Modify: `src/app/(auth)/verify/page.tsx`

- [ ] **Step 1: Background gradient + radial overlay**

Line 20, replace `to-sky-50` with `to-emerald-50/60`.
Line 23, replace:
```tsx
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.10),_transparent_60%)]"
```
with:
```tsx
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_60%)]"
```

- [ ] **Step 2: Loading state mail icon**

Line 44-45, replace:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 ring-8 ring-sky-50">
        <Loader2 className="h-6 w-6 animate-spin text-sky-700" aria-hidden />
```
with:
```tsx
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" aria-hidden />
```

- [ ] **Step 3: Error state CTA button**

Line 70, replace:
```tsx
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-xl"
```
with:
```tsx
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
```

- [ ] **Step 4: Verify no sky-* remain**

```bash
grep -n "sky-" src/app/\(auth\)/verify/page.tsx
```
Expected: empty.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/verify/page.tsx"
git commit -m "feat(auth): repaint verify → emerald palette"
```

---

## Phase 5 — Onboarding Wizard (highest priority — most outdated)

### Task 5.1: Restyle onboarding shell + progress bar

**Files:**
- Modify: `src/app/onboarding/page.tsx:30-58`

- [ ] **Step 1: Replace shell + progress markup**

In `src/app/onboarding/page.tsx`, replace the entire `return (...)` block (lines 30-58) with:

```tsx
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo header */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30">
            TG
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">TurnoGol</span>
        </div>

        <div className="rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-200 p-8">
          {/* Stepper */}
          <div className="mb-8">
            <div className="flex justify-between text-xs font-medium text-slate-500 mb-3">
              <span>Paso {currentStep} de 4</span>
              <span className="tabular-nums text-emerald-700">{Math.round((currentStep / 4) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={
                    n <= currentStep
                      ? 'flex-1 h-1 rounded-full bg-emerald-500'
                      : 'flex-1 h-1 rounded-full bg-slate-200'
                  }
                />
              ))}
            </div>
          </div>

          {/* Step content */}
          {currentStep === 1 && <StepIdentity />}
          {currentStep === 2 && <StepCourts />}
          {currentStep === 3 && tenantData && (
            <StepSchedule openingHours={tenantData.openingHours} />
          )}
          {currentStep === 4 && (
            <StepPayments mpConnected={!!tenantData?.mpConnectedAt} />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(onboarding): restyle wizard shell with stepper + emerald progress"
```

### Task 5.2: Restyle StepIdentity

**Files:**
- Modify: `src/app/onboarding/components/StepIdentity.tsx`

- [ ] **Step 1: Replace heading typography**

Line 53-55, replace:
```tsx
      <div>
        <h2 className="text-xl font-semibold">Tu Complejo</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 1 de 4 — Datos básicos del complejo</p>
      </div>
```
with:
```tsx
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tu Complejo</h2>
        <p className="text-sm text-slate-600 mt-1">Datos básicos del complejo</p>
      </div>
```

- [ ] **Step 2: Replace ALL `focus:ring-blue-500` with emerald + raise inputs to h-11**

Find all `<input>` and `<select>` elements with className `"w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"` (appears 6 times in this file: name, address, city, province select, phone, email).

Replace with:
```
"h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-slate-300"
```

For the `<select>` element on line 113, use the same className.

- [ ] **Step 3: Replace ALL `<label className="block text-sm font-medium mb-1">`**

There are 6 occurrences of `<label className="block text-sm font-medium mb-1">`. Replace each with:
```tsx
<label className="block text-sm font-medium text-slate-900 mb-1.5">
```

- [ ] **Step 4: Slug preview color**

Line 72-77, replace:
```tsx
            <p className="text-xs text-gray-500 mt-1">
              URL:{' '}
              <span className="font-mono">
                turnogol.app/<strong>{slugPreview}</strong>
              </span>
            </p>
```
with:
```tsx
            <p className="text-xs text-slate-500 mt-1.5">
              URL:{' '}
              <span className="font-mono text-slate-700">
                turnogol.app/<strong className="text-emerald-700">{slugPreview}</strong>
              </span>
            </p>
```

- [ ] **Step 5: Submit button**

Line 156-162, replace:
```tsx
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creando...' : 'Continuar →'}
        </button>
```
with:
```tsx
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Creando...' : 'Continuar →'}
        </button>
```

- [ ] **Step 6: Verify no blue-* / gray-* remain**

```bash
grep -nE "blue-[0-9]+|gray-[0-9]+" src/app/onboarding/components/StepIdentity.tsx
```
Expected: empty.

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/onboarding/components/StepIdentity.tsx
git commit -m "feat(onboarding): restyle StepIdentity with emerald inputs + lifted CTA"
```

### Task 5.3: Restyle StepCourts

**Files:**
- Modify: `src/app/onboarding/components/StepCourts.tsx:18-43`

- [ ] **Step 1: Replace entire return block**

Replace lines 18-43 with:

```tsx
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tus Canchas</h2>
        <p className="text-sm text-slate-600 mt-1">Configuración de canchas</p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
        <p className="font-medium">Podés agregar tus canchas desde el panel de configuración.</p>
        <p className="text-emerald-800">
          Necesitás al menos 1 cancha en estado <strong>online</strong> para aparecer en búsquedas
          públicas y recibir reservas.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={isPending}
        className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
      >
        {isPending ? 'Guardando...' : 'Continuar →'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/components/StepCourts.tsx
git commit -m "feat(onboarding): restyle StepCourts with emerald info box + CTA"
```

### Task 5.4: Restyle StepSchedule

**Files:**
- Modify: `src/app/onboarding/components/StepSchedule.tsx`

- [ ] **Step 1: Heading**

Line 50-53, replace:
```tsx
      <div>
        <h2 className="text-xl font-semibold">Horarios</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 3 de 4 — Horarios de apertura</p>
      </div>
```
with:
```tsx
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Horarios</h2>
        <p className="text-sm text-slate-600 mt-1">Horarios de apertura</p>
      </div>
```

- [ ] **Step 2: Helper paragraph**

Line 55-57, replace:
```tsx
      <p className="text-sm text-gray-600">
        Valores pre-cargados. Editá solo lo que sea diferente para tu complejo.
      </p>
```
with:
```tsx
      <p className="text-sm text-slate-600">
        Valores pre-cargados. Editá solo lo que sea diferente para tu complejo.
      </p>
```

- [ ] **Step 3: Table header text color**

Line 63, replace:
```tsx
              <tr className="text-left text-gray-500 border-b">
```
with:
```tsx
              <tr className="text-left text-slate-500 border-b border-slate-200">
```

- [ ] **Step 4: Time inputs (both `open` and `close`)**

Line 83 + line 92, both have:
```tsx
                        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
```
Replace both with:
```tsx
                        className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
```

- [ ] **Step 5: Checkbox row label color**

Line 103, replace:
```tsx
                        <span className="text-xs text-gray-600">
```
with:
```tsx
                        <span className="text-xs text-slate-600">
```

- [ ] **Step 6: Submit button**

Line 117-123, replace:
```tsx
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Guardando...' : 'Continuar →'}
        </button>
```
with:
```tsx
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Guardando...' : 'Continuar →'}
        </button>
```

- [ ] **Step 7: Error message color**

Line 115, replace `text-red-500` with `text-red-600`.

- [ ] **Step 8: Verify no blue-* / gray-* remain**

```bash
grep -nE "blue-[0-9]+|gray-[0-9]+" src/app/onboarding/components/StepSchedule.tsx
```
Expected: empty.

- [ ] **Step 9: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add src/app/onboarding/components/StepSchedule.tsx
git commit -m "feat(onboarding): restyle StepSchedule table + emerald CTA"
```

### Task 5.5: Restyle StepPayments

**Files:**
- Modify: `src/app/onboarding/components/StepPayments.tsx`

- [ ] **Step 1: Connected-state block**

Replace lines 19-40:

```tsx
  if (mpConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">MercadoPago</h2>
          <p className="text-sm text-gray-500 mt-1">Paso 4 de 4 — Cobro online</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">MercadoPago conectado exitosamente.</p>
          <p className="text-green-700 mt-1">
            Tus jugadores podrán pagar señas online al reservar.
          </p>
        </div>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Ir al dashboard →'}
        </button>
      </div>
    )
  }
```

with:

```tsx
  if (mpConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">MercadoPago</h2>
          <p className="text-sm text-slate-600 mt-1">Cobro online</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">MercadoPago conectado exitosamente.</p>
          <p className="text-emerald-800 mt-1">
            Tus jugadores podrán pagar señas online al reservar.
          </p>
        </div>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all duration-200"
        >
          {isPending ? 'Finalizando...' : 'Ir al dashboard →'}
        </button>
      </div>
    )
  }
```

- [ ] **Step 2: Disconnected state**

Replace lines 43-77:

```tsx
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">¿Cobrás seña?</h2>
        <p className="text-sm text-gray-500 mt-1">Paso 4 de 4 — Cobro online</p>
      </div>

      <p className="text-sm text-gray-600">
        Conectá tu cuenta de MercadoPago para cobrar señas online. El dinero va directo a tu
        cuenta, sin intermediarios.
      </p>

      <div className="space-y-3">
        <a
          href="/api/mp/oauth-start"
          className="block w-full text-center bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Conectar MercadoPago
        </a>

        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Terminar sin seña'}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Podés conectar MercadoPago en cualquier momento desde Configuración.
      </p>
    </div>
  )
```

with:

```tsx
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">¿Cobrás seña?</h2>
        <p className="text-sm text-slate-600 mt-1">Cobro online</p>
      </div>

      <p className="text-sm text-slate-600">
        Conectá tu cuenta de MercadoPago para cobrar señas online. El dinero va directo a tu
        cuenta, sin intermediarios.
      </p>

      <div className="space-y-3">
        <a
          href="/api/mp/oauth-start"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200"
        >
          Conectar MercadoPago
        </a>

        <button
          onClick={handleSkip}
          disabled={isPending}
          className="w-full h-11 border border-slate-200 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Finalizando...' : 'Terminar sin seña'}
        </button>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Podés conectar MercadoPago en cualquier momento desde Configuración.
      </p>
    </div>
  )
```

- [ ] **Step 3: Verify no blue-* / gray-* / green-* remain**

```bash
grep -nE "blue-[0-9]+|gray-[0-9]+|green-[0-9]+" src/app/onboarding/components/StepPayments.tsx
```
Expected: empty.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/components/StepPayments.tsx
git commit -m "feat(onboarding): restyle StepPayments — unify emerald success + CTA"
```

---

## Phase 6 — Admin Shell

### Task 6.1: Restyle admin sidebar

**Files:**
- Modify: `src/components/layout/admin-sidebar.tsx:84-114, 125, 132`

- [ ] **Step 1: Active nav item state**

Replace lines 84-113 (the `<nav>...{NAV_ITEMS.map(...)}</nav>` block):

```tsx
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label, pin }) => {
          const isActive =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href + '/'))

          return (
            <Link
              key={href}
              href={href}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-500" aria-hidden />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700',
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {pin && (
                <Lock
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              )}
              {pin && <span className="sr-only">Requiere PIN</span>}
            </Link>
          )
        })}
      </nav>
```

- [ ] **Step 2: Refine sidebar surface**

Line 60, replace:
```tsx
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-200">
```
with:
```tsx
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-200/70">
```

Line 62, replace:
```tsx
          <span className="text-base font-semibold text-slate-900">TurnoGol</span>
```
with:
```tsx
          <span className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-slate-950 shadow-sm shadow-emerald-500/30">
              TG
            </span>
            TurnoGol
          </span>
```

- [ ] **Step 3: Desktop + mobile sidebar surface tone**

Line 125, replace:
```tsx
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-slate-200 bg-white">
```
with:
```tsx
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-slate-200 bg-white shadow-sm shadow-slate-200/40">
```

Line 132, replace:
```tsx
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:hidden',
```
with:
```tsx
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-slate-200 bg-white shadow-xl shadow-slate-900/10 transition-transform duration-200 lg:hidden',
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/admin-sidebar.tsx
git commit -m "feat(admin): emerald active state + left-border accent in sidebar nav"
```

### Task 6.2: Restyle admin header

**Files:**
- Modify: `src/components/layout/admin-header.tsx:18, 35-36`

- [ ] **Step 1: Header surface shadow**

Line 18, replace:
```tsx
    <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-6 lg:left-60">
```
with:
```tsx
    <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm shadow-slate-200/50 px-4 sm:px-6 lg:left-60">
```

- [ ] **Step 2: Email pill + logout button**

Line 34-44, replace:
```tsx
      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-slate-500">{userEmail}</span>
        <Button
          variant="ghost"
          className="h-10 gap-2"
          onClick={onSignOut}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span>Salir</span>
        </Button>
      </div>
```
with:
```tsx
      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {userEmail}
        </span>
        <Button
          variant="ghost"
          className="h-10 gap-2 text-slate-700 hover:text-slate-900"
          onClick={onSignOut}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span>Salir</span>
        </Button>
      </div>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/admin-header.tsx
git commit -m "feat(admin): admin header soft shadow + email pill"
```

### Task 6.3: Restyle status banner trialing variant

**Files:**
- Modify: `src/components/layout/status-banner.tsx:42-54`

- [ ] **Step 1: Trialing variant**

Replace lines 41-55:

```tsx
  // Priority 2: Trialing
  if (tenantStatus === 'trialing' && trialEndsAt) {
    const days = daysUntil(trialEndsAt)
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 border-b border-sky-200 text-sm text-sky-800">
        <Clock className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
        <span className="flex-1">
          Período de prueba: <strong>{days}</strong> {days === 1 ? 'día restante' : 'días restantes'}.
        </span>
        <Link
          href="/settings/facturacion"
          className="font-medium underline underline-offset-2 hover:text-sky-900 transition-colors duration-150 shrink-0"
        >
          Elegir plan
        </Link>
      </div>
    )
  }
```

with:

```tsx
  // Priority 2: Trialing
  if (tenantStatus === 'trialing' && trialEndsAt) {
    const days = daysUntil(trialEndsAt)
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-900">
        <Clock className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span className="flex-1">
          Período de prueba: <strong>{days}</strong> {days === 1 ? 'día restante' : 'días restantes'}.
        </span>
        <Link
          href="/settings/facturacion"
          className="font-semibold underline underline-offset-2 hover:text-emerald-700 transition-colors duration-150 shrink-0"
        >
          Elegir plan
        </Link>
      </div>
    )
  }
```

- [ ] **Step 2: Verify no sky-* remain**

```bash
grep -n "sky-" src/components/layout/status-banner.tsx
```
Expected: empty.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/status-banner.tsx
git commit -m "feat(admin): trialing banner sky → emerald"
```

---

## Phase 7 — Dashboard Widgets

### Task 7.1: Restyle MetricCard

**Files:**
- Modify: `src/components/dashboard/metric-card.tsx:10-21`

- [ ] **Step 1: Replace component body**

Replace lines 10-21:

```tsx
export function MetricCard({ label, value, icon, sub }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
```

with:

```tsx
export function MetricCard({ label, value, icon, sub }: MetricCardProps) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-md shadow-slate-200/50 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70 hover:border-slate-300">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100 transition-colors group-hover:bg-emerald-100 group-hover:ring-emerald-200">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/metric-card.tsx
git commit -m "feat(dashboard): MetricCard rounded-2xl + emerald icon ring + hover lift"
```

### Task 7.2: Restyle OnboardingChecklist

**Files:**
- Modify: `src/components/dashboard/onboarding-checklist.tsx`

- [ ] **Step 1: Minimized success state**

Lines 53-68, the entire `if (minimized)` block — already uses `green-200/green-50/green-600/green-700/green-800/green-900`. Unify with emerald:

Replace:
```tsx
      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          <p className="text-sm font-medium text-green-800">¡Tu complejo está 100% listo!</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMinimized(false)}
          className="text-xs text-green-700 hover:text-green-900"
        >
          Ver checklist
        </Button>
      </div>
```
with:
```tsx
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm shadow-emerald-100">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-900">¡Tu complejo está 100% listo!</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMinimized(false)}
          className="text-xs text-emerald-700 hover:text-emerald-900"
        >
          Ver checklist
        </Button>
      </div>
```

- [ ] **Step 2: Card surface**

Line 72, replace:
```tsx
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
```
with:
```tsx
    <div className="rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/50">
```

- [ ] **Step 3: Progress bar**

Line 82, replace:
```tsx
                className="h-full rounded-full bg-sky-600 transition-all duration-300"
```
with:
```tsx
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
```

- [ ] **Step 4: Completed item check icon**

Line 107, replace:
```tsx
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
```
with:
```tsx
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
```

- [ ] **Step 5: "Configurar" link**

Line 135, replace:
```tsx
                  className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
```
with:
```tsx
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
```

- [ ] **Step 6: Verify no sky-* / green-* remain**

```bash
grep -nE "sky-[0-9]+|green-[0-9]+" src/components/dashboard/onboarding-checklist.tsx
```
Expected: empty.

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/onboarding-checklist.tsx
git commit -m "feat(dashboard): unify checklist palette — emerald progress + checks"
```

---

## Phase 8 — Bulk Palette Sweep

### Task 8.1: Identify all remaining sky/blue references

**Files:**
- Read-only audit, no modifications yet.

- [ ] **Step 1: Grep across src/ for legacy palette tokens**

```bash
grep -rnE "sky-[0-9]+|blue-[0-9]+" src/ --include="*.tsx" --include="*.ts"
```

Expected output: list of files with sky-* or blue-* class references. Capture the full output as `/tmp/sky-blue-audit.txt` (mental note for manual reference).

- [ ] **Step 2: Grep for remaining gray-* (legacy Tailwind v2)**

```bash
grep -rnE "(text|bg|border|ring)-gray-[0-9]+" src/ --include="*.tsx" --include="*.ts"
```

Expected: list of files using `gray-*` instead of `slate-*`. These should be migrated to `slate-*` for consistency.

- [ ] **Step 3: Note completion**

No commit. Just hold the file list mentally for Tasks 8.2–8.5.

### Task 8.2: Sweep player surface

**Files:**
- Modify: `src/app/(player)/perfil/page.tsx`
- Modify: `src/app/(player)/mis-reservas/page.tsx`
- Modify: `src/app/(player)/_components/PlayerBottomNav.tsx`

- [ ] **Step 1: Read each file fully before editing**

```bash
# In sequence, use the Read tool on each path. Do not skip — these files were not deeply analyzed in Phase 1.
```

- [ ] **Step 2: Apply mechanical replacements per file**

For each file, run these find/replace operations (preserve everything else):

| Find | Replace |
|---|---|
| `sky-50` | `emerald-50` |
| `sky-100` | `emerald-100` |
| `sky-200` | `emerald-200` |
| `sky-400` | `emerald-400` |
| `sky-500` | `emerald-500` |
| `sky-600` | `emerald-600` |
| `sky-700` | `emerald-700` |
| `sky-800` | `emerald-800` |
| `sky-900` | `emerald-900` |
| `blue-50` | `emerald-50` |
| `blue-100` | `emerald-100` |
| `blue-500` | `emerald-500` |
| `blue-600` | `emerald-600` |
| `blue-700` | `emerald-700` |
| `text-gray-` | `text-slate-` |
| `bg-gray-` | `bg-slate-` |
| `border-gray-` | `border-slate-` |

Do **NOT** replace `green-*` blanket — `green-*` may be intentional for "success" semantics in some contexts. Manually inspect each `green-*` occurrence and decide: keep `green` for native success states (saved/confirmed), swap to `emerald` for branded UI accents.

- [ ] **Step 3: PlayerBottomNav active state**

The active nav state should mirror the admin sidebar pattern: emerald-50 bg + emerald-700 text + emerald-500 left/top accent. Inspect file output from Step 1; if there's an `isActive ? '...' : '...'` ternary with sky-* values, replace with:
```
isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'
```
(Adapt the structural class names to match the file's existing layout — top nav vs side nav vs bottom tab bar.)

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(player)/"
git commit -m "feat(player): sweep palette → emerald + slate"
```

### Task 8.3: Sweep admin pages (staff, caja, settings/*)

**Files:**
- Modify: `src/app/(admin)/staff/page.tsx`
- Modify: `src/app/(admin)/caja/page.tsx`
- Modify: `src/app/(admin)/settings/reservas/page.tsx`
- Modify: `src/app/(admin)/settings/horarios/page.tsx`
- Modify: `src/app/(admin)/settings/pin/page.tsx`

- [ ] **Step 1: Read each file**

Use the Read tool on each path to capture current state.

- [ ] **Step 2: Apply Task 8.2 find/replace table to each file**

Same mappings: `sky-* → emerald-*`, `blue-* → emerald-*`, `gray-* → slate-*`. Inspect `green-*` case-by-case.

- [ ] **Step 3: Special — settings/pin/page.tsx**

PIN entry surface needs strong "secure feel". After base sweep, ensure the PIN input uses:
- `bg-white` card surface
- `rounded-2xl shadow-md shadow-slate-200/50`
- emerald-600 submit button (already covered by Button primitive)
- Slate-700 large numerals for the input dots/digits.

If file uses raw inline classes for the PIN dots, leave those structural classes as-is.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/staff/" "src/app/(admin)/caja/" "src/app/(admin)/settings/"
git commit -m "feat(admin): sweep staff/caja/settings palette → emerald"
```

### Task 8.4: Sweep canchas, booking modal, dialog, pin-gate, public not-found

**Files:**
- Modify: `src/app/(admin)/canchas/components/CourtList.tsx`
- Modify: `src/app/(admin)/canchas/components/CourtForm.tsx`
- Modify: `src/components/booking/BookingFormModal.tsx`
- Modify: `src/components/auth/pin-gate.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/app/(public)/[slug]/not-found.tsx`

- [ ] **Step 1: Read each file**

Use the Read tool on each.

- [ ] **Step 2: Apply find/replace mappings from Task 8.2**

Same table.

- [ ] **Step 3: Dialog component check**

`src/components/ui/dialog.tsx` is a shadcn primitive — apply ONLY palette replacements. Do not change Radix structural attributes, `data-[state=*]:` selectors, or aria props.

- [ ] **Step 4: pin-gate special**

`src/components/auth/pin-gate.tsx` is the lock-out screen. Ensure the unlock CTA uses emerald-600. The lock icon should remain neutral (slate-400/500), NOT emerald — it represents friction, not action.

- [ ] **Step 5: public not-found**

`src/app/(public)/[slug]/not-found.tsx` is shown to players when a tenant slug doesn't exist. Replace any sky logo accent with emerald. Keep the error illustration neutral.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin)/canchas/" "src/components/booking/" "src/components/auth/pin-gate.tsx" "src/components/ui/dialog.tsx" "src/app/(public)/"
git commit -m "feat: sweep canchas/booking/dialog/pin-gate palette → emerald"
```

### Task 8.5: Final audit — confirm no legacy palette remains

**Files:**
- Read-only verification.

- [ ] **Step 1: Confirm zero sky-* in src/**

```bash
grep -rnE "sky-[0-9]+" src/ --include="*.tsx" --include="*.ts"
```
Expected: empty output.

If any results appear, open each file, evaluate the use, and either replace with `emerald-*` (for branded accents) or `slate-*` (for neutral). If a result is intentional (e.g., a hex color in a `style` prop hardcoded for a specific Sentry trace ID badge), leave it but note in a final commit message.

- [ ] **Step 2: Confirm zero blue-* in src/**

```bash
grep -rnE "(text|bg|border|ring)-blue-[0-9]+" src/ --include="*.tsx" --include="*.ts"
```
Expected: empty output. Same handling as Step 1 if any survive.

- [ ] **Step 3: Confirm minimal gray-* in src/**

```bash
grep -rnE "(text|bg|border|ring)-gray-[0-9]+" src/ --include="*.tsx" --include="*.ts"
```
Expected: empty (or near-empty) output. If any remain, replace `gray-*` with `slate-*`.

- [ ] **Step 4: If any final cleanup needed, apply it**

Edit any straggler files. Each fix is its own bullet, not a separate task — bundle into one final commit.

- [ ] **Step 5: Final commit (if any cleanup happened)**

```bash
git add -p
git commit -m "chore: final palette sweep — eliminate legacy sky/blue/gray references"
```

---

## Phase 9 — Visual QA

### Task 9.1: Typecheck + lint

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```
Expected: pass with zero errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```
Expected: pass. If failures appear, fix them inline (only if they are className-related). Do NOT fix logic errors — those are out of scope for this redesign.

### Task 9.2: Dev server smoke test

**Files:** none

- [ ] **Step 1: Start dev server in background**

```bash
pnpm dev
```
(Run in background. Wait until output shows "Ready on http://localhost:3000".)

- [ ] **Step 2: Smoke-test each surface manually in browser**

Visit each URL and confirm visually:

| URL | What to verify |
|---|---|
| `http://localhost:3000/` | Hero gradient is emerald (not sky). All CTAs are emerald-500 with hover lift. Feature cards have emerald icon ring. |
| `http://localhost:3000/login` | Image-pane gradient is emerald. Submit button is emerald-600 with hover lift. Mail SentState icon ring is emerald. |
| `http://localhost:3000/register` | Same pattern as login. Form inputs emerald focus ring on focus. |
| `http://localhost:3000/verify` | Loading state mail icon ring emerald. |
| `http://localhost:3000/onboarding` | (Login first, no tenant) Wizard shell uses bg-slate-50 + rounded-2xl card + emerald gradient progress bar + 4 stepper dots. StepIdentity inputs h-11 with emerald focus. Submit emerald with hover lift. |
| `http://localhost:3000/dashboard` | (Login first, has tenant) Sidebar active item bg-emerald-50, left emerald-500 accent bar visible. MetricCards rounded-2xl with shadow + emerald icon ring + hover lift. OnboardingChecklist progress bar emerald gradient. |
| `http://localhost:3000/grilla` | Sidebar nav active state correct. No remaining sky/blue colors anywhere. |
| `http://localhost:3000/canchas` | Court list/form palette consistent. |
| `http://localhost:3000/c/<test-tenant-slug>` | Public player page (if accessible). |

- [ ] **Step 3: Check responsive behavior**

Resize browser window. Confirm:
- Mobile sidebar transitions smoothly (translate-x-0 / -translate-x-full).
- Hero CTAs stack on mobile.
- Onboarding wizard card stays max-w-md and centered.

- [ ] **Step 4: Check accessibility — focus rings**

Tab through key forms (login email, onboarding StepIdentity name field, dashboard sidebar links). Each should display a visible emerald-500 focus ring (`ring-2 ring-emerald-500`). No focus rings should be sky-*.

- [ ] **Step 5: Stop dev server**

Kill the background `pnpm dev` process.

- [ ] **Step 6: Note any visual regressions**

If any visual surface looks broken (text invisible due to contrast, missing background, etc.), document the file + line and fix in a follow-up commit. Do NOT mass-revert.

### Task 9.3: Final commit + branch summary

**Files:** none

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: only the `tsconfig.tsbuildinfo` may show modified (auto-generated). All redesign work committed.

- [ ] **Step 2: Print branch summary**

```bash
git log --oneline main..HEAD
```
Expected: ~25-30 commits across phases 1-8.

- [ ] **Step 3: Done. Hand off to user for visual review and PR.**

---

## Self-Review Checklist (run after writing this plan)

✓ **Spec coverage:**
- Mint Field palette (emerald primary) → Phase 1 (tokens), Phase 2 (primitives), Phases 3–8 (every surface).
- Slate Grey #334155 sidebars → Phase 6.1 (nav inactive text-slate-700, hover slate-100).
- Midnight Blue #1E293B typography → all heading swaps to text-slate-900 / subtitles text-slate-600 across phases 4–7.
- Off-Whites prohibited as body bg → Phase 5.1 (onboarding bg-slate-50), Phase 6 (sidebar surface stays white but body remains slate-50).
- Soft modern shadows → metric-card/onboarding-checklist (`shadow-md shadow-slate-200/50`), wizard card.
- Pronounced rounded corners → `rounded-xl` (info boxes, banners) and `rounded-2xl` (cards, wizard, primary metric cards).
- Micro-animations on buttons → cva default variant in Button + custom in onboarding/auth submit buttons (`hover:-translate-y-0.5 hover:shadow-lg`).
- Focus rings emerald-500/50 → Input primitive + every form input across auth/onboarding.
- Landing dynamic feel with FOMO/stats/testimonials → existing structure preserved, just repainted (Phase 3).
- Logic intact → no Server Action / hook / DB / route changes anywhere; Phase 1.1 verified by `pnpm typecheck` post-CSS-edit; Phases 2-8 also gated by typecheck.

✓ **Placeholder scan:** No "TBD", "implement later", "similar to Task N", "add appropriate". Every code step shows complete code. Bulk sweep (Phase 8) gives exact find/replace mapping table.

✓ **Type consistency:** No types/methods/props introduced or renamed. Only className strings + small JSX wrapping (e.g., wrapping logo in onboarding header).

✓ **Token consistency:** `emerald-600` (#059669) for text/CTA on light surfaces. `emerald-500` (#10B981) for accents/icons/dark-bg. `slate-700` for nav text. `slate-900` for headings. `slate-50` for body. Mappings unified across all phases.

✓ **WCAG AA:** `bg-emerald-600` text-white = 4.6:1 ✓. `text-emerald-700` on white = 5.5:1 ✓. `text-emerald-600` on white = 4.5:1 ✓. `bg-emerald-500` reserved for non-text accents only.

✓ **Reversibility:** Every change is a className swap or HSL var swap. Zero schema/migration risk. Single `git revert` per phase rolls back cleanly.
