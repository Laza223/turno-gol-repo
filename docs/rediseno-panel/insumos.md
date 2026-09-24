# Insumos del rediseño del panel: El Vagón

> Paso 0 antes de abrir impeccable. Complejo: **El Vagón Deportivo** (Luján). Tiene 5 canchas: 4 de F7 a
> $84.000 y 1 de F5 a $60.000, con precio único todo el día. Abre de lunes a viernes de 08 a 01, los sábados de 08 a 22, y los domingos cierra.
> Alta en TurnoGol el 2026-09-07; uso real desde el 2026-09-14.
>
> Cada dato lleva su origen:
>
> - **[MEDIDO]**: sale de producción (consulta de solo lectura del 2026-09-23 sobre los 8 días operativos
>   del 14 al 22 de septiembre). Son conteos, sin nombres ni facturación.
> - **[REGISTRADO]**: está anotado en el repo con fecha. Es lo que contó el founder, no la frase
>   textual del complejo.
> - **[FOUNDER]**: lo respondió el founder el 2026-09-23, por usar el panel él mismo y por conocer el
>   complejo. No se le preguntó al complejo.
>
> "Rodrigo" y "Marcelo" son las personas inventadas de `docs/spec/doc3_personas_jtbd.md`, no la gente
> del Vagón. Acá se usan los roles (encargado, dueño) y no van nombres reales (misma regla que
> `docs/gtm/ejecucion/10-aprendizajes.md`).

## 1. De dónde sale el rediseño

**El complejo no se queja.** Antes usaban un cuaderno y lo dejaron; al lado del cuaderno, el sistema es
la gloria. **El rediseño lo empuja el founder** después de usarlo él mismo: los procesos, las vistas y la
UX/UI pueden ser mucho mejores. Lo que el complejo sí reportó fueron roces puntuales, y ya se
arreglaron.

### La mirada del founder [FOUNDER]

Estos son los lugares donde más se puede mejorar:

1. **Cobrar en la hora pico.** Hay que cobrar 4 o 5 turnos, cada uno en varios pagos, y vender en la cantina al mismo tiempo.
2. **Moverse entre vistas.** Hoy, Grilla, Reservas y Caja se pisan: no queda claro dónde se hace cada cosa.
3. **El aspecto general.** Densidad, tarjetas, jerarquía: tiene que parecer una herramienta de trabajo.

### Lo que reportó el complejo [REGISTRADO]

| Fecha | Quién | Qué dijo | Qué se hizo |
|---|---|---|---|
| 2026-09-07 | complejo, por WhatsApp | "Solo lo dejaba cargar 2 canchas". Además quería borrar una "Cancha de prueba" y el sistema solo le dejaba desactivarla. | El síntoma era falso: el editor de precios descartaba de lunes a viernes porque el complejo cierra pasada la medianoche. `docs/decisions/2026-09-07-vagon-deportivo-horarios-y-cobro.md` |
| 2026-09-15 | complejo | La mayoría de las veces se cobra por equipo: es un solo turno, pero la plata entra en dos momentos y de dos manos. El del mostrador necesita ver cuál de los dos ya pagó. | "Dividir pago por equipo" y el rótulo "Equipo 1 pagó · falta Equipo 2". `docs/decisions/2026-09-15-cobro-por-equipo.md` |
| 2026-09-15 | encargado | Antes de la hora del turno le pagaron una parte. Cuando el turno se puso en rojo, el panel solo ofrecía "Cobrar $84.000" y no encontró cómo cargar $20.000. | Monto editable a la vista. `docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md` |
| 2026-09-15 | encargado o dueño | Una reserva cargada no se puede editar (ni nombre, ni teléfono, ni precio, ni duración). Las escuelitas se repiten y casi siempre son gratis. | Edición de la reserva y evento repetible y gratis, en el mismo doc. |
| 2026-09-16 | complejo | Lo más frecuente no es el pago por equipo: cada jugador paga lo suyo a medida que llega. | "Pagó uno" y el rótulo "Pagaron 4 de 10". El criterio de que sea un contador visual y no un registro, y de que la deuda se le reclama al que reservó, es del founder. |
| 2026-09-16 | dueño (observado por el founder) | En el celular no encontraba sus canchas en la grilla: veía dos o tres y no se dio cuenta de que había que deslizar. | Degradé en los bordes y contador de canchas. `design-system/pages/grilla.md` |
| 2026-09-19 | cliente real | Cuando terminan uno o más turnos a la misma hora y va a cobrarlos, el sistema lo saca de la vista y no le da todo lo que necesita en ese momento. | Hoy pasa a ser la pantalla del mostrador: cobro en un modal y Vender al lado. `docs/decisions/2026-09-19-hoy-cobrar-y-vender.md` |
| 2026-09-19 | observado por el founder | Las canchas no tienen ninguna foto y nada del panel se lo avisa. | Aviso de lo que falta en Canchas y en Perfil. |

## 2. Un día real en el Vagón

### Quién, dónde y con qué [FOUNDER]

- **En el mostrador de noche está el encargado, solo, con el usuario del dueño.** Una sola persona hace
  todo: carga turnos, cobra, vende en la cantina y contesta el WhatsApp del complejo.
- **Usa una PC o notebook fija en el mostrador, con mouse.**
- **Las reservas entran por el WhatsApp del complejo**, y además están los grupos de siempre, que repiten sin
  ser turno fijo.
- **Desde el 2026-09-19 cobra y vende desde Hoy.** Antes cobraba desde la grilla.
- **El dueño no está de noche.** Mira desde el celular cómo va la noche. No entra a Métricas. En el
  celular fue donde no encontró sus canchas en la grilla (2026-09-16).
- **Dejaron el cuaderno.** No anotan nada en papel.

### Lo que dicen los datos [MEDIDO]

- **El sistema se usa de 17 a 1.** Todos los cobros y todas las ventas se registraron entre las
  17:00 y las 00:59. De mañana nadie opera, salvo el día del arranque, cuando se cargó la grilla de
  golpe a las 10.
- **Hay una sola cuenta: la del dueño (`admin`).** El panel no sabe si el que cobra es el
  encargado o el dueño.
- **Los turnos se cargan en el día.** Después del arranque se cargan 6 a 8 turnos por día, casi todos entre las 17 y
  las 20. De los 47 que se cargaron después del arranque, **ninguno se cargó con más de 24 h de anticipación**: el 89% se cargó
  menos de 6 h antes y el 38% menos de 1 h antes. Son mensajes de WhatsApp que se contestan en el momento.
- **La hora pico es a las 19 y a las 20, cualquier día de semana.** 51 de los 75 turnos jugados empezaron a esas
  horas; a las 21 bajan a 12 y después casi no hay. El viernes no es especial: tuvo 10 turnos, contra 13 del
  miércoles y del jueves. Las 5 canchas se llenaron a las 19 el miércoles 16 y el viernes 18, y a las 20
  el miércoles 16.
- **Se cobra después del partido.** En la mediana, el primer pago de un turno llega 29 minutos
  después de que termina (la mitad de los casos, entre 24 y 39 min). Solo 3 de 65 turnos pagaron algo antes de
  empezar.
- **Se cobra de a partes.** 7 de cada 10 turnos se pagaron en 2 o más veces (hasta 7 pagos para un mismo
  turno) y casi la mitad mezcló métodos. Entre el primer y el último pago de un turno pasan 7 minutos
  en la mediana, y en el 10% de los casos más de 37: la gente paga a medida que llega al mostrador.
- **Efectivo y MercadoPago cargado a mano.** De los pagos de turnos, el 65% fue en efectivo, el 33% por MercadoPago (QR o alias, cargado a
  mano; el complejo no pide seña online) y el 3% por transferencia.
- **Lo que más se hace es vender en la cantina.** Hubo 197 ventas en 8 días, unas 25 por noche, contra 150 pagos de
  turnos. La venta típica es de $6.000, más o menos una bebida (1,2 productos por venta), y el 99% son ventas sueltas, que no se
  cargan al turno. El pico es a las 20 y a las 21, justo cuando se cobran los turnos.
- **Nadie reserva online.** Hubo 0 reservas online y 0 turnos de jugadores con cuenta: todo se carga con nombre y
  teléfono. Hay 2 turnos fijos activos.

### El momento crítico: de 20:00 a 22:00 [MEDIDO + inferencia]

Esto es una noche armada con los promedios, no una noche que alguien haya visto.

A las 20:00 terminan los 3 a 5 turnos de las 19 y empiezan los de las 20. En las dos horas siguientes,
el encargado, solo y en la PC del mostrador:

- cobra los turnos que terminaron. Son unos 13 pagos por noche, porque cada turno se paga en 2 o 3 veces con minutos de
  diferencia, en efectivo o con QR;
- vende en la cantina unas 15 veces por noche;
- atiende a los que llegan para las 20, contesta el WhatsApp y a veces carga un turno para dentro de un
  rato.

Son unos 29 movimientos en dos horas, amontonados en la media hora que sigue al final de cada
turno. Dos tercios de todos los cobros y ventas de la semana caen en esa franja.

**Que un turno esté terminado y sin cobrar no es una excepción:** es lo normal durante la media hora que sigue a cada
partido. Marcar en rojo como deuda un turno a las 20:05 no refleja lo que pasa en este complejo.

## 3. Tareas por frecuencia [MEDIDO, 8 días]

| # | Tarea | Cuántas veces | Cuándo |
|---|---|---|---|
| 1 | Vender en la cantina | 197 (unas 25 por noche) | de 18 a 23; pico a las 20 y a las 21 |
| 2 | Cobrar un turno (cada pago) | 150 pagos en 65 turnos (unos 19 por noche, 2,3 por turno) | de 20 a 22 |
| 3 | Mirar la grilla para ver si hay lugar | no se puede medir (no hay registro de lo que se mira). Tiene que ser lo más frecuente: pasa con cada WhatsApp | toda la tarde |
| 4 | Cargar un turno | 6 a 8 por día | de 17 a 20, siempre para el mismo día |
| 5 | Cancelar un turno | 15 (unos 2 por día) | 5 se cancelaron después del inicio del turno. El founder cree que pueden ser pruebas suyas, y los datos no lo distinguen: salen de la misma cuenta y sin impersonar |

Cada tanto:

- Anotar un fiado: 7 en 8 días.
- Cargar un evento sin cargo (escuelita): 2 en la semana.

Una vez por mes, o nunca (en 8 días):

- Cerrar la caja: **ninguna vez**. **[FOUNDER]** A nadie le importa y nadie lo va a usar. Queda pendiente que el cierre de caja sea
  inteligente y automático, en vez de un arqueo manual.
- Reponer stock: **ninguna reposición** (hubo 2 ajustes). Tienen 31 productos cargados y el stock solo baja con las ventas.
- Turnos fijos: hay 2 activos, cargados el día del arranque.
- Canchas, precios y horarios: se configuraron el día del alta (07-09) y se volvieron a tocar cuando algo se rompió.
- Fotos, logo y perfil público: nunca. Las canchas siguen sin foto.
- Equipo: nunca. Hay una sola cuenta.
- Métricas: nunca. El dueño no entra **[FOUNDER]**.

## 4. Frases para impeccable

Lo de arriba, en frases que cambian el diseño:

- "El encargado cobra con mouse en una PC fija del mostrador, solo, mientras contesta el WhatsApp del
  complejo y vende bebidas."
- "De 20 a 22 el mostrador cobra cuatro o cinco turnos en varios pagos cada uno y vende en la cantina, todo a la vez: unos 29
  movimientos en dos horas."
- "Cada turno se paga en 2 o 3 veces que llegan en unos 7 minutos, en efectivo o con QR. Casi nadie paga
  antes de jugar."
- "Que un turno esté terminado y sin cobrar es lo normal durante media hora. No es deuda."
- "Vender en la cantina es lo que más se hace en el panel, y casi nunca va atado a un turno."
- "Los turnos se cargan el mismo día, muchas veces menos de una hora antes, contestando un WhatsApp
  mientras se atiende el mostrador."
- "El dueño no está: mira la noche desde el celular. En el celular la grilla le escondió canchas."
- "El encargado usa el usuario del dueño: el panel no sabe quién está cobrando."
- "Nunca cerraron la caja ni repusieron stock. Lo que se hace una vez por mes no puede competir por lugar
  con lo que se hace cada minuto."
- "El complejo está contento porque venía de un cuaderno. Que no se quejen no quiere decir que el flujo sea bueno."

## Fuentes

- Producción: `bookings`, `cash_flows`, `stock_movements`, `canteen_tabs`, `daily_cash_closes`,
  `tenant_staff_members` y `audit_logs` del tenant `ed346072…`, del 14 al 22 de septiembre de 2026. Solo lectura,
  solo conteos.
- `docs/gtm/ejecucion/10-aprendizajes.md` (entradas del 2026-09-07 al 2026-09-19).
- Decisiones: `2026-09-07-vagon-deportivo-horarios-y-cobro`, `2026-09-15-cobro-por-equipo`,
  `2026-09-15-evento-repetible-edicion-y-cobro-parcial`, `2026-09-19-hoy-cobrar-y-vender`.
- Respuestas del founder del 2026-09-23 (sección 2 "Quién, dónde y con qué", Hoy contra grilla, Métricas y cierre de
  caja).
- Facturación de los primeros 3 días: `docs/gtm/data/2026-09-17-facturacion-p-vagon.md` (fuera de git).
