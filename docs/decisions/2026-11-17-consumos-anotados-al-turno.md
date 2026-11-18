# Consumos anotados al turno: se piden durante el partido y se cobran junto con la cancha

**Fecha**: 2026-11-17 · **Estado**: implementada en `feat/consumos-anotados-turno`, sin mergear ·
**Decide**: el dueño (el modelo "anotado, no cobrado" y el aviso en el cobro) + esta sesión (cómo)

## Origen

Fricción observada en El Vagón (El Zurdo, vía founder; registrada en
`docs/gtm/ejecucion/10-aprendizajes.md`, 2026-11-17): al terminar un turno los jugadores piden
"2 jugos" o "2 birras" y lo pagan junto con la cancha. Hoy el sistema solo deja **cobrar** una venta
(entra en caja en ese momento) o **fiarla a una persona**. No hay forma de dejarla anotada en el turno
y que el cobro del turno la traiga sumada, así que siguen anotando en papel.

## Qué se decide

1. **El consumo se anota en el turno, no se cobra.** Desde el modal del turno en Hoy, "Cantina" abre el
   mismo ticket de Vender y suma un botón **"Anotar al turno"**. El stock sale en ese momento y no entra
   plata. Es un `canteen_tabs` (fiado) con `booking_id`: no hay circuito de plata nuevo.
2. **El cobro del turno avisa lo anotado.** En "Todo junto" aparece "Consumos anotados $X" (una línea por
   tanda: "2 × Cerveza"), con una ✕ para quitar una y una casilla "Cobrar con el turno" (tildada). El
   botón suma todo: "Cobrar $30.000". Sin consumos anotados el modal queda idéntico a hoy.
3. **El cobro combinado son dos pasos idempotentes, en este orden:** `settleTab` de cada anotado y
   después la acción de cobro del turno de siempre, sin tocar. Cada paso es verdadero por sí solo: si el
   segundo falla, el consumo ya quedó cobrado y el modal lo dice ("Lo anotado ya quedó cobrado… Falta
   cobrar el turno"). Un corte de red reintenta los dos con las mismas keys.
4. **El libro los muestra como cantina.** `settleTab` guarda "Consumo de turno · Cancha 3 · 21:00" (el
   fiado común sigue siendo "Fiado cobrado — …"), así que en Caja › Cuentas se lee como una venta de
   cantina y no como fiado.

## Reglas de v1 (deliberadas)

- **Un solo medio de pago para todo** cuando hay consumos incluidos: el pago dividido se desactiva (la
  casilla se apaga con "dejá un solo medio de pago"). Con "Otro" y consumos incluidos el cobro se frena:
  `settleTab` solo admite efectivo, transferencia y MercadoPago.
- **Solo en "Todo junto".** En "Por equipo" y "Por jugador" una línea avisa que los consumos se cobran en
  "Todo junto".
- **La Grilla no cambia**: el modal de la Grilla sigue sin "Anotar al turno".
- **Sin texto libre sobre personas** (Ley 25.326): el nombre del anotado lo arma el servidor
  ("Consumo de turno · Cancha 3 · 21:00"); el cliente no manda nombre. El motivo de quitar un anotado es fijo.
- **Si el turno nunca se cobra, el consumo no se pierde**: queda como fiado sin cobrar en Caja › Cuentas.
  Un turno cancelado, ausente o que no admite consumos (todavía no confirmado, bloqueo, torneo) rechaza
  anotar. El cron `auto-credit-unpaid` acredita solo el turno, no los consumos.
- **El saldo del turno no cambia**: el saldo filtra `category = 'booking'`, y un consumo es
  `product_sale`. Nunca baja lo pendiente de la cancha.

## Qué se reabre y qué se respeta

- **Reabre `2026-09-25-hoy-cobrar-ahora.md`, punto 3** ("el modal de Hoy es solo para cobrar, sin
  Cantina"). El motivo de entonces era sacar una segunda caja del modal de cobro; "Anotar al turno" no lo
  es: no cobra nada, deja una cuenta que el mismo cobro suma. "Marcar ausente" sigue fuera del modal.
- **Supera** "la cantina no se suma a la cuenta del turno" (spec archivado de cobrar y vender): ahora se
  suma, pero como cobro aparte y verdadero, no como parte del precio del turno.
- **Respeta `2026-09-19-hoy-cobrar-y-vender.md`**: lo anotado entra como el flujo real de cantina
  (stock, fiado, libro), sin una tabla ni un tipo de movimiento nuevo.

## Por qué no se metió la plata de cantina en la acción de cobro del turno

El cobro del turno vive dentro de tres Server Actions con replay e idempotencia finos
(`addBookingChargeAction`, `completeAndChargeBookingAction`, `chargeDebtAction`) y un saldo que solo mira
`category = 'booking'`. Mezclar ahí plata de cantina rompe el saldo, el libro y el stock. Se paga el
costo de dos llamadas en vez de una transacción, y se acepta porque cada una es idempotente y el stock ya
salió al anotar (cobrar no puede fallar por stock).

## Datos

Migración `115_canteen_tabs_booking_id.sql`: `canteen_tabs.booking_id uuid NULL REFERENCES bookings(id)
ON DELETE SET NULL` + índice parcial `(tenant_id, booking_id) WHERE status = 'open' AND booking_id IS NOT
NULL`. Aditiva: no toca filas viejas. Se aplica sola al mergear: **necesita el OK del dueño antes de
prod** (efecto visible en El Vagón: ninguno hasta que anoten un consumo).

## Fuera de v1 (a pedido)

Indicador en la fila de la cancha ("+$5.000 anotado") · anotar desde Vender eligiendo turno · consumos en
"Por equipo" / "Por jugador" · pago dividido con consumos · cobrar un consumo anotado de un turno ya
saldado desde el modal (hoy se cobra en Caja › Cuentas).

## Decidido por el dueño (2026-11-18)

- **Rótulo** de un consumo que nadie cobró en Caja › Cuentas › "Fiado sin cobrar": "Consumo de turno ·
  Cancha 3 · 21:00" (el servidor lo arma; es también la descripción del cobro en el libro).
- **Migración 115**: puede aplicarse sola al mergear.
- **Cantina completa en el modal de Hoy**: "Cobrar ahora" convive con "Anotar al turno".
