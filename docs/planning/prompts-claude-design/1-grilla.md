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

Rediseñá la Grilla para que se vea **más moderna, más linda y más clara**, construyendo con los
componentes de este proyecto y respetando sus guías. Tenés libertad total en layout, jerarquía,
agrupación, espaciado, composición, estados vacíos, iconografía y microinteracciones. Podés
proponer cambios al armazón de la app (barra lateral, barra superior) si mejoran esta pantalla.

No tenés libertad en lo de abajo. La app acaba de pasar una auditoría de coherencia de 130
hallazgos, y el objetivo es que **cada cosa se llame igual en todas las pantallas**.

## La pantalla

Rodrigo, viernes 21:40, solo, con alguien en el mostrador y el teléfono sonando: _"¿tenés cancha a
las 22?"_. Tiene que verlo de un vistazo y cargarla en 15 segundos sin doblar una cancha.

**Lo que hay hoy:**

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
- **Tocar un lugar libre** abre un formulario corto ahí mismo: nombre, teléfono opcional, y el
  precio ya resuelto por la franja horaria. Se guarda y la celda pasa a ocupada.
- **Tocar un turno** abre un panel lateral con quién, horario, precio, cobrado y pendiente, más las
  acciones: cobrar, cargar consumo de cantina, marcar ausente (pide confirmación, porque le hace
  perder la seña), reprogramar y cancelar (pide motivo y quién cancela). Si es un bloqueo, se
  libera desde ahí. Si es un turno de torneo, dice qué torneo lo ocupa y lleva al torneo.
- **Leyenda** de estados al pie, solo en escritorio.

**Qué está mal hoy.** En el teléfono el dueño la describió como _"ilegible e inmanejable"_. En
escritorio funciona, pero se ve como una tabla de sistema: sin aire, sin jerarquía entre el turno
que empieza en 10 minutos y el de dentro de 6 horas, y el panel lateral es una lista de campos.
Quiero que un viernes a las 21 con 4 canchas se lea de un vistazo qué está libre, qué está por
empezar y a quién hay que cobrarle.

**Vacíos a diseñar:** día sin ninguna reserva, con la pista de primera vez "tocá un lugar libre
para reservar"; día cerrado; y todas las canchas pausadas.

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
7. **Nada nuevo funcionalmente.** Si tu diseño necesita un dato que la app no tiene, marcalo aparte
   en vez de dibujarlo como si existiera.

## Qué quiero recibir

Escritorio a 1280 px y teléfono a 375 px, cada uno en claro y en oscuro. El estado **lleno** es un
viernes con 4 canchas y turnos en todos los estados. Más los tres vacíos de arriba. El encargado ve
lo mismo que el dueño en esta pantalla, así que con una versión alcanza.
