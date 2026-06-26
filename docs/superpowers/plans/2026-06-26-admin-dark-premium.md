# Admin Dark-Premium — Implementation Plan

**Spec:** docs/superpowers/specs/2026-06-26-admin-dark-premium-design.md
**Branch:** `feat/admin-dark-premium` (base = main tras merge de PR #24)
**Ejecución:** Subagent-Driven Development por fases (implementer + reviewer adversarial por tarea, fix loop, review final whole-branch). Ledger en `.superpowers/sdd/progress.md`.

**Regla por tarea (TODAS):** cada superficie recibe (a) tokenización theme-adaptive (light+dark, sigue toggle) **y** (b) upgrade premium usando las primitivas compartidas de Fase 0 (PageHeader / PremiumCard / StatCard / tablas premium / Reveal / micro-interacciones). NO es solo cambio de color. Colores semánticos: hue + `dark:` sibling, nunca neutralizar. `pnpm typecheck` exit 0 + sin `any` tras cada tarea.

---

## Fase 0 — Fundaciones y primitivas compartidas (BLOQUEA todo lo demás)

- **T0 · CSS + doc20**
  `globals.css`: agregar `.dark .content-area-gradient` (espejo de `.dark .player-shell-bg`); regla `color-scheme` (`:root { color-scheme: light }` / `.dark { color-scheme: dark }`) para controles nativos; keyframes/utilidades premium si hacen falta (glow, lift). Actualizar `docs/spec/design-system/MASTER.md` (doc20): dark first-class, glass permitido en sistema premium, `font-display` extendido a títulos/numerales admin, reemplazar las 2 anti-patterns obsoletas.

- **T1 · Primitivas premium compartidas**
  Crear `src/components/admin/PageHeader.tsx` (banda título `font-display` + subtítulo + slot acciones, fondo theme-adaptive light gradient / dark radial-glow), `src/components/admin/PremiumCard.tsx` (o utilidad `.card-premium` en globals: light elevación+sombra capas / dark glass white-alpha+blur+glow+lift), `src/components/admin/StatCard.tsx` (refactor de `dashboard/metric-card.tsx` + `super-admin/_components/sa-metric-card.tsx`: icon-halo, valor `font-display tabular-nums`, delta semántico, hover lift). Reusar `Reveal`. Documentar el patrón de tabla premium (header sticky blur, `divide-border`, hover, tabular). Tests de presentación donde aplique.

- **T2 · Chart theme hook**
  `src/components/admin/useChartTheme.ts` (lee tema vía `next-themes`/CSS vars → devuelve `{grid, axis, series[], tooltip}` para recharts). Base para métricas.

- **T3 · Chrome admin theme-adaptive + toggle**
  `admin-sidebar.tsx` (slate crudo → tokens adaptativos, activo emerald se mantiene), `admin-header.tsx` (glass theme-adaptive + **montar `ThemeToggle`**), `admin-layout-shell.tsx` (seam header/contenido), `status-banner.tsx` (semántico trial/past_due/degraded con dark siblings), `pin-gate.tsx`, `admin/PushNotificationManager.tsx`. `impersonation-banner.tsx` queda rojo (no tocar salvo verificar).

- **T4 · BookingFormModal + grilla gaps**
  `booking/BookingFormModal.tsx` (Dialog bg-white + select/inputs/textarea/botones → tokens + dark; campos nativos), `BookingGrid.tsx` banner OFFLINE amber + tag `(offline)` slate sin sibling. Resto de la grilla (`BookingCard`/`WeekStrip`/`BookingPopover`) ya dark — solo verificar + aplicar premium (Reveal/hover) sin romper `slotVisual()`/`GRID_LEGEND`.

---

## Fase 1 — Superficies (una por tarea, secuencial)

- **T5 · dashboard** (`(admin)/dashboard/page.tsx`, `dashboard/metric-card.tsx`→StatCard, `dashboard/onboarding-checklist.tsx`): PageHeader, StatCards premium, checklist con estados done/pending semánticos + Reveal stagger.
- **T6 · grilla** (`(admin)/grilla/*` page/loading/error): PageHeader, premium en chrome de grilla, loading skeleton tokens. (Celdas de estado ya cubiertas en T4.)
- **T7 · reservas** (`(admin)/reservas/**`, 8 archivos): tablas premium + `BookingListItem` `STATUS_VISUALS` (hue+dark, consistente con grilla), toolbar/segmented controls (reemplazar idiom "white pill" por raised tokenizado), detalle + charges (emerald/amber money-state).
- **T8 · caja** (`(admin)/caja/**`): finanzas semánticas (emerald/red/amber) + `CATEGORY_BADGE` (5 tints dark), `CloseDayButton` (bg-slate-900 repensar), `CanteenQuickSale` tiles premium, mobile-list + desktop-table en lockstep. Receipt = excepción.
- **T9 · abonados** (`(admin)/abonados/**`, 5 archivos): unificar badges Libre/Ocupado, forms/dialogs tokens, pills filtro (idiom invertido), warnings amber dark.
- **T10 · canchas** (`canchas/CourtList/CourtForm/PricingGrid`): cards premium, status badges, **heat-map rampa dark** (inline rgb → dark-aware), sticky cells opacas en dark, empty-price amber.
- **T11 · jugadores** (`(admin)/jugadores/**`, 4 UI): tablas/cards premium, badges deuda(red)/sin-deuda(emerald)/saldo, forms inline (card vs nested `bg-muted`).
- **T12 · métricas** (`metricas/MetricsDashboard` + loader + page + `pin-gate` ya en T3): cards premium, **recharts con `useChartTheme`** (grid/axis/series/tooltip), TopSlots `bg-muted`+brand, NoShow/System status semántico.
- **T13 · reportes** (`(admin)/reportes/*`): KPI premium, delta emerald/red, **EmptyReportIllustration SVG dark fill/stroke**, tablas premium. (EmptyState/ErrorState/PinGate ya en shared/T3.)
- **T14 · settings** (`(admin)/settings/**`, 7 UI): tab-nav (hoist o repetir), cards premium, status red/emerald/amber alerts dark, **controles nativos** (date/time/radio), badge "Conectado".
- **T15 · staff** (`(admin)/staff/**`, 5 UI): tabla premium + role badges (violet/sky) + status (green/slate) + invite dialog (radio nativo, has-checked tint dark), loading lockstep.
- **T16 · super-admin** (`(super-admin)/**` ~10 UI + `super-admin-layout-shell`): sidebar violet → tokens adaptativos, header/main, 3 mapas status badge dark, violet brand + emerald CTA, support-actions destructive red, tablas premium. Impersonation-banner queda rojo.
- **T17 · auth-staff** (`(auth)/{login,register,forgot-password,reset-password}/**`): glass cards theme-adaptive (light: elevación / dark: glass), gradientes de fondo dark sibling, hero ImagePane **queda dark** (excepción white-on-photo), chips emerald success, error red dark, `hover:bg-white`→token.
- **T18 · onboarding** (`onboarding/**`, 5 UI): shell + steps tokens + premium, **controles nativos** (time/select/checkbox), callouts emerald info/success dark, stepper gradient brand, Logo call-site props.
- **T19 · select-tenant** (`select-tenant/page.tsx`): card premium, error red dark, accents emerald. (Low.)

---

## Fase 2 — Cierre

- **T20 · para-complejos** (excepción): verificar que la isla always-dark sigue intacta tras los cambios globales (toggle no debe afectarla); limpieza menor opcional de raw slate → tokens dark fijos. NO theme-adaptive.
- **T21 · e2e** : extender `theme-toggle.spec.ts` (o nuevo spec) a una vista admin (p.ej. `/dashboard` o `/caja`) con `adminStorageState`: verificar que flipa light/dark y que el toggle del header admin funciona.
- **T22 · Review final whole-branch** (modelo más capaz): spec compliance + premium consistency + AA + sin regresión de semánticos + charts/native/excepciones. Fix loop. Luego `superpowers:finishing-a-development-branch`.

---

## Notas de ejecución
- **Orden estricto**: Fase 0 (T0–T4) antes que cualquier superficie — las superficies consumen las primitivas.
- **No paralelizar implementers** (conflictos de commit). Reviewer adversarial por tarea, máx 2 rounds de fix.
- **Excepciones list** (no tokenizar): receipt/print, QR, Leaflet, impersonation-banner, para-complejos, shadcn ui/*, hero ImagePane auth, CTAs emerald.
- **Verificar, no asumir**: la grilla ya está ~90% dark — diff antes de tocar; mantener `slotVisual()`↔`GRID_LEGEND` en sync.
- Pre-existentes (no nuestros): `booking-grid.test.tsx:247`, lint `PricingGrid`/`BookingCard` — T10/T6 pueden cerrarlos de paso.
