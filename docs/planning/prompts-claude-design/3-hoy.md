# Prompt 3 — Hoy

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar `desktop_admin_dashboard.png` y `mobile_admin_dashboard.png`.
>
> ⚠️ **Antes de usar este prompt hay que regenerar esas dos capturas.** Las que están en
> `.design-sync/handoff/2026-09-11/capturas/` son de antes del rediseño de #300 y todavía muestran
> las tarjetas de plata que sacamos. Con Docker Desktop arriba:
> `pnpm supabase:start`, el servidor de desarrollo, y
> `MSYS_NO_PATHCONV=1 pnpm audit:corpus --solo=/dashboard`.
>
> Hacela **última**: hereda lo que decidas en Grilla y Configuración.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**, no
la app del jugador.

"Hoy" la ve **solo el dueño**. Marcelo tiene 35–60 años y un nivel de tecnología de 2,5 sobre 5:
nunca va a leer un manual y tiene miedo de tocar algo y romper todo. Está en el complejo desde las
9, atiende el mostrador, y vuelve a las 17 para el pico de la noche. Es la primera pantalla que ve
al entrar. El encargado no la ve: rebota a la Grilla.

El panel es una **herramienta de trabajo**: densidad alta, datos primero, decoración después.
Animaciones de hasta 200 ms y solo si cumplen una función. **La belleza acá es la eficiencia.**

## Qué te pido

Dos cosas, y el orden es la importancia:

1. **Que cada cosa que muestra lleve a resolver algo en menos toques, y que sobre menos.** El dueño
   describió la app con tres palabras: _"incoherente, incómoda"_ y con _"TANTO"_. Lo primero ya se
   arregló: la app pasó una auditoría de 130 hallazgos y ahora cada cosa se llama igual en todas las
   pantallas. Lo segundo y lo tercero son tu trabajo. Para cada situación de la tabla de abajo,
   **caminala paso a paso como si fueras Marcelo**: ¿en cuántos segundos contesta la pregunta?, ¿sabe
   qué tocar?, ¿cuando toca, llega a la cosa ya abierta o tiene que buscarla en otra pantalla? Y para
   **cada bloque** de la pantalla contestá tres preguntas: ¿quién lo usa?, ¿cada cuánto?, ¿qué se
   rompe si lo sacamos? Lo que no sobreviva, sacalo o plegalo.
2. **Que se vea más moderna, más linda y más clara**, construyendo con los componentes de este
   proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía, agrupación, espaciado,
   composición, estados vacíos, iconografía y microinteracciones.

**Cambiar el flujo sí; inventar funcionalidad no.** Cambiar el flujo es reordenar, fusionar o sacar
bloques, cambiar a dónde lleva un botón y con qué abierto, cambiar qué va primero. Funcionalidad
nueva es un dato que la app no tiene, una alerta nueva, un gráfico, un botón de hacer. Lo primero lo
quiero; lo segundo lo marcás aparte como "requiere decisión del dueño" en vez de dibujarlo como si
existiera.

**Una hipótesis del dueño que tenés que contestar.** Antes de la auditoría, él mismo dudó de que esta
pantalla aporte valor real, y se la evaluó como a cualquier otro elemento: quién la usa, cada cuánto,
qué se rompe si se saca o se pliega dentro de la Grilla. El rediseño de la semana pasada fue la
respuesta: sacó la plata y puso "Próximos turnos". Si después de restar tu conclusión es que Hoy
igual no se justifica como pantalla aparte, **decilo con argumentos**, no lo dibujes como hecho. Es
una decisión de él.

## Las situaciones que esta pantalla tiene que resolver

| #   | Situación                                                                            | Cada cuánto          | Cómo es hoy                                                                                                           | Qué tiene que pasar                                                                                                                  |
| --- | ------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Marcelo vuelve al mostrador a las 17: _"¿qué falta jugar y qué tengo que resolver?"_ | todos los días       | Tres bloques apilados con la misma cara: Próximos turnos, Necesita tu atención, Mientras no estabas.                  | Contesta en **5 segundos**, sin tocar nada. Hay jerarquía entre "lo que viene" y "lo que tengo que resolver".                        |
| 2   | Un turno terminó y no se cobró                                                       | varias por semana    | Alerta con "Cobrar $ 16.000" al lado.                                                                                 | Tocar el botón lleva a cobrar **con el turno ya abierto**, no a una lista donde hay que buscarlo. Cobrar es 1 interacción desde ahí. |
| 3   | Hay devoluciones pendientes, una seña rechazada, o la caja de ayer sin cerrar        | cada tanto           | Alertas con "Gestionar", "Ver reserva", "Cerrar caja de ayer".                                                        | Mismo criterio: cada botón aterriza en la cosa, no en la pantalla que la contiene.                                                   |
| 4   | Mirar desde el sillón a las 23:40 qué pasó hoy                                       | todos los días       | El bloque "Mientras no estabas": reserva por internet, cancelación, seña acreditada, lo más reciente primero.         | Se lee en 8 segundos y baja la ansiedad en vez de subirla. Es el momento en que el sistema vendió solo.                              |
| 5   | Primera semana: todavía falta configurar cosas                                       | una vez en la vida   | Arriba de todo, una lista de pasos iniciales que se puede descartar. En el teléfono se come toda la primera pantalla. | Lo operativo entra antes del pliegue. La lista existe, pero no manda.                                                                |
| 6   | Ofrecerle un horario a alguien que llama                                             | muchas veces por día | Una cancha sin turnos dice "Libre el resto del día."; el subtítulo del bloque es "9 de 12 · 75% de ocupación".        | Eso es un dato, no un vacío: sigue a la vista. Reservar, igual, vive en la Grilla.                                                   |

## Lo que hay hoy

Tres bloques, en este orden:

1. **Próximos turnos.** Una fila por cancha en servicio, en el mismo orden en que la Grilla dibuja
   sus columnas. Cada turno muestra la hora ("20:00-21:00"), quién es, "ahora" o "en 25 min" cuando
   arranca dentro de la hora, y su píldora de estado. Una cancha sin turnos dice "Libre el resto del
   día."
2. **Necesita tu atención.** Cuatro alertas posibles, cada una con su botón al lado: turno terminado
   sin cobrar ("Cobrar $ 16.000"), devoluciones pendientes ("Gestionar"), seña rechazada ("Ver
   reserva"), caja de ayer sin cerrar ("Cerrar caja de ayer"). Cuando está vacío, el texto es exacto
   y no se toca: **"Nada pendiente. Todo cobrado y cerrado."** Ese vacío es el premio del día.
3. **Mientras no estabas.** El registro de lo que pasó sin él. Lo más reciente primero.

Arriba de todo, mientras falte configurar algo, la lista de pasos iniciales.

**Vacíos a diseñar:** día cerrado ("Hoy el complejo está cerrado."), ninguna cancha en servicio, y
"No queda nada por jugar hoy.".

## Lo que te pido que pongas en duda

No digo que sobren. Digo que nadie preguntó. Para cada uno, las tres preguntas (quién, cada cuánto,
qué se rompe) y una decisión con su motivo:

- "Mientras no estabas": ¿lo lee alguien, o es un registro que nadie mira?
- El porcentaje de ocupación en el subtítulo.
- La lista de configuración inicial: ¿cuándo desaparece sola?
- Tres bloques con el mismo peso visual.
- La pantalla entera, como hipótesis del dueño (ver arriba).

## Lo que NO puede aparecer

Esto es lo más importante del prompt, porque es lo que acabamos de sacar:

- **Ninguna cifra de plata.** Lo cobrado y lo que te deben viven en Caja, que es donde se cobra.
  Hasta ayer esta pantalla repetía las tarjetas "Cobrado hoy" y "Deudas" con el mismo componente y
  el mismo dato que Caja muestra un clic más allá. Se sacaron a propósito. No las traigas de vuelta
  en ninguna forma.
- **Ningún gráfico.** Un gráfico es una herramienta de análisis; esto es un parte de situación. El
  análisis vive en Métricas.
- **Ningún botón de hacer.** Nada de "venta rápida" ni de accesos directos para reservar. Se decidió
  que no. Reservar vive en la Grilla, vender vive en Caja. La única acción visible es la que pide
  cada alerta, más el enlace de cada turno a su detalle.

## La regla del dueño que pesa más que todas

**La app tiene que mostrar el estado de la PLATA, no el estado del sistema.** "Confirmada" es un
estado del sistema; "me deben $ 16.000" es lo que el dueño necesita. En esta pantalla eso se dice
con la píldora de estado de cada turno y con las alertas, nunca con cifras sueltas.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa                      | Se dice                                                                                             | Nunca                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Los 9 estados de un turno | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado | Pagando ahora, Pendiente, Reservado, No-show |
| Plata que debés devolver  | **Devolvés**                                                                                        | Reembolsos                                   |
| La seña                   | seña                                                                                                | anticipo, depósito                           |
| Quien reserva             | jugador si tiene cuenta, invitado si no                                                             | cliente, usuario                             |
| Turno fijo semanal        | abonado                                                                                             | suscripción                                  |
| Acciones                  | verbo primero y en voseo: "Cobrar $ 16.000", "Cerrar caja de ayer", "Ver reserva"                   | "Click aquí", "Ir a"                         |

Plata siempre `$ 16.000`, con espacio y punto de miles. Fechas en castellano, formato medio:
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
nuevos. La marca es esmeralda para acciones, sobre superficies grises azuladas. **Claro y oscuro son
igual de importantes**: en claro la profundidad se hace con sombras en capas, en oscuro con vidrio
esmerilado. Nunca vidrio en claro. Contraste AA en los dos.

## Reglas que no se negocian

1. **Ningún dato se repite entre pantallas.** Ver la sección "Lo que NO puede aparecer".
2. **El texto del vacío de "Necesita tu atención" es literal**, no lo mejores ni lo parafrasees.
3. **La píldora de estado es la misma** que en la Grilla y en Reservas. Sale de una sola tabla en el
   código. Si diseñás una nueva, tiene que reemplazar a esa, no convivir con ella.
4. **Las canchas se nombran en el mismo orden** que las columnas de la Grilla.
5. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima.
6. **En el teléfono, lo operativo entra antes del pliegue.**
7. **Como máximo 5 a 7 opciones a la vez** de la misma jerarquía; el resto se pliega. La
   información va en grupos de 3 o 4. Lo que exige acción es lo único que salta a la vista.
8. **Cambiar el flujo sí; inventar funcionalidad no.** Está definido arriba. Si creés que una de
   estas reglas está mal, decilo aparte con el argumento en vez de callarlo o de saltearla.

## Qué quiero recibir

1. **Cambios de flujo propuestos.** Una entrada por situación de la tabla: cuántos toques y
   segundos lleva hoy, cuántos quedan, qué se saca, qué se mueve, a dónde aterriza cada botón y con
   qué abierto, y qué necesitaría del código que hoy no existe, si algo.
2. **Lista de resta.** Cada bloque que sacaste o plegaste, con las tres respuestas. Y tu respuesta
   a la hipótesis del dueño.
3. **Decisiones que no son tuyas.** Lo que cambia una regla de negocio o necesita un dato nuevo,
   listado aparte y sin dibujar.
4. **Las pantallas.** Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro. El
   estado **lleno** es un viernes con 4 canchas, turnos en varios estados y dos alertas activas. Más
   los tres vacíos de arriba, y la variante con la lista de configuración inicial todavía visible.
