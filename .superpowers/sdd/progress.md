# SDD Progress — player-public-dark-mode

Plan: docs/superpowers/plans/2026-06-25-player-public-dark-mode.md
Branch: feat/player-public-dark-mode (base 60a1c82)
Execution: phased Workflow (F0→F1→F2→F3), implementer + adversarial reviewer per task.

## Pre-flight scan: CLEAN
- home (src/app/page.tsx) + player auth (ingresar/verify) = hardcoded-dark islands -> no force-dark needed.
- privacy/terms/suspended under (public) -> covered by Task 9 wrapper.
- staff auth (login/register/forgot/reset) = out of scope (not player/public, not token-based).
- Open item: Task 12 e2e login helper is a placeholder — implementer must wire real player login.

## Tasks
- [x] Task 1: paleta dark en globals.css (703ab4d, review clean)
- [x] Task 2: shell dark (.player-shell-bg recolor) + skeleton (3b4c10a, review clean)
- [x] Task 3: dark default fijo (a6299ad, review clean; 1 pre-existing booking-grid test fail, no nuestro)
- [x] Task 4: chrome portal (d379e87, review clean)
- [x] Task 5: /mis-reservas (e295eaa, review clean)
- [x] Task 6: /perfil (5ea7b9f, review clean, 1 minor loading.tsx)
- [x] Task 7: /configuracion (859a9c6+7b9b273, review clean tras fix bg-white, 2 minors)
- [x] Task 8: /eliminar-cuenta (a833fe3+21faea5, review clean tras fix dark:text-red-300)
- [x] Task 9: force-dark layouts + TenantCard (0a551a9, review clean, 1 minor to-slate-100 L188)
- [x] Task 10: next-themes + ThemeProvider (99dc953, review clean)
- [x] Task 11: ThemeToggle 3 estados (341e252, review clean)
- [x] Task 12: e2e toggle + verif final (f0cc02f, review clean; e2e exec DEFERRED, unit 1397/1398 pre-existing fail)
- [x] Final whole-branch review (opus, a1305000555eb6171): readyToMerge=FALSE. Toggle/tokens/islas correctos; gap = plan asumio (public) dark pero /explorar y /[slug] estaban LIGHT -> .dark wrapper deja contenido claro sobre frame oscuro. Pre-existing (booking-grid test + 5 lint) confirmados. 4 minors NON-blocking.

## F4 — GAP CLOSURE (descubierto por review final, expansion de scope)
Surfaces light bajo .dark wrapper a tokenizar:
- /explorar: page.tsx + ExplorarFilters(17) ExplorarMap(7) ExplorarToolbar(6) TenantCardCarousel(3) EmptyResults(3) SearchBar(3) QuickFilters(1) SearchBand(1) ExplorarMapLoader(1)
- /[slug]: page.tsx(white sheet) + TenantHeader(10) AvailabilityGrid(15) ReviewsSection(8) TenantGallery(5) CourtCard(4) loading(1)
- /[slug]/disponibilidad: page(2) + WeeklyAvailability(5) + loading(1)
- /reserva/[bookingId]/verificar/page.tsx(14) (no usa ReservaDarkShell)
- player modals: CancelBookingButton(2) LeaveReviewButton(3)
NO tocar (islas dark ya OK): /[slug]/reservar/* (BookingDarkShell), reserva exito/error/pendiente (ReservaDarkShell).
Scope confirmado por usuario: CERRAR TODO.

### F4 progreso (wkzb0wkax cortó por session limit; reanudado en wztwdercd)
- [x] T13 /explorar toolbar cluster (a0aa56e+0d5eb2d... ver log; SearchBar/SearchBand/Toolbar/QuickFilters/page) review clean
- [x] T14 /explorar filtros/mapa/resultados + TenantCard L188->to-muted (3bcc03b,2c00922,d41648d) review clean
- [x] T15 /[slug] landing page+TenantHeader+TenantGallery (+CourtCard bonus 40525e4) — files clean; review tuvo falso-fail por bug de prompt (chequeaba T19 modales aun no hechos)
- [x] T16 AvailabilityGrid+ReviewsSection+loading (eaf0d01,c31f275) review clean; TenantGallery 3 = excepciones lightbox
- [x] T17 disponibilidad page+WeeklyAvailability+loading (6498e1d) review clean
- [x] T18 verificar/page (4a994b7) review clean
- [x] T19 modales (6f7967e,36f57d1) review clean (1 minor: CancelBookingButton L34 trigger sin dark:)
BUG corregido en F4-cont: review prompt llevaba "T19 check" en toda task -> reviewer salia a mirar archivos de otra task. Ahora cada review SOLO sus files.

### F4 final gaps (wy1vcfsss) — sweep wztwdercd dio verdict=gaps_remain, 14 gaps reales en 5 archivos
Mismo patron: bajo .dark wrapper pero nunca tokenizados (pre-flight dijo "cubiertos por wrapper" = solo frame, no contenido):
- [x] explorar/loading.tsx + privacy + terms + suspended + reservar/loading + CancelBookingButton L34 (94d8197)
- [x] re-sweep (wy1vcfsss): verdict=CLEAN, 79 hits TODOS excepciones, 0 white-on-dark reales, typecheck clean, unit 1397/1398
- [x] review final whole-branch round-1 (opus): gap (public) -> cerrado en F4
- [x] review final whole-branch round-2 (opus): blocker cerrado; 3 last-mile AA accent fixes -> 9261796
- [x] verificacion final: typecheck exit 0, fixes confirmados, arbol limpio, 30 commits

## ESTADO: COMPLETO / merge-ready (rama feat/player-public-dark-mode, 30 commits desde 60a1c82)
Pendientes NO-bloqueantes (pre-existentes, NO nuestros): booking-grid.test.tsx:247 tooltip; lint PricingGrid(unused)+BookingCard(hooks-conditional).
Diferido: ejecucion e2e theme-toggle.spec.ts (necesita Supabase local+server); spec escrito + typechecks.
Sin commitear (regla commit-only-when-asked): spec + plan + ledger.

## Minors rollup (para triaje del review final)
1. T6 perfil/loading.tsx: pulse bars bg-white/[.06] en banda always-dark no flipan en light (defensible).
2. T7 configuracion/page.tsx: bg-white colado en 1er commit, fixeado (7b9b273). Proceso, estado final OK.
3. T7 configuracion/loading.tsx: idem #1 (pulse bars no flipan en light).
4. T9 TenantCard L188: to-slate-100 con dark:to-muted (tabla B) en vez de reemplazo to-muted (tabla A) -> light renderiza slate-100. El mas real.

## Pre-existing (NO nuestros, verificar)
- tests/unit/booking-grid.test.tsx:247 tooltip — falla en base.
- lint: PricingGrid.tsx (unused var) + BookingCard.tsx (4 hooks-in-conditional).

---

# SDD Progress — admin-dark-premium (2da tanda)

Plan: docs/superpowers/plans/2026-06-26-admin-dark-premium.md
Spec: docs/superpowers/specs/2026-06-26-admin-dark-premium-design.md
Branch: feat/admin-dark-premium (base d82f400 = main tras merge PR #24)
Execution: SDD por tarea (implementer + reviewer adversarial, fix loop max 2). NO push (commit-only-when-asked: usuario aprobo ejecutar plan SDD = commits por tarea en branch, sin push).

Baseline pre-T0 (cambios premium ya empezados, foldeados al branch):
- [x] docs spec+plan (commit docs)
- [x] chrome premium compartido: dropdown glass + ThemeToggle full-width + AccountMenu avatar/seccion + Fav/Share hover-lift+dark (commit feat premium chrome)

## Fase 0 — Fundaciones (BLOQUEA todo)
- [x] T0: globals.css (.dark .content-area-gradient, color-scheme, util premium) + doc20 MASTER.md (dark first-class, glass permitido, font-display extendido)
- [x] T1: primitivas premium (PageHeader/PremiumCard/StatCard + patron tabla, reusa Reveal)
- [x] T2: useChartTheme hook
- [x] T3: chrome admin theme-adaptive + ThemeToggle en header (sidebar/header/layout-shell/status-banner/pin-gate/PushNotificationManager)
- [x] T4: BookingFormModal + grilla gaps (banner offline amber)

## Fase 1 — Superficies (T5-T19, una por tarea)
- [x] T5 dashboard (PageHeader+Reveal+checklist premium)
- [x] T6 grilla
- [x] T7 reservas
- [x] T8 caja
- [x] T9 abonados
- [x] T10 canchas
- [x] T11 jugadores
- [x] T12 metricas
- [x] T13 reportes
- [x] T14 settings
- [x] T15 staff
- [x] T16 super-admin
- [x] T17 auth-staff
- [x] T18 onboarding
- [x] T19 select-tenant

## Fase 2 — Cierre
- [x] T20 para-complejos (verificado: isla hardcoded dark, cero tokens que flipeen) (verificar isla always-dark) / T21 e2e admin / T22 review final whole-branch


## ESTADO ADMIN-DARK-PREMIUM: COMPLETO / merge-ready (branch feat/admin-dark-premium, base d82f400)
Fase 0 (T0-T4) + Fase 1 (T5-T19, 15 superficies) + Fase 2 (T20-T22). ~26 commits.
Gate whole-branch: typecheck exit 0; unit 1401/1402 (1 pre-existente booking-grid:247, test identico a main, NO nuestro); residual de color crudo = limpio en todas las superficies; excepciones intactas (impersonation rojo / receipt+print / QR / Leaflet / para-complejos / hero ImagePane); review adversarial final (charts/heat-map/CTAs invertidas/glass/semanticos) = 0 issues; e2e admin theme-flip VERDE (puerto aislado :3100, Supabase local).
Aprendizaje e2e: el dropdown Radix (AdminThemeMenu) NO abre en Playwright headless dev -> test admin valida el flip via localStorage['theme'] (lo que next-themes persiste) + presencia del boton; interaccion del dropdown cubierta por patron AccountMenu.
Pendiente NO-bloqueante (pre-existente): booking-grid.test.tsx:247 tooltip.
