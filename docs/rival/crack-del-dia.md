# El Crack del Día

**Estado:** idea de la punta de entrada (etapa 2), sin construir. Visión: [`README.md`](README.md), mundo 5. Catálogo: [`ideas.md`](ideas.md).

## Qué es

Un minijuego diario en la home de TurnoGol: adivinar un futbolista en 6 intentos. Es el mismo para todos y cambia a la medianoche (hora de Argentina).

Es la única pieza de RIVAL que **no necesita gente en la zona**: anda desde el día 1 con un solo complejo. Por eso trae tráfico y hábito antes de que haya tablas.

Tomamos el **género** (adivinar con pistas de colores, popularizado por Wordle), no copiamos un juego puntual. Nombre, diseño, pistas y modos son propios.

## Cómo se juega

1. Escribís el apellido de un futbolista; el campo autocompleta desde la lista del juego, así no se pierden intentos por tipeo.
2. Cada intento muestra pistas futboleras con tres colores:
   - **verde:** coincide;
   - **amarillo:** cerca (por ejemplo, la misma década o la misma región);
   - **gris:** no coincide.
3. Las pistas son: posición, país, un club por el que pasó, década en que brilló, y la letra inicial del apellido.
4. Si lo sacás, ves tu número de intentos y tu racha. Si no, ves quién era.

Los detalles finos (qué es "cerca" en cada pista, cuántas pistas por intento) se ajustan al diseñar la ola, probándolo.

## Modos

- **Diario**, el principal.
- **Leyendas:** solo retirados.
- **Ascenso:** jugadores del fútbol argentino de las categorías de abajo.
- **Selección:** jugadores que pasaron por la Selección.

Los modos extra son una propuesta: arranca solo el Diario.

## De dónde salen los jugadores

- Una lista curada a mano, con los datos que alimentan las pistas (posición, país, clubes, década).
- Son hechos públicos sobre carreras deportivas; no se usa ninguna foto, escudo, camiseta ni voz.
- Nadie de la lista aparece como si apoyara TurnoGol.
- El orden de los días se arma de antemano y no se repite un jugador dentro de un período largo.
- Antes de construir: confirmar con asesoría que usar nombres reales como dato del juego está bien.

## Cómo se comparte

- **La grilla de cuadraditos**, sin el nombre del jugador (para no arruinarle el día a nadie), con el número del día y el link. Se pega en el grupo de WhatsApp.
- **La tarjeta 9:16**, que reusa `src/lib/story-image/`.
- **Tu club:** "tu club promedia 3,8 intentos" (el número es el real de cada club). Le da al club algo de qué hablar todos los días.

## Hábito y racha

- Racha diaria, con el mismo perdón que la racha de partidos (una "lesión" por temporada).
- Sin push salvo opt-in, y siempre con horario silencioso.

## Cuenta y privacidad

- Se juega sin cuenta. Para guardar la racha y aparecer en el promedio del club, hace falta la cuenta de TurnoGol (solo mayores de 18).
- Se guarda cuántos intentos usaste cada día, no las palabras que probaste.

## Métricas (para decidir, no para vender)

- Jugadores por día y cuántos vuelven al día siguiente.
- Cuántos comparten la grilla.
- Cuántos llegan a la home por un link compartido y después reservan.

Mientras no estén medidas, no se usan en ventas ni en marketing.
