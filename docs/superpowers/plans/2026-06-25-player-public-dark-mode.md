# Player/Public Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar las vistas de jugador + públicas completamente en dark mode sobre una base de tokens semánticos, y sumar un toggle de tema (Sistema/Claro/Oscuro) sin retrabajo.

**Architecture:** Sistema de tokens CSS (`:root` = light, `.dark` = dark) que ya está medio armado (`darkMode: ['class']` + tokens en `globals.css`, solo faltan los valores dark). Los componentes de "app" del jugador se pasan de hex/clases-claras hardcodeadas a clases de token (`bg-card`, `text-foreground`, …) → flipan con la clase `.dark`. Las páginas always-dark (público, reserva, auth, home) se fuerzan dark a nivel layout. El toggle (next-themes) llega último: las superficies toggleables ya tienen valores light listos.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS (darkMode class), next-themes (a instalar en F3), Vitest + Playwright.

## Global Constraints

- TypeScript strict, **nunca `any`**.
- Correr `pnpm typecheck` después de **cada** cambio. Filtrar ruido del dir espejo: `pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"` → debe salir sin errores nuevos.
- Montos en centavos de ARS; timestamps UTC (no tocar — esto es solo visual).
- ENUMs usan `canceled` (una L), nunca `cancelled` (no aplica acá, pero regla vigente).
- Commits frecuentes. Mensaje de commit termina con línea en blanco + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Spec fuente: `docs/superpowers/specs/2026-06-25-player-public-dark-mode-design.md`.

### Tabla de mapeo de clases (aplica a TODAS las tasks de tokenización, F1)

**A) Superficies estructurales → tokens semánticos (flipan solos con `.dark`):**

| Clase clara hardcodeada | Reemplazo (token) |
|---|---|
| `bg-white` (superficie/card) | `bg-card` |
| `bg-slate-50`, `bg-slate-50/70` | `bg-muted/40` |
| `bg-slate-100` (superficie) | `bg-muted` |
| `text-slate-900`, `text-slate-800` | `text-foreground` |
| `text-slate-700` | `text-foreground` |
| `text-slate-600`, `text-slate-500`, `text-slate-400` | `text-muted-foreground` |
| `border-slate-200`, `border-slate-200/80`, `border-slate-300` | `border-border` |
| `ring-slate-200` | `ring-border` |
| separador `bg-slate-100` / `border-slate-100` (divisores) | `bg-border` / `border-border` |
| `hover:bg-slate-100`, `hover:bg-slate-50` | `hover:bg-accent` |
| `hover:text-slate-900` | `hover:text-foreground` |

**B) Acentos de marca → mantener la clase clara y AÑADIR variante `dark:` (no flipan solos):**

| Patrón claro | Añadir |
|---|---|
| `bg-emerald-50 text-emerald-600` / `text-emerald-700` + `ring-emerald-600/15` (tiles/badges) | `dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20` |
| `bg-amber-50 text-amber-700 ring-amber-600/20` | `dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20` |
| `bg-red-50 text-red-600` / `text-red-700` | `dark:bg-red-500/10 dark:text-red-300` |
| `text-emerald-700` (precio/links sobre claro) | `dark:text-emerald-400` |
| `bg-rose-50 text-rose-500 ring-rose-500/15` (favoritos vacío) | `dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20` |
| badge neutro `bg-slate-100 text-slate-600 ring-slate-500/20` | usar tokens: `bg-muted text-muted-foreground ring-border` |

**C) NO tocar (excepciones):**
- QR: el `bg-white` del wrapper de `BookingQR` en `exito/page.tsx` es zona de silencio del código → **queda blanco**.
- `#booking-receipt` y los `@media print` en `globals.css` → comprobante impreso, queda claro.
- Islas always-dark que ya usan hex: `PlayerHeroBand.tsx`, la banda dark inline de `mis-reservas`, `ReservaDarkShell.tsx`, `PortalHeader` variante `overlay`, `SiteFooter.tsx` (ya es `bg-slate-950`, footer de marca → se deja dark siempre).
- Primitivos `components/ui/*` de shadcn → ya usan tokens, flipan gratis. No tocar salvo que rompan.
- Botones CTA `bg-emerald-600 text-white` → marca, legibles en ambos temas. Se dejan.

---

## F0 — Fundación de tokens

### Task 1: Paleta dark en globals.css

**Files:**
- Modify: `src/app/globals.css` (bloque `@layer base` con `:root`, líneas ~5-50)

**Interfaces:**
- Produces: clase `.dark` con valores HSL para todos los tokens (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover*`, `--secondary*`, `--muted*`, `--accent*`, `--border`, `--input`, `--ring`, `--success*`, `--warning*`). Consumida por todas las tasks de tokenización.

- [ ] **Step 1: Agregar el bloque `.dark` dentro de `@layer base`**, justo después del cierre del `:root { … }` existente (después de la línea `--sidebar-width: 240px; }`):

```css
  .dark {
    --background: 224 71% 4%;          /* #020617 slate-950 */
    --foreground: 210 40% 98%;         /* slate-50 */

    --card: 222 33% 9%;                /* superficie elevada ~#0d1424 */
    --card-foreground: 210 40% 98%;

    --popover: 222 33% 9%;
    --popover-foreground: 210 40% 98%;

    --primary: 161 94% 30%;            /* emerald-600 (CTA, igual que light) */
    --primary-foreground: 0 0% 100%;

    --secondary: 217 33% 14%;          /* nested surface */
    --secondary-foreground: 210 40% 98%;

    --muted: 217 33% 14%;
    --muted-foreground: 215 20% 65%;   /* más claro para legibilidad dark */

    --accent: 217 33% 17%;             /* hover bg */
    --accent-foreground: 210 40% 98%;

    --destructive: 0 72% 51%;          /* red-600 */
    --destructive-foreground: 0 0% 100%;

    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 160 84% 39%;               /* emerald-500 */

    --success: 142 70% 45%;            /* green más vivo para dark */
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;             /* amber más vivo para dark */
    --warning-foreground: 0 0% 100%;
  }
```

- [ ] **Step 2: Verificar tipos/compilación**

Run: `pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"`
Expected: sin errores nuevos (CSS no afecta TS; confirma que no se rompió nada).

- [ ] **Step 3: Verificación visual manual**

Run: `pnpm dev`, abrir la home (`/`). Expected: sin cambios (todavía no hay `.dark` en el árbol; el bloque está inerte). Confirma que el CSS parsea (sin error en consola del dev server).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): definir paleta dark en tokens (.dark)

Bloque .dark con valores HSL de todos los tokens semánticos.
Inerte hasta que un ancestro tenga la clase .dark.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shell del portal dark (cancha recoloreada) + skeleton

**Files:**
- Modify: `src/app/globals.css` (`.player-shell-bg`, líneas ~76-85; `.skeleton` ya usa tokens, solo verificar)

**Interfaces:**
- Consumes: clase `.dark` (Task 1).
- Produces: `.player-shell-bg` con dos comportamientos (base = light actual; bajo `.dark` = #020617 + cancha esmeralda tenue + glow).

- [ ] **Step 1: Añadir la regla dark de `.player-shell-bg`** inmediatamente después de la regla `.player-shell-bg { … }` existente (NO borrar la existente: es el modo light):

```css
/* Player shell — variante dark: misma cancha recoloreada sobre #020617 + glow */
.dark .player-shell-bg {
  background-color: #020617;
  background-image:
    radial-gradient(circle at top right, rgba(16, 185, 129, 0.14), transparent 42%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'%3E%3Cg stroke='%2334d399' stroke-width='2' stroke-opacity='0.06' fill='none'%3E%3Cline x1='600' y1='0' x2='600' y2='800'/%3E%3Ccircle cx='600' cy='400' r='160'/%3E%3Ccircle cx='600' cy='400' r='4' fill='%2334d399' fill-opacity='0.06'/%3E%3Crect x='-10' y='150' width='220' height='500' rx='8'/%3E%3Crect x='-10' y='260' width='70' height='280' rx='4'/%3E%3Cpath d='M 210 300 A 130 130 0 0 1 210 500'/%3E%3Crect x='990' y='150' width='220' height='500' rx='8'/%3E%3Crect x='1140' y='260' width='70' height='280' rx='4'/%3E%3Cpath d='M 990 300 A 130 130 0 0 0 990 500'/%3E%3C/g%3E%3C/svg%3E"),
    linear-gradient(to bottom right, #07131d, #020617);
  background-size: cover, cover, 100% 100%;
  background-position: center;
  background-attachment: fixed;
}
```

- [ ] **Step 2: Confirmar que `.skeleton` ya es token-based** (no requiere cambio). Verificar que el bloque `.skeleton` usa `hsl(var(--muted))` y `hsl(var(--secondary))` (líneas ~103-112). Si es así, flipará solo bajo `.dark`. No editar.

- [ ] **Step 3: Verificación visual manual**

Run: `pnpm dev`. En devtools, agregar `class="dark"` al `<html>` manualmente. Navegar a `/mis-reservas` (o cualquier ruta player). Expected: el fondo del shell pasa a #020617 con líneas de cancha tenues; los skeletons (si hay loading) se ven oscuros. Quitar la clase → vuelve a emerald-50.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
git add src/app/globals.css
git commit -m "feat(theme): variante dark del shell del portal (cancha recoloreada)

.dark .player-shell-bg: #020617 + cancha esmeralda @6% + glow.
Mismo SVG inline, recolor por tema. .skeleton ya flipa por tokens.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Dark como default fijo (pre-toggle)

**Files:**
- Modify: `src/app/layout.tsx:66` (la etiqueta `<html lang="es" className={…}>`)

**Interfaces:**
- Consumes: `.dark` (Task 1), `.dark .player-shell-bg` (Task 2).
- Produces: `<html>` con clase `dark` fija. Se retira en Task 10 (lo toma next-themes). A partir de acá toda la app que use tokens renderiza dark.

- [ ] **Step 1: Agregar `dark` al className del `<html>`.** Reemplazar:

```tsx
    <html lang="es" className={`${inter.variable} ${archivo.variable} ${sora.variable}`}>
```

por:

```tsx
    <html lang="es" className={`dark ${inter.variable} ${archivo.variable} ${sora.variable}`}>
```

- [ ] **Step 2: Verificación visual manual**

Run: `pnpm dev`. Navegar a `/mis-reservas`, `/perfil`, `/configuracion`. Expected: el SHELL (fondo + header tokenizado en tasks siguientes) se ve dark, pero las tarjetas de contenido todavía se ven CLARAS (`bg-white` sin tokenizar). Esto es esperado: marca el trabajo pendiente de F1. Las páginas always-dark (`/`, `/explorar`, `/reserva/.../exito`) se ven coherentes dark.

- [ ] **Step 3: Typecheck + correr tests existentes (no deben romperse)**

Run: `pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"`
Run: `pnpm test src/ tests/unit 2>&1 | tail -20`
Expected: typecheck limpio; tests verdes (ninguno asume color).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(theme): dark como tema default (fijo, pre-toggle)

Clase .dark fija en <html>. Se reemplaza por next-themes en F3.
Shell ya dark; el contenido de app del jugador queda WIP claro.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## F1 — Tokenizar superficies de app del jugador

> Aplicar la **Tabla de mapeo** (Global Constraints) en cada task. Método: `grep` las clases claras del archivo, reemplazar según tablas A/B, respetar excepciones C. Verificar dark visual + typecheck + tests tras cada una.

### Task 4: Tokenizar chrome del portal (header solid + bottom nav)

**Files:**
- Modify: `src/components/site/PortalHeader.tsx` (SOLO el `return` final, variante `solid`, líneas ~81-133; la variante `overlay` NO se toca)
- Modify: `src/components/site/PlayerBottomNav.tsx` (el `<nav>` y el className de los links, líneas ~37-50)
- Modify: `src/components/site/AccountMenu.tsx` (chip `solid` y contenido del dropdown, líneas ~33-67)

**Interfaces:**
- Consumes: tokens (Task 1).
- Produces: chrome tokenizado que renderiza dark bajo `.dark` (global o wrapper de layout) y light bajo tema claro.

- [ ] **Step 1: PortalHeader — variante solid.** En el `<header>` final (NO el `overlay`), aplicar:
  - barra: `border-slate-200/80 bg-white/80` → `border-border bg-card/80`
  - logo: `textClassName="text-slate-900 font-bold" iconClassName="bg-white border-slate-200"` → `textClassName="text-foreground font-bold" iconClassName="bg-card border-border"`
  - links Explorar/Mis reservas/Para complejos: `text-slate-600 hover:bg-slate-100 hover:text-slate-900` → `text-muted-foreground hover:bg-accent hover:text-foreground`
  - CTA Ingresar `bg-emerald-600 … text-white` → **dejar** (acento marca).

- [ ] **Step 2: PlayerBottomNav.** En el `<nav>`: `border-slate-200 bg-white` → `border-border bg-card`. En el link: `text-slate-500 hover:text-slate-900` → `text-muted-foreground hover:text-foreground`; activo `text-emerald-700` → `text-emerald-700 dark:text-emerald-400`.

- [ ] **Step 3: AccountMenu.** chip `solid`: `bg-white hover:bg-slate-50 ring-slate-200 text-slate-700` → `bg-card hover:bg-accent ring-border text-foreground`. Dropdown header: `text-slate-900`→`text-foreground`, `text-slate-500`→`text-muted-foreground`. Separadores `bg-slate-100`→`bg-border`. Íconos `text-slate-500`→`text-muted-foreground`. (El `DropdownMenuContent` de shadcn ya es token-based.)

- [ ] **Step 4: Verificación visual**

Run: `pnpm dev`. Con `.dark` activo (Task 3): header solid, bottom nav y menú de cuenta se ven dark e integrados con el shell. Probar también `/explorar` (header dark sobre layout always-dark, F2 lo confirma).

- [ ] **Step 5: Typecheck + tests + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm test src/ tests/unit 2>&1 | tail -20
git add src/components/site/PortalHeader.tsx src/components/site/PlayerBottomNav.tsx src/components/site/AccountMenu.tsx
git commit -m "feat(theme): tokenizar chrome del portal (header solid, bottom nav, account menu)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Tokenizar /mis-reservas

**Files:**
- Modify: `src/app/(player)/mis-reservas/page.tsx`

**Interfaces:**
- Consumes: tokens (Task 1). La banda dark inline (líneas ~122-169) NO se toca (isla always-dark).

- [ ] **Step 1: `tabClass`** (líneas ~112-117): inactivo `text-slate-600 hover:text-slate-900` → `text-muted-foreground hover:text-foreground`. Activo `bg-emerald-600 text-white` → dejar.

- [ ] **Step 2: Contenedor de tabs** (~172): `border-slate-200 bg-white` → `border-border bg-card`.

- [ ] **Step 3: Empty state** (~183-204): `border-slate-200 bg-white` → `border-border bg-card`; tile `bg-emerald-50 text-emerald-600 ring-emerald-600/15` → + `dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20`; `text-slate-900`→`text-foreground`; `text-slate-500`→`text-muted-foreground`; CTA emerald → dejar.

- [ ] **Step 4: STATUS_CLASSES + DATE_BLOCK_CLASSES + DATE_BLOCK_MUTED** (~64-78): añadir variantes dark a cada entrada. Ej:
```ts
const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  pending_payment: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  completed: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:bg-muted dark:text-muted-foreground dark:ring-border',
  canceled_refunded: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/20 dark:bg-muted dark:text-muted-foreground dark:ring-border',
  canceled_no_refund: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/20 dark:bg-muted dark:text-muted-foreground dark:ring-border',
  no_show: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
}
const DATE_BLOCK_CLASSES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
}
const DATE_BLOCK_MUTED = 'bg-slate-50 text-slate-500 ring-slate-300/40 dark:bg-muted dark:text-muted-foreground dark:ring-border'
```

- [ ] **Step 5: Card `<li>`** (~211-213): `border-slate-200 bg-white` → `border-border bg-card` (mantener hover emerald). Contenido: `text-slate-900`→`text-foreground`; `text-slate-500`→`text-muted-foreground`; `text-slate-700`→`text-foreground`; precio `text-emerald-700`→`text-emerald-700 dark:text-emerald-400`; badge "Turno fijo" `bg-slate-100 text-slate-600 ring-slate-500/20`→`bg-muted text-muted-foreground ring-border`; borde `border-slate-100`→`border-border`; link "Reservar de nuevo" `text-slate-600 hover:bg-emerald-50 hover:text-emerald-700`→`text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300`.

- [ ] **Step 6: Verificación visual** — `/mis-reservas` dark coherente (banda + tabs + cards + estados). Probar tab Historial y empty state.

- [ ] **Step 7: Typecheck + tests + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm test src/ tests/unit 2>&1 | tail -20
git add "src/app/(player)/mis-reservas/page.tsx"
git commit -m "feat(theme): tokenizar /mis-reservas (tabs, cards, estados, empty)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Tokenizar /perfil (page + subcomponentes)

**Files:**
- Modify: `src/app/(player)/perfil/page.tsx`
- Modify: `src/app/(player)/perfil/ProfileForm.tsx`
- Modify: `src/app/(player)/perfil/ActivityStats.tsx`
- Modify: `src/app/(player)/perfil/NotificationPrefs.tsx`
- Modify: `src/app/(player)/perfil/FavoritesList.tsx`
- Modify: `src/app/(player)/perfil/loading.tsx`

**Interfaces:**
- Consumes: tokens (Task 1). `PlayerHeroBand` (la banda) NO se toca (isla always-dark). `TenantCard` se tokeniza en Task 9 (se usa también en /explorar).

- [ ] **Step 1: `perfil/page.tsx`.** `grep -nE "slate-|bg-white|emerald-50|border-slate"` y aplicar tabla A. Avatar fallback (tile con iniciales) ya usa estilo dark esmeralda — si usa `bg-emerald-50/text-emerald-600`, añadir `dark:` (tabla B). Aviso legal `rounded-xl`: `bg-white`→`bg-card`, textos slate→tokens. El bloque `<PlayerHeroBand …>` no se toca.

- [ ] **Step 2: `ProfileForm.tsx`.** Card `bg-white`→`bg-card`, `border-slate-200`→`border-border`. Inputs `rounded-xl bg-white px-3.5 … border-slate-...`→ `bg-background border-border text-foreground placeholder:text-muted-foreground`. Email readonly `bg-slate-50/70`→`bg-muted/40 text-muted-foreground`. SubmitButton emerald → dejar. Labels `text-slate-700`→`text-foreground`.

- [ ] **Step 3: `ActivityStats.tsx`.** Cards `bg-white border-slate-200`→`bg-card border-border`; valor `font-display` → mantener; detalle `text-slate-500`→`text-muted-foreground`; cualquier `text-slate-900`→`text-foreground`.

- [ ] **Step 4: `NotificationPrefs.tsx`** (ya leído). Card (línea ~69): `border-slate-200 bg-white hover:border-emerald-400/40` → `border-border bg-card hover:border-emerald-400/40`. Tile ícono (~72-74): `bg-emerald-50 text-emerald-600`→`bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300`; off `bg-slate-100 text-slate-400`→`bg-muted text-muted-foreground`. Label `text-slate-900`→`text-foreground`; desc `text-slate-500`→`text-muted-foreground`. Switch off `bg-slate-300`→`bg-input`; on `bg-emerald-600`→dejar. Knob `bg-white`→dejar (es el thumb, blanco en ambos). Error `text-red-600`→`text-red-600 dark:text-red-300`. **No tocar copy ni `role`/`aria-label`** (contrato de `notification-prefs.test.tsx`).

- [ ] **Step 5: `FavoritesList.tsx`** (ya leído). Empty (~20): `border-slate-200 bg-white`→`border-border bg-card`; tile `bg-rose-50 text-rose-500 ring-rose-500/15`→ + `dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20`; `text-slate-900`→`text-foreground`; `text-slate-500`→`text-muted-foreground`; CTA emerald → dejar. **No tocar la frase** "Todavía no marcaste complejos favoritos. Tocá el corazón…" (contrato de `profile-favorites.test.tsx`).

- [ ] **Step 6: `perfil/loading.tsx`.** Si usa placeholders `bg-white/[.06]` dark hardcodeados, dejarlos (funcionan en dark) o migrar a `bg-muted animate-pulse` (token, flipa). Recomendado: `bg-muted`.

- [ ] **Step 7: Verificación visual** — `/perfil` dark coherente: banda dark + form/stats/prefs/favoritos en `bg-card` oscuro. Toggle de prefs sigue andando.

- [ ] **Step 8: Typecheck + tests (incluye los de perfil) + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm test tests/unit/notification-prefs.test.tsx tests/unit/profile-favorites.test.tsx 2>&1 | tail -20
git add "src/app/(player)/perfil/"
git commit -m "feat(theme): tokenizar /perfil (page, form, stats, prefs, favoritos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Tokenizar /configuracion

**Files:**
- Modify: `src/app/(player)/configuracion/page.tsx`
- Modify: `src/app/(player)/configuracion/DataExportButton.tsx`
- Modify: `src/app/(player)/configuracion/loading.tsx`

**Interfaces:**
- Consumes: tokens (Task 1). `PlayerHeroBand` no se toca.

- [ ] **Step 1: `configuracion/page.tsx`.** `grep -nE "slate-|bg-white|border-slate|emerald-50|sky-|red-"`. 3 cards: `bg-white border-slate-200`→`bg-card border-border`. Icon-tiles (emerald/sky/red): añadir `dark:` (emerald y red en tabla B; para sky usar `dark:bg-sky-500/10 dark:text-sky-300`). h2 `text-slate-900`→`text-foreground`; descripciones `text-slate-500`→`text-muted-foreground`; chevron animado `text-slate-400`→`text-muted-foreground`. Banda no se toca.

- [ ] **Step 2: `DataExportButton.tsx`.** Pill emerald premium → mantener (acento). Si tiene estados de texto `text-slate-*`, mapear a tokens.

- [ ] **Step 3: `configuracion/loading.tsx`.** Igual criterio que Task 6 Step 6 (`bg-muted` placeholders).

- [ ] **Step 4: Verificación visual** — `/configuracion` dark coherente; los 3 cards con sus tiles legibles.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
git add "src/app/(player)/configuracion/"
git commit -m "feat(theme): tokenizar /configuracion (cards, tiles, export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Tokenizar /eliminar-cuenta

**Files:**
- Modify: `src/app/(player)/eliminar-cuenta/page.tsx`
- Modify: `src/app/(player)/eliminar-cuenta/DeleteAccountForm.tsx`

**Interfaces:**
- Consumes: tokens (Task 1). Página seria/sobria (sin banda flashy) — mantener tono pero en dark.

- [ ] **Step 1: `page.tsx`.** `grep -nE "slate-|bg-white|border-slate|red-|amber-"`. h1 `font-display` mantener, `text-slate-900`→`text-foreground`. Cards `bg-white border-slate-200`→`bg-card border-border`. Avisos rojos/ámbar: añadir `dark:` (tabla B). Textos slate→tokens.

- [ ] **Step 2: `DeleteAccountForm.tsx`.** Botón rojo `bg-red-600 text-white h-12 rounded-xl` → mantener (destructive es legible en ambos; opcional `dark:bg-red-600`). Inputs/labels slate→tokens. Texto de confirmación slate→tokens.

- [ ] **Step 3: Verificación visual** — `/eliminar-cuenta` dark, legible, mantiene la seriedad. El botón destructivo se distingue.

- [ ] **Step 4: Typecheck + tests + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm test src/ tests/unit 2>&1 | tail -20
git add "src/app/(player)/eliminar-cuenta/"
git commit -m "feat(theme): tokenizar /eliminar-cuenta (page + form)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## F2 — Blindar always-dark (a nivel layout) + puente TenantCard

### Task 9: Force-dark en layouts públicos/reserva + tokenizar TenantCard

**Files:**
- Modify: `src/app/(public)/layout.tsx`
- Modify: `src/app/reserva/layout.tsx`
- Modify: `src/app/(public)/explorar/components/TenantCard.tsx`

**Interfaces:**
- Consumes: `.dark` (Task 1), chrome tokenizado (Task 4).
- Produces: layouts público/reserva forzados dark; `TenantCard` tokenizada (sirve en /explorar always-dark y en favoritos toggleable).

- [ ] **Step 1: `(public)/layout.tsx`** — envolver el `PortalShell` en un wrapper `.dark`:

```tsx
import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark">
      <PortalShell>{children}</PortalShell>
    </div>
  )
}
```

- [ ] **Step 2: `reserva/layout.tsx`** — mismo patrón (envolver `PortalShell` en `<div className="dark">`, preservando el comentario existente).

- [ ] **Step 3: `TenantCard.tsx`** — aplicar tabla A/B. Como vive en contexto always-dark (/explorar) y toggleable (favoritos), DEBE usar tokens: `bg-white`→`bg-card`, textos slate→tokens, bordes→`border-border`, acentos emerald/amber→ + `dark:`. (El rating, precio y carrusel: precio `text-emerald-700`→ + `dark:text-emerald-400`.)

- [ ] **Step 4: Verificación de no-regresión de always-dark.** Con `.dark` global aún activo (Task 3), abrir `/explorar`, `/[slug]` (un slug real del seed), `/[slug]/reservar`, `/reserva/<id>/exito`. Expected: TODO dark coherente, header dark, cards dark. **Prueba clave del blindaje:** en devtools, quitar `dark` del `<html>` (simula tema light futuro). Expected: `/explorar` y `/reserva/.../exito` siguen dark (por el wrapper de layout); `/perfil` pasa a light. Re-agregar `dark` al `<html>`.

- [ ] **Step 5: Typecheck + e2e de booking (no romper) + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
git add "src/app/(public)/layout.tsx" "src/app/reserva/layout.tsx" "src/app/(public)/explorar/components/TenantCard.tsx"
git commit -m "feat(theme): force-dark en layouts publico/reserva + tokenizar TenantCard

Wrapper .dark a nivel layout blinda always-dark contra el toggle futuro.
TenantCard tokenizada (puente /explorar <-> favoritos).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## F3 — Toggle de tema (Sistema / Claro / Oscuro)

### Task 10: Instalar next-themes + ThemeProvider

**Files:**
- Modify: `package.json` (dependencia `next-themes`)
- Create: `src/components/theme/ThemeProvider.tsx`
- Modify: `src/app/layout.tsx` (quitar `dark` fijo, agregar `suppressHydrationWarning`, envolver children en `ThemeProvider`)

**Interfaces:**
- Produces: `<ThemeProvider>` (client) que pone/saca `.dark` en `<html>` según tema. `defaultTheme="system"`, `enableSystem`. Consumido por `ThemeToggle` (Task 11) vía `useTheme`.

- [ ] **Step 1: Instalar dependencia**

Run: `pnpm add next-themes`
Expected: `next-themes` aparece en `package.json` dependencies.

- [ ] **Step 2: Crear `src/components/theme/ThemeProvider.tsx`**

```tsx
'use client'

import { ThemeProvider as NextThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * Proveedor de tema (Sistema/Claro/Oscuro). Pone/saca la clase `.dark` en
 * <html>. Default = system: primera visita sigue la preferencia del SO.
 * Las páginas always-dark se blindan con su propio wrapper `.dark` de layout,
 * así quedan oscuras sin importar este tema.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  )
}
```

- [ ] **Step 3: Editar `src/app/layout.tsx`.** (a) quitar `dark` del className del `<html>` (revierte Task 3) y agregar `suppressHydrationWarning`:

```tsx
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${archivo.variable} ${sora.variable}`}>
```

(b) importar y envolver el contenido del `<body>` en `<ThemeProvider>`:

```tsx
import ThemeProvider from '@/components/theme/ThemeProvider'
// …
      <body className="font-sans antialiased">
        <ThemeProvider>
          {/* skip-link + children + Toaster + WebVitalsReporter quedan adentro */}
          <a href="#main-content" className="...">Saltar al contenido</a>
          {children}
          <Toaster />
          <WebVitalsReporter />
        </ThemeProvider>
      </body>
```

- [ ] **Step 4: Verificación de FOUC + default system.**

Run: `pnpm dev`. Con el SO en dark: la app abre dark sin flash. Cambiar el SO a light (o devtools → Rendering → emulate `prefers-color-scheme: light`): las páginas player (`/perfil`) abren light; las always-dark (`/explorar`) siguen dark. Recargar varias veces: sin flash de tema (next-themes inyecta script inline).

- [ ] **Step 5: Typecheck + tests + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm test src/ tests/unit 2>&1 | tail -20
git add package.json pnpm-lock.yaml src/components/theme/ThemeProvider.tsx src/app/layout.tsx
git commit -m "feat(theme): next-themes con default system (Sistema/Claro/Oscuro)

ThemeProvider attribute=class, enableSystem, defaultTheme=system.
Quita el .dark fijo; <html> suppressHydrationWarning anti-FOUC.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Control de toggle (3 estados) en menú + configuración

**Files:**
- Create: `src/components/theme/ThemeToggle.tsx`
- Modify: `src/components/site/AccountMenu.tsx` (agregar item de tema)
- Modify: `src/app/(player)/configuracion/page.tsx` (agregar control de tema en un card)

**Interfaces:**
- Consumes: `useTheme` de next-themes (Task 10).
- Produces: `<ThemeToggle />` (segmented control 3 estados: Sistema/Claro/Oscuro) con guardia de montaje (evita mismatch de hidratación).

- [ ] **Step 1: Crear `src/components/theme/ThemeToggle.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'

const OPTIONS = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
] as const

/**
 * Segmented control de tema (Sistema/Claro/Oscuro). Guardia `mounted` porque
 * el tema resuelto solo se conoce client-side: hasta montar, render neutro
 * para no romper la hidratación (next-themes).
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = mounted ? theme : undefined

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la aplicación"
      className="inline-flex gap-1 rounded-full border border-border bg-muted/40 p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Agregar acceso en `AccountMenu.tsx`.** Antes del separador final (antes del `<form action={signOutAction}>`), agregar una fila no-clickeable con el toggle:

```tsx
        <div className="my-1 h-px bg-border" />
        <div className="px-2 py-1.5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tema</p>
          <ThemeToggle />
        </div>
```

Importar: `import ThemeToggle from '@/components/theme/ThemeToggle'`. (El toggle no debe cerrar el menú al clickear: envolver el `<div>` con `onSelect`/click stop no es necesario porque no es `DropdownMenuItem`.)

- [ ] **Step 3: Agregar control en `configuracion/page.tsx`.** Sumar un card tokenizado (mismo estilo que los otros 3) con título "Apariencia" + `<ThemeToggle />` debajo. Como es Server Component, `ThemeToggle` (client) se importa y usa directamente (boundary client se resuelve solo).

- [ ] **Step 4: Verificación visual + funcional**

Run: `pnpm dev`. En `/configuracion` y en el menú de cuenta: el segmented control muestra el estado actual. Clic en "Claro" → `/perfil`, `/configuracion`, `/mis-reservas` pasan a light; `/explorar` sigue dark. Clic en "Oscuro" → todo dark. Clic en "Sistema" → sigue el SO. Recargar: persiste (localStorage).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
git add src/components/theme/ThemeToggle.tsx src/components/site/AccountMenu.tsx "src/app/(player)/configuracion/page.tsx"
git commit -m "feat(theme): control de tema 3 estados (Sistema/Claro/Oscuro)

ThemeToggle segmented con guardia de montaje; en menu de cuenta + /configuracion.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Test e2e del toggle + verificación final

**Files:**
- Create: `tests/e2e/theme-toggle.spec.ts`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 11), layouts blindados (Task 9).

- [ ] **Step 1: Escribir el test e2e** (requiere sesión de jugador; reusar el helper de auth/seed del proyecto — ver `tests/e2e/` para el patrón de login del jugador, p. ej. `playerLogin` o el storageState existente):

```ts
import { test, expect } from '@playwright/test'
// Reusar el helper de login de jugador del proyecto (ajustar import al real):
// import { loginAsPlayer } from './helpers/auth'

test.describe('Toggle de tema', () => {
  test('togglea superficies de app y respeta always-dark', async ({ page }) => {
    // await loginAsPlayer(page)
    await page.goto('/configuracion')

    // Forzar Claro
    await page.getByRole('radio', { name: 'Claro' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    // Superficie toggleable cambió a light
    await page.goto('/perfil')
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    // Página always-dark: su layout fuerza .dark en un wrapper interno,
    // independiente del <html>. Verificar que el wrapper existe.
    await page.goto('/explorar')
    await expect(page.locator('div.dark').first()).toBeVisible()

    // Forzar Oscuro
    await page.goto('/configuracion')
    await page.getByRole('radio', { name: 'Oscuro' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
```

- [ ] **Step 2: Correr el test e2e**

Run: `pnpm test:e2e theme-toggle` (o el comando Playwright del proyecto; ver `package.json` scripts)
Expected: PASS. Si el selector de login difiere, ajustar al helper real antes de dar por bueno.

- [ ] **Step 3: Verificación final completa**

```bash
pnpm typecheck 2>&1 | grep -v "TurnoGol-audit-f02/"
pnpm lint
pnpm test 2>&1 | tail -30
```
Expected: typecheck limpio, lint limpio, unit verdes. Checklist visual manual:
- Dark (default SO dark): home, /explorar, /[slug], /reservar, /exito, /ingresar, /verify, /mis-reservas, /perfil, /configuracion, /eliminar-cuenta → todas dark coherentes.
- Light (toggle Claro): /mis-reservas, /perfil, /configuracion, /eliminar-cuenta → light limpias; /explorar, /[slug], /reservar, /exito → SIGUEN dark.
- Contraste de texto AA en ambos temas (revisar `text-muted-foreground` sobre cards).

- [ ] **Step 4: Commit final**

```bash
git add tests/e2e/theme-toggle.spec.ts
git commit -m "test(theme): e2e del toggle (flip toggleable, blindaje always-dark)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** F0 (1→3) antes que F1 (4→8) antes que F2 (9) antes que F3 (10→12). Task 3 deja dark fijo; Task 10 lo revierte hacia next-themes.
- Tras Task 3 y hasta terminar F1, las páginas player se ven "mitad dark" (shell dark, cards claras) — es WIP esperado, no un bug.
- Si una superficie usa una clase clara no listada en la tabla, mapear por analogía (superficie→`bg-card`/`bg-muted`, texto principal→`foreground`, secundario→`muted-foreground`, borde→`border`) y, si es acento de marca, añadir `dark:`.
- No tocar lógica de servidor, queries, ni copy salvo lo indicado. Es refactor visual.
