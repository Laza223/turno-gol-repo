---
version: 1
slug: "src-app-business-para-complejos"
primary_target: "src/app/(business)/para-complejos"
related_targets: ["src/components/site/BusinessHeader.tsx","src/components/site/BusinessFooter.tsx"]
---

# /para-complejos (src/app/(business)/para-complejos)

Modo: Persuade. Visitante: el dueño de un complejo de 4-6 canchas del corredor oeste que llega desde un WhatsApp, casi siempre en el celular. Trabajo: entender que la noche del complejo se lleva en el celular (turnos, cobros y caja) y empezar la prueba o escribir por WhatsApp.

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio), F8 de la decisión del 2026-11-13 ([`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md)). **Ya no es la versión siempre oscura de La Previa** (`.dark-surface`, `.card-premium`, `.mockup-card`, `.hero-glow-blob`, Archivo 900 itálica): la página sigue el tema del visitante, claro u oscuro. `(business)/layout.tsx` pone `data-portal-glass` y `portal-ambient`, sin barra de abajo (son páginas para el dueño, no para el jugador). La misma piel cubre `/precios`, el blog, las comparativas, los legales (`ArticleShell`) y `/r/[code]`.

## Decisiones del dueño

**2026-09-27 (posicionamiento, vigente):** el red team §11.2: tu complejo con página propia; contra la reserva de palabra. Nunca "te traemos jugadores" ni "siempre lleno". Decision doc: `docs/decisions/2026-09-27-landing-para-complejos.md`. Menos brillo, más producto: el peso en fragmentos reales del producto. Claims solo verificados (seña a la cuenta MP del complejo, 6 minutos para pagar la seña, `NO_SHOW_CONSEQUENCES`, avisos nocturnos a las 8, soporte del founder por WhatsApp); los textos de venta pasan por la skill `turnogol-copy`, que prohíbe "sin tarjeta" en el copy.

**2026-11-16 (F8, decisiones de Lazar):**
- El hero es el del mockup: `HeroBackdrop` y texto centrado. Se borraron el celular animado (`NochePhone`) y la grilla real (`GridFragment`).
- "Así se ve tu noche" pasa a ser la agenda dibujada del mockup, con el título **"Así se ve la noche de tu complejo."** (la dirección §4.5 lo decía de otra forma: se corrigió).
- La cabecera de complejos es la píldora de vidrio de `PortalHeader` (`.portal-top*`) con sus mismos links más el botón de tema. En el celu, el tema va adentro del menú.

## Qué tiene la página, en orden

1. **Hero** (`.bz-stage`): `HeroBackdrop` y el h1 "Chau cuaderno, chau WhatsApp." (la segunda línea en verde), la bajada, los CTA (`pill` verde y `pill-glass`) y la línea del plan gratis con el link a `/precios` (el gratis va de puerta de entrada, nunca de titular).
2. **"¿Te suena?"** (`Escenas`): filas de problema que se tachan y muestran la solución.
3. **"Así se ve la noche de tu complejo."** (`AgendaFragment` dentro de `.bz-sec`): la agenda dibujada y las pastillas de funciones (turnos fijos, cantina con stock, cierre de caja, usuario para tu encargado, métricas, freno al que reserva y no viene, seña online si querés).
4. **Cierre** ("Probalo N días en tu complejo.", `.bz-cta glass-painted`) con "Ver precios".
5. **`BusinessFooter`.**

Todo vive en vidrio pintado (`glass-painted`) salvo la cabecera. Textos visibles en español rioplatense, voz de empresa.

## Movimiento (dirección §4.5)

Se reutiliza el de la sección: el tachado (`pc-tachar`), la solución (`pc-solucion`) y la agenda (`pc-celda`, `pc-due`) viven en `para-complejos.css`, bajo `prefers-reduced-motion: no-preference`, y arrancan con el `[data-revealed]` de `Reveal`. Las celdas de la agenda se encienden por fila y la celda "Sin cobrar" late una vez en rojo y queda. En planes, la píldora de Mensual y Anual se desliza y los precios cambian por reemplazo. Decidido en F9: brillo que sigue al puntero en las tarjetas de planes (solo compu).

## Direction contract (histórico del 2026-09-27, actualizado)

THESIS: La página se demuestra con fragmentos reales del producto (la agenda con sus cobros y lo que falta cobrar); rechaza la grilla de tarjetas de funciones con ícono y el titular "siempre lleno".
OWN-WORLD: Vidrio sobre `portal-ambient`, en claro y oscuro; Archivo 700 con `font-stretch: 104%` en los titulares; un solo verde de acción (la píldora "Probalo 30 días"). Los fragmentos usan el vocabulario real (`slot-visual.ts`, `status-tone.ts`, `NO_SHOW_CONSEQUENCES`); la agenda dibujada es un ejemplo, rotulado como tal (`ExampleTag`).
STORY: El dueño entiende que su noche se lleva desde el celular, cree que el que no paga o no viene no le cuesta plata, y toca "Probalo 30 días" o escribe por WhatsApp.
FINISH: sin revisión ni documentación no está terminado; todo raster que se publica lleva su procedencia.

## Planes (`/precios`) y artículos

`/precios` conserva el selector de canchas, la calculadora, los 12 incluidos, los pasos, las 8 preguntas y el cierre; los precios salen de `src/modules/billing/pricing.ts`, nunca escritos a mano. En el blog el h1 sigue siendo "Blog", la bajada es la descripción de la metadata y las tarjetas van sin foto. El 404 (`NotFoundView`) conserva su texto y una sola salida; hay un `not-found.tsx` en `(public)` y otro en `(business)` que montan solo `NotFoundView`, para que el cromo no salga dos veces. Referidos, reactivar, `/suspended` y la pausa del complejo no tienen mockup: van con `PortalResult`, `.bz-*` y `glass-painted`.

## Fuera

El panel, el alta (`/onboarding` y `/register`) y los precios, la seña por defecto y las reglas de cancelación (decisión escrita del dueño).
