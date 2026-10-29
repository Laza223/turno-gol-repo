# Decisión: la bienvenida de RIVAL en dos momentos y el tablón después de crear

**Fecha:** 2026-10-28. **Decide:** Lazar (founder), sobre la critique de `/rival` y `/rival/nuevo`. **Insumo:** el snapshot `.impeccable/critique/2026-10-28T03-59-13Z__src-app-player-rival.md`, que dio 23/36. Los dos P1 fueron:
- la bienvenida pide posición y zona antes de dejar armar el primer partido;
- el form de armar carga el tablón, que es una segunda tarea.

**Enmienda** las decisiones 1, 5 y 11 de [`2026-10-22-rival-v1.md`](2026-10-22-rival-v1.md) y los §5.1, §5.2, §5.7 y §7 de la spec [`2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md). Lo que no se nombra acá sigue igual.

## Decisiones

1. **La bienvenida se parte en dos momentos.**
   - **Para armar un partido** alcanzan el nombre y aceptar las reglas.
   - **Al sumarse**, sea con "Voy" por link o con "Pedir sumarme" desde el tablón, se pide la posición y la zona. Solo se pide lo que falta: quien ya las cargó no vuelve a verlas.
   - La frase "El organizador ve además tu posición y tu zona." pasa al paso de sumarse, que es donde aplica.
   - `RIVAL_TERMS_VERSION` no cambia, porque el texto de las reglas no cambia.
2. **El intent por mail (decisión 11) solo suma automático si el perfil está completo.** Si a quien toca el mail le falta la posición o la zona, ve el paso que le falta y suma con su toque. Nunca queda adentro sin esos dos datos, porque el organizador los usa para armar el equipo.
3. **El tablón sale del form de armar** y se publica después, desde la vista del partido ("Publicar en el tablón" ya existía ahí). Enmienda la decisión 1, que decía "se publica con un interruptor" en el form.
   - Arriba del form va **"¿Qué armás?"** con dos opciones: **Partido completo** y **Mi equipo busca rival**.
   - "Mi equipo busca rival" fija "Cuántos juegan" al formato, porque `canSeekRival` exige `capacity === format` y la capacidad no se puede cambiar después de crear.
   - Al crear, la vista del partido tiene una sola acción verde arriba:
     - **"Avisar al grupo"** si es partido completo;
     - **"Publicar en el tablón"** si el equipo busca rival.
4. **WhatsApp del tablón:** al publicar aparece la casilla **"Guardar este número en mi cuenta"**, sin marcar.
   - Si se marca, el número queda en `players.phone`, y la próxima vez viene precargado al publicar. La reserva no pide teléfono, pero los complejos donde el jugador reserva sí ven `players.phone`: la ayuda de la casilla lo dice.
   - Es un dato propio, con consentimiento explícito y separado del de mostrar el número a quien acepte.
5. **Hora en el form:** chips rápidos de 19:00, 20:00, 21:00 y 22:00, más "Otra hora" con la lista completa.
   - Las dos listas se filtran por el horario del complejo elegido (`opening_hours`, `closed_dates` y `closes_next_day`) y por lo que ya pasó.
   - Si el complejo no tiene horario cargado, va la lista completa.
   - Es una ayuda del cliente: el servidor no valida el horario del complejo, igual que antes.

6. **Día sin horas.** Si el horario del complejo deja cero horas un día (día cerrado, `closed_dates` o un horario mal cargado, como el default viejo que cerraba vie/sáb a la 01:00 sin `closes_next_day`), el form muestra la lista completa con el aviso "Ese día el complejo figura cerrado en TurnoGol. Si tenés la cancha igual, elegí tu hora." No se bloquea el día.
7. **El ingreso RIVAL del "Voy" se usa también en "Armar un partido" y "Pedir sumarme"** cuando no hay sesión. Crea la cuenta con el clickwrap +18 (ADR-012) y vuelve solo. Armar y pedir no se auto-envían: siguen pidiendo el toque. Antes mandaban a `/ingresar`, que por email no crea cuenta, así que un organizador nuevo esperaba un mail que nunca llegaba. Quien llega directo a `/rival/nuevo` por URL sigue yendo a `/ingresar`.
8. **Ayuda de los niveles** debajo de los chips: "Lo elegís vos, según cómo juega tu grupo." y, según el elegido, Tranqui "Para pasarla bien, sin drama.", Parejo "Se juega en serio, sin pasarse.", Picante "Se juega a ganar.". El enum y los labels no cambian.
9. **"Busca rival" con el equipo completo** tiene un solo titular, "Busca rival". No dice "¡Estamos los N! Se juega." porque todavía no hay rival ("RIVAL junta gente de verdad").
10. **El mail de pedido distingue al capitán de un equipo rival.** Cuando el pedido llega a un partido que busca rival, el mail al organizador dice que es un equipo que quiere jugarle, no un jugador suelto que se suma.
11. **Con el partido lleno, el botón fijo dice "Voy al banco".** Entra al banco como siempre; solo cambia la etiqueta para que no prometa un lugar que no hay.
12. **La intro del perfil del capitán tiene texto propio.** "Para armar los equipos" no aplica a quien trae su equipo: dice que el organizador ve la posición y la zona para coordinar el partido.
13. **La bienvenida al sumarse va sin foto y con "Estoy adentro" fijo abajo**, como el "Voy". La foto se carga al armar o desde `/configuracion`. Las cuatro reglas y el consentimiento siguen visibles y completos, sin plegar.
14. **La posición es un select en todas las tarjetas de bienvenida**, nunca chips en unas y select en otras.
15. **Al capitán de un equipo rival se le pide solo la zona.** La posición no le sirve al organizador, porque trae a su equipo. Supera en parte a las decisiones 2 y 12: el servidor exige la posición y la zona para sumarse como jugador, y solo la zona para pedir como capitán (el rol lo da el partido, no el cliente). Si ese capitán después se suma como jugador a otro partido, se le pide la posición que falta.

## Qué no cambia

- **No hay migración.** `players.position`, `players.zone` y `players.phone` ya eran nullable, y el estado de la bienvenida se deriva en TypeScript.
- **Editar la posición y la zona después** sigue pendiente (tarjeta "Tu perfil en RIVAL" de `/configuracion`, spec §7). Lo registra el ledger.
- Siguen vigentes los vetos: sin texto libre sobre personas (Ley 25.326), y "RIVAL junta gente de verdad" (ni cupos ni confirmados inventados).

## Cómo se ejecuta

Los siete comandos de la critique (harden, clarify, onboard, distill, adapt, layout y polish) se aplican a todo RIVAL del jugador. Primero diseña un agente por comando, después implementan agentes con dueño por archivo y al final revisa otra vez un agente por comando. El detalle está en el ledger [`2026-10-rival-v1-ledger.md`](../planning/2026-10-rival-v1-ledger.md).
