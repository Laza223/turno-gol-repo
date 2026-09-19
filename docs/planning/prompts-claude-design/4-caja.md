# Prompt 4 — Caja

> Pegar entero en una conversación nueva del proyecto `turnogol` de claude.ai/design.
> Adjuntar las capturas de las cuatro pestañas en escritorio y teléfono.
> Hacela **después** de la Grilla, Configuración y Hoy: hereda lo que se decidió ahí.

---

## Quiénes usan esto

TurnoGol es un sistema para complejos de fútbol de Argentina. Esto es el **panel del complejo**, no
la app del jugador.

**Caja es la única sección con dos usuarios distintos, y usan cosas distintas.**

**Rodrigo, el encargado.** Está parado detrás del mostrador. Hay cuatro personas esperando y un
partido que arranca en dos minutos. Alguien le pide dos Gatorade y una cerveza. Cobra, vuelve a lo
que estaba. Lo hace veinte veces por noche. Para él, Caja es una **caja registradora**: cada segundo
y cada toque de más se pagan con una cola que crece. Usa el sistema de pie, muchas veces con una
mano, en una tablet o un teléfono.

**Marcelo, el dueño.** 35–60 años, nivel de tecnología 2,5 sobre 5, nunca va a leer un manual y
tiene miedo de tocar algo y romper todo. Entra a Caja una o dos veces por día, sentado, a preguntar
**"¿cuánto entró y quién me debe?"**. Y una vez por semana, a cargar stock o mirar qué se vende. Para
él, Caja es un **libro de cuentas**.

Esas dos naturalezas conviven hoy en la misma pantalla con el mismo peso visual. **Ese es el problema
central que te pido resolver.**

El panel es una herramienta de trabajo: densidad alta, datos primero, decoración después.
Animaciones de hasta 200 ms y solo si cumplen una función. **La belleza acá es la eficiencia.**

## Tu tarea

**Rediseñá la sección Caja entera, con criterio de diseñador experto en sistemas de punto de venta y
de gestión.** No te pido que retoques las cuatro pestañas que existen: te pido que decidas cuál es la
estructura correcta.

**Tenés libertad total de estructura.** Si la respuesta es que las pestañas sobran, sacalas. Si son
dos pantallas en vez de cuatro, hacelo. Si algo funciona mejor como panel lateral, como modal, como
hoja desde abajo o como una sola vista con zonas, proponelo. Si dos pestañas son en realidad la misma
cosa mirada de dos lados, fusionalas. **Lo único que te pido a cambio es que lo valides**: cada
cambio de estructura viene con el recorrido de la tarea antes y después, en toques y en segundos.

Dos criterios, y el orden es la importancia:

1. **Que la venta del mostrador baje a su mínimo irreducible de toques, y que el resto no le estorbe.**
2. **Que se vea moderna, linda y clara**, con los componentes de este proyecto y sus guías. Tenés
   libertad total en layout, jerarquía, agrupación, espaciado, composición, estados vacíos,
   iconografía y microinteracciones.

## Antes de dibujar: razoná esto y escribilo

Este prompt corre con esfuerzo alto a propósito. Quiero el razonamiento, no solo el resultado.

**1. Las dos naturalezas.** Caja es a la vez un punto de venta (segundos, de pie, repetitivo, bajo
presión) y un libro de cuentas (sentado, una vez por día, lectura y decisión). Decidí explícitamente:
¿se separan en dos destinos, se separan por jerarquía dentro de uno, o hay una tercera forma? **No
inventes un selector de modo ni un "modo mostrador"**: eso es configurabilidad, y acá está prohibida.
La estructura tiene que resolverlo sola.

**2. Las tareas reales, cronometradas.** Para cada una: cuántos toques y cuántos segundos lleva hoy,
cuántos con tu diseño, y qué sacaste del camino.

| # | Tarea | Quién | Cada cuánto | Bajo presión |
| --- | --- | --- | --- | --- |
| 1 | Vender dos productos y cobrar en efectivo | encargado | ~20 por noche | sí, con cola |
| 2 | Vender y anotarlo como fiado, porque paga después | encargado | varias por noche | sí |
| 3 | Cobrarle a alguien un fiado abierto de hace dos días | encargado | varias por semana | a veces |
| 4 | Registrar un gasto o un ingreso que no es una venta | los dos | pocas por semana | no |
| 5 | "¿Cuánto entró hoy y por qué método?" | dueño | 1–2 por día | no |
| 6 | "¿Quién me debe y desde cuándo?" | dueño | 1 por día | no |
| 7 | Marcar que ya devolvió una seña | dueño | pocas por semana | no |
| 8 | Cargar stock que llegó, o corregir un precio | dueño | 1 por semana | no |
| 9 | "¿Qué se vende y qué no?" | dueño | 1 por semana o menos | no |

**3. De qué sistemas tomás y qué NO tomás.** Mirá cómo resuelven esto los buenos puntos de venta y
los buenos sistemas de gestión, nombrá de dónde sacás cada idea y qué estás tomando. Pero un sistema
de gestión típico está pensado para alguien que lo usa ocho horas por día y recibió capacitación, y
**este usuario no es ese**: le tiene miedo al sistema y no lee manuales. Decí explícitamente qué
patrones del rubro estás descartando por eso. Grillas densas de veinte columnas, atajos de teclado
como único camino, y pantallas con doce acciones al mismo nivel son ejemplos de lo que no sirve acá.

**4. Qué falta y qué sobra.** Para cada bloque que proponés **y** para cada bloque que hay hoy, tres
preguntas: **¿quién lo usa?**, **¿cada cuánto?**, **¿qué se rompe si no está?** Lo que no sobreviva,
afuera. Y decí si hay algo que la sección debería mostrar y hoy no muestra, con el dato ya existente.

## Lo que Caja puede saber hoy

Inventario real, leído del código. **Todo lo que está acá se puede mostrar sin escribir una consulta
nueva.** Lo que no esté acá es un dato nuevo y va a la lista de decisiones que no son tuyas.

**Los tres totales del encabezado**, hoy siempre visibles arriba de las pestañas:

| Total | Qué es |
| --- | --- |
| Cobrado hoy | lo que entró en el día operativo |
| Deudas | lo que te deben: turnos jugados sin cobrar, fiados abiertos y cuotas de torneo impagas, sumados |
| Devolvés | señas que el complejo tiene que devolver y todavía no devolvió |

**Movimientos del día**: cada uno con su monto, método de pago, concepto, si es ingreso o egreso, y
el momento. Más el desglose de cuánto entró por cada método.

**Catálogo de cantina**: productos con precio y stock, y el historial de movimientos de stock.

**Fiados abiertos**: a nombre de quién, cuánto, desde cuándo.

**Deudas, fila por fila**: de dónde viene cada una (turno, fiado o torneo), quién debe, cuánto, desde
cuándo, y el identificador para ir a la cosa.

**Devoluciones pendientes**: de qué turno, a quién, cuánto, desde cuándo, y la acción de marcarla
como ya devuelta.

**Reporte de cantina**: ranking de lo más vendido, venta por método y venta por día, sobre un rango.

## Lo que hay hoy

Una `PageHeader` con título y un botón "Agregar movimiento", debajo una barra de cuatro pestañas, y
debajo tres tarjetas de total que se ven en las cuatro pestañas.

| Pestaña | Qué tiene |
| --- | --- |
| **Cantina** (la raíz) | panel de venta rápida, lista de fiados abiertos, movimientos del día, desglose por método |
| **Deudas** | la lista de todo lo que te deben, de las tres fuentes juntas |
| **Devoluciones** | las señas por devolver, cada una con su acción de marcarla saldada |
| **Productos y stock** | tabla del catálogo, y plegado abajo, el reporte de ventas y el historial de stock |

**Poné en duda, con las tres preguntas y una decisión con motivo:** si cuatro pestañas es la forma
correcta; si las tres tarjetas tienen que estar en las cuatro pestañas o solo en algunas; si "Deudas"
y "Devoluciones" son dos pantallas o dos caras de una; si el reporte plegado dentro de Productos es
donde alguien lo va a buscar; y si la venta rápida y el diario de movimientos pueden convivir en la
misma pantalla sin que la venta pierda.

## Lo que NO puede aparecer

Te doy el motivo de cada veto. Si tenés un argumento fuerte en contra, escribilo aparte, pero **no lo
dibujes**.

- **Nada de apertura, cierre ni arqueo de caja.** Esto es lo más importante del prompt. Todo sistema
  del rubro tiene un ritual de "abrir la caja" a la mañana y "cerrarla" a la noche contando el
  efectivo, y hasta hace unos días esto lo tenía. **Se eliminó entero, a propósito**: le agregaba un
  paso obligatorio al día que nadie hacía bien, y peor, bloqueaba cobros cuando la caja figuraba
  cerrada — el sistema le impedía al complejo cobrar plata real. Hoy ningún movimiento se bloquea por
  eso. No lo repongas en ninguna forma, ni como "cierre opcional", ni como resumen del día que
  invite a cerrar.
- **Ninguna configurabilidad.** Ni preferencias, ni columnas que el usuario elija, ni bloques
  reordenables, ni un selector de vista. "Por las dudas" está prohibido en todo el producto.
- **Ningún gráfico fuera del reporte de cantina.** El reporte tiene su lugar y ahí un gráfico se
  justifica. En las pantallas operativas, no: son un parte de situación, no una herramienta de
  análisis.
- **Ninguna devolución automática.** El sistema **no puede** devolverle plata a nadie: la devolución
  la hace el complejo por fuera y acá solo se registra que ya la hizo. Un botón que diga "Devolver"
  como si ejecutara algo es una mentira.
- **Ningún texto libre sobre una persona.** Ni notas, ni observaciones, ni comentarios sobre un
  deudor. Es una restricción legal, no una preferencia de producto.

## Cambiar el flujo sí; inventar funcionalidad no

**Cambiar el flujo es lo que quiero**: reordenar, fusionar, plegar o eliminar pantallas y bloques,
cambiar qué es pestaña y qué es panel, cambiar a dónde lleva un botón y con qué ya abierto, cambiar
qué se ve primero, cambiar cómo se presenta un dato.

**Funcionalidad nueva** es un dato que el sistema no tiene, una acción que hoy no existe o un cálculo
que nadie hace. Eso va a una lista aparte, "requiere decisión del dueño", con el motivo y lo que
aportaría. **No lo dibujes como si existiera**: una pantalla que muestra algo que el sistema no puede
calcular no es una propuesta, es una promesa que después alguien tiene que romper.

Los botones tienen que **aterrizar en la cosa, no en la pantalla que la contiene**. Si desde una
deuda se puede cobrar, que abra eso listo para cobrar. Decí para cada acción cuál es el destino y con
qué abierto.

## Vocabulario cerrado

Un término por estado, en toda la app. Estas son las palabras, no sinónimos:

| Cosa | Se dice | Nunca |
| --- | --- | --- |
| Plata que te deben | **Deudas** | cuentas por cobrar, saldo deudor, morosos |
| Plata que tenés que devolver | **Devolvés** | reembolsos, notas de crédito |
| Venta anotada para cobrar después | **fiado** | cuenta corriente, crédito, a cuenta |
| La seña de una reserva | **seña** | anticipo, depósito |
| Quien reserva | jugador si tiene cuenta, invitado si no | cliente, usuario |
| Turno fijo semanal | **abonado** | suscripción |
| Los 9 estados de un turno | Esperando seña · Confirmada · Señada · Jugada · Sin cobrar · Ausente · Abonado · Torneo · Bloqueado | Pendiente, Reservado, No-show |
| Acciones | verbo primero y en voseo: "Cobrar $ 16.000", "Marcar devuelta" | "Click aquí", "Ir a" |

Plata siempre `$ 16.000`, con espacio y punto de miles, sin decimales. Fechas en castellano, formato
medio: "mié 2 de julio". Horas en 24 h. Nada de formato ISO ni anglicismos de tablero.

## El color dice el estado de la plata

El color comunica **el estado de la plata**; el ícono y el texto comunican **qué es la cosa**. Nada
se comunica solo con color: el 8 % de los varones es daltónico y la base de usuarios es casi toda
masculina.

- Verde: plata que entró o está asegurada.
- Ámbar: te deben algo y todavía no llegó.
- Rojo: plata que sale, o algo que ya se prestó y falta cobrar.
- Gris: sin movimiento, o no aplica.

**Usá siempre los tokens del sistema** (`bg-card`, `text-foreground`, `bg-primary`,
`text-muted-foreground`), nunca un color nuevo ni un hex suelto. La marca es esmeralda para acciones,
sobre superficies grises azuladas.

**Entregá todo en tema claro solamente.** El tema oscuro se deriva después, en el código, a partir de
esos mismos tokens — por eso importa tanto que no haya colores fuera del sistema: un hex suelto no
tiene versión oscura y rompe la derivación. No gastes esfuerzo dibujando la variante oscura.

## Reglas que no se negocian

1. **El total de "Deudas" tiene una sola fuente.** El número del encabezado y el de la lista salen de
   la misma cuenta y no pueden diferir nunca. Si tu diseño muestra ese total en más lugares, decilo:
   todos tienen que ser el mismo número.
2. **"Deudas" y "Devolvés" son opuestos y no se mezclan en un neto.** Una es plata que entra, la otra
   plata que sale. Un solo número combinado esconde las dos.
3. **44 px mínimo** en todo lo que se toca, y nada que dependa de pasar el mouse por encima: el
   mostrador atiende de pie, desde una tablet.
4. **La venta rápida tiene que funcionar con una mano y sin apuntar fino.** Es el único flujo del
   producto que se ejecuta bajo presión social, con gente mirando.
5. **En el teléfono, lo operativo entra antes del pliegue.**
6. **Como máximo 5 a 7 opciones a la vez** de la misma jerarquía; el resto se pliega. La información
   va en grupos de 3 o 4. Lo que exige acción es lo único que salta a la vista.
7. **El armazón del panel ya está definido y no se rediseña acá.** A la izquierda hay un riel fijo de
   72 px con íconos, y arriba una barra de 60 px donde cada pantalla cuelga sus propios controles.
   Diseñá el contenido que va adentro de ese marco; si necesitás poner algo en la barra superior,
   decilo y mostralo, pero no cambies el marco.
8. **El día de Caja no es el día del calendario.** Un complejo que cierra a las 2 de la mañana tiene
   las ventas de esa madrugada en el día anterior. Cualquier rótulo de fecha tiene que ser compatible
   con eso: "hoy" significa el día de trabajo, no de medianoche a medianoche.
9. Si creés que una de estas reglas está mal, **decilo aparte con el argumento** en vez de callarlo o
   de saltearla.

## Qué quiero recibir

1. **El razonamiento de la sección "Antes de dibujar"**: las dos naturalezas y cómo las resolvés, la
   tabla de tareas cronometrada antes y después, de qué sistemas tomás y qué descartás por este
   usuario, y qué falta y qué sobra con las tres preguntas por bloque.
2. **La estructura propuesta, con el porqué**: qué pantallas hay, cuáles desaparecen, qué pasó con
   cada pestaña actual, y por qué esa forma y no otra. Si sacás las pestañas, mostrame qué las
   reemplaza y por qué es mejor.
3. **Los destinos.** Para cada acción: a dónde lleva, con qué ya abierto, y cuántos toques quedan
   hasta resolver, contra cuántos son hoy.
4. **Decisiones que no son tuyas.** Lo que cambiaría una regla de negocio o necesitaría un dato que
   el inventario no tiene, listado aparte y sin dibujar.
5. **Las pantallas, solo en tema claro**: escritorio a 1280 px y teléfono a 375 px.
   - **El estado lleno de la venta**: viernes a la noche, con productos, fiados abiertos y
     movimientos del día.
   - **El estado lleno de lo administrativo**: varias deudas de las tres fuentes y dos devoluciones
     pendientes.
   - **Productos y stock**, con catálogo cargado y con un producto sin stock.
   - **Los vacíos**: sin ventas todavía hoy, sin deudas ("nadie te debe nada" es un premio, tratalo
     como tal), sin devoluciones pendientes, y catálogo vacío de un complejo que recién arranca.
   - **El flujo de venta completo**, paso por paso, desde que el encargado toca el primer producto
     hasta que la venta queda registrada.
