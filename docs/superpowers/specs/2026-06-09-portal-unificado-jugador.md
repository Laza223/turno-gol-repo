# Portal Unificado del Jugador (shell session-aware) — Refactor

**Fecha**: 2026-06-09
**Fase**: refactor-ux-jugador
**Tipo**: Documento de refactorización (UX/UI + accesibilidad). **Sin cambios de código hasta aprobación explícita.**
**User stories**: continuidad de sesión del jugador, navegación a secciones (Mis reservas / Perfil / Cuenta) sin abandonar el portal
**Relacionado**: `2026-05-22-portal-publico-jugador-design.md`, `docs/spec/design-system/pages/player-area.md`

---

## Contexto

El viaje del jugador (Tomás) está partido en **dos mundos visuales que no se hablan**, por cómo están
armados los route groups de Next.js. Esto rompe reglas básicas de UX/UI y genera dos quejas concretas:
"la interfaz no da ningún indicio de que estés logueado" y "al ir a mis reservas / perfil / cuenta te
excluye de poder seguir reservando o seguir en el portal".

Causa raíz (verificada en código):

| # | Problema | Evidencia |
|---|----------|-----------|
| 1 | La zona pública **nunca sabe que estás logueado**. El header muestra siempre "Ingresar". | `SiteNav.tsx:40-42` (link "Ingresar" fijo); `(public)/layout.tsx:5-12` no llama a `extractAuthUser()` |
| 2 | El área logueada es un **portal aparte**: header oscuro `bg-slate-900` + bottom-nav aislado. | `(player)/layout.tsx:23` (header negro); `PlayerBottomNav.tsx:7-11` (solo Reservas/Perfil/Cuenta) |
| 3 | Desde el área del jugador **no hay forma de volver a reservar**: la única salida es "Salir". | `(player)/layout.tsx:25-32`; no hay tab "Explorar/Reservar" en `PlayerBottomNav.tsx` |
| 4 | **Discontinuidad estética** en el flujo: público (blanco/emerald) → reservar → `/reserva/{id}/exito` (sin layout) → player (negro). | `reserva/[bookingId]/exito/page.tsx` no usa shell |

Objetivo: que **todo sea el mismo portal**, estilo ecommerce — el jugador entra a sus secciones dentro
del mismo cascarón, con la misma cabecera, sabiendo siempre que está logueado y pudiendo seguir
reservando en cualquier momento. El área del jugador **deja de ser algo externo al portal**.

---

## Principios de diseño

1. **Un solo shell session-aware** para todo el viaje del jugador (público + logueado + post-reserva).
2. **Estilo ecommerce**: las secciones de cuenta son páginas dentro de la tienda, no otra app.
3. **Adherir al design system** (`design-system/MASTER.md` + `pages/player-area.md`): emerald-600
   primario, blanco/slate, contraste AA, foco `focus-visible:ring-emerald-500`, touch-targets 44px,
   `tabular-nums`. **Eliminar el header negro `slate-900`** del área jugador.
4. **Mobile-first**, reusando lo existente (bottom-nav, safe-area, cascade `h-11 md:h-10`).
5. **Reusar antes de crear**: `Logo`, `dropdown-menu.tsx` (Radix), primitives `ui/`, `signOutAction`.

---

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Modelo de navegación | Shell único session-aware (no dos layouts divergentes) | El usuario pidió explícitamente que el área jugador no sea "algo externo al portal" |
| Estilo de las secciones de cuenta | Ecommerce: páginas dentro del mismo cascarón, accesibles desde menú de avatar | Coincide con la persona Tomás (compara con Airbnb/Rappi/MercadoLibre, doc3) |
| Header del área jugador | Eliminar `bg-slate-900`; usar el header claro blanco/emerald del MASTER | Continuidad visual; el negro era la marca más fuerte de "otra app" |
| Datos de sesión en el header | Nuevo `getPlayerHeaderInfo(playerId)`; `(public)/layout.tsx` pasa a async | `extractAuthUser()` no devuelve nombre/avatar; el chip los necesita |
| "Reservar/Explorar" en el área logueada | Destino de primera clase (tab + link en header) | Hoy la única salida es cerrar sesión (problema #3) |
| Continuidad de `SiteNav` | Refactor hacia `PortalHeader`; `SiteNav` queda como re-export fino | No romper imports existentes (`variant: overlay\|solid` se preserva) |
| Alcance del bottom-nav mobile | Visible para jugador logueado en **toda** el área (público + secciones), no solo en `(player)/*` | Coherencia tipo app; mantiene navegación mientras explora/reserva (confirmado 2026-06-09) |
| Perfil vs Cuenta | Un hub "Cuenta" (`/configuracion`) agrupa Perfil + Datos + Eliminar; se mantienen las rutas `/perfil`, `/configuracion`, `/eliminar-cuenta` | Menos ítems de nav, mental model claro, sin romper enlaces (confirmado 2026-06-09) |

---

## Arquitectura propuesta

### 1. `PortalHeader` — cabecera única session-aware

Nuevo componente que **reemplaza** la mitad derecha estática de `SiteNav` y el header negro del área
jugador. Una sola cabecera, dos estados:

- **Deslogueado**: igual que hoy → "Ingresar" + "Comenzar" (`/login`, `/register`).
- **Logueado** (jugador): chip **avatar (iniciales) + nombre** a la derecha → menú desplegable (Radix
  `dropdown-menu.tsx`) con **Mis reservas · Perfil · Cuenta · Salir**. A la izquierda, siempre: Logo
  (→ home) + **Explorar** + (si aplica) el complejo actual.

Reusos: `Logo` (`ui/logo.tsx`), `dropdown-menu.tsx`, avatar de iniciales (patrón de `perfil/page.tsx`),
`signOutAction` (extraído de `(player)/layout.tsx:8-13` a un módulo compartido).

### 2. Datos de sesión para el header

- `extractAuthUser()` (`auth.middleware.ts:9-41`) devuelve `type/playerId/email`, **no el nombre**.
- Nuevo `getPlayerHeaderInfo(playerId)` en `src/modules/players/`: trae `firstName`, `lastName`,
  `avatarUrl` con `withPlayerContext`. Cachear por request (`React.cache`).
- `(public)/layout.tsx` pasa a **async server component**: lee sesión y la pasa a `PortalHeader`.
  (Hoy es sync y anónimo — corrección del problema #1.)

### 3. Navegación unificada (ecommerce)

- **Desktop**: top-nav → izquierda `Logo` + `Explorar` (+ complejo actual); derecha chip de avatar con
  `AccountMenu`. Ítems del dropdown: **Mis reservas · Cuenta · Salir** (`Perfil` vive dentro del hub Cuenta).
- **Mobile**: misma top-bar con avatar **+** bottom-nav de 3 tabs: **`Explorar` · `Reservas` · `Cuenta`**.
  "Explorar/Reservar" es destino de primera clase — el jugador nunca queda encerrado.
- **Alcance del bottom-nav**: se renderiza para el jugador logueado en **toda** el área (zona pública
  incluida) en mobile, no solo en `(player)/*`. Implica: el shell condiciona `PlayerBottomNav` a la
  sesión de jugador y agrega `pb-20` al `main` cuando se muestra (hoy solo `(player)/layout` lo hace).
- Modificar `PlayerBottomNav.tsx` (NAV_ITEMS → Explorar/Reservas/Cuenta) y elevarlo al shell compartido.

### 4. Las secciones del jugador, dentro del portal (hub "Cuenta")

`mis-reservas`, `perfil`, `configuracion`, `eliminar-cuenta` **conservan contenido y candado de
seguridad** (redirect si no es player), pero pierden el shell oscuro y renderizan el `PortalHeader`
claro, con título de sección + breadcrumb/volver.

**Hub "Cuenta"**: `/configuracion` actúa como índice de cuenta y enlaza sus sub-secciones —
**Mi perfil** (`/perfil`), **Descargar mis datos** (export ARCO, ya existente) y **Eliminar cuenta**
(`/eliminar-cuenta`). El tab "Cuenta" (bottom-nav) y el ítem "Cuenta" (dropdown) apuntan acá. Las
rutas `/perfil`, `/configuracion`, `/eliminar-cuenta` se mantienen para no romper enlaces.

### 5. Continuidad del flujo de reserva

Envolver `reserva/[bookingId]/{exito,pendiente,error}/page.tsx` en el mismo shell (hoy son páginas
sueltas). Tras reservar, el jugador queda **dentro del portal** con la cabecera logueada y CTAs
"Ver mis reservas" / "Seguir explorando" — no en una tarjeta huérfana.

### 6. Estética y accesibilidad (empatía visual)

- Quitar `bg-slate-900`; usar blanco/emerald del MASTER. Contraste AA (emerald-600, nunca emerald-500
  para texto — MASTER §anti-patterns).
- Dropdown de cuenta accesible: `aria-expanded`, teclado, foco visible (Radix ya lo provee).
- El indicador de sesión elimina la ambigüedad cognitiva ("¿estoy logueado?") — accesibilidad real.
- Respetar `prefers-reduced-motion`, touch 44px, `env(safe-area-inset-*)` (ya en uso).

---

## Archivos: nuevos / a modificar / a reusar

**Nuevos**
- `src/components/site/PortalHeader.tsx` — cabecera session-aware.
- `src/components/site/AccountMenu.tsx` — chip de avatar + dropdown (client).
- `src/modules/players/get-player-header-info.ts` — helper de datos del header.
- `src/modules/auth/sign-out.action.ts` — `signOutAction` compartido (extraído del layout player).
- `docs/spec/design-system/pages/player-area.md` — reglas visuales de la sección jugador. ✅ (creado con este refactor)

**A modificar**
- `src/app/(public)/layout.tsx` — async + lee sesión + usa `PortalHeader` + bottom-nav condicional (jugador logueado, mobile).
- `src/app/(player)/layout.tsx` — quita header negro; usa el mismo shell.
- `src/components/site/SiteNav.tsx` — refactor hacia `PortalHeader` (o re-export fino).
- `src/app/(player)/_components/PlayerBottomNav.tsx` — NAV_ITEMS: Explorar · Reservas · Cuenta.
- `src/app/reserva/[bookingId]/{exito,pendiente,error}/page.tsx` — envolver en shell + CTAs.

**A reusar (no recrear)**
- `src/components/ui/logo.tsx`, `src/components/ui/dropdown-menu.tsx`, primitives `ui/`.
- Patrón avatar/iniciales de `src/app/(player)/perfil/page.tsx`.
- `extractAuthUser()` (`src/modules/auth/auth.middleware.ts`) y `withPlayerContext`.

---

## Plan por fases (incremental, sin romper producción)

- **Fase 0** — Este doc + `design-system/pages/player-area.md`. ✅
- **Fase 1** — `PortalHeader` session-aware en la **zona pública** (chip de sesión). Resuelve el
  problema principal con el menor riesgo. *(alto impacto, bajo riesgo)*
- **Fase 2** — Unificar el layout del jugador al shell (quitar el header negro `slate-900`).
- **Fase 3** — Navegación: "Explorar/Reservar" de primera clase + reorganizar Perfil/Cuenta.
- **Fase 4** — Envolver `/reserva/*` en el shell (continuidad post-reserva).
- **Fase 5** — Pulido de accesibilidad + tests (axe, Lighthouse, e2e mobile).

---

## Verificación (al implementar)

- `pnpm typecheck` y `pnpm lint` tras cada fase (regla del repo).
- Recorrido manual con `pnpm dev`: explorar → reservar (magic link) → volver a `/explorar` y confirmar
  que el header muestra avatar/nombre; entrar a Mis reservas y volver a Explorar sin cerrar sesión.
- `tests/e2e/a11y/` (axe-core) sobre rutas públicas + jugador; `lighthouserc.public.json` a11y ≥0.95.
- `tests/e2e/mobile/` (Pixel 5): bottom-nav 44px, sin scroll horizontal, dropdown accesible.

---

## Decisiones resueltas (2026-06-09)

Las tres decisiones abiertas fueron confirmadas por Lázaro (ver tabla de "Decisiones tomadas"):

1. **Bottom-nav mobile en ambas zonas** (pública logueada + secciones del jugador) — coherencia tipo app.
2. **Hub "Cuenta"** (`/configuracion`) que agrupa Perfil + Datos + Eliminar, **manteniendo** las rutas actuales.
3. **`SiteNav` → `PortalHeader`** con re-export fino (preserva `variant: overlay\|solid`, no rompe imports).
