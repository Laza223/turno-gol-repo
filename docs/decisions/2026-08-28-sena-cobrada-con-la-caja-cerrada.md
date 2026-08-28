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
tira `AdjustmentRequiredForClosedDayError`. El único caller es
`recordManualBookingDepositCashFlow`; no lo expone ninguna Server Action, porque abrirlo a
la UI genérica convertiría el cierre en una sugerencia.

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

## Lo que quedó afuera a propósito

**El encargado sigue sin ver un aviso en el momento.** La opción elegida lo incluía, pero
surfacear la señal exige ensanchar el retorno de `createManualBooking`, del que dependen 17
archivos de test (contarlos: `grep -rln "createManualBooking" tests/ | wc -l`) más
`bookingResponseSchema`, que es un `z.strictObject`. Con la plata ya registrada el aviso
pasó de ser el arreglo a ser una comodidad, y no justifica ese churn. Queda pendiente.

## Cómo verificarlo

Cerrar la caja del día, cargar una reserva desde `/grilla` cobrando efectivo, y contrastar:

```sql
SELECT b.guest_name, b.deposit_status,
       (SELECT count(*) FROM cash_flows cf WHERE cf.booking_id = b.id) AS filas_en_caja
FROM bookings b WHERE b.guest_name = '<el que hayas usado>';
```

Tiene que dar `paid` con **1** fila, y esa fila `adjustment` / `other`. El test que lo fija
es `tests/integration/manual-booking-deposit-cashflow.test.ts`, caso *"caja ya cerrada"*.
