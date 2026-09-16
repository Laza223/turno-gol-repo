# Cobrar un turno por equipo: dos pagos, sin modelo nuevo

**Fecha**: 2026-09-15 · **Estado**: aplicado · **Decide**: el dueño (encuadre y formato) + esta
sesión (cómo)

## Qué

El panel del turno en la grilla ofrece **"Cobrar la mitad — $X"** como botón propio, y una vez que
entró el primer cobro de mostrador muestra **"Equipo 1 pagó · falta Equipo 2"**. El mismo atajo va
en `CompleteBookingDialog` (la otra puerta de cobro, desde `/reservas`), y la lista de cobros del
detalle rotula sus filas "Equipo 1 / Equipo 2" cuando el turno se cobró exactamente en dos veces.

## Por qué

El complejo de prueba avisó que **la mayoría de las veces se cobra por equipo**: el turno es uno
solo, pero la plata entra en dos momentos y de dos manos, y el que está en el mostrador necesita
saber cuál de los dos ya pagó sin acordarse de memoria.

## Esto revierte la mitad de D2

`docs/planning/2026-08-01-decisiones-de-fase-v2.md` §D2 decidió, textualmente: _"cada cobro se
registra a UNA persona en UNA transacción, pero esa transacción puede partirse en métodos … **Sin N
pagadores** (los parciales completos quedan fuera de alcance)"_. El motivo declarado era no abrir
"la contabilidad de terceros que hace pantanoso el arqueo".

Se revierte la parte de N pagadores. Tres razones:

1. D2 se decidió en agosto **sin un solo cliente usando el producto**. Esto viene de uno real.
2. El miedo era el arqueo, y no se materializa: cada cobro ya es una fila de `cash_flows` con su
   método, así que el desglose por método del día sigue cerrando exactamente igual. Dos filas de un
   mismo turno no son distintas de dos filas de dos turnos.
3. **El split por método, que es lo que D2 sí quería, no se toca**: `SplitPaymentFields`,
   `chargeSplitPayment` y "Cobrar otro monto" quedan como están.

## El hallazgo: no faltaba modelo, faltaba la puerta

Cobrar un turno en dos veces **ya funcionaba**, y por eso este cambio no tiene ni migración ni
columna:

- Cada cobro es una fila de `cash_flows` (`type='income'`, `category='booking'`, `booking_id`).
  **No hay UNIQUE sobre `booking_id`** — N cobros por turno siempre fueron válidos.
- El saldo **se calcula, no se guarda**: `summarizeBookingCharges`
  (`src/modules/bookings/booking.charges.ts`), consumido por grilla, `/reservas`, Deudas y el
  detalle.
- `addBookingChargeAction` y `chargeDebtAction` aceptan **cualquier monto ≤ pendiente**, con
  `SELECT … FOR UPDATE` e idempotencia por línea. `tests/integration/booking-charges.test.ts` ya
  cubría parciales y la carrera de dos cobros simultáneos.
- El detalle de la reserva hasta tenía un atajo "50%".

Lo que no existía era el acceso donde se cobra de verdad. En el panel de la grilla el botón grande
cobra **el total**, y la única forma de cobrar la mitad era **"Cobrar otro monto"**: un link de
11 px, gris, que además abre el monto **prellenado con el total** — su propio comentario dice que
"se abre para CORREGIR un monto, no para escribirlo de cero". Nadie lo encuentra, y quien lo
encuentra tiene que borrar un número para escribir otro.

## Por qué "Equipo 1 / Equipo 2" NO es una columna

Se evaluó guardar quién pagó cada mitad (`cash_flows.payer_slot`, o una etiqueta). Se descartó:

- **La etiqueta es el orden.** El primer cobro es el del primer equipo por definición; los dos
  equipos son intercambiables y nadie necesita saber cuál era "el 1". Una columna que siempre vale
  lo mismo que el ordinal de la fila es denormalizar algo gratis.
- **Guardarla como texto dentro de `description` estaba directamente vetado por precedente.** Este
  repo ya paga el costo de una semántica metida en un texto de caja: el literal `'Seña — turno
<uuid>'`, que `getBookingCharges` usa como clave de exclusión y que está hardcodeado en SQL crudo
  en `booking.debts.ts` (×2) y `caja-lib.ts`, reconocido como frágil en ese mismo archivo. No se
  repite el patrón.
- **Nunca texto libre sobre personas** (Ley 25.326, veto vigente): "Equipo 1/2" es un rótulo fijo
  del producto, no un dato cargado por el staff, así que no abre esa puerta.

Se deriva entonces de lo que el panel ya tiene (`priceSnapshot`, `totalPaid`, `depositAmount`,
`depositStatus`, todos en `GridBooking`), en un helper puro: `teamSplit`
(`src/components/booking/slot-panel/charge-copy.ts`).

## Invariantes y consecuencias asumidas

- **La seña NO cuenta como "un equipo pagó".** `teamSplit` descuenta el depósito con la MISMA regla
  que `summarizeBookingCharges` (`paid`/`captured` y nada más). Sin esto, todo turno señado online
  por el jugador diría "Equipo 1 pagó" sin que nadie haya puesto un peso en el mostrador. Es el caso
  que más tests tiene.
- **La mitad redondea para ARRIBA** (`halfOfPending`): el primero pone el peso de más y el segundo
  nunca queda con un centavo colgado, que en el mostrador no se cobra y dejaría el turno figurando
  como deuda para siempre.
- **La mitad se calcula sobre lo que FALTA, no sobre el precio del turno.** Con seña pagada, la
  mitad es de lo que resta después de la seña.
- **El atajo desaparece solo** en cuanto entra el primer cobro: ahí el botón grande ya dice
  exactamente lo que falta, así que no hay un estado intermedio que explicar.
- **Límite conocido**: el panel de la grilla sabe cuánta plata entró, no en cuántas veces. Si el
  mostrador partió el turno en tres, el rótulo igual dice "Equipo 1 · Equipo 2"; el monto pendiente,
  que es lo que decide qué cobrar, sigue siendo exacto. La lista del detalle sí tiene las filas y
  ahí el rótulo se apaga cuando no son exactamente dos.
- **El medio turno impago es deuda y se comporta como tal**: aparece en `/caja/cuentas` → Deudas
  hasta que lo paguen. No se agregó ningún estado nuevo de reserva.

## Verificación

- `tests/unit/charge-split.test.ts`: los casos del helper, incluido "seña pagada y cero cobros de
  mostrador → no dice que pagó gente" y el redondeo con saldo impar.
- `BookingSlotPanel.stories.tsx`: `CobrarDeAPartes`, `PagaronCuatroDeDiez`, `MitadCobrada`,
  `SeniaNoEsGenteQuePago`.
- Backend sin test nuevo a propósito: `tests/integration/booking-charges.test.ts` ya cubre cobro
  parcial, tope por pendiente y dos cobros concurrentes.

## Nota 2026-09-16 — "Pagó uno": cobrar jugador por jugador

El dueño, revisando lo de arriba: cobrar por equipo es **sólo un contador visual** para el que está
en el mostrador, y el caso más frecuente no es el equipo sino que **cada jugador paga lo suyo a
medida que llega**. Se agrega un segundo atajo, **"Pagó uno — $X"**, y el rótulo pasa a contar
gente: **"Pagaron 4 de 10"** (con "· un equipo entero" cuando cae justo en la mitad).

Encuadre explícito del dueño, que acota el alcance: **no se registra un cliente por equipo ni por
jugador.** Sería demasiada fricción y llenaría el sistema de datos que no sirven ni a este complejo
ni a ningún otro. En la vida real, si hay que reclamar, se le reclama **al que reservó** por
WhatsApp — incluso cuando el que no pagó es del otro equipo. La simplicidad es el requisito, no un
recorte.

Consecuencias:

- **La parte de un jugador sale del PRECIO del turno**, no de lo pendiente: lo que pone cada uno no
  cambia porque otro ya haya pagado. Con seña, la seña cubre las primeras partes y el pendiente baja
  solo. Divisor: `courts.capacity` (jugadores que entran = `format × 2`), que ya existe.
- **El panel necesitaba un dato que no tenía**: la capacidad de la cancha del turno. Viajaba hasta
  `BookingGrid` dentro de `CourtRow` pero el panel recortaba el tipo a `{id, name, status}`. Se
  ensanchó esa prop — no hay query nueva. Sin `capacity`, el botón no se ofrece y el rótulo vuelve a
  hablar de equipos: degrada, no rompe.
- **`canSplitShare` exige `pending > shareCents`, estrictamente.** Cuando lo que falta ES una parte,
  el botón grande ya dice "Cobrar $2.400": ofrecer los dos sería el mismo cobro dos veces.
- **El conteo se deduce dividiendo** (`counterPaid / shareCents`), porque el panel sabe cuánto entró
  y no en cuántas veces. Un cobro suelto por "Cobrar otro monto" puede correr el conteo un jugador;
  por eso el número grande sigue siendo **lo que falta**, que nunca se deduce, y el rótulo no repite
  el monto. Contar filas exactas pediría traer los cobros de cada turno a la grilla, la consulta por
  turno que `sumBookingChargesByBooking` evita a propósito.
- **`submitPartialCharge` topea contra el pendiente** antes de llamar a la action. El backend ya lo
  valida, pero cobrar de más no puede depender de que el cliente calcule bien.
- `CompleteBookingDialog` adopta el rótulo "Pagó un equipo" para no tener dos nombres del mismo
  cobro (H017). **No** ofrece "Pagó uno": ese diálogo no conoce la cancha del turno.

## Nota 2026-09-16 (tarde) — "Dividir pago por equipo" en vez de "Pagó un equipo"

El dueño, viéndolo andar: el atajo de la mitad cobraba de un toque sin mostrar nada, y lo que quiere
es **ver los dos equipos**. "Pagó un equipo" pasa a ser **"Dividir pago por equipo"**, que parte el
cobro en dos filas rotuladas **Equipo 1 / Equipo 2** — la misma interacción que el pago dividido por
método, con el rótulo del equipo en vez del índice. Cada fila tiene monto (precargado con la mitad,
editable), método y **su propio "Cobrar"**, así se le cobra a cada equipo cuando paga; el botón
grande sigue cobrando las dos filas juntas. "Cobrar en un solo pago" vuelve atrás.

- **Sigue sin guardarse nada.** Las filas son estado de la pantalla; una vez que entró un cobro, el
  panel se reconstruye desde la plata (`canSplitHalf` pasa a false) y el rótulo de arriba dice
  **"Equipo 1 pagó · falta Equipo 2"**. Por eso la mitad justa dejó de decir "Pagaron 5 de 10 · un
  equipo entero": dos nombres para lo mismo en el mismo panel.
- **El "Cobrar" de una fila no usa `submitPartialCharge`** (`submitLineCharge` en
  `use-slot-charges.ts`): aquel reemplaza las líneas por una sola, y si el cobro fallaba el admin
  perdía la fila del otro equipo y el monto que había corregido.
- El modo exige exactamente dos líneas y se reinicia con `key={booking.id}`: entre un cobro exitoso y
  el refresco del turno las líneas vuelven a una, y ahí se cae a la vista normal en vez de dibujar un
  equipo huérfano.
- `CompleteBookingDialog` adopta el mismo gesto: carga dos líneas de la mitad, rotuladas por equipo.
