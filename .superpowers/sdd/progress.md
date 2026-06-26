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
