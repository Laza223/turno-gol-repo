# La seña cobrada con la caja ya cerrada entra como ajuste

**Fecha:** 2026-08-28
**Estado:** aplicada
**Origen:** hallazgo F-02 del QA exhaustivo (`.gstack/qa-reports/qa-report-localhost-2026-08-28.md`)
**Decide:** Lazar

## El problema

El encargado cierra la caja a las 23:00. A las 23:30 llega un grupo, paga la seña en
efectivo y el encargado carga el turno desde la grilla.

`createCashFlow` llama a `assertDayOpen`, que tira `DayAlreadyClosedError` porque ese día
operativo ya tiene fila en `daily_cash_closes`. El `catch` de
`recordManualBookingDepositCashFlow` atrapaba ese error, mandaba un `captureMessage` a
Sentry y encolaba `admin_deposit_after_close` para el dueño.

Resultado: la reserva quedaba `deposit_status='paid'` + `payment_method='cash'` y **no
existía ninguna fila en `cash_flows`**. Medido con un control de una sola variable (misma
acción, único cambio el estado de la caja):

| Turno | Caja al cobrar | `deposit_status` | Filas en `cash_flows` |
|---|---|---|---|
| 20:00 | cerrada | `paid` | **0** |
| 21:00 | abierta | `paid` | 1 |

La plata estaba físicamente en el cajón y el sistema decía que la reserva estaba pagada,
pero en Caja no figuraba en ningún lado. Nadie iba a ir a buscarla, justamente porque la
reserva ya figuraba paga. El mail al dueño existía y funcionaba (verificado: las filas
`admin_deposit_after_close` se encolan de verdad), pero no le daba ningún lugar donde
cargar esa plata.

## Lo que se decidió

**La seña entra igual, como `type='adjustment'` del mismo día operativo.**

`CreateCashFlowInput` acepta `allowClosedDay?: boolean`. Con esa bandera `createCashFlow`
no rechaza el día cerrado, pero **exige `type: 'adjustment'`** — con cualquier otro tipo
tira `AdjustmentRequiredForClosedDayError`. No lo expone ninguna Server Action, porque
abrirlo a la UI genérica convertiría el cierre en una sugerencia.

**Los tres emisores de la seña lo usan, no uno solo.** El primer intento arregló sólo
`recordManualBookingDepositCashFlow` (alta manual con la seña ya cobrada) y dio el
agujero por cerrado. Un barrido de la clase encontró las otras dos puertas al MISMO
estado, las dos en `payment.service.ts` y las dos con el mismo `catch` que se tragaba la
plata:

| Emisor | Cuándo corre |
|---|---|
| `recordManualBookingDepositCashFlow` (booking.service.ts) | el staff carga el turno con la seña ya cobrada |
| `recordManualDepositCashFlow` (payment.service.ts) | el staff confirma a mano una seña que estaba pendiente |
| `recordDepositCashFlow` (payment.service.ts) | el webhook de MP aprueba la seña |

En el caso de MP la plata no está en el cajón sino en la cuenta del complejo: no mueve
el conteo de efectivo del cierre, pero es ingreso del día igual y tiene que verse en
Caja. Cada uno tiene su test con control negativo (sin el fix, `cash_flows` queda vacío).

Es lo que el propio diálogo de cierre ya prometía y no cumplía: *"El cierre es inmutable:
una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones
posteriores van como ajustes."*

Detalles que no son arbitrarios:

- **`category: 'other'`, no `'booking'`.** El CHECK `chk_cashflow_type_category` solo admite
  `other` y `no_show_correction` con `type='adjustment'`. Usar `booking` habría exigido una
  migración para ensanchar el constraint; no vale una migración por esto.
- **La descripción es el MISMO literal** que el camino feliz (`depositCashFlowDescription`).
  `getBookingCharges` y `sumBookingChargesByBooking` excluyen esa fila por match de string
  exacto; cualquier otro texto contaría la seña dos veces en el "cobrado" del turno.
- **El snapshot del cierre no se toca.** `expected_cash` y `diff_amount` siguen siendo la
  foto de lo que se contó esa noche; el ajuste se ve aparte. Un test de integración lo fija.
- **El advisory lock se toma igual.** `assertDayOpen` recibe un parámetro `allowClosed` en
  vez de que el caller se saltee la llamada entera: el `pg_advisory_xact_lock` serializa
  contra un `closeDailyRegister` concurrente, y saltearlo dejaba el ajuste corriendo en
  paralelo a un cierre. Este error se cometió en el primer intento del fix.

## Alternativas descartadas

- **Rechazar el cobro** y crear la reserva sin marcarla paga. Deja el cierre intocable, pero
  el encargado se queda con la plata en la mano mientras el sistema dice que nadie pagó, y
  el pendiente depende de que alguien se acuerde de cargarlo.
- **Imputar el ajuste al día siguiente.** Coherente con cómo funciona el cajón físico (la
  plata se cuenta recién al otro día), pero deja la noche del cierre subestimada para
  siempre. Se prefirió que la historia de esa noche quede en un solo lugar.
- **Solo avisarle al encargado**, sin tocar la plata. Es el cambio más chico y no toca
  ninguna regla contable, pero no cierra el agujero: la conciliación del día sigue quedando
  corta.
- **Dejarlo como estaba**, tratando el mail al dueño como red de seguridad suficiente.

## El aviso al encargado (cerrado en el segundo pase)

La opción elegida incluía avisarle al encargado en el momento, y el primer pase lo dejó
afuera: surfacear la señal parecía exigir ensanchar el retorno de `createManualBooking`,
del que dependen 17 archivos de test más `bookingResponseSchema` (un `z.strictObject`).

Se resolvió sin tocar nada de eso: `createBookingAction` **lee la fila recién escrita**
dentro de la misma transacción (`depositEnteredAsAdjustment`) y devuelve
`depositAfterClose`. Leer en vez de predecir tiene una ventaja propia: entre un chequeo
previo y la escritura puede cerrar la caja otro encargado, y ahí el aviso saldría al
revés.

El toast de "Reserva creada" agrega entonces *"La caja de hoy ya estaba cerrada: la seña
quedó cargada como ajuste"* — en las dos puertas de alta manual (el popover rápido de la
grilla y el modal completo). Sigue siendo `variant: 'success'`: no falló nada, la reserva
se creó y la plata quedó registrada; lo que cambia es dónde hay que ir a buscarla.

`BookingActionResult` no se tocó — lo comparten seis acciones a las que la bandera no les
dice nada. El alta manual tiene el suyo, `CreateBookingActionResult`.

## Cómo verificarlo

Cerrar la caja del día, cargar una reserva desde `/grilla` cobrando efectivo, y contrastar:

```sql
SELECT b.guest_name, b.deposit_status,
       (SELECT count(*) FROM cash_flows cf WHERE cf.booking_id = b.id) AS filas_en_caja
FROM bookings b WHERE b.guest_name = '<el que hayas usado>';
```

Tiene que dar `paid` con **1** fila, y esa fila `adjustment` / `other`. El test que lo fija
es `tests/integration/manual-booking-deposit-cashflow.test.ts`, caso *"caja ya cerrada"*.
