# Diseño — Landing `/para-complejos` al lenguaje dark-premium del jugador

**Fecha:** 2026-06-26
**Estado:** Aprobado (diseño) — pendiente plan de implementación
**Alcance:** Superficie B2B pública (`/para-complejos`) + su header/footer. No toca rutas, auth, ni vistas de app.

## 1. Problema

La landing pública del jugador (`src/app/page.tsx`) ya tiene el lenguaje visual **dark-premium**: glow blobs, partículas flotantes, animaciones `tg-float`/`tg-drift`, tipografía `font-display font-black italic` con `clamp()`, mockup flotante (`BookingCardMockup`), secciones con `Reveal`, fondo `#020617`.

La landing B2B (`src/app/(business)/para-complejos/page.tsx`) quedó en una versión **anterior y plana**: Tailwind básico, sin glow/partículas/animaciones, sin `Reveal`, tipografía estándar, mockups simples. Visualmente no matchea el producto.

Además tiene un **dato falso**: la feature card "Recordatorios automáticos / Email 24 hs antes" describe un feature **eliminado de v1** (CLAUDE.md, cambio #18: el recordatorio 24 hs al jugador se descartó por costo de email masivo; worker/template eliminados).

## 2. Objetivo

Llevar `/para-complejos` al **mismo lenguaje visual** que la landing del jugador, manteniendo:
- Las **6 secciones** y el **contenido/copy** actuales (salvo el dato falso).
- La **semántica B2B** de navegación y auth (dueño = staff con password).
- Los **contratos de test** existentes (unit `business-header.test.tsx`, e2e `landing.spec.ts`).

## 3. Decisiones tomadas (forks resueltos)

| Decisión | Elección | Razón |
|---|---|---|
| Alcance | **Restyle de las mismas 6 secciones** (no rebuild) | Conserva copy y estructura; menor riesgo |
| Header/Footer | **Igualar el *look* al jugador, conservar links B2B** | El `PortalHeader` del jugador manda "Ingresar"→`/ingresar` (magic link) y muestra "Explorar"; el dueño es staff → "Ingresar"→`/login`, "Empezar gratis"→`/register`. Reusar el componente del jugador rompería auth + unit test |
| Hero | **2 columnas con mockup flotante premium nuevo** | Replica el efecto "wow" del `BookingCardMockup`, adaptado a panel de complejo |
| Dato falso (24 hs) | **Reemplazar la card por "Avisos al instante" (Web Push real, cambio #7)** | Corrige el único dato inexacto; el resto del copy es correcto |
| Componentes premium | **Reusar `Reveal`; clases `tg-float`/`tg-drift`/`font-display`/`font-logo` (globales)** | Ya definidas en `tailwind.config.ts`; cero infra nueva |

## 4. Arquitectura

### 4.1 Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/(business)/layout.tsx` | Fondo `bg-slate-950` → `#020617` (navy del jugador). Estructura header/main/footer intacta. |
| `src/components/site/BusinessHeader.tsx` | Restyle a **pill flotante overlay** (estilo `PortalHeader variant="overlay"`: `backdrop-blur`, borde `white/.09`, glow). Links B2B intactos. |
| `src/components/site/BusinessFooter.tsx` | Restyle al look premium de `SiteFooter`. Links B2B (`/login`, `/register`) intactos. |
| `src/app/(business)/para-complejos/page.tsx` | Restyle completo de las 6 secciones (ver §5). |

**No se crean componentes nuevos** salvo, si conviene, subcomponentes locales del page (`Hero`, `Features`, etc. ya son funciones locales). El mockup del hero es un subcomponente local nuevo dentro del page (análogo a `BookingCardMockup`).

### 4.2 Invariantes a preservar

- **Auth B2B:** "Ingresar"→`/login`, "Empezar gratis"→`/register`. Nunca `/ingresar` (es jugador).
- **e2e `landing.spec.ts`:** `/para-complejos` debe tener un link con accessible name `/empezar gratis/i` y `href` matcheando `/register`. Lo cumple el CTA del hero (y el header).
- **unit `business-header.test.tsx`:** `BusinessHeader` debe mantener "Ingresar"→`/login`, "Empezar gratis"→`/register`, y **no** mostrar "Explorar".
- **a11y:** `font-display italic` solo decorativo; `h1` único; `motion-reduce:` en animaciones (igual que jugador); `aria-hidden` en blobs/partículas/mockups.

## 5. Secciones (restyle)

Todas envueltas en `Reveal` con `delay` escalonado donde el jugador lo hace.

1. **Fondo + layout** — wrapper `#020617`, `text-slate-300`.
2. **Header (BusinessHeader)** — pill overlay premium; logo→`/`, anclas `Funciones`/`Testimonios`, `Ingresar`→`/login`, `Empezar gratis`→`/register`.
3. **Hero (2 col)** —
   - Izq: pill "en vivo" (`Para dueños y encargados`), `h1` clamp con degradé esmeralda en la frase clave (`lleno todos los días`), subtítulo, CTAs (`Empezar gratis`→`/register`, `Ingresar`→`/login`), trust pills con check. Mantiene las 3 trust lines actuales ("Sin tarjeta de crédito", "Config <2 min", "Soporte por email").
   - Bg image con mask + glow blobs (`tg-drift`) + partículas (`tg-float`), `motion-reduce` safe.
   - Der: **mockup flotante premium "Panel del complejo en vivo"** — tarjeta glass con: mini-grilla de turnos (estados libre/ocupado/reservado), fila resumen de caja del día, y toast flotante "Nueva reserva online · hace 1 min". Animación `tg-float`, badge "En vivo". `aria-hidden`, oculto en mobile (`hidden lg:block`).
4. **Features (6 cards)** — cards dark-premium (`Reveal`, hover `-translate-y`, icono en chip glow esmeralda). **Fix:** card 4 "Recordatorios automáticos / Email 24 hs antes" → **"Avisos al instante" / "Push al admin cuando entra una reserva online, con horario silencioso de madrugada"** (icono `Bell`). Cards 1,2,3,5,6 (reservas 24/7, MercadoPago, dashboard, caja unificada, abonados/fijos) **intactas** — son features reales.
5. **StatsBar** — panel con borde esmeralda + glow radial; números `font-display italic` degradé blanco→esmeralda. Mismos 4 stats.
6. **ShowcaseStrip (onboarding 4 pasos)** — bg image + overlay; pasos con número en chip glow; mockup grilla → ventana premium (grid + badge "En vivo"). Contenido (wizard 4 pasos, doc10) intacto y correcto.
7. **Testimonios** — cards premium (`Reveal`, `Quote` glow, estrellas). Contenido intacto.
8. **FinalCta** — glow radial, `Shield`, mismos textos ("30 días gratis…").
9. **Footer (BusinessFooter)** — look premium, links B2B intactos.

## 6. Lo que NO cambia

- Copy de stats, testimonios, textos de CTA y onboarding (correctos / marketing que ya matchea al jugador).
- Rutas, layouts de otras superficies, auth, contratos de API.
- Componentes del jugador (`PortalHeader`, `SiteFooter`) — no se reusan ni se modifican.

## 7. Testing

- **Sin tests nuevos obligatorios** (es restyle visual). Los contratos existentes deben seguir verdes:
  - `pnpm test` → `business-header.test.tsx` (links B2B + no Explorar).
  - `pnpm test:e2e` (o equivalente) → `landing.spec.ts` ("Empezar gratis"→`/register` en `/para-complejos`).
- `pnpm typecheck` y `pnpm lint` verdes tras cada cambio (regla CLAUDE.md).
- Verificación visual manual (o screenshot) de `/para-complejos` vs `/` para confirmar paridad de lenguaje.

## 8. Riesgos

- **Header overlay sobre layout existente:** el header es `sticky`/overlay; el hero debe ser el primer hijo de `main` y proveer su propio fondo para que el blur del pill se vea bien. Mitigación: hero con `relative isolate` y fondo propio, igual que el jugador.
- **Drift de copy del header pill:** al restilear `BusinessHeader` no cambiar accessible names ("Ingresar"/"Empezar gratis") para no romper el unit test.
- **Animaciones:** respetar `motion-reduce:` en todos los blobs/partículas/float (paridad con jugador, a11y).
