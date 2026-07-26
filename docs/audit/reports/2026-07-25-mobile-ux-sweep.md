# Barrido UX/UI mobile — 2026-07-25

Rama `feat/mobile-ux-hardening`. Disparador: el dueño probó la app en un iPhone real (Chrome iOS) y reportó zoom automático al tocar campos de texto, con scroll horizontal y vertical como consecuencia, más "varias vistas que se rompen".

## Causa raíz del bug reportado

iOS WebKit hace zoom automático al enfocar cualquier campo con `font-size` computado < 16px. En iPhone **todos** los navegadores son WebKit (Chrome iOS incluido), así que aplica siempre. El zoom achica el visual viewport y todo lo de ancho fijo queda fuera → scroll horizontal.

El primitivo `ui/input.tsx` declaraba `text-sm` (14px), y ~18 constantes de campo replicaban el patrón. `maximumScale: 5` en el viewport es correcto para accesibilidad pero **no previene** el zoom-on-focus.

## Por qué no se detectó antes

La fase F10 (Responsive/Mobile) cerró 🟢 PASS, pero toda su verificación automatizada corre en **Chromium emulando Pixel 5**. Chromium nunca reproduce el zoom-on-focus de iOS. El propio report difirió el smoke en iPhone físico (`fase-f10-responsive-mobile-report.md:187`) y nunca se ejecutó.

**Corrección de método aplicada:** el WebKit de Playwright *tampoco* implementa el auto-zoom (es de UIKit/Mobile Safari, no del motor de render), así que ninguna suite automatizada puede probar la ausencia del síntoma. Lo que sí es verificable en cualquier motor es la **causa**: `getComputedStyle().fontSize >= 16`. Ese es el invariante que ahora guardan los tests.

## Método

| Herramienta | Motor | Autoritativo para |
|---|---|---|
| agent-browser (`set viewport`) | Chromium | Overflow, layout, tap targets, consola. El caballo de batalla del barrido |
| Playwright `mobile-safari` | WebKit real (iPhone 14) | `dvh`/`svh`, `position: sticky` bajo overflow, `env(safe-area-*)`, scroll-lock |
| iPhone del dueño | WebKit iOS real | Zoom efectivo, teclado virtual, PWA standalone, retorno de MercadoPago |

Viewports barridos: **360** (Samsung compacto), **375** (iPhone SE), **390** (iPhone 14/15/16), **430** (Pro Max).

Probes por pantalla, todos medidos sobre el DOM renderizado —no impresiones—: (1) `documentElement.scrollWidth <= innerWidth`, (2) `fontSize >= 16` en cada campo visible, (3) `getBoundingClientRect() >= 44×44` en cada elemento tocable, (4) los tres anteriores **con los overlays abiertos**.

## Resultados post-fix

| Ruta | Overflow X | Campos < 16px | Targets < 44px |
|---|---|---|---|
| `/` (360/375/390/430) | ninguno | 0 | 0 |
| `/explorar` | ninguno | 0 | toggle Lista/Mapa (40px de ancho) → corregido |
| `/e2e-complejo-demo` | ninguno | 0 | 0 |
| `/e2e-complejo-demo/disponibilidad` | ninguno | 0 | 0 |
| `/login` · `/register` · `/ingresar` · `/forgot-password` | ninguno | 0 | 0 tras corregir |
| `/dashboard` · `/grilla` · `/caja` · `/caja/cantina` | ninguno | 0 | ver §Pendientes |
| `/reservas` · `/jugadores` · `/abonados/nuevo` · `/settings/horarios` | ninguno | 0 | ver §Pendientes |
| `/caja` + RegisterMovementModal abierto | ninguno | 0 | 0 |

Verificación puntual del bug reportado: el input `#exp-q` (placeholder "Nombre del complejo…") de `/explorar` mide **16px** contra los 14px previos.

Modal en 390px medido con el overlay abierto: `358×658 @ top=16, left=16` — entra completo, anclado arriba, sin overflow.

## Hallazgos y correcciones

### A — Zoom al enfocar campos (causa del reporte)
Regla sin capa en `globals.css` que fuerza 16px a `input`/`textarea`/`select`/`[contenteditable]` bajo `md`, más `text-base md:text-sm` explícito en los primitivos (`ui/input`, `ui/phone-input`, `ui/combobox`) y en las ~18 constantes de campo. Regla nueva en `MASTER.md §3.1`.

Dos deudas resueltas de paso: `ui/combobox.tsx` aplicaba `className={inputClassName}` **sin default** (heredaba lo que viniera del caller, o el default del user-agent si no venía nada), y `HeroSearch` derivaba su clase de fecha con `fieldClass.replace(...)` sobre un literal — reordenar `fieldClass` devolvía el original **sin error**.

### B — `100vh` en los shells (grilla inalcanzable)
`admin-layout-shell.tsx` aplicaba `h-screen overflow-hidden` a la raíz en `/grilla`. En iOS `100vh` incluye la barra de URL, así que el contenedor quedaba más alto que el área visible y el excedente era **inalcanzable**: los últimos turnos del día no se podían tocar. Migrado a `dvh` acá y en `super-admin-layout-shell`, `ui/toast`.

### C — Teclado tapando el CTA de los modales
`ui/dialog` centraba con `translate-y-[-50%]`: con el teclado abierto la mitad inferior —incluido el botón de submit— quedaba detrás, y ni `svh` ni `dvh` se recalculan al aparecer el teclado. Ahora se ancla arriba en mobile (`top-4 translate-y-0`) y vuelve al centro desde `md`. Resuelve los 6 modales de formulario sin tocarlos uno por uno. Las clases se exportan como `dialogContentClass` para que `BookingFormModal` (que monta Radix directo) consuma la misma receta.

### D — Overlays sin tope de alto
`ui/dropdown-menu` tenía `overflow-hidden` sin `max-h`: un menú largo se cortaba contra el viewport sin poder scrollear. `ui/popover` sin `max-h`. `ui/sheet` side `left` (el drawer del sidebar admin) sin `overflow-y-auto`.

### E — Scroll-lock que no funciona en iOS
El lightbox de `TenantGallery` usaba `document.body.style.overflow = 'hidden'`, que **no frena el scroll en iOS Safari**: el fondo se movía detrás de la foto. Extraído a `src/hooks/use-scroll-lock.ts` con el patrón `position: fixed` + restauración de `scrollY` (sin la restauración, cerrar el lightbox devolvía al tope de la página).

### F — Overflow horizontal propio
- `AvailabilityGrid`: el toolbar de fecha (`min-w-[180px]` en un flex con título y prev/next) **sí desbordaba** a 360px → `flex-wrap`. La tabla de canchas **no** desbordaba (ya estaba contenida por `overflow-x-auto`); el problema real era scroll lateral sin afordancia → `min-w-[88px] sm:min-w-[110px]` + `snap-x`.
- `explorar/page.tsx`: `-mx-4` fijo con `px-4 sm:px-6 lg:px-8` → el margen negativo ahora acompaña al padding en cada breakpoint.
- `PushNotificationManager`: `left-4` + `max-w-[calc(100vw-2rem)]` desbordaba 1rem exacto → `inset-x-4`.

### G — Safe area y elevación
`BusinessHeader` era el único header fixed sin `pt-[env(safe-area-inset-top)]` — se nota sobre todo con la app instalada. `PlayerBottomNav` estaba en `z-10` con el header en `z-50`.

### H — Touch targets
~30 elementos por debajo de 44×44 corregidos con cascada `md:` que preserva el tamaño de desktop. El barrido con navegador encontró varios que el inventario estático no vio, porque no usaban clases de altura: el botón de mostrar contraseña de `/login` medía **16×16**, y los links "Volver" de las páginas de auth (24px, y son `lg:hidden` — solo existen en mobile).

## Falsos positivos identificados

- **Títulos de card en `/explorar`** (156×20): `TenantCard` usa el patrón "stretched link" (`after:absolute after:inset-0`), así que el área tocable real es la card entera. `getBoundingClientRect()` mide el elemento, no su pseudo-elemento. El probe de `_helpers.ts` ahora detecta y excluye este patrón.
- **Botón "Cerrar" 24×24 en todas las rutas**: es el overlay de Next.js Dev Tools, no de la app.
- **Links dentro de texto corrido** ("¿Sos nuevo? *Empezar gratis*"): les aplica la excepción "inline" de WCAG 2.5.5. Agrandarlos separa los renglones.

## Guard rails

| Test | Dónde corre | Qué protege |
|---|---|---|
| `tests/unit/mobile-field-font-size.test.tsx` | job `unit-tests`, **cada push**, sin browser ni DB | El invariante de 16px sobre primitivos y constantes, y que la regla de `globals.css` siga **fuera de todo `@layer`** — dentro de uno, las utilities de Tailwind v4 le ganan por cascada de capas y el fix deja de aplicar en silencio |
| `tests/e2e/mobile/field-font-size.spec.ts` | pre-release | `getComputedStyle` sobre campos reales en 19 rutas + con overlays abiertos |
| `tests/e2e/mobile/_helpers.ts` | compartido | Los tres probes devuelven **la lista de culpables**, no un booleano: un fallo se arregla leyendo el output |

El gate de PR corre en un runner de 2 cores y ya murió por timeout dos veces con la suite completa (documentado en `ci.yml`). Por eso el guard barato es unit y el caro corre pre-release: un guard que se apaga por lento no protege nada.

## Pendientes

- Tanda de tap targets del admin cazada en el último barrido: 7 checkboxes de 16×16 en `/settings/horarios` (el peor), botones de 36px en `/caja` y `/dashboard`, tabs de 32px en `/reservas`.
- Fase PWA (hint de instalación en iOS, verificación en modo standalone) y performance mobile (Lighthouse con preset móvil sobre las rutas de plata).
- **Hallazgo a verificar**: `PushNotificationManager` registra el Service Worker con `scope: '/admin/'`, pero la app no tiene prefijo `/admin/` en sus URLs — `(admin)` es un route *group*, las rutas son `/grilla`, `/caja`. Un SW con ese scope no controla ninguna página. Push sigue andando (la suscripción vive en la registration), pero `clients.matchAll()` en `notificationclick` opera sobre un conjunto posiblemente vacío.

## Qué NO se verificó, y por qué

Ninguna de estas se puede probar sin un iPhone físico. Van a la checklist del dueño:

1. **Zoom efectivo al enfocar** — ni Chromium ni el WebKit de Playwright lo implementan. El invariante de 16px es el proxy; el iPhone es la prueba.
2. **Teclado virtual tapando el CTA** — ningún browser headless levanta teclado.
3. **PWA en modo standalone** — sin barra de URL cambian las alturas de viewport y no hay botón atrás.
4. **Retorno de MercadoPago desde la app instalada** — en iOS standalone el pago abre un in-app browser view y el redirect de vuelta puede no volver a la app, dejando la reserva colgada en `pending_payment`. Es el mayor riesgo de la PWA.
5. **Web Push en iOS** — requiere la app instalada (iOS 16.4+).
