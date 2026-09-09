# Cómo arrancar la revisión de la app — explicado sin vueltas

> Este archivo es para Lazar, no para un agente. El plan técnico completo está en
> [`docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md`](../superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md).
> Acá está lo mismo, en castellano común, y con lo único que tenés que hacer vos.

## Primero: tres palabras que usé mal

Las venía diciendo en inglés de consultoría y no significan nada. Lo que quieren decir:

| Lo que dije | Lo que es de verdad                                                                     |
| ----------- | --------------------------------------------------------------------------------------- |
| _brief_     | La hoja de instrucciones que leen los asistentes antes de empezar. Una carilla y media. |
| _corpus_    | La carpeta con las fotos de todas las pantallas de la app.                              |
| _scope_     | Hasta dónde llega el trabajo: qué entra y qué queda afuera.                             |

De acá en adelante van con esos nombres.

## Qué vamos a hacer

Poner unos 25 asistentes a revisar la app entera al mismo tiempo, cada uno mirando una cosa
distinta. Son cuatro miradas:

1. **La app contra tus propias reglas.** Vos ya escribiste cómo tiene que hablar y verse la app
   (el documento del sistema de diseño). Hoy la app se le fue: un turno jugado a veces dice
   "Jugada" y a veces "Completada"; el mismo lugar es "Clientes" en el menú, "Personas" en la
   pestaña y "jugadores" en la dirección web. Estos asistentes buscan todas esas.

2. **Hacer las tareas de un dueño, paso a paso.** Cargar una reserva, cobrarla, cancelarla,
   bloquear una cancha, cerrar la caja. En cada paso se preguntan: ¿se entiende qué hay que tocar?
   ¿el sistema avisa que pasó algo? ¿se puede volver atrás? Así fue como apareció el bloqueo que
   no se podía liberar.

3. **Mirar cada pantalla como si fuera la primera vez.** Con las fotos, no con el código. Dos
   asistentes distintos por grupo de pantallas, sin hablar entre ellos: uno solo encuentra como un
   tercio de los problemas, varios encuentran bastante más.

4. **Contar todo lo que hay y proponer qué sacar.** Elemento por elemento: quién lo usa, cada
   cuánto, qué se rompe si lo sacamos. Acá entra tu sospecha sobre la pantalla "Hoy" — la van a
   evaluar como a cualquier otra, y la decisión final de sacarla o no es tuya.

Después, otro grupo de asistentes agarra cada cosa encontrada y **trata de tumbarla**: "¿esto es
verdad? ¿de verdad rompe la regla que dice? ¿un dueño lo notaría?". Lo que no sobrevive, no te
llega. Recién lo que queda te lo muestro para que votes.

## Qué tenés que hacer vos (tres momentos, nada más)

**1. Ahora: nada.** Yo preparo dos cosas antes de largar a nadie: la hoja de instrucciones y las
fotos de las pantallas.

**2. Cuando te avise: votar.** Te va a llegar una lista tipo la de la recorrida del otro día, con
un botón por hallazgo. Cuatro opciones por cada uno: _arreglalo ahora_ · _esto lo decido yo_ ·
_después del freeze_ · _no_. Calculá entre 40 y 50 minutos. Es la única parte que te ocupa tiempo
de verdad, y no la puede hacer nadie más: son decisiones de tu producto.

**3. Al final: probar con gente.** Tres a cinco dueños de complejo de verdad, cinco tareas, sin
ayudarlos. Eso mide si **entienden las palabras**, que es lo único que ningún asistente puede
medir por vos. La regla ahí es simple: si tenés que explicarles algo, el problema es del producto,
no de ellos.

## Cómo arrancás la sesión nueva

Abrís una sesión de Claude Code en TurnoGol y pegás esto tal cual:

```text
Arrancá la revisión de coherencia de TurnoGol. El plan está en
docs/superpowers/specs/2026-09-09-auditoria-coherencia-ux-design.md — ya está
decidido el alcance (sección 6), no lo vuelvas a preguntar.

Hacé los pasos 2 y 3 de la sección 5: la hoja de instrucciones para los agentes
y las fotos de las 29 pantallas del admin y del encargado. Cuando estén, largá
los agentes de las 4 miradas y avisame recién cuando tengas la lista para votar.

Si algo del plan no cierra contra el código real, arreglá el plan y seguí; no
me preguntes cosas que podés averiguar leyendo el repo.
```

Con eso alcanza. Si querés hacerlo en dos ratos, la primera sesión hace la hoja y las fotos, y la
segunda larga los agentes.

## Qué NO vamos a hacer (para que no te preocupe)

- **No se arregla nada sin tu voto.** Los asistentes buscan y verifican; los arreglos son un paso
  aparte, después de que vos decidas.
- **No entra el portal público ni la app del jugador todavía.** Solo el panel del dueño y del
  encargado. Lo otro es otra personalidad del producto y va en una tanda aparte.
- **No se toca nada de lo que el freeze prohíbe.** Lo que aparezca y sea función nueva queda
  anotado para después del 1 de noviembre.
