# TurnoGol — Design System (MASTER)

> **Source of Truth.** All UI code must follow these rules.
> When building a specific page, check `design-system/pages/[page].md` first.
> If that file exists, its rules **override** this file. Otherwise use this exclusively.

**Project:** TurnoGol — SaaS B2B para complejos de fútbol (Argentina)
**Stack:** Next.js 14 · TypeScript · shadcn/ui · Tailwind CSS
**Generated:** 2026-04-27
**Product type:** B2B SaaS admin dashboard
**Users:** Complejo owners/operators, tech literacy 2–3/5

---

## 1. Color Palette

| Role | Hex | Tailwind token | CSS Variable |
|------|-----|----------------|--------------|
| Primary | `#059669` | `emerald-600` | `--color-primary` — Mint Field |
| On Primary | `#FFFFFF` | `white` | `--color-on-primary` |
| Secondary | `#334155` | `slate-700` | `--color-secondary` |
| Accent | `#10B981` | `emerald-500` | `--color-accent` — for non-text accents only (icon glows, gradients) |
| Background | `#F8FAFC` | `slate-50` | `--color-background` |
| Foreground | `#020617` | `slate-950` | `--color-foreground` |
| Muted bg | `#F1F5F9` | `slate-100` | `--color-muted` |
| Muted fg | `#64748B` | `slate-500` | `--color-muted-foreground` |
| Border | `#E2E8F0` | `slate-200` | `--color-border` |
| Success | `#16A34A` | `green-600` | `--color-success` |
| Warning | `#D97706` | `amber-600` | `--color-warning` |
| Destructive | `#DC2626` | `red-600` | `--color-destructive` |
| Ring (focus) | `#10B981` | `emerald-500` | `--color-ring` |

**Rationale:** Mint Field — emerald primary evokes the football pitch while keeping AA contrast on white surfaces. Slate neutrals preserve professional, data-dense feel. Accent (emerald-500) is reserved for non-text decorative use (icon halos, subtle gradients) to avoid contrast failures.

---

## 2. Typography

**Font stack:** Inter (shadcn/ui default — variable font, system fallback)

```css
/* Already provided by shadcn/ui + next/font/google */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Type Scale

| Role | Size | Weight | Line Height | Tailwind |
|------|------|--------|-------------|---------|
| Page title (h1) | 24px | 600 | 1.25 | `text-2xl font-semibold` |
| Section title (h2) | 20px | 600 | 1.3 | `text-xl font-semibold` |
| Card title (h3) | 16px | 600 | 1.4 | `text-base font-semibold` |
| Body | 14px | 400 | 1.5 | `text-sm` |
| Label | 14px | 500 | 1.4 | `text-sm font-medium` |
| Caption / helper | 12px | 400 | 1.4 | `text-xs text-muted-foreground` |
| Tabular data | 14px | 400 (tabular) | 1.4 | `text-sm tabular-nums` |
| Badge | 12px | 500 | 1 | `text-xs font-medium` |

**Rules:**
- Body minimum: 14px (admin context, desktop-first)
- Tabular numbers (`tabular-nums`) for all prices, times, counts
- No Fira Code / monospace for UI text — only for code blocks if any

---

## 3. Spacing Scale

4px base grid. Tailwind tokens map directly.

| Token | px | rem | Tailwind | Usage |
|-------|----|-----|---------|-------|
| `space-1` | 4px | 0.25rem | `p-1` / `gap-1` | Icon padding |
| `space-2` | 8px | 0.5rem | `p-2` / `gap-2` | Inline spacing |
| `space-3` | 12px | 0.75rem | `p-3` / `gap-3` | Compact inputs |
| `space-4` | 16px | 1rem | `p-4` / `gap-4` | Standard padding |
| `space-6` | 24px | 1.5rem | `p-6` / `gap-6` | Card padding |
| `space-8` | 32px | 2rem | `p-8` / `gap-8` | Section spacing |
| `space-12` | 48px | 3rem | `p-12` | Hero / page top |

---

## 4. Shadow Depths

| Level | Value | Tailwind | Usage |
|-------|-------|---------|-------|
| Subtle | `0 1px 2px rgba(0,0,0,0.05)` | `shadow-sm` | Table rows, inputs |
| Default | `0 4px 6px rgba(0,0,0,0.07)` | `shadow` | Cards |
| Elevated | `0 10px 15px rgba(0,0,0,0.1)` | `shadow-lg` | Dropdowns, popovers |
| Modal | `0 20px 40px rgba(0,0,0,0.15)` | `shadow-2xl` | Dialogs |

---

## 5. Border Radius

| Token | Value | Tailwind | Usage |
|-------|-------|---------|-------|
| xs | 4px | `rounded` | Badges, tags |
| sm | 6px | `rounded-md` | Inputs, buttons |
| md | 8px | `rounded-lg` | Cards |
| lg | 12px | `rounded-xl` | Panels, modals |
| full | 9999px | `rounded-full` | Avatars, pills |

---

## 6. Component Specs

### Buttons

```tsx
// Primary — one per view
<Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-4 rounded-md text-sm font-medium transition-colors duration-150">

// Secondary / outline
<Button variant="outline" className="h-10 px-4 rounded-md text-sm font-medium border-slate-200 hover:bg-slate-50">

// Ghost
<Button variant="ghost" className="h-10 px-4 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100">

// Destructive
<Button variant="destructive" className="h-10 px-4 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700">
```

**Rules:**
- Min height: 40px (`h-10`) desktop / 44px (`h-11`) mobile-facing
- **Mobile-first cascade in primitives:** `Button` and `Input` use `h-11 md:h-10` (44px <768px, 40px ≥md). Enforces WCAG 2.5.5 touch size on mobile while preserving desktop density. Custom heights (`size="lg"` already `h-11`, `size="sm"` cascades `h-10 md:h-9`).
- Loading state: disable + spinner (never silent)
- One primary CTA per view; secondary actions subordinate

### Inputs / Form Fields

```tsx
<Input className="h-10 px-3 border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-600">
```

- Visible `<label>` for every input (never placeholder-only)
- Errors below field, `text-xs text-red-600`
- Helper text below field, `text-xs text-slate-500`
- Validate on blur, not on keystroke
- `autocomplete` attributes on all auth/personal data fields

### Cards

```tsx
<div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
```

- Background: white (not slate-50 — reserve that for page bg)
- Interactive cards: `hover:shadow-md transition-shadow duration-150`

### Badges / Status pills

```tsx
// Green — active/online/success
<span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">

// Yellow — warning/trialing
<span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">

// Red — error/canceled/offline
<span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">

// Gray — neutral/draft
<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
```

### Tables (data grids)

- Header: `text-xs font-medium text-slate-500 uppercase tracking-wide`
- Rows: `text-sm text-slate-900`, divide-y `divide-slate-100`
- Hover row: `hover:bg-slate-50`
- Numeric columns: right-align + `tabular-nums`

### Modals / Dialogs

- Overlay: `bg-black/50`
- Content: `bg-white rounded-xl shadow-2xl max-w-md w-full p-6`
- Always include close button (keyboard: Escape)
- Destructive confirm dialogs: red confirm button, separated from cancel

### Toast / Notifications

- Auto-dismiss: 4s (success), persist (error)
- Use `aria-live="polite"` — no focus steal
- Position: bottom-right desktop, bottom-full mobile

---

## 7. Animation

| Interaction | Duration | Easing | Tailwind |
|-------------|----------|--------|---------|
| Hover state | 150ms | ease | `transition-colors duration-150` |
| Button press | 100ms | ease-in | `active:scale-[0.98]` |
| Dropdown open | 150ms | ease-out | `animate-in fade-in-0 zoom-in-95` |
| Modal open | 200ms | ease-out | `animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4` |
| Toast slide-in | 250ms | ease-out | `animate-in slide-in-from-bottom-4` |
| Page skeleton | shimmer | — | CSS keyframe on `bg-gradient` |

**Rules:**
- No animations > 300ms for interactions
- `prefers-reduced-motion`: respect via `motion-reduce:` Tailwind variant
- No layout-shifting transforms (no translateY on hover that pushes siblings)
- No decorative animation — every motion must express meaning

---

## 8. Layout System

### Breakpoints (Tailwind defaults)

| Name | Width | Context |
|------|-------|---------|
| Mobile | < 640px | Onboarding wizard, player-facing |
| sm | 640px | Compact admin |
| md | 768px | Tablet admin |
| lg | 1024px | Desktop sidebar layout |
| xl | 1280px | Wide dashboard |
| 2xl | 1536px | Ultra-wide (max-w clamp) |

### Admin Layout Shell

```
┌─────────────────────────────────────────────┐
│ Sidebar 240px (lg+) │  Main content area     │
│  - Logo             │  max-w-7xl mx-auto     │
│  - Nav items        │  px-6 py-8             │
│  - (bottom) User    │                        │
└─────────────────────────────────────────────┘
```

- Mobile: sidebar collapses to sheet/drawer
- Content max-width: `max-w-7xl` (1280px) on xl+
- Page padding: `px-4 sm:px-6 lg:px-8`
- Section vertical gap: `space-y-6`

### Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| Base | 0 | Normal content |
| Sticky | 10 | Table headers, sticky bars |
| Dropdown | 20 | Menus, popovers |
| Modal overlay | 40 | Dialog backdrop |
| Modal | 50 | Dialog content |
| Toast | 100 | Notifications |

---

## 9. Icons

**Library:** Lucide React (`lucide-react`) — stroke icons, consistent weight

```tsx
import { Calendar, Clock, Users, CreditCard } from 'lucide-react'

// Standard size
<Icon className="h-4 w-4" />          // inline/label
<Icon className="h-5 w-5" />          // button/nav item
<Icon className="h-6 w-6" />          // feature icon

// Icon + label (always pair for non-obvious icons)
<Button><Calendar className="mr-2 h-4 w-4" />Ver grilla</Button>
```

**Rules:**
- Never emojis as structural icons
- Icon-only buttons need `aria-label`
- Consistent stroke width (Lucide default: 2px)

---

## 10. Accessibility Baseline

- All text contrast: ≥ 4.5:1 (AA)
- Large text / UI components: ≥ 3:1
- Focus ring: `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`
- Skip-to-content link at page top
- Form errors: `role="alert"` or `aria-live="assertive"`
- No info conveyed by color alone (add icon or text)
- Keyboard nav: tab order = visual order

---

## 11. Anti-Patterns

| ❌ Don't | ✅ Do instead |
|---------|-------------|
| Emoji as icons (📅 🏟️) | Lucide SVG icons |
| `any` type | Strict TypeScript |
| Raw hex in className | Tailwind tokens |
| Placeholder-only form labels | Visible `<label>` above input |
| Hover-only interactions | Click/tap primary; hover = enhancement |
| Instant state changes (0ms) | 150ms transition minimum |
| Mixing tailwind colors arbitrarily | Only palette colors from §1 |
| Fixed heights on text containers | Let text wrap; use min-h |
| Dark mode default | Light mode only (v1) |
| Glassmorphism / heavy blur effects | Clean flat + subtle shadows |

- **PROHIBIDO** usar `bg-emerald-500` (#10B981) para texto sobre fondo blanco — falla WCAG AA (~2.97:1). Para texto/CTA en fondo claro usar siempre `emerald-600` (#059669) que cumple AA (4.5:1).
- **PROHIBIDO** usar `bg-white` como fondo de página/body. `bg-white` se reserva para superficies elevadas (cards, modales, formularios). Body siempre `bg-slate-50`.
- **PROHIBIDO** `text-black` o `bg-black`. Texto principal `text-slate-900`, fondos oscuros `bg-slate-950` o `bg-slate-900`.

---

## 12. Pre-Delivery Checklist

- [ ] No emojis as icons — Lucide only
- [ ] All colors from palette §1 — no raw hex in JSX
- [ ] `cursor-pointer` on all clickable non-button elements
- [ ] `tabular-nums` on all numeric data columns
- [ ] Visible `<label>` for every input
- [ ] Errors shown below field, not only at top
- [ ] Button disabled + loading state during async ops
- [ ] Contrast ≥ 4.5:1 for all text
- [ ] Focus states visible (`focus-visible:ring-2`)
- [ ] `prefers-reduced-motion` respected
- [ ] No horizontal scroll on 375px viewport
- [ ] Responsive tested: 375px / 768px / 1280px
