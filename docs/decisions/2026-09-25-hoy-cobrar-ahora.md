# Hoy es un tablero de acción: un turno por cancha, "Cobrar ahora" en rojo y el equipo de cada cobro

**Fecha**: 2026-09-25 · **Estado**: implementada en `refactor/hoy-limpio`, sin mergear · **Decide**:
el dueño (qué muestra Hoy, el rojo y guardar el equipo) + esta sesión (cómo)

## Origen

Fricción observada con el complejo piloto, registrada en `docs/gtm/ejecucion/10-aprendizajes.md`
(2026-09-25):

- En 14 días se juntaron cientos de miles de pesos en turnos **jugados y no cobrados**. Mientras nadie
  los cobra, esa plata no está en la caja ni en las métricas (`getTenantMetrics` suma `cash_flows`).
- Hoy mostraba todos los turnos del día por cancha. Entre los que pasaron y los que vienen, los que había
  que cobrar no se miraban. El ámbar de "Por cobrar" (2026-09-24, PRs #374 y #375) no transmitía urgencia.
- El dueño del piloto: cuando paga alguien de un equipo, el sistema lo descuenta del total y no de la
  mitad de ESE equipo, y necesitan saber qué equipo pagó.
- Lo de días anteriores vivía solo en Caja y se llamaba "Deudas": la palabra no es y el lugar tampoco.

## Qué se decide

1. **Hoy es un tablero por cancha con UN turno cada una.** (Primera versión de la mañana: una
   cola "Cobrar ahora" con todos los turnos por cobrar más la lista de "Turnos no cobrados". El dueño
   la rechazó el mismo día: una lista larga no es una pantalla de acción, y quien cobra poco termina
   con una pantalla llena de atrasados.) Cada cancha muestra el turno que terminó sin cobrarse, en
   rojo y con "Cobrar $X" latiendo; si no hay, el que se juega; si no, el próximo. Es una fila por
   cancha con el reloj del turno abajo, y lo pagado entero va en verde (diseño elegido por el dueño
   entre variantes el mismo día). Con Vender como modal (punto 6) el tablero va a todo el ancho: doce
   canchas miden 662 px de alto en la notebook de 1366. Lo de días anteriores es UN renglón con el total que abre
   la lista en un diálogo. Se van la ocupación y la lista de próximos turnos.
2. **Rojo en todos lados para lo jugado y no cobrado.** Hoy y la Grilla dicen lo mismo: "No cobrado",
   "Cobrar $X", "Turnos no cobrados". **Nunca "deuda".** Un turno que se está jugando todavía se
   cobra a tiempo y no va en rojo. El portal del jugador no cambia.
3. **El modal de cobro de Hoy es solo para cobrar.** Sin "Cantina" (la venta está en la columna de al
   lado) ni "Marcar ausente" (se anota desde la Grilla, cuyo modal los conserva). Más ancho (672 px) para
   que los dos equipos entren lado a lado, cada uno con lo que le falta, su "Cobrar" y su "Pagó uno".
   Con el turno saldado ofrece **"Cobrar el siguiente"**, y mientras tanto "Siguiente para cobrar"
   abajo: cobrar cinco turnos seguidos no obliga a cerrar y buscar cada uno. Un turno a medias (pagó un
   equipo) queda a medias y su cancha lo sigue mostrando hasta que pague el otro.
4. **Cada cobro de mostrador guarda su equipo** (`cash_flows.booking_team`, 1, 2 o vacío; migración
   092). Lo que falta a cada equipo sale de lo que pagó ESE equipo; lo cobrado sin equipo (cobros
   viejos o "Todo junto") se le cuenta primero al Equipo 1, que es lo que se hacía hasta hoy.
5. **En Caja, "Deudas" pasa a "Sin cobrar".** La lista completa sigue ahí; Hoy muestra los más
   recientes y manda a Caja solo lo que no entra.
   "Turnos no cobrados" filtra en SQL con el mismo predicado que Caja › Cuentas (Hoy se refresca cada
   minuto: nada de traer a Node todo el año, la forma de B11) y ordena por el instante físico.
6. **Vender deja de ser una columna y pasa a un modal** (elegido por el dueño entre variantes el mismo
   día). La columna fija de 380 px le quitaba lugar al tablero y su catálogo obligaba a scrollear o
   tipear cada producto. El modal abre con "Vender" o la tecla V: rubros a la izquierda, "Más vendidos"
   primero (los 8 con más unidades en 30 días, de `getSalesRanking`, la cuenta del reporte de Caja), la
   lista en renglones y la venta a la derecha. La venta es la misma de Caja (`useTicketSale`). Los
   productos ganan una **categoría** opcional (texto de hasta 40 letras, migración 093, sin tabla aparte:
   para 10 a 50 productos una tabla sumaría RLS, tests de aislamiento y una pantalla de administración).
   Es una excepción al freeze decidida por el dueño (`10-aprendizajes.md`, 2026-09-25). El menú lateral
   pasa a íconos que se despliegan con el nombre al pasar el mouse; en tablet el rótulo sigue visible.
## Qué se reabre

- **`2026-09-15-cobro-por-equipo.md`, "Por qué Equipo 1 / Equipo 2 NO es una columna".** Su argumento
  principal era que "la etiqueta es el orden" y que nadie necesita saber cuál era el 1. Un cliente real
  lo refutó: el primero que paga puede ser del Equipo 2, y el mostrador necesita saber a quién le falta.
  El otro argumento se sigue respetando: `booking_team` es un valor cerrado (1 o 2), no texto libre sobre
  personas (Ley 25.326), y no va en `description`.
- **El principio 3 de `PRODUCT.md`** ("terminado y sin cobrar es normal, por cobrar, no alarma") y el
  ámbar del 2026-09-24: se reemplazan por el rojo de "No cobrado".
- **`2026-09-19-hoy-cobrar-y-vender.md`, punto 3** (tablero por cancha): sigue siendo por cancha, pero con
  un turno por cancha en vez de todos. El modal de cobro sigue; la columna Vender pasa a modal (punto 6).
- **DESIGN.md, "sin loops infinitos"**: el punto que late en "Cobrar $X" es una excepción pedida por el
  dueño; `prefers-reduced-motion` lo congela.

## Qué no cambia

- El saldo se sigue calculando (`summarizeBookingCharges`); las tres Server Actions de cobro conservan
  el bloqueo de fila, el recálculo del saldo en el servidor y la idempotencia por línea (que ahora
  incluye el equipo).
- El pago dividido en varios métodos (D3 del 2026-09-15) sigue, en "Todo junto" y dentro de cada
  equipo: si un equipo divide su pago, las tarjetas pasan de lado a lado a una debajo de la otra.
- El modal de la Grilla conserva Cantina y "Marcar ausente".

## Freeze

Entra por dos puertas del freeze (D4): circuito de plata y fricción de adopción observada en un cliente
real. La observación está registrada antes de programar (`10-aprendizajes.md`, 2026-09-25).

## Riesgo y vuelta atrás

La migración 092 agrega una columna que acepta vacío: no toca filas existentes y se aplica sola al
mergear. Volver atrás en la pantalla es revertir el PR; la columna puede quedar sin uso.
