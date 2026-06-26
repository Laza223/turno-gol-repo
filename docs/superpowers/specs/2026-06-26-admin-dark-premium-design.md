# Admin Dark-Premium — Design Spec

**Fecha:** 2026-06-26
**Branch (a crear):** `feat/admin-dark-premium`
**Antecedente:** PR #24 (`feat/player-public-dark-mode`) tokenizó jugador + público y agregó el toggle global 3-estados (Sistema/Claro/Oscuro, default Sistema) vía `next-themes` (`.dark` en `<html>`).

## 0. Objetivo

Llevar **todo el lado operativo** (admin/staff/super-admin/onboarding/auth-staff/select-tenant) a:

1. **Tema adaptativo full-toggle**: cada superficie se ve bien en **light Y dark**, siguiendo el toggle global. Incluye convertir el sidebar admin + sidebar super-admin (hoy dark-por-diseño con slate crudo) a **tokens adaptativos** y agregar el **toggle de tema al header admin** (hoy solo vive en el `AccountMenu` del jugador).
2. **Upgrade de UX/UI premium**, NO solo cambio de color: animaciones, glassmorphism (dark) / elevación premium (light), estilo de componentes moderno, al nivel del portal público — para que **toda la plataforma comparta un concepto visual unificado**.

Decisiones del usuario (2026-06-26):
- Modelo admin = **"Sigue toggle, full"** (todo flipa, incluido el sidebar).
- `para-complejos` (B2B landing) = **queda always-dark** (excepción, ya es dark-premium; no puede ir light por overlays sobre fotos).
- Premium obligatorio en cada superficie nueva del plan.

## 1. Conflicto de docs a resolver (⚠️ bloqueante de coherencia)

`docs/spec/design-system/MASTER.md` (doc20, generado 2026-04-27) está **obsoleto**. Su §11 Anti-Patterns dice literal:
- *"Dark mode default → Light mode only (v1)"*
- *"Glassmorphism / heavy blur effects → Clean flat + subtle shadows"*

Ambas reglas **contradicen** el rediseño dark-premium (PR #24) y esta directiva. **Acción:** actualizar doc20 al lenguaje nuevo (dark como first-class, glass permitido en el sistema premium, `font-display` extendido más allá de /explorar) como tarea del plan. Sin esto, el design-system de referencia miente.

## 2. Arquitectura de tema (ya existe, se reutiliza)

`src/app/globals.css` ya define `:root` (light) + `.dark` (dark) con 23 tokens HSL (`--background`, `--foreground`, `--card`, `--muted`, `--accent`, `--border`, `--ring`, `--primary` emerald, `--success`, `--warning`, etc.). Tailwind `darkMode:['class']`. El trabajo es:
- Reemplazar slate/white crudos por **clases semánticas** (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `hover:bg-accent`) que flipan solas.
- Acentos de marca/semánticos (emerald/red/amber/violet/sky/blue) → mantener clase light + agregar `dark:` sibling (convención PR #24). **Nunca** neutralizar un color semántico a token gris.

## 3. Lenguaje premium theme-adaptive (el corazón del upgrade)

Mismo "alma" que el portal, tuneada por tema. Se materializa en **primitivas compartidas** (no clases sueltas repetidas):

### 3.1 Motion
- **`Reveal`** (ya existe, `src/components/site/Reveal.tsx`): reutilizar para entrada fade-up con stagger (`delay`) en grillas de cards, filas de tablas (primeras N), secciones. Respeta `prefers-reduced-motion`.
- **Micro-interacciones**: hover-lift `hover:-translate-y-0.5` + `hover:shadow-lg`, `active:scale-[0.98]` en CTAs, `group-hover:scale-105` en imágenes/icon-halos. Todo `transition-[...] duration-150/200` + `motion-reduce:` guard.
- Modales/dropdowns: ya traen `animate-in` de shadcn — verificar y reforzar (fade+zoom+slide).

### 3.2 Superficies (glass dark / elevación light)
Primitiva **`<PremiumCard>`** (o utilidad `.card-premium`):
- **Light**: `bg-card` + `border-border` + sombra suave en capas (`shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_-12px_rgba(2,6,23,.12)]`), hover → glow emerald sutil + lift.
- **Dark**: glass `dark:bg-white/[.03] dark:border-white/[.08]` + `dark:backdrop-blur-sm` + sombra grande (`dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,.9)]`), hover → `dark:hover:border-emerald-500/40` + glow `rgba(16,185,129,.35)`.

### 3.3 Page header band premium
Primitiva **`<PageHeader title subtitle actions>`**: banda superior con título `font-display`, subtítulo `text-muted-foreground`, slot de acciones. Fondo theme-adaptive:
- Light: gradiente slate sutil + tinte emerald.
- Dark: `slate-950` + radial glow emerald (como hero del portal).
Reemplaza los `<h1 className="text-slate-900">` sueltos de cada página.

### 3.4 Stat/KPI cards
Primitiva **`<StatCard>`** (refactor de `metric-card.tsx` + `sa-metric-card.tsx`): icon-halo emerald, valor `font-display tabular-nums`, delta semántico (emerald↑/red↓), hover lift. Theme-adaptive.

### 3.5 Tablas premium
Patrón compartido: contenedor `rounded-xl` glass/elevado, **header sticky** con blur, hairlines `divide-border`, hover `hover:bg-accent/muted`, numéricos `text-right tabular-nums`. Aplica a reservas, caja, jugadores, staff, reportes, super-admin.

### 3.6 Tipografía display
Extender `font-display` (Archivo, ya cargada) a títulos de página admin + numerales clave (KPIs, montos de caja/reportes). Actualizar doc20 §2 (hoy restringe Archivo a /explorar).

## 4. Puntos delicados (del discovery, no flip ciego)

### 4.1 Colores semánticos — preservar hue + dar `dark:` sibling
- **Booking status** (grilla `BookingCard.slotVisual()` + `GRID_LEGEND` + `reservas/BookingListItem` `STATUS_VISUALS`): azul=reservado, violeta=abonado, amber=seña pendiente, rojo=no-show, slate=bloqueado/completada. La grilla **ya** tiene siblings dark WCAG-tuneados — **mantener exactos**, NO colapsar a `bg-card`. `GRID_LEGEND` debe seguir byte-a-byte con `slotVisual()` (comentario en código lo exige).
- **Finanzas caja**: emerald=ingreso, red=gasto, amber=dif. arqueo. `CATEGORY_BADGE` (5 tints: booking/product_sale/operating_expense/no_show_correction/other). Dark variants a mano.
- **Status tenant super-admin**: 3 mapas separados (`tenant-status-badge`, `tenants/status-badge`, court pill inline). Los neutros slate (canceled/churned/deleted) son los que peor leen en dark.
- **Roles staff**: violet=admin, sky=manager. **Abonado**: violet type-marker. **Libre/Ocupado**: green/amber (unificar las 2 implementaciones — raw span vs Badge variant).
- **SaaS lifecycle banner** (`status-banner`): trial=emerald, past_due/suspended=red, degraded=amber.

### 4.2 Charts (inline hex, NO flipan con `.dark`)
- **Recharts** (`metricas/MetricsDashboard.tsx`): `CartesianGrid stroke #e2e8f0`, axis tick `#64748b`, Bar/Line `#059669`, Tooltip blanco default. → Theme-aware vía hook que lee CSS vars (o `useTheme()` de next-themes) y pasa colores dark/light. Tooltip con `contentStyle` adaptativo.
- **PricingGrid heat-map** (`canchas/PricingGrid.tsx`): `backgroundColor` rgb() interpolado inline (HEAT_LO emerald-50 → HEAT_HI emerald-700). → rampa dark deliberada (no token flip).
- **EmptyReportIllustration** (`reportes`): SVG inline `fill-slate-50/stroke-slate-200/fill-emerald-*`. → `dark:fill-*`/`dark:stroke-*` a mano.
- **TopSlots** (`metricas`): mini-barra hecha a mano `bg-slate-100` track + `bg-emerald-500` fill → `bg-muted` + brand.

### 4.3 Controles nativos
`<input type=date/time/number>`, `<select>`, `<input type=checkbox/radio>` (settings, onboarding, staff, abonados) renderizan chrome claro del navegador. → regla global `.dark { color-scheme: dark }` (o `color-scheme: light dark` en `:root`) + `accent-color` adaptativo. No basta Tailwind.

### 4.4 CSS-level
`.content-area-gradient` (fondo del área de contenido admin) es gradiente light fijo **sin `.dark` sibling** → agregar `.dark .content-area-gradient` (espejo del patrón `.dark .player-shell-bg`).

## 5. Excepciones (NO tocar / mantener)
- `BookingReceipt` (#booking-receipt) + `@media print` en globals.css → debe imprimir en papel, queda bg-white/text-slate.
- `BookingQR` (fill #ffffff/#0f172a, escaneabilidad), `BookingMiniMap` (Leaflet/OSM 3rd-party; ya hay overrides `.dark .leaflet-*`).
- `impersonation-banner` (bg-red-600 text-white, alerta semántica) → queda rojo en ambos temas.
- `para-complejos` + `BusinessHeader`/`BusinessFooter` + `(business)/layout.tsx` → **always-dark** (excepción). A lo sumo limpieza menor; NO hacer theme-adaptive.
- shadcn `components/ui/*` → ya token-aware, no re-tocar.
- CTAs emerald `bg-emerald-600 text-white` → marca, se mantienen (+ glow/active premium).

## 6. Toggle de tema en admin
Hoy el `ThemeToggle` (`src/components/theme/ThemeToggle.tsx`, radiogroup 3-estados) vive en el `AccountMenu` del jugador + `/configuracion`. Agregarlo al **`admin-header.tsx`** (y al header super-admin) para que el staff pueda cambiar tema. Reusar el componente existente.

## 7. Criterios de aceptación
- Toggle Sistema/Claro/Oscuro: cada superficie admin se ve coherente y premium en los 3 estados (incl. sidebar, que ahora flipa).
- Sin `bg-white`/slate crudo de superficie sin `dark:` sibling o token (salvo excepciones §5).
- Colores semánticos legibles (AA) en dark, hue preservado.
- Charts theme-aware (no caja blanca de tooltip ni grid invisible en dark).
- Controles nativos en dark (color-scheme).
- `pnpm typecheck` exit 0; sin `any`; unit verdes (salvo pre-existentes); e2e toggle extendido a una vista admin.
- doc20 actualizado al lenguaje nuevo.
- Premium: cada superficie usa las primitivas compartidas (PageHeader/PremiumCard/StatCard/tablas/Reveal), no solo tokens planos.
