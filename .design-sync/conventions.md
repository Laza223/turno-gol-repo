# TurnoGol design system

shadcn/ui + Radix primitives on Tailwind CSS, for a B2B SaaS that manages Argentine
football-pitch complexes. Brand: **emerald-600** action color on calm **slate** surfaces.
UI copy is rioplatense Spanish ("Reservá", "turno", "seña", "cancha").

## Setup & wrapping

- Components are styled by Tailwind utility classes + CSS custom properties. The theme tokens
  ship in the bound `styles.css` closure (`:root { --primary, --background, … }`) — no theme
  provider needed for color/spacing.
- **No provider needed** for Button, Badge, Input, Label, Combobox, Skeleton, EmptyState,
  ErrorState, Logo, Dialog, ConfirmDialog, DropdownMenu (Radix renders standalone).
- **Toast is the one exception** — Radix toasts must live inside `ToastProvider` and render into a
  `ToastViewport`:
  ```jsx
  <ToastProvider>
    <Toast open variant="success">
      <ToastTitle>Pago acreditado</ToastTitle>
      <ToastDescription>Recibimos tu seña.</ToastDescription>
      <ToastClose />
    </Toast>
    <ToastViewport />
  </ToastProvider>
  ```
- Compound components compose from sub-parts: `Dialog` → `DialogTrigger`/`DialogContent`/
  `DialogHeader`/`DialogTitle`/`DialogClose`; `DropdownMenu` → `DropdownMenuTrigger`/
  `DropdownMenuContent`/`DropdownMenuItem`. `ConfirmDialog` is a ready-made confirm modal (pass
  `open`, `title`, `onConfirm`, `variant="destructive"`).
- Fonts: `font-sans` = Inter (body, default), `font-display` = Archivo (the Logo wordmark),
  `font-logo` = Sora. All three ship as `@font-face` in the closure.

## Styling idiom — Tailwind utilities (use the semantic token classes)

Style your own layout/markup with Tailwind. Prefer the **semantic token utilities** (they track the
brand theme) over raw palette where one exists:

| Purpose | Class |
|---|---|
| Action / brand surface | `bg-primary text-primary-foreground` (emerald-600) |
| Page / app surface | `bg-background text-foreground` (slate) |
| Card surface | `bg-card text-card-foreground border border-border` |
| Muted/secondary text | `text-muted-foreground` |
| Secondary / subtle fill | `bg-secondary` · `bg-muted` · `bg-accent` |
| Destructive | `bg-destructive text-destructive-foreground` (red-600) |
| Success / Warning | `bg-success …` (green-700) · `bg-warning …` (amber-600) |
| Focus ring | `ring-ring` (emerald-500) |
| Radius | `rounded-lg` = `--radius` (0.5rem) |

Direct palette the components themselves use: `emerald-600/500`, `slate-900/600/200`, `red-600`,
`amber-600`. Don't invent new brand hues — reach for `primary`/`emerald` for actions.

## Where the truth lives

- `_ds/<folder>/styles.css` and its `@import` closure — the real tokens/fonts/component CSS.
- Per-component `<Name>.d.ts` (the prop contract) and `<Name>.prompt.md` (usage + examples).
- `guidelines/` carries the visual source of truth (design-system MASTER).

## Idiomatic example

```jsx
<div className="rounded-lg border border-border bg-card p-4">
  <div className="flex items-center justify-between">
    <h3 className="font-display text-lg text-foreground">Cancha 3 — Fútbol 5</h3>
    <Badge variant="success">Confirmada</Badge>
  </div>
  <p className="mt-1 text-sm text-muted-foreground">Sábado 20:00 · Seña $8.000</p>
  <div className="mt-4 flex justify-end gap-2">
    <Button variant="outline">Ver detalle</Button>
    <Button>Reservar turno</Button>
  </div>
</div>
```
