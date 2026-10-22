# Decisión: se levanta el feature freeze

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder), en la sesión de spec de RIVAL v1.

**Supera D4** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md) (feature freeze hasta el 2026-11-01), con las acotaciones que le hizo [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md). También supera F2 de esa misma decisión, que dejaba el panel en mantenimiento.

## Por qué

En palabras del founder: "Levanta el freeze, es una decisión mía." Da tres razones:
- El Vagón ya está adaptado a TurnoGol y "cada vez lo quiere más".
- Hay dos features grandes en marcha: RIVAL y el bot de IA de WhatsApp, que también pidió el cliente.
- El freeze limitaba las propuestas. Quiere que se le plantee todo lo que sirva para "crear la gran comunidad de RIVAL" y para sumar features nuevas.

## Qué cae

- **El freeze completo.** Ya no hace falta encuadrar un cambio en una excepción (bug, seguridad, fricción observada…) ni registrarlo antes en `10-aprendizajes.md` para poder programarlo. Anotar ahí lo que se observa en clientes reales sigue siendo una buena práctica, pero deja de ser un requisito para programar.
- **La kill list de D4** y lo "congelado" de F4 y de [`09-gates.md`](../gtm/ejecucion/09-gates.md). Ahora son ideas que se pueden proponer. Cada una entra cuando el dueño la decide por escrito, no por calendario.
- **F2:** el panel admin vuelve a recibir mejoras, no solo arreglos.
- **El techo del 2026-11-01.** RIVAL ya no tiene que salir antes de esa fecha.

## Qué sigue vigente

Ninguno de estos puntos dependía del freeze:

- **Los vetos de producto de `CLAUDE.md`.** Cada uno tiene su propio decision doc:
  - sin billetera;
  - abonados solo con `price_per_session`;
  - el no-show no es deuda;
  - sin recordatorio de 24 h;
  - el jugador sin Realtime;
  - horario silencioso para el push al admin;
  - sin AFIP;
  - Personas sin tabla de contactos;
  - las reglas de caja y de torneos.

  Se cambian como siempre: con decisión escrita del dueño, nunca de pasada.
- **Nunca texto libre sobre personas** (Ley 25.326). Es un veto legal, no de producto, y no se reabre sin asesoría.
- **Precio, seña por defecto y lifecycle:** cualquier cambio sigue necesitando una decisión escrita del dueño. Son circuitos de plata y tocan a El Vagón en producción.
- **Lo que llega a producción** pasa por el criterio de siempre: qué efecto tiene sobre El Vagón y el OK del founder antes.
- **El principio de gates de D5** (Operations → Distribution → Identity → Competition → Media). Pasa a ser orientación para priorizar y deja de ser un bloqueo. Los umbrales de [`09-gates.md`](../gtm/ejecucion/09-gates.md) se siguen midiendo.
- Las decisiones de diseño y portal: La Previa, con la ficha `/[slug]` en La Reserva ([`2026-10-20-vuelve-la-previa.md`](2026-10-20-vuelve-la-previa.md)), con `DESIGN.md` como autoridad. Los precios ocultos por complejo, y RIVAL detrás del flag `rival`.

## Consecuencias

- **Lectura del modelo:** hasta hoy, un pedido que caía en "No permitido" devolvía "REQUIERE INPUT". Desde ahora, una feature nueva se propone y se diseña directamente. "REQUIERE INPUT" queda para las decisiones de negocio y para lo que choca con un veto vigente.
- **`CLAUDE.md`:** el bloque "FEATURE FREEZE" se reemplaza por un puntero a esta decisión con lo que sigue vigente. `PRODUCT.md`, D4, F2, F4, `09-gates.md` y `2026-10-20-vuelve-la-previa.md` llevan un banner que apunta acá.
- **Confianza:** es una decisión del founder sobre su propio foco, no una validación de mercado. La evidencia de El Vagón es la que ya está en `10-aprendizajes.md`.
