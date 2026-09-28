---
version: 1
slug: "src-app-business-para-complejos"
primary_target: "src/app/(business)/para-complejos"
related_targets: ["src/components/site/BusinessHeader.tsx","src/components/site/BusinessFooter.tsx"]
---

# /para-complejos (src/app/(business)/para-complejos)

Modo: Persuade. Visitante: el dueño de un complejo de 4-6 canchas del corredor oeste que llega desde un WhatsApp, casi siempre en el celular. Trabajo: entender que la seña se cobra sola y que el que clava pierde la seña, y empezar la prueba o escribir por WhatsApp. Mundo: La Previa de DESIGN.md en su versión siempre oscura; este brief no lo cambia.

## Decisiones del dueño (2026-09-27)
- Posicionamiento del red team §11.2: el sistema de señas para canchas de fútbol; tu complejo con página propia; contra la reserva de palabra. Nunca "te traemos jugadores" ni "siempre lleno". Decision doc: docs/decisions/2026-09-27-landing-para-complejos.md.
- Menos brillo, más producto: un solo resplandor, el acento de degradé solo en el titular, el peso en fragmentos reales del producto.
- Claims solo verificados: 30 días de prueba sin tarjeta, seña a la cuenta MP del complejo, 6 minutos para pagar la seña, NO_SHOW_CONSEQUENCES, avisos nocturnos a las 8, soporte del founder por WhatsApp (confirmado).
- Todo en el rediseño, sin parche intermedio. El merge lo decide el dueño.

## Direction contract
THESIS: La página se demuestra siguiendo una sola reserva con seña, del celular del jugador a la cuenta de MercadoPago del dueño; rechaza la grilla de tarjetas de funciones con ícono y el titular "siempre lleno".
OWN-WORLD: Losa slate-950 fija, vidrio al 3 % (.card-premium), .mockup-card solo en el celular, un único .hero-glow-blob detrás del paso de la seña, Archivo 900 itálica en titulares y en la cifra de la seña, Inter en todo lo demás, un solo verde sólido: "Probalo 30 días". Los fragmentos usan el vocabulario real: rótulos y tonos de slot-visual.ts y status-tone.ts, NO_SHOW_CONSEQUENCES.
STORY: El dueño entiende que el jugador reserva desde su página y paga la seña por MercadoPago a su cuenta, cree que el que no paga o no viene no le cuesta plata, y toca "Probalo 30 días" o "Escribime por WhatsApp".
FIRST VIEWPORT: Izquierda ~55 %: "Chau, reserva de palabra." en Archivo 900 itálica (acento en "de palabra."), bajada con el posicionamiento, CTA verde "Probalo 30 días" + WhatsApp secundario, línea "Sin tarjeta. Si no te sirve, lo dejás." Derecha: un celular con la página de un complejo de ejemplo, un turno de 60 min elegido y la hoja "Seña $ 9.000 de $ 30.000 · MercadoPago", rotulado Ejemplo. Firma: el reloj de la seña (6:00 que baja y libera el turno) en el paso 2.
FORM: Surface structure 1 de 7 ("El recorrido de la seña"); seed 790388c7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
