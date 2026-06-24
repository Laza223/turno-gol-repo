# Rediseño de `/explorar` — "Matchday"

**Fecha:** 2026-06-23
**Estado:** Diseño aprobado (dirección) — pendiente revisión de spec
**Página override:** `docs/spec/design-system/pages/explorar.md`
**Alcance:** `src/app/(public)/explorar/*` + cableado de fuente + docs de design system

---

## 1. Contexto y objetivo

`/explorar` es la vista que **más visita el jugador**: el catálogo de complejos de fútbol
donde busca, compara y entra a reservar. Hoy funciona y es accesible, pero se ve como un
grid SaaS genérico (emerald plano, cards redondeadas, hover lift) que no usa nada del mundo
del fútbol. Objetivo: **renovarla a un nivel "increíble" — impactante y funcional —** sin
romper el espíritu del portal del jugador.

### Decisiones tomadas (brainstorming 2026-06-23)

1. **Dirección visual:** *Evolucionar la identidad* — empujar el design system con un
   elemento de firma y una escala tipográfica más audaz, enraizado en emerald. Requiere
   ratificar cambios en MASTER / player-area.
2. **Alcance:** *Página completa* — búsqueda, filtros, card, grilla, vista mapa y estados.
3. **Funcionalidad:** *Visual / UX sobre datos actuales* — **sin cambios de backend**. Se
   explota al máximo lo que ya expone `PublicTenantCard`. (Queda **fuera**: "próximo turno
   libre siempre visible", que requeriría una query nueva.)
4. **Banda hero:** *verde claro con líneas* (`emerald-50/100`, brillante, fiel a
   `player-area.md`; sin cabecera oscura).
5. **Filtros:** *híbrido* — chips rápidos arriba (todos los viewports) + sidebar completo
   en desktop ancho.
6. **Mapa:** *split view ahora* — lista + mapa lado a lado.

### No-objetivos (fuera de scope)

- Cualquier cambio en `search.service.ts` / `availability-search.service.ts` o en la base.
- Features que requieran datos nuevos: próximo turno sin buscar, popularidad/"reservas esta
  semana", guardar búsqueda, recomendaciones.
- `PortalHeader`, `PlayerBottomNav`, `SiteFooter` (se conservan; la vista vive dentro del
  shell del jugador).
- Rediseño del perfil del complejo `/[slug]` (otra vista).

---

## 2. Identidad visual ("Matchday")

**Concepto:** el jugador elige *dónde jugar hoy*; la página tiene energía de pre-partido.

**Firma (una sola cosa memorable):** *la cancha como sistema visual*:
- **Líneas de cal** (pitch lines finas) como recurso estructural en la banda hero y el
  estado vacío. Implementadas en **CSS/SVG, sin imágenes** (perf + theming).
- **Tipografía de marcador**: una display grotesca para titulares y números clave.

Todo lo demás queda **quieto, claro y brillante** (Airbnb/MercadoLibre). La audacia se
concentra en la firma; el resto es ejecución limpia.

### 2.1 Tipografía

- **Body / UI:** Inter (sin cambios).
- **Display:** **Archivo** (Google Fonts, variable, incluye anchos *Expanded*). Grotesca
  técnica/señalética, confiada, con energía deportiva, sin clichés (no Bebas/Oswald, no
  serif). Pareja invisible con Inter.
- **Uso disciplinado** (`font-display`): hero de la banda + `h1`/`h2` + numeral de precio
  de la card. La data densa sigue en Inter `tabular-nums`.

Cableado (preciso, sigue el patrón actual de Inter):

```ts
// src/app/layout.tsx
import { Inter, Archivo } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' })
// <html className={`${inter.variable} ${archivo.variable}`}>
```

```ts
// tailwind.config.ts  → theme.extend.fontFamily
sans: ['var(--font-inter)', ...fontFamily.sans],
display: ['var(--font-archivo)', ...fontFamily.sans],   // NUEVO → clase font-display
```

### 2.2 Color

Ver tabla en `pages/explorar.md` §3. Resumen: MASTER intacto + superficie hero
`emerald-50/100` + líneas `emerald-600/15–25` + numeral precio `emerald-700` + borde de
card `emerald-500` (decorativo). Sin paleta nueva, sin acentos neón.

### 2.3 Motivo "líneas de cal"

Componente decorativo reutilizable `PitchLines` (SVG, `aria-hidden`): líneas finas que
evocan las marcas de la cancha (línea de medio campo + arco). Usado como fondo de la banda
hero y en el estado vacío. Color por `currentColor`/clases para adaptarse a la superficie.
Nunca transporta información (decorativo puro, respeta `prefers-reduced-motion`: estático).

---

## 3. Arquitectura de componentes

Principio: unidades chicas, una responsabilidad, interfaces claras, testeables aisladas.
Se preservan los contratos de datos (`PublicTenantCard`, `SlotPill`, `CityCount`) y el
patrón **URL-driven** (filtros en la URL vía `buildExplorarUrl`, SSR, compartible).

### 3.1 Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/app/layout.tsx` | editar | + fuente Archivo (`--font-archivo`) |
| `tailwind.config.ts` | editar | + `fontFamily.display` |
| `explorar/page.tsx` | editar | orquestación: composición de banda + chips + (sidebar/grid \| split) + estados. La lógica de fetch/cache **no cambia** |
| `explorar/components/SearchBand.tsx` | **nuevo** | presentacional (server): banda clara + `PitchLines` + titular `font-display`; envuelve `SearchBar` |
| `explorar/components/SearchBar.tsx` | editar | el form (texto/localidad/fecha/hora/CTA); restyle a la banda; lógica intacta |
| `explorar/components/QuickFilters.tsx` | **nuevo** | client: chips sticky (formato/superficie/online/precio-popover) → URL; botón "Todos los filtros" abre el drawer (reusa `ExplorarFilters`) |
| `explorar/components/ExplorarFilters.tsx` | editar | cuerpo de filtros (sidebar + drawer); restyle leve; lógica intacta |
| `explorar/components/ExplorarToolbar.tsx` | editar | queda con contador + orden + toggle lista/mapa (los chips y el drawer migran a `QuickFilters`) |
| `explorar/components/TenantCard.tsx` | editar | rediseño grid + `variant?: 'grid' \| 'compact'` para la lista del split |
| `explorar/components/TenantCardCarousel.tsx` | conservar | carrusel (ajustes menores de estilo) |
| `explorar/components/PitchLines.tsx` | **nuevo** | SVG decorativo de líneas de cal |
| `explorar/components/EmptyResults.tsx` | **nuevo** | estado vacío on-brand (líneas + reset) |
| `explorar/components/ExplorarSplitView.tsx` | **nuevo** | client: layout lista+mapa (desktop) / toggle+FAB (mobile); estado `activeTenantId` para hover-sync (opcional) |
| `explorar/components/ExplorarMap.tsx` | editar | core de Leaflet intacto; acepta `activeId` opcional para resaltar pin; restyle empty |
| `explorar/components/ExplorarMapLoader.tsx` | conservar | `dynamic ssr:false` |
| `explorar/loading.tsx` | editar | skeleton al nuevo card/grid |
| `explorar/components/url.ts` | conservar | helpers de URL |

Docs de design system:
| `docs/spec/design-system/pages/explorar.md` | **nuevo (hecho)** | override de la página |
| `docs/spec/design-system/MASTER.md` | editar | §2: documentar `font-display` (excepción a "solo Inter") |
| `docs/spec/design-system/pages/player-area.md` | editar | referencia a la identidad de `/explorar` |

### 3.2 Interfaces nuevas

```ts
// TenantCard
type Variant = 'grid' | 'compact'
// 'compact' = layout horizontal (foto izq pequeña + datos der) para la lista del split.

// ExplorarSplitView (client)
{ results: PublicTenantCard[]; favoriteIds: Set<string>; photosByTenant: Record<string,string[]> }
// Renderiza lista compacta + ExplorarMapLoader; comparte activeTenantId.

// PitchLines (presentacional)
{ className?: string; variant?: 'band' | 'empty' }
```

---

## 4. Layout de página

### 4.1 Vista lista (desktop ≥ lg)

```
┌───────────────────────────────────────────────────────────────┐
│ PortalHeader (blanco, NO se toca)                              │
├───────────────────────────────────────────────────────────────┤
│ ░ SearchBand — emerald-50/100 + PitchLines ░                  │
│ ░  "¿Dónde jugás hoy?"  (font-display)                  ░     │
│ ░  [Buscar] [Localidad] [Fecha] [Hora] [🔍 Buscar]     ░     │
├───────────────────────────────────────────────────────────────┤
│ QuickFilters (sticky): [F5][F7][F11] [Sintético][Techado]     │
│                        [Online] [Precio▾] [⚙ Todos los filtros]│
│ Toolbar:               124 complejos · Orden▾ · [Lista|Mapa]   │
├──────────────┬────────────────────────────────────────────────┤
│ Sidebar 256  │ Grilla cards  (sm:2 · lg:2 · xl:3)             │
│ (filtros     │ ┌──────┐ ┌──────┐ ┌──────┐                     │
│  completos,  │ │ card │ │ card │ │ card │                     │
│  sticky)     │ └──────┘ └──────┘ └──────┘                     │
│              │ … "Ver más complejos"                          │
└──────────────┴────────────────────────────────────────────────┘
```

- La `SearchBand` se **condensa al scroll** (Airbnb-style): el titular se achica/oculta y
  queda una barra sticky compacta. Implementación CSS-first (sticky + transición), sin
  observers pesados si se puede.
- `< lg`: sin sidebar; los chips + drawer "Todos los filtros" cubren todo. Grilla 1→2 col.

### 4.2 Vista mapa (split)

```
┌──────────────┬────────────────────────────────────────────────┐
│ Lista compacta (scroll)   │  Mapa (sticky, alto = viewport)    │
│ ┌──────────────────────┐  │   ┌──────────────────────────┐    │
│ │ [foto] Nombre  ★4.8  │  │   │   • $12.000   • $9.500    │    │
│ │        Palermo $12k  │  │   │        • $15.000          │    │
│ └──────────────────────┘  │   │   • (pin activo resaltado)│    │
│ ┌──────────────────────┐  │   └──────────────────────────┘    │
│ │ [foto] Otro    ★4.5  │  │                                    │
│ └──────────────────────┘  │                                    │
└──────────────┴────────────────────────────────────────────────┘
```

- En vista mapa **no** hay sidebar: filtros vía chips + drawer (más ancho para el split).
- **Hover-sync (opcional, enhancement):** hover en card compacta → resalta su pin (y
  viceversa) mediante `activeTenantId` en `ExplorarSplitView`. Si se descarta por
  complejidad, el split sigue siendo válido sin sync.
- Mobile: una sola columna; toggle Lista/Mapa (ya existe en `Toolbar`) y, en mapa, **FAB
  "Ver lista"** para volver. El mapa va full-width.
- Se conserva el `priceIcon` (pin pastilla con precio), `FitBounds`, popup "Ver complejo".

---

## 5. La `TenantCard` (rediseño)

### 5.1 Variante grid

```
┌─────────────────────────────┐
│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│ ← borde sup. 2px emerald (línea de cal)
│ ▓▓▓▓▓ FOTO 16:9 ▓▓▓▓▓   [♡] │   overlays mínimos:
│ ▓ [⚡ Reservá online]     ▓ │   solo badge online + favorito
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├─────────────────────────────┤
│ La Bombonerita      ★ 4.8 (123)│ nombre Inter 16/600 + rating limpio
│ 📍 Palermo, CABA · a 2,3 km │ ubicación slate-500
│ [Fútbol 5] [Fútbol 7] · Sintético │ ← chips de FORMATO protagonistas
│ ─────────────────────────── │
│ $12.000  /turno      Ver →  │ ← precio font-display emerald-700; CTA
└─────────────────────────────┘
```

Cambios respecto a hoy:
- Precio y rating **salen del overlay** (eran chiquitos/poco legibles) → al body con
  jerarquía. Precio = numeral de marcador (`font-display`, `emerald-700`, `tabular-nums`),
  lo más fuerte de la card.
- Overlays sobre foto: **solo** "Reservá online" (pill emerald sólida, sin glass) +
  favorito. Foto limpia.
- **Formato** sube de jerarquía (chips claros): es lo primero que decide el jugador.
  Superficie y servicios quedan secundarios (servicios como íconos, como hoy).
- Borde superior 2px emerald (línea de cal) = firma sutil.
- Al buscar fecha+hora: las **pills de turnos** (ya existen) se rediseñan como chips de
  horario y mantienen el link directo a `/[slug]/reservar?court=…&date=…&time=…`.
- Interacción dentro de MASTER §7: lift sutil + zoom de foto, `motion-reduce` respetado;
  patrón stretched-link conservado (HTML válido; favorito y carrusel como hermanos).

### 5.2 Variante compact (lista del split)

Layout horizontal: foto chica a la izquierda (≈`w-28 h-24`), a la derecha nombre + rating
+ ubicación + precio. Sin carrusel (una sola foto), sin chips de formato (espacio). Mismo
contrato de datos; mismo destino (perfil). Si `TenantCard` crece demasiado, extraer los
sub-bloques compartidos (badge online, rating, precio) a helpers.

---

## 6. Banda de búsqueda

- Superficie `emerald-50` (o degradé suave a `emerald-100`) con `PitchLines` de fondo.
- Titular `font-display` ("¿Dónde jugás hoy?" / "Encontrá tu cancha") + subtítulo Inter.
- El form (`SearchBar`) se conserva en lógica: texto + Combobox de localidad + fecha + hora
  + CTA; navega por URL preservando filtros. Restyle de inputs a la banda (mantener labels
  visibles, foco AA, touch ≥44px).
- **Condensación al scroll**: la banda se vuelve sticky compacta; el titular se reduce.

---

## 7. Filtros (híbrido)

- **`QuickFilters`** (sticky, todos los viewports): chips para lo más usado —
  Formato (F5/F7/F11 desde `FORMAT_OPTIONS`), Superficie, Techado, Online, y **Precio**
  (popover con min/max, reusa la validación de `ExplorarFilters`). Cada chip refleja estado
  activo (emerald) y escribe a la URL con `buildExplorarUrl`. Botón **"Todos los filtros"**
  con badge de conteo abre el drawer.
- **Sidebar** (`lg+`): `ExplorarFilters` completo, sticky, como hoy (restyle leve). Muestra
  todos los facets de una para power users.
- **Drawer** (`< lg`): `ExplorarFilters` en `Dialog` (como hoy), disparado desde
  `QuickFilters`.
- En **vista mapa** no hay sidebar (solo chips + drawer), para dar ancho al split.
- Mantener "Limpiar" preservando la búsqueda (q/city/date/time/sort/view).

---

## 8. Estados

- **Vacío (`EmptyResults`):** `PitchLines` (variant empty) + mensaje contextual (con/sin
  disponibilidad buscada) + link "Limpiar búsqueda". Reemplaza el ícono `SearchX` pelado.
- **Loading (`loading.tsx`):** skeleton actualizado a la banda + chips + (sidebar/grid). El
  card skeleton refleja el nuevo layout (foto 16:9 + líneas de body + fila de precio).
- **Mapa sin ubicaciones:** mensaje actual conservado, restyle a la superficie nueva.
- **Mapa cargando:** placeholder `dynamic` conservado.

---

## 9. Responsive

- Breakpoints MASTER §8. Verificar 375 / 768 / 1280.
- Grilla: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` (el sidebar ocupa el ancho restante;
  sin sidebar en `< lg` la grilla respira). *Nota:* con sidebar, 3 col reales en xl; se
  evalúa `2xl:grid-cols-3`/`4` según ancho disponible al maquetar.
- Chips: scroll horizontal en mobile (sin wrap que rompa), con `snap` suave.
- Split view: una columna en mobile (toggle + FAB); dos columnas `lg+`.
- Sin scroll horizontal en 375px (regla MASTER).

---

## 10. Accesibilidad (mantener baseline MASTER §10 + player-area §8)

- Contraste AA en todo texto; **nunca** `emerald-500` para texto sobre blanco.
- Foco visible `focus-visible:ring-2 ring-emerald-500 ring-offset-2` en chips, inputs, card
  (stretched-link), pins/popup, FAB.
- `prefers-reduced-motion`: sin zoom/lift/condensación brusca; `PitchLines` estático.
- Touch ≥44px en chips, CTA, toggle, FAB, ítems del drawer.
- Orden de tabulación = orden visual; `PitchLines` y overlays decorativos `aria-hidden`.
- Color nunca como único canal (badge online = ícono + texto; rating = número + estrellas).
- `aria-live="polite"` en el contador de resultados (ya existe).

---

## 11. Performance

- Sin imágenes para la firma (líneas en SVG/CSS). Foto con `next/image` (ya), `lazy`,
  `sizes` correctos por columna.
- No romper el camino de datos cacheado: `getDefaultSearchCached` /
  `listPublicCitiesCached` y la detección `isDefaultSearch` se conservan tal cual.
- `font-display: swap` en Archivo; un solo subset latino; pesos mínimos necesarios.
- Leaflet sigue en `dynamic ssr:false` (no entra al bundle inicial). El split monta el mapa
  solo en `view=map`.
- Mantener/observar Lighthouse público (`lighthouserc.public.json`) — sin regresión de LCP/CLS.

---

## 12. Impacto en tests

Revisar/actualizar (no romper):
- `tests/unit/tenant-card.test.tsx` — cambia el DOM de la card (precio/rating al body,
  chips de formato). Actualizar asserts.
- `tests/unit/explorar-searchbar-city.test.tsx`, `hero-search-city-prefill.test.tsx` — la
  lógica del form se conserva; verificar selectores.
- `tests/e2e/portal-search.spec.ts`, `tests/e2e/a11y/public.spec.ts`,
  `tests/e2e/cross-browser/public-smoke.spec.ts` — flujos de búsqueda/filtros/vista;
  actualizar selectores de chips/sidebar y validar a11y.
- `tests/unit/no-raw-focus-ring.test.ts`, `navigation-aria.test.tsx` — mantener patrones.
- Agregar, si aplica: test de presencia de `font-display` en hero y de la variante compact.

---

## 13. Enfoque de implementación (fases sugeridas)

Para entregar incremental y mantener verde:

- **Fase 0 — Tokens:** Archivo en `layout.tsx` + `tailwind.config.ts`; `PitchLines`;
  actualizar docs DS (MASTER §2, player-area, ya creado `pages/explorar.md`).
- **Fase 1 — Card + grilla:** `TenantCard` (grid) + `loading.tsx` + `EmptyResults`. (Lo
  más visto; mayor ROI visual.)
- **Fase 2 — Búsqueda + filtros:** `SearchBand` + condensación + `QuickFilters` + ajuste de
  `ExplorarToolbar`/`ExplorarFilters` (chips/sidebar/drawer híbrido).
- **Fase 3 — Mapa split:** `ExplorarSplitView` + variante `compact` de card + `ExplorarMap`
  (activeId/hover-sync opcional) + FAB mobile.
- **Fase 4 — Pulido:** a11y pass, responsive 375/768/1280, tests, Lighthouse, capturas.

Cada fase deja `pnpm typecheck` + `pnpm lint` + tests en verde.

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Banda hero + display leídos como "otro sitio" (inconsistencia con el portal) | Hero **claro** (no oscuro), emerald-rooted; display disciplinada; PortalHeader intacto |
| Split view sobre Leaflet más complejo de lo previsto | Hover-sync es opcional; el split funciona sin sync; mobile cae a toggle ya existente |
| Cambiar MASTER ("solo Inter") sin ratificar | Documentar la excepción en MASTER §2 + `pages/explorar.md`; revisión de spec antes de código |
| Tests existentes rojos por cambios de DOM | Fase 4 dedica el pase de tests; actualizar asserts junto a cada componente |
| Chips + sidebar duplican lógica de filtros | `QuickFilters` reusa `FORMAT_OPTIONS`/`AMENITIES` y `buildExplorarUrl`; el drawer reusa `ExplorarFilters` (una fuente) |

---

## 15. Criterios de aceptación

- [ ] `/explorar` usa `font-display` (Archivo) en hero/títulos/precio; resto Inter.
- [ ] Banda hero clara con motivo de líneas de cal (CSS/SVG, sin imágenes), condensa al
      scroll; `PortalHeader` sin cambios.
- [ ] Card rediseñada: precio (`font-display`, `emerald-700`) y rating en el body; foto con
      ≤2 overlays; chips de formato prominentes; borde superior 2px; stretched-link válido.
- [ ] Filtros híbridos: chips sticky (todos los viewports) + sidebar `lg+` + drawer mobile;
      estado activo visible; escriben a la URL (SSR/compartible).
- [ ] Vista mapa = split lista+mapa en desktop; toggle+FAB en mobile; pins/popup
      conservados.
- [ ] Estados vacío/loading on-brand y actualizados.
- [ ] Sin cambios de backend; camino de datos cacheado intacto.
- [ ] AA, foco visible, `prefers-reduced-motion`, touch ≥44px, sin scroll horizontal 375px.
- [ ] `pnpm typecheck`, `pnpm lint`, unit + e2e relevantes en verde; sin regresión
      Lighthouse pública.
- [ ] Docs DS actualizados (MASTER §2, player-area, `pages/explorar.md`).
