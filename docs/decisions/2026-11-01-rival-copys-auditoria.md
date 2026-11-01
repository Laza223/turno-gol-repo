# Decisión: los copys de RIVAL después de la auditoría externa

**Fecha:** 2026-11-01. **Decide:** Lazar (founder), sobre la auditoría externa de lenguaje, claridad y persuasión de `/rival` (revisión del sitio en vivo del 31/10, escritorio). **Método:** tres revisores de solo lectura cruzaron cada hallazgo con el código de `origin/main` y con las decisiones vigentes; lo que dependía de una regla se verificó en el código, no en la pantalla.

**Enmienda** el copy de [`docs/rival/landing.md`](../rival/landing.md) (decisiones 1 a 16) y las respuestas de su sección 9, que la decisión 13 había dejado «tal cual». Lo que no se nombra acá sigue igual.

## Qué dice la auditoría y qué se encontró

Acierta en lo grueso:
- el hero empieza por la mecánica, no por el beneficio, y «si falta 1, sale al tablón» suena automático cuando publicar es manual y sirve para cualquier cantidad de lugares;
- «Muy pronto» aparecía 6 veces contra «Por partes y sin fecha»;
- el ingreso desde RIVAL hablaba de reservas y perdía el contexto;
- el tablón vacío cortaba la expectativa de quien llegó a buscar partido.

Se equivoca o no tiene contexto en lo que el código ya resolvía o es marca del producto (ver «Lo que no se aplica»).

**Dos promesas falsas que la auditoría no vio y se sacaron de la app:**
- al quedar en el banco decía «te avisamos por mail», pero el mail «entraste al partido» se cortó por la decisión de poco mail (`rival-mail.service.ts`);
- al armar un partido con reserva decía «Si se cae, te avisamos», y ese mail nunca se construyó.

## Decisiones

1. **Segundo botón del hero y del cierre: «Buscá un partido»** (antes «Mirá el tablón»). Dentro de la app el tablón sigue siendo «Ver el tablón»: vocabulario de pantalla fijo.
2. **«Banco» se queda**, con la glosa «anotado por si alguien se baja, por orden de llegada». No se cambia a «Suplentes».
3. **Nivel: Tranqui · Parejo · Picante se quedan.** Es intensidad que declara el organizador, no habilidad; la ayuda «según cómo juega tu grupo» pasa también a la landing.
4. **Título Grupo/Club:** «Los turnos fijos de la semana son para jugar tranqui. El club, para competir.» (frase del dueño).
5. **Título de las reglas: «Antes de salir a la cancha.»** (antes «Competir sin escrache»). El principio sigue vigente en el README; solo cambia el título público.
6. **Reglas sin promesa absoluta.** «¿Se va a ver cuando me va mal?» pasa a hablar solo de jugadores: «Tu rendimiento no se le muestra a otros jugadores. Las tablas de jugadores muestran solo a los de arriba, y tu posición la ves vos.» La tabla de clubes es abierta y con descensos, así que no se promete nada sobre ella.
7. **«Gratis» se mantiene** (decisión 12) y se aclara que la reserva de la cancha es aparte y la maneja cada complejo, sin nombrar precios.
8. **Ingreso:** en `/ingresar`, cuando se viene de RIVAL, el título y la bajada hablan de RIVAL, y «¿Primera vez?» manda a armar el primer partido, que sí crea la cuenta por email (`/ingresar` solo re-ingresa cuentas existentes). Los botones «Continuar con…» y la frase «Al continuar declarás…» no se tocan: son el clickwrap de +18 (`2026-10-21-confirmar-sin-casilla-y-modal.md`).
9. **Escenas intactas.** Se mantiene que la landing cuenta todo RIVAL (decisión 1 de `landing.md`). La banda de mitad de cancha suma un resumen de tres ideas: identidad de equipo, competir con resultados que suman, compartir la historia. Recortar o plegar las escenas queda para cuando haya medición.
10. **Apoyo del hero:** «La plataforma de los futboleros: armá tus partidos, encontrá rivales y sumate a los de otros.» La idea es del dueño; se evitó «donde están todos» porque afirma una presencia que hoy no existe (el tablón está casi vacío).
11. **Palabras sueltas que sí cambian:** «esos partidos sí cuentan» → «suman a la tabla y a la categoría»; el chiste del arquero → «Si atajás, acá te buscan…»; «Defensas: 2» → «La defendió 2 veces»; Hora RIVAL sin «de la casa».

## Lo que no se aplica

| Propuesta | Por qué no |
|---|---|
| Demo del hero con «Faltan 2» | Rompe la mecánica (con 8 + Voy no se llena) y el momento «Se juega» |
| «Mandame el enlace» como botón | Rompe el clickwrap de +18 |
| «Suplentes», «solicitud» en vez de «pedido», «Armar un partido» como único CTA | Vocabulario de pantalla fijo (spec §2, 10+ pantallas) |
| Frases que insinuaban que se puede armar un partido sin cancha (por ejemplo «si no, la marcás como tuya») | «Ya tengo la cancha» es obligatorio: «sin cancha no hay partido» (`NewMatchSections.tsx`) |
| Reemplazar «¿Volverían a jugar?» explicando qué hace el «no» | Los términos y la privacidad todavía no mencionan RIVAL (decisión 13) |
| «Ni premios en dinero» | Premios sigue abierto (README, «Premios y prode») |
| «Sin comentarios personales sobre jugadores» para las crónicas | Debilita la regla: la IA no nombra jugadores |
| Condiciones numéricas de las ediciones de figurita, de la Leyenda de la cancha, del clásico | Son propuestas fuera hasta su ola (decisión 8) |
| Sacar «serio», dorsales → números, tabla sin «división», Temporada Cero sin «los que la jueguen» | El dueño eligió dejarlos |

## Abierto (REQUIERE INPUT)

El copy nuevo no compromete ninguna de estas reglas.
1. ¿El picado tiene figura o tabla internas del grupo? (`README.md` dice que sí; `clubes.md` y `categorias.md`, que no.)
2. Resultados distintos: quién resuelve y cuándo se excluye. Hoy solo «queda en revisión y no cuenta» (propuesta de la decisión 2026-10-29).
3. Corona: empate, inactividad, quién la tiene al inicio, cómo se acepta y vence un desafío.
4. Temporada Cero: si «Fundador» depende de crear club, jugar o un mínimo de partidos.
5. Club oculto: qué se ve de él (cartelera con los dos escudos o «elige si aparece»).
6. `/terminos` y `/privacidad` no mencionan RIVAL: hasta que lo hagan no se explica el uso del «no» de «¿Volverían a jugar?».
7. ¿Se puede escribir el nombre propio del club o solo elegir uno propuesto por la IA?
8. ¿El OK al quiz de categoría cubre su tabla de arranque, que sigue marcada «pendiente del OK»?

## Pendiente fuera de este cambio

- La sección «Mis datos» de `/configuracion` describe el export como «tu perfil, tus reservas y tus pagos», pero el JSON incluye también RIVAL; y `/configuracion` conserva la «Zona preferida» que la decisión 5 del 22/10 dio de baja. Ya que la FAQ ahora manda a esa pantalla, conviene alinearlas.
- No hay e2e de `/rival`; el único guardián de los textos de la landing es el ojo.
