# Prompt 1 — Grilla

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar las 4 capturas: `desktop_admin_grilla.png`, `mobile_admin_grilla.png`,
> `desktop_manager_grilla.png`, `mobile_manager_grilla.png`.
> Empezá por esta pantalla: es la que más duele y sus capturas están al día.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**,
no la app del jugador. Lo usan dos personas, 8 horas por día, en el mostrador, con gente esperando:

- **Marcelo, el dueño.** 35–60 años, nivel de tecnología 2,5 sobre 5. Nunca va a leer un manual.
  Tiene miedo de tocar algo y romper todo. Su frase: _"quiero confirmar y cobrar un turno en menos
  de 20 segundos desde el celu"_.
- **Rodrigo, el encargado.** 4 sobre 5 en tecnología, prefiere atajos a menús. A veces está solo con
  el teléfono sonando. Su frase: _"quiero ver de un vistazo si hay disponibilidad y confirmar en 15
  segundos"_.

El panel es una **herramienta de trabajo**: caja registradora más agenda. Densidad alta, datos
primero, decoración después. Animaciones de hasta 200 ms y solo si cumplen una función. La
referencia mental es PedidosYa del lado del restaurante, o un punto de venta de bar. **La belleza
acá es la eficiencia.** Un degradé animado es ruido.

## Qué te pido

Dos cosas, y el orden es la importancia:

1. **Que el flujo sea más corto y que sobre menos.** El dueño describió la app con tres palabras:
   _"incoherente, incómoda"_ y con _"TANTO"_. Lo primero ya se arregló: la app pasó una auditoría de
   130 hallazgos y ahora cada cosa se llama igual en todas las pantallas. Lo segundo y lo tercero son
   tu trabajo. Para cada tarea de la tabla de abajo, **caminala paso a paso como si fueras Rodrigo**:
   en cada paso, ¿sabe qué tocar?, ¿ve que el control existe?, ¿ve que avanzó? Contá las
   interacciones que hay hoy y proponé el camino más corto. Y para **cada elemento visible** de la
   pantalla contestá tres preguntas: ¿quién lo usa?, ¿cada cuánto?, ¿qué se rompe si lo sacamos? Lo
   que no sobreviva a esas tres preguntas, sacalo o plegalo.
2. **Que se vea más moderna, más linda y más clara**, construyendo con los componentes de este
   proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía, agrupación, espaciado,
   composición, estados vacíos, iconografía y microinteracciones. Podés proponer cambios al armazón
   de la app (barra lateral, barra superior) si mejoran esta pantalla.

**Cambiar el flujo sí; inventar funcionalidad no.** Cambiar el flujo es reordenar, fusionar o sacar
pasos, mover una acción de lugar, cambiar qué se pregunta primero y qué se pliega. Funcionalidad
nueva es un dato que la app no tiene, un circuito de plata nuevo, una pantalla nueva o una acción
que hoy no existe. Lo primero lo quiero; lo segundo lo marcás aparte como "requiere decisión del
dueño" en vez de dibujarlo como si existiera.

## Las tareas que esta pantalla tiene que resolver

Salen de una recorrida real del dueño por su propio complejo. La frecuencia manda: **un problema
chico en una tarea diaria vale más que uno grande en una ocasional.** "Cómo es hoy" está medido
sobre el código, no estimado.

| #   | Tarea                                               | Cada cuánto          | Cómo es hoy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Qué tiene que pasar                                                                                                                                |
| --- | --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Crear una reserva tocando un lugar libre            | muchas veces por día | Tocar el lugar abre un **popover rápido** sobre la celda: nombre, teléfono, ¿cobraste algo ahora? y el precio ya resuelto por la franja. Detrás de **"Más opciones"** se abre el modal completo "Nueva reserva", con **5 campos a la vista** (Horario de inicio, Horario de fin, Jugador registrado, Nombre, Motivo / Tipo de Bloqueo) y **5 más en un desplegable** (Teléfono, Precio del turno, ¿Cobraste algo ahora?, Cuánto cobraste, Notas internas). El turno dura 60 minutos fijos, así que "Horario de fin" no decide nada en una reserva común. Medí los dos caminos. | Un toque, un nombre, guardar: **2 interacciones**, con el precio ya resuelto por la franja. Ese camino tiene que alcanzar el 90 % de las veces.    |
| A2  | Cobrarle a esa reserva                              | muchas veces por día | Tocar el turno abre el panel con precio, cobrado y pendiente. Hay un atajo de un toque para cobrar todo en efectivo, y un formulario con método y monto para el resto.                                                                                                                                                                                                                                                                                                                                                                                                         | Un botón cobra. Si el turno ya terminó, el mismo botón cobra **y lo da por jugado**, en un paso.                                                   |
| A3  | Cancelar esa reserva                                | varias por semana    | Panel → "Cancelar reserva" → motivo y quién cancela → confirmar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Igual de corto, pero si hay seña paga avisa **antes** de confirmar, porque de eso depende la devolución.                                           |
| A4  | Bloquear una cancha por lluvia y después liberar    | semanal              | Tocar un lugar libre → "Motivo / Tipo de Bloqueo" → "Bloquear cancha". Liberar: abrir el bloqueo → "Liberar el bloqueo".                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Se libera desde el mismo lugar donde se bloqueó. Hoy funciona; que siga.                                                                           |
| B4  | Marcar a alguien como ausente y cobrarle igual      | semanal              | Panel → "Marcar ausente" → confirmación (pierde la seña).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Si debe plata, la celda lo dice **y deja cobrar desde ahí**. Un estado que alarma sin dejar actuar es un callejón sin salida.                      |
| E2  | Un turno de torneo tomado desde la grilla           | ocasional            | El panel dice qué torneo lo ocupa y lleva al torneo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Que siga. Es lo que rompió una demo cuando no estaba.                                                                                              |
| E3  | Todo lo de arriba desde el celular                  | muchas veces por día | Carrusel de páginas: "Todas" y una por cancha. El dueño la describió como _"ilegible e inmanejable"_.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lo mismo que en la compu, con el pulgar.                                                                                                           |
| —   | _"¿Tenés cancha a las 22?"_ con el teléfono sonando | muchas veces por día | Mirar la matriz (compu) o la página "Todas" (celular).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Se contesta de un vistazo, sin tocar nada. Un viernes a las 21 con 4 canchas se lee qué está libre, qué está por empezar y a quién hay que cobrar. |

## Lo que hay hoy

- **Encabezado fijo**: título, fecha, "Por cobrar hoy: $ 40.000 (3 turnos)" solo cuando hay algo,
  botón "Hoy", selector de densidad (Cómodo / Compacto) y una tira con los días de la semana.
- **Escritorio, 1024 px para arriba: la matriz.** Columnas son canchas, filas son horas. El eje
  horario de la izquierda es la **única** fuente de la hora: la celda no la repite. Cada celda
  muestra el nombre y el estado, con una barra de 3 px del color del estado sobre el borde
  izquierdo. El lugar libre muestra un "+" siempre visible, no solo al pasar el mouse. Hay una
  línea que marca "ahora", y las horas de la mañana sin actividad se pliegan en una banda que dice
  "08:00–14:00 · Sin actividad · Mostrar".
- **Teléfono, menos de 1024 px: la matriz no existe.** Es un carrusel de páginas que se pasa con el
  dedo. La primera es "Todas": una fila por hora con todas las canchas como fichas, y es la que
  contesta "¿tenés cancha a las 21?". Las siguientes son una por cancha, con su lista vertical de
  horas. Las píldoras de arriba son selector e indicador de página a la vez.
- **Tocar un turno** abre un panel lateral con quién, horario, precio, cobrado y pendiente, más las
  acciones: cobrar, cargar consumo de cantina, marcar ausente, reprogramar y cancelar. Si es un
  bloqueo, se libera desde ahí. Si es un turno de torneo, dice qué torneo lo ocupa y lleva al torneo.
- **Leyenda** de estados al pie, solo en escritorio.

**Qué está mal hoy.** En escritorio funciona, pero se ve como una tabla de sistema: sin aire, sin
jerarquía entre el turno que empieza en 10 minutos y el de dentro de 6 horas, y el panel lateral es
una lista de campos. El formulario de reserva pide diez cosas para una tarea que la regla dice que
son dos interacciones.

## Lo que te pido que pongas en duda

No digo que sobren. Digo que nadie preguntó. Para cada uno, las tres preguntas (quién, cada cuánto,
qué se rompe) y una decisión con su motivo:

- El selector de densidad Cómodo / Compacto.
- La tira de días de la semana y el botón "Hoy".
- "Por cobrar hoy" en el encabezado, cuando el color de cada celda ya dice a quién se le debe.
- La leyenda al pie.
- En el modal completo de reserva (el de "Más opciones"): "Horario de fin" (el turno es de 60 minutos fijos), "Jugador
  registrado" y "Nombre" como dos campos separados, "Motivo / Tipo de Bloqueo" siempre a la vista
  aunque el 90 % de las veces es una reserva común, y "Notas internas".
- En el panel del turno: cinco acciones a la misma altura.

Si algo se queda, que sea porque una tarea de la tabla lo necesita.

## La regla del dueño que pesa más que todas

**La app tiene que mostrar el estado de la PLATA, no el estado del sistema.** "Confirmada" es un
estado del sistema; "me deben $ 28.000" es lo que el dueño necesita. Un turno cobrado entero y uno
sin pagar **no pueden verse iguales** en ninguna parte de esta pantalla. Y lo que exige acción tiene
que ser lo único que salta a la vista: un viernes a las 21, lo que se ve primero es a quién hay que
cobrarle.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa                      | Se dice                                                                                             | Nunca                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Los 9 estados de un turno | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado | Pagando ahora, Pendiente, Reservado, No-show |
| Plata que te deben, acá   | **Por cobrar hoy** (solo el día visible)                                                            | Deudas, Pendientes                           |
| La seña                   | seña                                                                                                | anticipo, depósito                           |
| Quien reserva             | jugador si tiene cuenta, invitado si no                                                             | cliente, usuario                             |
| Turno fijo semanal        | abonado                                                                                             | suscripción                                  |
| Acciones                  | verbo primero y en voseo: "Cobrar $ 28.000", "Marcar ausente", "Ver reserva"                        | "Click aquí", "Ir a"                         |

Plata siempre `$ 28.000`, con espacio y punto de miles. Fechas en castellano, formato medio:
"mié 2 de julio". Nada de formato ISO ni anglicismos de tablero.

## El color dice el estado de la plata

El color comunica **el estado de la plata**; el ícono y el texto comunican **qué es la cosa**. Nada
se comunica solo con color: el 8 % de los varones es daltónico y la base de usuarios es casi toda
masculina.

| Estado               | Tono             | Qué significa                                  |
| -------------------- | ---------------- | ---------------------------------------------- |
| Esperando seña       | ámbar            | te deben la seña                               |
| Confirmada · Abonado | azul             | cobrás cuando llegue                           |
| Señada · Jugada      | verde            | plata asegurada o ya cobrada                   |
| Sin cobrar · Ausente | rojo             | se prestó el servicio y falta plata, o no vino |
| Torneo               | ámbar con rayado | ocupa cancha, no es la reserva de un jugador   |
| Bloqueado            | gris con rayado  | ocupa cancha, no es la reserva de un jugador   |

Usá siempre los tokens del sistema (`bg-card`, `text-foreground`, `bg-primary`), nunca colores
nuevos. La marca es esmeralda para acciones, sobre superficies grises azuladas. **Claro y oscuro
son igual de importantes**: en claro la profundidad se hace con sombras en capas, en oscuro con
vidrio esmerilado. Nunca vidrio en claro. Contraste AA en los dos.

## Reglas que no se negocian

1. **La grilla es el producto.** Cualquier cosa que enlentezca leer o cargar una reserva es un error
   de diseño, por linda que sea. Reservar son **2 interacciones**: tocar un lugar libre, guardar.
   Cobrar es **1** desde el panel del turno.
2. **El lugar entero es el blanco del toque**, no un botoncito adentro.
3. **La hora no se repite en la celda**: el eje de la izquierda es la única fuente.
4. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima: el
   mostrador usa tablet.
5. **La píldora de estado es la misma** que en Hoy y en Reservas. Sale de una sola tabla en el
   código. Si diseñás una nueva, tiene que reemplazar a esa, no convivir con ella.
6. **Una sola acción principal por superficie.** Lo destructivo pide confirmación; lo reversible
   ofrece deshacer.
7. **Como máximo 5 a 7 opciones a la vez** de la misma jerarquía; el resto se pliega. La
   información va en grupos de 3 o 4. La tarea principal se completa en 3 interacciones o menos
   desde que carga la pantalla.
8. **Nunca un campo de texto libre sobre personas.** Es una restricción legal de datos personales,
   no una preferencia.
9. **Cambiar el flujo sí; inventar funcionalidad no.** Está definido arriba. Si creés que una de
   estas reglas está mal, decilo aparte con el argumento en vez de callarlo o de saltearla.

## Qué quiero recibir

1. **Cambios de flujo propuestos.** Una entrada por tarea de la tabla: cuántas interacciones tiene
   hoy, cuántas quedan, qué se saca, qué se mueve, y qué necesitaría del código que hoy no existe,
   si algo.
2. **Lista de resta.** Cada elemento que sacaste o plegaste, con las tres respuestas.
3. **Decisiones que no son tuyas.** Lo que cambia una regla de negocio o necesita un dato nuevo,
   listado aparte y sin dibujar.
4. **Las pantallas.** Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro. El
   estado **lleno** es un viernes con 4 canchas y turnos en todos los estados. Además: el popover rápido y el modal completo
   abiertos, el panel de un turno sin cobrar abierto, y los tres vacíos: día sin ninguna
   reserva (con la pista de primera vez "tocá un lugar libre para reservar"), día cerrado, y todas
   las canchas pausadas. El encargado ve lo mismo que el dueño en esta pantalla, así que con una
   versión alcanza.
