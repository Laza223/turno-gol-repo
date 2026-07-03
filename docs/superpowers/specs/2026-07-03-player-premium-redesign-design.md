# Rediseño premium del lado jugador — landing · explorar · checkout

**Fecha:** 2026-07-03
**Alcance:** `src/app/page.tsx` (+ site components), `(public)/explorar/*`, `(public)/[slug]/reservar/*`, `reserva/[bookingId]/*`.
**Ley:** `MASTER.md v2` (manda en color/contraste/motion), `pages/explorar.md` (estructura Matchday), `pages/player-area.md` (shell/continuidad). Donde el doc viejo contradice al MASTER v2 (hero "siempre clara", emerald-600 como texto AA), gana el MASTER.
**No se toca:** handlers, server actions, data fetching, URLs, selectores e2e, SEO/JsonLd.

---

## 1. Problema

El lado jugador migró a tokens pero quedó en dos mundos:

1. **Landing y checkout dark-locked** (hex inline, `#020617` fijo): en light mode son bloques negros incrustados en un portal claro — el "salto de tema" que §13.6 declaró bug. La Fase E diferida.
2. **Explorar theme-adaptive pero genérico**: la banda hero es slab oscuro fijo, la firma "líneas de cal" (pages/explorar.md §1) quedó relegada al empty state, y los CTAs usan `bg-emerald-600`+blanco (3,8:1 — viola §2.4).

Meta: **una sola personalidad "La Previa"** (§1 MASTER) con dos climas — **light = mediodía de partido** (crema emerald + elevación en capas), **dark = partido nocturno** (slab + glass + glow neón). Premium en ambos, cero pantalla que no flipe.

## 2. Principios de ejecución

- **Un lenguaje, dos climas.** Toda superficie hero deriva de `.player-hero-band` (ya dual). Nada de inventar sombras inline: receta nueva → `globals.css` con par light/dark (§4.3).
- **CTA = token.** Todo CTA primario pasa a `bg-primary text-primary-foreground` (light emerald-700/blanco 5,5:1 · dark emerald-500/slate-950 7,9:1). El "verde eléctrico sobre negro" del dark es más PedidosYa que el emerald-600 actual, y es AA.
- **La firma es la cancha.** PitchLines (líneas de cal) sube de empty-state a motivo estructural: hero landing light, banda explorar light, fondo del comprobante. En dark las líneas van white-alpha tenue (retícula nocturna).
- **Micro-feedback en todo lo tocable:** `active:scale-[0.98]` (100ms §5.3) en CTAs, chips, pills y cards; lift+glow solo en hover de cards (`.card-premium-interactive` ya lo da).
- **Celebración una sola vez** (§5.3): el éxito reemplaza el `animate-ping` infinito por un ring que se disipa 1 vez (`animate-slot-pulse`, ya existe).
- **§8 es bloqueante:** muere `formatARS` local del checkout (→ `formatArs` único), muere la fecha ISO del éxito (→ "viernes 3 de julio"), player sin decimales.

## 3. Landing `/` — "la vidriera"

Estructura y copy se conservan (hero + buscador, destacados, cómo funciona, stats, banner dueños). Cambia la piel:

| Pieza | Hoy | Decisión | Por qué |
|---|---|---|---|
| Fondo página | `#020617` inline | `.landing-hero` receta dual: light crema emerald→blanco con glows emerald fuertes; dark actual | Es la pantalla de confianza inicial; en light hoy directamente no existe |
| Foto hero + foto how-it-works | opacity fija | visibles **solo en dark** (`hidden dark:block`); en light las reemplazan líneas de cal `PitchLines` tenues | La foto nocturna ensucia el clima claro; la cancha de cal ES la identidad diurna |
| Nav overlay | glass oscuro inline | `.overlay-nav` receta dual (light: blanco/90 blur + borde; dark: actual) + **fix §13.5**: paddings/gaps mobile para que "Ingresar" no desborde a 375px | Deuda declarada P1.5 |
| Titular | blanco fijo + gradiente hex | `text-foreground` + `.hero-accent-text` (ya dual) | flip gratis |
| Pill "Disponibilidad en tiempo real" | verde sobre oscuro | receta dual `.live-pill` (light: emerald-50 + texto emerald-800; dark: actual) | AA §2.4 sobre claro |
| Tarjeta buscador (HeroSearch) | blanca fija + inputs `bg-white` hardcoded | `.search-card` dual (light: blanca elevada + glow suave; dark: glass slab) + inputs tokenizados (`bg-background border-border text-foreground`) | en dark una tarjeta blanca gigante grita; inputs deben flipar |
| CTA "Buscar canchas" | `bg-emerald-600`+blanco | `bg-primary` | AA + neón dark |
| Mockup card reserva | glass oscuro inline | `.mockup-card` dual: light blanca elevada con cover emerald claro; dark actual. Slots con clases duales | es el "producto en acción": debe demostrar el tema activo |
| FeaturedComplexCard | dark fija + `onMouseEnter` mutando `style.boxShadow` | `card-premium card-premium-interactive` + tokens + chips duales; muere el handler JS de sombra (CSS hover lo hace) | menos JS, flip gratis, patrón canónico §6.4 |
| How-it-works cards | slab oscuro inline | `.card-premium` + `.icon-halo` (ambas ya duales) + numeral fantasma `text-foreground/[.04]` | recetas existentes alcanzan |
| Stats band | gradiente emerald oscuro inline | `.stats-band` dual (light: emerald-100→50 elevada; dark: actual + glow). Numerales `hero-accent-text` en light para contraste | los KPI gradiente blanco→verde son ilegibles sobre claro |
| Owner banner | slab oscuro inline | `.cta-band` dual + CTA `bg-primary` | ídem |
| SiteFooter | `bg-slate-950` fijo | tokens (`bg-card border-border text-muted-foreground`) — flipa con el resto | era el último slab fijo del shell |

## 4. `/explorar` — "Matchday" en ambos climas

Estructura intacta (chips sticky + sidebar lg + drawer, card foto-protagonista, split map). Cambios:

- **SearchBand → `.player-hero-band`** (receta existente): light clara crema/emerald con **PitchLines** `text-emerald-600/20`, dark slab actual con líneas `text-white/[.05]`. Titular `text-foreground` + `.hero-accent-text`. Cumple la reinterpretación del MASTER ("clara en light, slab en dark") y estrena la firma de cal donde más se ve.
- **SearchBar**: sombra glow inline → `.search-card`; CTA → `bg-primary`.
- **QuickFilters**: quedan (ya duales); + `active:scale-[0.98]`.
- **ExplorarToolbar**: toggle activo `bg-emerald-600` → `bg-primary text-primary-foreground`.
- **TenantCard**: base ya correcta. Ajustes: slot pills → `bg-primary` + press feedback (mini-CTAs reales); precio "desde" sube a `text-2xl` (el numeral es el dato que decide, §3 escala KPI); `active:scale-[0.99]` en la card.
- **EmptyResults / "Ver más" / FAB**: CTAs → `bg-primary`; FAB `bg-slate-900` fijo → `bg-primary` (marca, visible en ambos temas).
- **loading.tsx**: se actualiza la silueta si cambia la banda (misma silueta = regla §6.7).

## 5. Checkout `/[slug]/reservar` — "el pago sin miedo"

La pantalla de plata es donde la confianza se gana o se pierde (§12 jugador: precio y seña visibles antes del CTA — ya se cumple; el problema es la piel dark-locked).

- **BookingDarkShell → `ReservaShell`**: reuso del lenguaje `reserva-*` ya dual (`.reserva-shell` + glows `.reserva-glow-*`). En light: portal claro con glow emerald suave; dark: actual.
- **BookingSummary**: glass inline → `.reserva-receipt-card` (ya dual — es literalmente el mismo rol: comprobante). Tipografía a tokens (`text-foreground`/`text-muted-foreground`), seña en `text-emerald-700 dark:text-emerald-400` `font-display`. **`formatARS` local muere** → `formatArs` de `lib/format`.
- **PaymentMethodSelector**: cards de radio a tokens (`border-border bg-card` light / glass dark vía `dark:`), textos duales. Acentos por método se conservan (MP celeste solo acá — regla §2.2 de marca de terceros) con par light/dark AA (`sky-700`/`sky-300` etc.).
- **ConfirmBookingButton**: CTA → `bg-primary` h-14 full-width (Fitts §9); microcopy de confianza queda (ya existe "Te llevamos a MercadoPago…"), color a `text-muted-foreground`.
- **Error banners**: tinte dual (`bg-destructive/10 text-destructive` estilo badge §6.5 con par dark) — hoy solo legibles en dark.
- **h1**: `text-foreground` + acento. Texto "Confirmá tu reserva" NO cambia.

## 6. Retorno `reserva/[bookingId]/*` — "el pico"

- **Éxito** (ya adaptive): fecha ISO → `formatDateLong` ("viernes 3 de julio") — deuda §13.2; `fmtArs` 2 decimales → `formatArs` sin decimales (§8.2 player); ping infinito → `animate-slot-pulse` una vez + glow estático (§5.3); CTAs → `bg-primary` / secundario ghost. **El h1 "¡Reserva confirmada!" no se toca** (contrato e2e).
- **Pendiente / error / verificar / loadings**: mismo tratamiento de shell y CTAs; se auditan al implementar (los textos/estados no cambian).

## 7. Recetas nuevas en `globals.css` (todas con par light/dark)

`.landing-hero` · `.overlay-nav` · `.live-pill` · `.search-card` · `.mockup-card` (+ variantes slot) · `.stats-band` · `.cta-band`. Se documentan en MASTER §4.3 al cerrar. Reusadas sin crear: `.player-hero-band`, `.player-hero-grid`, `.hero-accent-text`, `.card-premium(-interactive)`, `.icon-halo`, `.reserva-*`, `.hero-glow-blob`, `animate-slot-pulse`.

## 8. Riesgos y guardas

- **Contratos e2e**: inventario en curso (agente). Regla: headings, roles, labels y textos visibles no cambian; clases solo donde ningún spec las ancle. Verificación cruzada antes de cerrar.
- **ISR/caché**: la landing es `revalidate 300` y el HTML server es el estado anónimo — el flip de tema es CSS puro (`.dark` en `<html>` vía next-themes), cero branching JS por tema. Ninguna receta lee JS.
- **Leaflet/mapa**: no se toca (overrides dark ya existen).
- **`prefers-reduced-motion`**: contrato global ya congela todo; las animaciones nuevas son transform/opacity/box-shadow only.

## 9. Criterios de aceptación

1. Toggle light↔dark en `/`, `/explorar`, `/[slug]/reservar`, `/reserva/*/exito`: cero superficie que quede del tema anterior.
2. Contraste §2.4: ningún texto emerald < AA en su fondo; CTAs vía token.
3. Cero hex nuevos en JSX; inline styles de color solo donde ya son receta CSS.
4. `pnpm typecheck` + `pnpm lint` verdes; e2e selectors intactos (cotejo con inventario).
5. Plata y fechas cara al usuario: `formatArs`/fecha es-AR — cero ISO, cero decimales en player.
