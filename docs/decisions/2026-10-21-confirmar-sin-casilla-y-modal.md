# Decisión: confirmar sin casilla de +18, con ingreso en modal y sin elegir cómo se paga

**Fecha:** 2026-10-21. **Decide:** Lazar (founder), después de probar el flujo de reserva de punta a punta. Se implementa junto con R4 de [`2026-10-20-vuelve-la-previa.md`](2026-10-20-vuelve-la-previa.md). La observación que lo motiva está en [`docs/gtm/ejecucion/10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md) (2026-10-21).

## Qué se decide

- **El +18 pasa a clickwrap.** Se saca la casilla. Debajo de los botones del ingreso va la frase "Al continuar declarás que sos mayor de 18 años y aceptás los Términos y condiciones" (el link abre `/terminos` en otra pestaña, con 44 px de alto táctil). Tocar "Continuar con Google" o "Continuar con mi email" es la declaración. Los dos formularios mandan `terms=on` en un campo oculto.
- **Se conserva todo lo que hace que valga como declaración jurada (ADR-012).** El servidor sigue exigiendo `terms` y sigue grabando `players.agreed_to_terms_at` + `terms_version` + `audit_logs`. Cambia cómo el jugador manifiesta el consentimiento (un acto de continuar, con la frase a la vista en el mismo bloque), no qué se registra. El consentimiento de Google sigue yendo por la cookie firmada de `startGoogleLoginFromReservar`, así que un alta nueva por Google llega con el +18 resuelto y no pasa por `/aceptar-terminos`.
- **El ingreso es un modal, no un bloque debajo del resumen.** Sin sesión, el botón de acción ("Reservar" o "Pagar seña") abre un diálogo (hoja que sube desde abajo en el celular): Google y email, uno debajo del otro. Con sesión, el mismo botón envía la reserva.
- **Solo email, sin campo Nombre.** El nombre del jugador se deriva en el servidor de la parte local del email: se corta en `+`, se parte en `.` `_` `-`, se descartan dígitos y símbolos, cada palabra va capitalizada, máximo 80 caracteres y, si no queda ninguna letra, "Jugador". Un nombre explícito (si algún cliente lo manda) gana. El jugador lo edita después en Cuenta.
- **No hay selector de cómo se paga en el complejo.** Se elimina la sección "Cómo pagás" (`PaymentMethodSelector`). Con seña el botón dice "Pagar seña" (con el monto si el complejo muestra precios); sin seña, "Reservar". La reserva sin seña se crea sin método presencial. El `?pay=` de un link viejo se tolera y viaja, pero ninguna pantalla lo ofrece. La regla de cancelación va debajo del botón; con seña y precios ocultos, ahí mismo: "Pagás una seña online con MercadoPago; el resto, en el complejo."

## Por qué ni el email ni Google alcanzan para presumir +18

- **Google:** en Argentina una cuenta de Google puede crearse desde los 13 años. Que alguien entre con Google no dice nada sobre los 18.
- **Email (enlace mágico):** no implica Google ni ninguna verificación de edad; cualquiera con un correo puede pedir el enlace.

Por eso la declaración sigue siendo necesaria. Lo que se cambia es la forma de pedirla: una casilla que un jugador nuevo no entendía (no sabía que tildarla era lo que habilitaba Google) pasa a una frase que acompaña la acción.

## Qué no cambia

- La validación +18 del servidor (`terms` requerido), el registro del consentimiento y `/aceptar-terminos` (que se mantiene para quien llega por otro camino).
- `booking-intent.ts` y la confirmación automática al volver del enlace del email, el caso `too_soon`, el botón fijo `[data-fixed-cta]` por encima de la barra inferior, "Avisarle al grupo" y los precios ocultos.
- Los vetos de producto: no hay texto libre sobre personas y no hay billetera virtual.

## Consecuencia asumida

Se pierde la línea "La cancha es tuya cuando empezás a señar" que vivía en la sección "Cómo pagás" (decisión v2 D1): sin esa sección no tiene dónde ir. Si hace falta decirlo, se agrega como una línea del resumen, no como una sección.
