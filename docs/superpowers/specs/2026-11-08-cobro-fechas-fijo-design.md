# Cobrar fechas de un turno fijo — diseño

Fecha: 2026-11-08 · Solo spec, sin implementar · El arreglo de "cancelar un fijo con fechas que ya tienen plata" ya está en main (#575).

## Por qué

Un cliente fijo que paga el mes junto deja N cobros sueltos, uno por fecha. Si nadie los anota, `auto-credit-unpaid` los registra en efectivo a las 24 h. Hoy todo estado de pago es de una sola fecha y no existe "pagó el mes".

Decisión del dueño: **la base no cambia.** Cada fecha sigue siendo su propia reserva (`type='fixed'`) con su cobro (`cash_flows` por `booking_id`). El período es solo una forma de cobrar varias fechas de un mismo fijo de una vez, desde la lista de fijos. Veto vigente: abonados solo `price_per_session`, sin saldo a favor ni precio mensual. Un adelanto es plata aplicada a reservas concretas, no un crédito.

## Hallazgos verificados en el código

- **`auto-credit-unpaid`** (`src/modules/bookings/booking.auto-credit.ts:52-77`): candidatos solo `status='completed'`, saldo > 0, y 24 h desde `ends_at` Y `updated_at`. Un turno con saldo 0 nunca es candidato.
  **Consecuencia central:** una fecha jugada que se debe vive en la lista como máximo ~24 h; después ya fue acreditada en efectivo. Cobrar solo lo jugado no resuelve "paga el mes junto". Lo que sí lo resuelve es **cobrar fechas futuras por adelantado**: saldo 0, nunca se acredita sola, sin doble cobro.
- **Cobrar un turno hoy** son tres acciones según el estado (`chargeMode`, `src/components/booking/slot-panel/charge-copy.ts:16`): `chargeDebtAction` (completed, `caja/deudas/actions.ts:36`), `completeAndChargeBookingAction` (confirmed ya terminado) y `addBookingChargeAction` (confirmed futuro, `reservas/actions.ts:818`). Todas: guard, `adminRateLimited` por llamada, `resolveIdempotentCharges` (`cashflow.service.ts:291`, key por línea `${key}-${i}`), `FOR UPDATE` del booking, `getBookingCharges` + `summarizeBookingCharges`, `createCashFlow`. `CHARGEABLE_STATUSES = confirmed | completed`.
- **`useSlotCharges`, `ChargeCard` y `CobrarVariosDialog`** (#573) son por turno: una instancia de hook por booking, con su key. Cobrar N fechas de un fijo por ahí serían N llamados no atómicos y N golpes al rate limit, y un fallo a mitad dejaría el mes cobrado a medias. Se reusan las **piezas**, no los componentes (ver "Qué se reusa").
- `bookings.abonado_id` existe (índice parcial `idx_bookings_abonado`). `getAbonados` no trae saldos. `AbonadosList` recibe las Server Actions **por prop** (regla Storybook, comentario en `AbonadosList.tsx:66`): la nueva también.
- `cancelAbonado` hace `DELETE FROM bookings WHERE abonado_id … date >= desde` (`abonado.service.ts:400`). Con adelantos, "fechas futuras con plata" pasa a ser normal. Ese caso quedó resuelto en #575: las fechas con plata no se borran, quedan en la grilla y la acción devuelve `keptDates` para avisarlo.

## Alcance v1

Por fijo activo, un diálogo con dos grupos de fechas y un solo medio de pago. El monto de cada fecha es siempre lo que le falta. Un `cash_flow` por fecha. Cobros parciales o pago mixto: desde el modal del turno, que ya existe.

## Pantallas y estados

**1. Lista (`AbonadosList`, fila de tabla y card mobile).**
- Chip rojo "Debe $60.000 · 2 fechas" si hay jugadas sin cobrar (suma de saldos de las fechas `completed`/terminadas con saldo).
- Botón **Cobrar** en fijos activos, aunque no deba nada (por el adelanto). En la card mobile ocupa la fila de acciones con touch target de 44 px.
- Fijo al día: sin chip.

**2. Diálogo "Cobrar a {contacto}".**
- Encabezado: día, hora, cancha y precio por turno.
- Grupo **Jugadas sin cobrar**: casillas preseleccionadas.
- Grupo **Próximas fechas** (las ya generadas, ver pregunta 2): sin seleccionar. Una fecha ya cobrada sale "Cobrado ✓", tildada y deshabilitada.
- Medio de pago: Efectivo / Mercado Pago / Transferencia (`CARD_METHODS`, `SegmentedControl`).
- CTA con el total adentro. Cada fecha se muestra con su día de semana y fecha.

**3. Estados.**
| Estado | Qué se ve |
|---|---|
| Cargando | Skeleton de las filas de fechas |
| Sin nada | "No hay fechas para cobrar." |
| Cobrando | `aria-busy`, controles deshabilitados, el diálogo no se cierra |
| Éxito | Toast, el diálogo se cierra, la lista se refresca |
| Error atómico | Mensaje en el diálogo, no se registró ninguna fecha |
| Respuesta perdida | Aviso + "Reintentar cobro de $X" con la misma key |
| Fecha ya cobrada por otro | Se saltea, se avisa cuál, la lista se refresca |

## Textos (skill `turnogol-copy`: sin guiones largos ni dos puntos de separador)

| Dónde | Texto |
|---|---|
| Chip | "Debe $60.000 · 2 fechas" / "Debe $30.000 · 1 fecha" |
| Botón en la fila | "Cobrar" |
| Título | "Cobrar a {contacto}" |
| Subtítulo | "{Martes} 21:00 · {cancha} · $30.000 por turno" |
| Grupo 1 | "Jugadas sin cobrar" |
| Grupo 2 | "Próximas fechas" |
| Ayuda del grupo 2 | "Si cobrás una fecha que todavía no se jugó, queda pagada por adelantado." |
| Fila | "Mar 4 nov" y "Falta $30.000" / "Cobrado ✓" |
| Selección masiva | "Elegir todas" / "Quitar todas" |
| CTA | "Cobrar 3 fechas · $90.000" / "Cobrar 1 fecha · $30.000" |
| CTA cobrando | "Cobrando…" |
| CTA sin selección | "Elegí al menos una fecha" |
| Éxito | "Cobraste 3 fechas. $90.000 en transferencia." |
| Vacío | "No hay fechas para cobrar." |
| Error | "No se pudo cobrar. No se registró ninguna fecha. Probá de nuevo." |
| Fecha ya cobrada | "El martes 11 de noviembre ya estaba cobrado. Actualizamos la lista." |
| Corte de red | "Se cortó la conexión y no sabemos si ese cobro entró. Reintentalo antes de cobrar otra cosa: si ya había entrado, no se cobra dos veces." |
| Botón de reintento | "Reintentar cobro de $90.000" |
| Aviso en jugada reciente (pregunta 3) | "Se acredita sola en efectivo en {N} h" |

El texto de corte de red es el de `ChargeCard.tsx:258`, textual: mismo problema, misma frase.

## Qué se reusa y qué no

- **Se reusa:** `CARD_METHODS`, `SegmentedControl` + `choiceChipClass`, `METHOD_LABELS`, `formatArs`; el patrón de `CobrarVariosDialog` de no cerrar con un cobro en curso (`busy` + `onOpenChange`); el patrón `UnconfirmedCharge` de `useSlotCharges` (la key sobrevive a un corte y lo único que se puede mandar es ESE cobro); `summarizeBookingCharges` y `sumBookingChargesByBooking` (batch, sin N+1).
- **No se reusa:** `useSlotCharges`, `ChargeCard`, `HoyChargeSection`, porque asumen un booking por instancia y tres modos de acción por estado. Un hook nuevo y chico (`useFijoCharge`) con la key y el reintento alcanza; no se toca el hook existente.
- **`SlotPanelActions`** vive en `@/components` y no se extiende: la acción nueva llega por prop a `AbonadosList`, como `reactivateAction`.

## Servicio y acción nuevos (única pieza de backend)

**Lectura `listAbonadoDues(tenantId, abonadoIds, tx)`** en `src/modules/abonados/abonado.dues.ts`. Una query para los 25 fijos de la página: bookings con `abonado_id = ANY`, `status IN ('completed','confirmed')`, ventana de jugadas (últimas ~8 semanas) y futuras (las generadas, ≤12). Saldo con `sumBookingChargesByBooking` + `summarizeBookingCharges`. Devuelve por fijo `{ owed: Due[], upcoming: Due[] }` con `{ bookingId, date, timeStart, priceSnapshot, pending, endsAt }`. Se llama desde `page.tsx` dentro del `withTenantContext` existente y baja como prop. Una fecha `no_show` o `canceled_*` no entra.

**Acción `chargeAbonadoDatesAction`** en `abonados/actions.ts`:
```
{ abonadoId: uuid, bookingIds: uuid[] (1..12), method: 'cash'|'transfer'|'mercadopago', clientIdempotencyKey: uuid }
```
Guard `requireOperatorStaff`, **un solo** `adminRateLimited`. Delega en `chargeAbonadoDates` (service del módulo), una transacción:
1. Carga los bookings pedidos con `FOR UPDATE` ordenados por `id` (sin deadlock entre dos cobros concurrentes).
2. Valida que cada uno sea del `abonadoId` y del tenant, y esté `confirmed | completed`.
3. Por fecha: `resolveIdempotentCharges` con la key `${clientKey}-${bookingId}`, relee el cobrado bajo lock, calcula el pendiente y hace `createCashFlow` por ese monto (`income`, `category 'booking'`, `description 'Cobro de turno'`, `bookingId`).
4. Todo o nada: el error de dominio **escapa** del `withTenantContext` (rollback real), no se devuelve `{success:false}` desde adentro del callback. Es el bug de commit parcial ya documentado en `completeAndChargeBookingAction`.

**Idempotencia por fecha.**
- Una key de cliente por apertura del diálogo; la key de cada fecha deriva de ella más el `bookingId`.
- Reintento idéntico (mismas fechas y monto): `resolveIdempotentCharges` lo reconoce, no duplica ni revalida contra un saldo que ya bajó.
- Misma key con otra selección o monto: conflicto, y el mensaje nombra la fecha y el monto realmente registrado.
- Una fecha que otro ya saldó (saldo 0 sin key propia): se saltea y se informa; no falla el lote.
- La key rota tras un éxito o una respuesta del servidor; sobrevive solo a un corte de red (igual que `useSlotCharges`).

**Una sola ruta para `completed` y `confirmed`.** La acción solo agrega el `cash_flow`: no completa el turno, nunca. Para un `confirmed` ya terminado el worker de auto-complete lo completa después, con saldo 0 y sin acreditación automática. Esto evita replicar los tres modos de `chargeMode`.

**Sin migración. Sin flag.** Una tabla nueva o un campo de período contradirían la decisión del dueño.

## Relación con `auto-credit-unpaid`

| Caso | Qué pasa |
|---|---|
| Fecha futura cobrada por adelantado | Saldo 0 al jugarse y completarse: no es candidata, no hay doble cobro |
| Fecha jugada, cobrada desde la lista dentro de las 24 h | Saldo 0: no es candidata |
| Fecha jugada, nadie cobra en 24 h | Se acredita en efectivo, como hoy. Si el cliente pagó por transferencia después, el cobro en efectivo ya está y no se puede editar |
| Cobro de adelanto en caja | Entra en la noche en que se registra (cuando entró la plata), no en la del partido |
| Fecha adelantada cancelada o `no_show` | La plata ya está en caja. Sin reembolso por API: lo devuelve el complejo y queda en `/caja/cuentas` |

Alternativa descartada por ahora: excluir a los fijos del auto-crédito. Cambia la decisión del 2026-09-26 y necesita decision doc del dueño (pregunta 1).

## Archivos de la implementación futura

`src/app/(admin)/abonados/{page.tsx, actions.ts, AbonadosList.tsx}`, nuevo `CobrarFijoDialog.tsx` (+ story con los estados), `src/modules/abonados/abonado.dues.ts`, service y schema de la acción, tests: unit de selección/totales, integración de idempotencia, concurrencia (dos cobros del mismo fijo) y no-doble-cobro con `auto-credit`. DoD del repo: `format:check`, `lint`, `typecheck`, `knip`.

## Decisiones del dueño (2026-11-08)

1. **Adelanto: sí.** Se pueden cobrar fechas futuras por adelantado. Los fijos siguen dentro del auto-crédito (no se toca la decisión del 2026-09-26).
2. **Tope:** las fechas ya generadas, máximo 12 por cobro.
3. **Aviso "Se acredita sola en efectivo en N h":** sí, en las jugadas sin cobrar.
4. **Parciales:** no en v1. Siempre lo que falta; el parcial queda en el modal del turno.
5. **Medio de pago:** uno por cobro; pago mixto desde el modal del turno. **Permiso:** dueño y encargado (`requireOperatorStaff`).
6. **Cancelar con plata cobrada:** sí se avisa que la devolución la hace el complejo. Reusar `keptDates` de #575 en el aviso al cancelar un fijo; falta el aviso al cancelar una sola fecha cobrada.

## Pendiente, sin decidir

- Una acreditación automática en efectivo no se puede corregir si el cliente después pagó por transferencia (no hay edición de cobros). Fuera de alcance de este spec.
