# Prompt 3 — Hoy (la pantalla de entrada del panel)

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar las capturas: `desktop_admin_dashboard.png` y `mobile_admin_dashboard.png`, en sus
> estados lleno y vacío.
> Hacela **después** de la Grilla y de Configuración: hereda lo que se decidió ahí.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**, no
la app del jugador.

Esta pantalla la ve **solo el dueño**. Marcelo tiene 35–60 años y un nivel de tecnología de 2,5
sobre 5: nunca va a leer un manual y tiene miedo de tocar algo y romper todo. Abre el complejo a las
9, atiende el mostrador, vuelve a las 17 para el pico de la noche y cierra pasada la medianoche. El
encargado no ve esta pantalla: rebota a la Grilla.

El panel es una **herramienta de trabajo**: densidad alta, datos primero, decoración después.
Animaciones de hasta 200 ms y solo si cumplen una función. **La belleza acá es la eficiencia.**

## Tu tarea

**Diseñá la pantalla de entrada ideal del panel.** No te pido que edites la que existe: te pido que
resuelvas, desde cero, qué tiene que ver Marcelo cuando abre el sistema.

Lo que existe hoy está descrito más abajo, pero está ahí como **evidencia de lo que ya se aprendió**,
no como el punto de partida a retocar. Si la mejor respuesta es reordenar lo que hay, reordenalo. Si
es fusionar dos bloques en uno, fusionalos. Si es una estructura que no se parece a la actual,
diseñá esa y explicá por qué.

Dos criterios, y el orden es la importancia:

1. **Que conteste antes de que Marcelo toque nada, y que lo que toque aterrice en la cosa.** El
   dueño describió la app con tres palabras: _"incoherente, incómoda"_ y con _"TANTO"_. Lo primero
   ya se arregló (una auditoría de 130 hallazgos unificó los nombres en todas las pantallas). Lo
   segundo y lo tercero son tu trabajo.
2. **Que se vea moderna, linda y clara**, con los componentes de este proyecto y sus guías. Tenés
   libertad total en layout, jerarquía, agrupación, espaciado, composición, estados vacíos,
   iconografía y microinteracciones.

## Antes de dibujar: razoná esto y escribilo

Este prompt corre con esfuerzo alto a propósito. Quiero el razonamiento, no solo el resultado.

**1. Los tres momentos del día.** Marcelo abre esta pantalla en momentos distintos y con preguntas
distintas. Para cada uno, definí **cuál es la pregunta** y **qué tendría que ver sin tocar nada**:

| Momento | Dónde está | Qué está por hacer |
| --- | --- | --- |
| ~9:00, abre el complejo | en el mostrador, computadora | arrancar el día |
| ~17:00, vuelve al mostrador | de pie, apurado, a veces tablet | el pico de la noche |
| ~23:40, desde el sillón | teléfono, cansado | cerrar el día mentalmente |

Si los tres momentos piden cosas distintas, decidí: ¿una sola pantalla que sirva a los tres, o una
jerarquía que ponga arriba lo que sirve a más de uno? Justificá. **No inventes un selector de
momento**: eso sería configurabilidad, y acá está prohibida.

**2. La prueba de los cinco segundos.** Elegí el estado lleno (viernes, 4 canchas, turnos en varios
estados, dos alertas activas) y contá qué lee Marcelo en orden, en los primeros cinco segundos. Si
tu diseño no produce un orden de lectura claro, no está terminado.

**3. Qué falta y qué sobra.** Para cada bloque que proponés **y** para cada bloque que hay hoy,
contestá tres preguntas: **¿quién lo usa?**, **¿cada cuánto?**, **¿qué se rompe si no está?** Lo que
no sobreviva, afuera. Y decí explícitamente si hay algo que la pantalla debería mostrar y hoy no
muestra, aunque el dato exista (ver el inventario más abajo).

**4. La hipótesis del dueño.** Antes de la última auditoría, él mismo dudó de que esta pantalla
aporte valor real, y se la evaluó como a cualquier otro elemento: quién la usa, cada cuánto, qué se
rompe si se saca o se pliega dentro de la Grilla. El rediseño anterior fue una respuesta parcial:
sacó la plata repetida y puso "Próximos turnos". **Si después de restar tu conclusión es que esta
pantalla no se justifica como destino aparte, decilo con argumentos**, no lo dibujes como hecho. Es
una decisión de él.

## Lo que la pantalla puede saber hoy

Esto es el inventario real, leído del código. **Todo lo que está acá se puede mostrar sin escribir
una consulta nueva.** Cualquier cosa fuera de esta lista es un dato nuevo y va a la sección de
decisiones que no son tuyas, sin dibujar.

**Turnos del día, cancha por cancha** (`upcoming`): por cada cancha en servicio, sus turnos con hora
de inicio y fin, quién reservó, el estado del turno y su identificador para linkear al detalle. El
orden de las canchas es el mismo en que la Grilla dibuja sus columnas.

**Ocupación del día** (`occupancy`): turnos ocupados sobre turnos disponibles.

**Alertas** (`needsAttention`) — **son exactamente estas tres, no hay una cuarta**:

| Alerta | Qué trae | Alcance |
| --- | --- | --- |
| Turno jugado y sin cobrar | identificador del turno, cuánto falta, desde cuándo, cancha, horario, quién | del día |
| Devoluciones pendientes | cuántas y cuánto en total, desde cuándo la más vieja | de todo el complejo, sin filtro de fecha, y **agregada en un solo ítem** |
| Seña rechazada | el turno afectado, monto, desde cuándo | del día |

> Hasta hace poco había una cuarta, "caja de ayer sin cerrar". **Ya no existe**: el mecanismo de
> apertura y cierre de caja se eliminó del producto. No la dibujes.

**Lo que pasó sin él** (`whileYouWereAway`): reserva entrada por internet, cancelación, seña
acreditada y seña rechazada, cada una con su momento. Lo más reciente primero.

**Configuración inicial** (`checklist`): siete pasos, de los cuales cinco pueden estar pendientes de
verdad — tener canchas cargadas, tener horarios que generen turnos, MercadoPago conectado, link
público compartido, primera reserva recibida.

**Existe en el servidor pero está PROHIBIDO mostrarlo**: lo cobrado hoy y la plata en la calle. El
dato está calculado; la decisión de no mostrarlo es de producto, no una limitación. Ver más abajo.

## El ancla que no se mueve

Una cosa es requisito del dueño y no está en discusión: **la pantalla tiene que decir qué turnos
vienen, cuáles se están jugando ahora y cuáles hay que cobrar.** Esa es la razón de ser de la
pantalla.

Lo que sí está abierto es **la forma**: si eso es un bloque o dos, si va por cancha o por hora, si lo
que se está jugando ahora se separa de lo que viene, si lo que hay que cobrar vive con los turnos o
con las alertas. Resolvelo vos y justificá.

## Lo que hay hoy, y por qué

Tres bloques apilados con el mismo peso visual:

1. **Próximos turnos.** Una fila por cancha en servicio. Cada turno: hora ("20:00-21:00"), quién es,
   "ahora" o "en 25 min" cuando arranca dentro de la hora, y su píldora de estado. Una cancha sin
   turnos dice "Libre el resto del día." El subtítulo del bloque lleva la ocupación.
2. **Necesita tu atención.** Las tres alertas, cada una con su botón. Vacío: **"Nada pendiente. Todo
   cobrado y cerrado."**
3. **Mientras no estabas.** El registro de lo que pasó sin él, lo más reciente primero.

Arriba de todo, mientras falte configurar algo, la lista de pasos iniciales. En el teléfono se come
toda la primera pantalla, que es un defecto conocido.

**Poné en duda, con las tres preguntas y una decisión con motivo:** si alguien lee "Mientras no
estabas" o es un registro que nadie mira; si la ocupación como subtítulo sirve; cuándo desaparece
sola la lista de configuración; y si tres bloques con el mismo peso visual es lo correcto cuando uno
solo exige acción.

## Lo que NO puede aparecer

Esto es lo más importante del prompt, porque es exactamente lo que se acaba de sacar. Te doy el
motivo de cada veto: si tenés un argumento fuerte en contra, escribilo aparte, pero **no lo dibujes**.

- **Ninguna cifra de plata.** Lo cobrado y lo que te deben viven en Caja, que es donde se cobra.
  Hasta hace poco esta pantalla repetía las tarjetas "Cobrado hoy" y "Deudas" con el mismo
  componente y el mismo dato que Caja muestra un clic más allá. La excepción es el monto **dentro de
  una alerta** ("Cobrar $ 16.000"), porque ahí el número no es un indicador: es parte de la acción.
- **Ningún gráfico.** Un gráfico es una herramienta de análisis; esto es un parte de situación. El
  análisis vive en Métricas.
- **Ningún botón de hacer.** Nada de "venta rápida" ni de accesos directos para reservar. Reservar
  vive en la Grilla, vender vive en Caja. Las únicas acciones visibles son la de cada alerta y el
  enlace de cada turno a su detalle.
- **Nada configurable.** Ni preferencias, ni bloques que el dueño ordene, ni un selector de vista.
  "Por las dudas" está prohibido en todo el producto.

## Cambiar el flujo sí; inventar funcionalidad no

**Cambiar el flujo es lo que quiero**: reordenar, fusionar o sacar bloques, cambiar a dónde lleva un
botón y con qué ya abierto, cambiar qué va primero, cambiar la forma en que un dato se presenta.

**Funcionalidad nueva** es un dato que la app no tiene, una alerta nueva, un gráfico o un botón de
hacer. Eso va a una lista aparte, "requiere decisión del dueño", con el motivo y lo que aportaría.
**No lo dibujes como si existiera**: una pantalla que muestra algo que el sistema no puede calcular
no es una propuesta, es una promesa que después alguien tiene que romper.

Los botones tienen que **aterrizar en la cosa, no en la pantalla que la contiene**. Tocar "Cobrar
$ 16.000" abre ese turno listo para cobrar, no una lista donde hay que buscarlo. Decí para cada
acción cuál es el destino y con qué abierto.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa | Se dice | Nunca |
| --- | --- | --- |
| Los 9 estados de un turno | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado | Pagando ahora, Pendiente, Reservado, No-show |
| Plata que debés devolver | **Devolvés** | Reembolsos |
| La seña | seña | anticipo, depósito |
| Quien reserva | jugador si tiene cuenta, invitado si no | cliente, usuario |
| Turno fijo semanal | abonado | suscripción |
| Acciones | verbo primero y en voseo: "Cobrar $ 16.000", "Ver reserva" | "Click aquí", "Ir a" |

Plata siempre `$ 16.000`, con espacio y punto de miles, sin decimales. Fechas en castellano, formato
medio: "mié 2 de julio". Horas en 24 h, rango con guion medio sin espacios: "20:00–21:00". Nada de
formato ISO ni anglicismos de tablero.

## El color dice el estado de la plata

El color comunica **el estado de la plata**; el ícono y el texto comunican **qué es la cosa**. Nada
se comunica solo con color: el 8 % de los varones es daltónico y la base de usuarios es casi toda
masculina.

| Estado | Tono | Qué significa |
| --- | --- | --- |
| Esperando seña | ámbar | te deben la seña |
| Confirmada · Abonado | azul | cobrás cuando llegue |
| Señada · Jugada | verde | plata asegurada o ya cobrada |
| Sin cobrar · Ausente | rojo | se prestó el servicio y falta plata, o no vino |
| Torneo | ámbar con rayado | ocupa cancha, no es la reserva de un jugador |
| Bloqueado | gris con rayado | ocupa cancha, no es la reserva de un jugador |

**Usá siempre los tokens del sistema** (`bg-card`, `text-foreground`, `bg-primary`, `text-muted-foreground`),
nunca un color nuevo ni un hex suelto. La marca es esmeralda para acciones, sobre superficies grises
azuladas.

**Entregá todo en tema claro solamente.** El tema oscuro se deriva después, en el código, a partir de
esos mismos tokens — por eso importa tanto que no haya colores fuera del sistema: un hex suelto no
tiene versión oscura y rompe la derivación. No gastes esfuerzo dibujando la variante oscura.

## Reglas que no se negocian

1. **Ningún dato se repite entre pantallas.** Ver "Lo que NO puede aparecer".
2. **El texto del vacío de las alertas es literal**, no lo mejores ni lo parafrasees: "Nada
   pendiente. Todo cobrado y cerrado." Ese vacío es el premio del día.
3. **La píldora de estado es la misma** que en la Grilla y en Reservas. Sale de una sola tabla en el
   código. Si diseñás una nueva, tiene que **reemplazar** a esa, no convivir con ella, y lo decís.
4. **Las canchas se nombran en el mismo orden** que las columnas de la Grilla.
5. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima: el
   mostrador atiende desde una tablet.
6. **En el teléfono, lo operativo entra antes del pliegue.** La lista de configuración inicial no
   puede comerse la primera pantalla.
7. **Como máximo 5 a 7 opciones a la vez** de la misma jerarquía; el resto se pliega. La información
   va en grupos de 3 o 4. Lo que exige acción es lo único que salta a la vista.
8. **El armazón del panel ya está definido y no se rediseña acá.** A la izquierda hay un riel fijo de
   72 px con íconos, y arriba una barra de 60 px donde cada pantalla cuelga sus propios controles.
   Diseñá el contenido que va adentro de ese marco; si necesitás poner algo en la barra superior,
   decilo y mostralo, pero no cambies el marco.
9. Si creés que una de estas reglas está mal, **decilo aparte con el argumento** en vez de callarlo o
   de saltearla.

## Qué quiero recibir

1. **El razonamiento de la sección "Antes de dibujar"**: los tres momentos, la prueba de los cinco
   segundos, qué falta y qué sobra con las tres preguntas por bloque, y tu respuesta a la hipótesis
   del dueño.
2. **La propuesta de estructura**, con el porqué: qué bloques hay, en qué orden, con qué jerarquía
   visual entre ellos, y qué pasó con cada bloque actual (se mantiene, se fusiona, se pliega, se va).
3. **Los destinos.** Para cada acción: a dónde lleva, con qué ya abierto, y cuántos toques quedan
   hasta resolver. Comparado contra cuántos son hoy.
4. **Decisiones que no son tuyas.** Lo que cambiaría una regla de negocio o necesitaría un dato que
   el inventario no tiene, listado aparte y sin dibujar.
5. **Las pantallas, solo en tema claro**: escritorio a 1280 px y teléfono a 375 px.
   - **Lleno**: un viernes con 4 canchas, turnos en varios estados, uno en curso y dos alertas activas.
   - **Vacíos**: día cerrado ("Hoy el complejo está cerrado."), ninguna cancha en servicio, y "No
     queda nada por jugar hoy.".
   - **Primera semana**: con la lista de configuración inicial todavía visible.
