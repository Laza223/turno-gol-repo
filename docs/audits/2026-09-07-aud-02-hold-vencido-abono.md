# AUD-02 — Un hold online vencido le comía la sesión al turno fijo, en silencio

Tarea T-C del lote 2 de la auditoría técnica integral del 2026-09-06 (hallazgo AUD-02, §D.1).
Rama a partir de `main` = `1caa41c544ba56f12703ed4f29235524e3b81cef`.

## Causa

Cuando un jugador arranca una reserva online y la abandona, la fila queda en `expired` a los seis
minutos. El horario vuelve a estar libre: el constraint de solapamiento (migración 041) y el alta
normal de reservas sólo cuentan `pending_payment` y `confirmed`.

Abonados usaba otro criterio, más ancho: "cualquier reserva que no esté cancelada ocupa el turno".
Está en dos lugares y los dos entraban en el camino del cliente fijo:

- `findAbonadoBookingOverlaps` (`booking.overlap.ts`) — el alta y la reactivación del abono.
- `getAbonadoSlotConflicts` (`abonado.service.ts`) — el barrido que genera las sesiones de las
  semanas siguientes (`generate-abonado-slots.worker.ts`) y la vista previa del alta.

El predicado ancho se justificaba por `completed` y `no_show`: un horario donde ya se jugó no se
vuelve a ofrecer. Pero esos dos estados sólo existen en el pasado. `expired` era el único que
podía aparecer en una fecha **futura**, y ahí el efecto era el contrario al buscado: el cliente
fijo perdía la sesión de esa semana, en silencio, y el horario se seguía ofreciendo online porque
el constraint no lo consideraba ocupado.

## Cambio

`expired` sale de los dos predicados. `completed` y `no_show` siguen bloqueando, que es la
conducta documentada como deliberada y sólo aplica al pasado.

Se eligió la variante conservadora (`NOT IN (canceled_*, expired)`) y no alinear al predicado del
constraint (`IN ('pending_payment','confirmed')`): para fechas futuras el resultado es idéntico y
así se conserva el criterio de no reofrecer un horario ya jugado.

## La prueba

`tests/integration/abonado-expired-hold.test.ts`, cuatro casos que cubren **los dos** caminos.

Alta del abono, rojo antes del arreglo:

```
× el abono genera la sesión del martes aunque haya un hold expired esa fecha
  → expected [ '2030-01-08' ] to deeply equal []
```

Barrido de generación de las semanas siguientes, rojo antes del arreglo (fechas relativas a hoy:
el barrido arranca en su propio "hoy", así que una fecha fija dejaría de ejercitarlo):

```
× genera la sesión aunque haya un hold expired en esa fecha
  → expected [ '2026-09-17', '2026-09-24', … ] to include '2026-09-10'
```

Cada camino tiene su control positivo: una reserva `confirmed` le sigue ganando al fijo, en el
alta y en el barrido. Sin ellos, un predicado que ignorara todo también pasaría.

Verde con el arreglo: `Test Files 1 passed (1) · Tests 4 passed (4)`.

## Validación

Sobre esta rama, con Postgres descartable (`postgres:15-alpine`, las 84 migraciones aplicadas con
la misma receta que el job de CI):

| Comando | Resultado |
|---|---|
| `vitest run tests/integration/abonado-expired-hold.test.ts` | 4 passed |
| `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` | los cuatro limpios |

## Limitaciones

- No se midió cuántas filas `expired` futuras hay hoy en producción; la consulta de solo lectura
  quedó anotada en el informe de la auditoría y no se ejecutó.
- El resto del lote (AUD-09, AUD-06, AUD-14) va en PRs separados.
