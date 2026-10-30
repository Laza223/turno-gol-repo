# El Crack del Día

**Estado:** idea de la punta de entrada (etapa 2), sin construir. Visión: [`README.md`](README.md), mundo 5. Catálogo: [`ideas.md`](ideas.md).

## Qué es

Un minijuego diario en la home de TurnoGol: adivinar un futbolista en 6 intentos. Es el mismo para todos y cambia a la medianoche (hora de Argentina).

**Decisión de Lazar (2026-10-30): no es parte de RIVAL.** Es un jueguito extra de TurnoGol. Vive en la home, al lado del buscador de canchas, como un acceso al costado o un botón flotante ("Adiviná el crack del día"). La landing de RIVAL no lo muestra. Se juega con las letras del apellido, como los Wordle de fútbol.

Es la única pieza de RIVAL que **no necesita gente en la zona**: anda desde el día 1 con un solo complejo. Por eso trae tráfico y hábito antes de que haya tablas.

Tomamos el **género** (adivinar letras con colores, popularizado por Wordle y sus versiones de fútbol), no copiamos un juego puntual. Nombre, diseño y modos son propios.

## Cómo se juega

1. La grilla tiene tantas casillas como letras el apellido del crack del día, y 6 filas.
2. Escribís el apellido de un futbolista del largo justo. Solo valen apellidos de la lista del juego, así no se queman intentos con palabras cualquiera.
3. Cada letra se pinta:
   - **verde:** la letra está y en su lugar;
   - **marcada (otro color o patrón):** la letra está, pero en otro lugar;
   - **gris:** la letra no está.
4. Un teclado en pantalla marca las letras que ya usaste.
5. Si lo sacás, ves tu número de intentos y tu racha. Si no, ves quién era.

El color de "en otro lugar" se decide al diseñarlo: el ámbar de DESIGN.md es solo de "Queda 1". Los apellidos compuestos, los acentos y la ñ se resuelven al diseñar, probándolo.

## Modos

- **Diario**, el principal.
- **Leyendas:** solo retirados.
- **Ascenso:** jugadores del fútbol argentino de las categorías de abajo.
- **Selección:** jugadores que pasaron por la Selección.

Los modos extra son una propuesta: arranca solo el Diario.

## De dónde salen los jugadores

- Una lista curada a mano de apellidos, que es también la lista de intentos válidos.
- Son hechos públicos sobre carreras deportivas; no se usa ninguna foto, escudo, camiseta ni voz.
- Nadie de la lista aparece como si apoyara TurnoGol.
- El orden de los días se arma de antemano y no se repite un jugador dentro de un período largo.
- Antes de construir: confirmar con asesoría que usar nombres reales como dato del juego está bien.

## Cómo se comparte

- **La grilla de cuadraditos**, sin el nombre del jugador (para no arruinarle el día a nadie), con el número del día y el link. Se pega en el grupo de WhatsApp.
- **La tarjeta 9:16**, que reusa `src/lib/story-image/`.
- **Tu club** (solo si algún día se cruza con RIVAL, que hoy no): "tu club promedia 3,8 intentos", con el número real de cada club.

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
