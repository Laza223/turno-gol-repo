# Decisión: en el celular, la reserva de la ficha va en tres pasos (día, hora y cancha)

**Fecha:** 2026-10-29. **Decide:** Lazar (founder). Motivo: en `/[slug]` el jugador elige la hora y ve "5 libres" en letra chica. Después la página baja sola y aparecen las canchas en filas que parecen texto. Alguien que no se lleva bien con el celular no entiende cuál es el próximo toque.

## Qué se decide

- **Una pregunta por pantalla:** "¿Qué día querés jugar?", "¿A qué hora?" y "¿En qué cancha?". Al tocar una opción se pasa al paso siguiente. Al tocar la cancha se va a confirmar (`/reservar`), igual que antes. Arriba hay una barra con "← Volver", "Paso N de 3" y tres segmentos de progreso.
- **El día es un paso propio, aunque sea "Hoy".** Cada día muestra su estado antes de elegirlo: "Hay lugar", "Completo", "Sin horarios" o "Cerrado". Esos estados salen de la consulta de la semana que ya existía (`/api/public/availability/week`).
- **El flujo vive en la ficha**, debajo de la portada, sin un botón "Reservar" que lo abra. Desde el primer toque, la página sube hasta dejar la pregunta arriba y la barra del paso queda pegada debajo de la barra de TurnoGol.
- **El paso vive en la URL** (`date` y `hora`, el contrato de siempre). El botón atrás del celular retrocede un paso. Un link compartido y el "Volver" de confirmar caen en el paso que corresponde. Si se entró directo al paso 2 o 3, "Volver" reemplaza la URL en vez de retroceder, para no sacar al jugador del sitio.
- **El movimiento usa la plataforma:** View Transitions, con el paso viejo saliendo de costado y el nuevo entrando, en 200 ms. No se usa `motion`, porque `DESIGN.md` lo reserva a `/onboarding`. Sin soporte del navegador, o con movimiento reducido, el paso cambia al instante.

## El toque de más

El día como paso suma un toque a todos los caminos respecto de la línea base ([`2026-10-14-portal-jugador-linea-base.md`](../planning/2026-10-14-portal-jugador-linea-base.md)), aun para reservar hoy. Eso va contra la vara de F3 ([`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md)): "menos toques que hoy". Lazar lo eligió sabiendo el costo. Para quien no se maneja con el celular, una pantalla con una sola cosa que tocar vale más que un toque menos. Además, el estado de cada día se ve antes de elegirlo; antes se descubría después de tocar el chip.

## Descartado

- **"Hoy" ya elegido, entrando directo a la hora.** Ahorra el toque, pero quien quiere otro día tiene que descubrir dónde se cambia, y el flujo pasa a tener dos entradas.
- **Un botón "Reservar" que abre el flujo en otra capa.** Es otro toque y otra superficie, y el jugador ya vino a reservar.
- **Una sola columna con mejor jerarquía.** Mejora la lectura, pero no resuelve la confusión de fondo: muestra varias cosas tocables a la vez.

## Qué no cambia

- La lógica de reserva, la seña, los precios y los precios ocultos por complejo.
- `/reservar`, el ingreso y la vuelta de la reserva.
- En escritorio la reserva sigue en la columna lateral con los mismos tres pasos, pero la barra no queda pegada y la página no se mueve sola.
- La ficha sigue en La Reserva ([`2026-10-20-vuelve-la-previa.md`](2026-10-20-vuelve-la-previa.md)).

## Consecuencia asumida

Cambian a propósito los contratos de la ficha: el grupo de radios "Hora", los chips de día y la región "Canchas libres a las …" dejan de existir como estaban. Se actualizan junto con el cambio los tests unitarios, las stories y los e2e de la ficha (TG-HP-003, `availability.spec.ts`). Las capturas visuales de la ficha también cambian; los e2e y los visuales no corren en los PRs.
