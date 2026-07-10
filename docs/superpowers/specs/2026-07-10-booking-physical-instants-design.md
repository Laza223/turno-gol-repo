# Booking Physical Instants — Design Spec

**Fecha:** 2026-07-10
**Estado:** Validado (pre-implementación)
**Contexto:** Pre-deploy, cero tenants reales. Ventana de bajo riesgo para migrar la tabla más crítica.

## Problema

El modelo actual de "Día Operativo" guarda `bookings.date` (día operativo) + `time_start`/`time_end` (wall-clock) + `tenants.closes_next_day` (flag global). El instante físico de un slot **no se almacena**: se reconstruye ad-hoc en cada call site vía `date + time + (PHYSICALLY_NEXT_DAY ? INTERVAL '1 day' : 0)`, donde `PHYSICALLY_NEXT_DAY` requiere JOIN a `tenants` + lookup de `opening_hours` JSONB + `EXTRACT(DOW)` + comparar `time_start` contra la apertura de ese día.

~23 archivos tocan `date + time_*`. Cualquier query nueva de tiempo que olvide la corrección queda **silenciosamente incorrecta solo para slots post-medianoche de tenants `closes_next_day`** — edge raro, casi intesteable. Es el generador recurrente de bugs (caza-bugs 2026-07-10 #4/#5, parcheados con `PHYSICAL_START_SQL`/`PHYSICAL_END_SQL`/`PHYSICALLY_NEXT_DAY_SQL`).

El bug real no es "guardamos wall-clock": es que **la corrección se reconstruye en N call sites** en vez de existir como una fuente única.

## Decisión

Almacenar el **instante físico absoluto** en `bookings.starts_at` / `bookings.ends_at` (`TIMESTAMP WITH TIME ZONE`), como fuente única para toda la lógica fuerte (overlap, workers, cancelaciones, validaciones de vigencia). `bookings.date` + `time_start` + `time_end` quedan **exclusivamente** para día operativo (agrupación caja/cierre/reportes) y display de grilla.

El instante se computa **app-side** por un helper puro y testeado, stampeado en cada insert site. Justificación de app-side vs trigger DB:

- Ya existen `artDateAt(date, hhmm)` (instante ART, UTC-3 fijo) y `slotIsPhysicallyNextDay()` en TS; el create path ya los invoca.
- Un trigger plpgsql reimplementaría conversión tz + `'24:00'` + next-day + lookup `opening_hours` JSONB — exactamente la SQL frágil que queremos eliminar, ahora imposible de unit-testear en vitest.
- `starts_at`/`ends_at` `NOT NULL` hace que un insert que olvide setearlos **falle fuerte**, no en silencio.

## Modelo de tiempo

- **UTC-3 fijo, sin tz-database.** Coherente con `src/shared/dates/art.ts` ("Argentina does not observe DST... to avoid a runtime dependency"). `tenants.timezone` existe pero el sistema entero corre en ART; v1 mono-país usa el offset fijo. Multi-tz queda fuera de scope.
- `time_end = '24:00'` (slot 23:00→00:00): `artDateAt` lo maneja por overflow de `Date.UTC` (`h+3 = 27` → día siguiente 00:00 ART). En SQL, `date + '24:00'::time` rola a día siguiente 00:00.
- `physicallyNextDay = closes_next_day AND time_start < apertura_del_día`: desplaza `starts_at`/`ends_at` +1 día calendario para slots de madrugada archivados bajo el día operativo anterior.

## Cambios de esquema

`bookings`:
- `+ starts_at TIMESTAMPTZ NOT NULL`
- `+ ends_at   TIMESTAMPTZ NOT NULL`
- Constraint `no_overlapping_bookings`: de `EXCLUDE gist (court_id =, date =, tsrange(2000-01-01 + time_start, ... + time_end) &&)` a `EXCLUDE gist (court_id =, tstzrange(starts_at, ends_at) &&)`. **Se cae `date WITH =`**: el overlap deja de depender del día operativo bajo el que se archiva el slot. Esto elimina la razón por la que el truco "madrugada bajo la fecha operativa anterior" era necesario *para correctitud* — ese truco queda solo como convención contable.
- `+ INDEX idx_bookings_starts_at ON bookings(starts_at)`.
- `btree_gist` ya cargado (migr. 001); `tstzrange` no requiere extensión nueva.

## Migración

`src/shared/db/migrations/036_booking_physical_instants.sql`, robusta sobre DBs de dev con seed: `ADD COLUMN` nullable → `UPDATE` backfill → `SET NOT NULL` → swap del constraint → index. El backfill usa la lógica `PHYSICALLY_NEXT_DAY` en SQL **una sola vez** (no es reconstrucción de runtime). `AT TIME ZONE 'America/Argentina/Buenos_Aires'` da -3 para toda fecha real (2026+), idéntico al `artDateAt` fijo del app. Mirror `supabase/migrations/` se regenera con `db:sync-supabase`.

Pre-deploy sin datos reales → el backfill solo toca filas de seed; no hay riesgo de misagrupar plata/retención histórica.

## Helper nuevo

`src/shared/time/physical-range.ts` — `physicalRange({ date, timeStart, timeEnd, physicallyNextDay }) → { startsAt: Date; endsAt: Date }`. Puro, UTC-3 fijo, maneja `'24:00'` por overflow. `physicallyNextDay` lo provee el `slotIsPhysicallyNextDay` existente.

## Create paths (3 insert sites)

1. `booking.service.ts` — `createManualBooking` (insert ~281).
2. `booking.service.ts` — `createOnlineBookingImpl` (insert ~473).
3. `abonado.service.ts` — `insertBookingsForSlots` (insert ~123). `physicallyNextDay` es constante para todo el abonado (mismo `dayOfWeek` + `timeStart`) → se computa una vez.

Cada uno: computar `physicallyNextDay` → `physicalRange(...)` → agregar `startsAt`/`endsAt` al `.values(...)`.

`checkOverlapOrThrow` (y `checkBookingOverlap` de abonado): pre-check app-side reescrito a `tstzrange(starts_at, ends_at) && tstzrange($start, $end)`, eliminando el hack `2000-01-01`.

## Payoff read-side

Post-migración se **borran** `PHYSICALLY_NEXT_DAY_SQL`, `PHYSICAL_START_SQL`, `PHYSICAL_END_SQL` de `booking.service.ts`, y los workers `completeBooking`, `autoCompleteOverdueBookings`, `markNoShow` se reescriben a `b.starts_at`/`b.ends_at` directo contra `NOW()` — sin JOIN a `tenants`, sin `opening_hours`, sin `EXTRACT(DOW)`. Neto negativo de LOC del lado fuerte.

## Testing

- Unit `physical-range.test.ts`: same-day, madrugada next-day, `'24:00'` end, block pre-open (known-edge).
- Integration: `race-double-booking*.test.ts` verdes con el constraint nuevo. Nuevo caso: overlap físico entre slot pre-medianoche y post-medianoche del mismo court en **días operativos distintos** ahora se detecta por instante (antes el `date WITH =` los separaba).
- Test factories / seeds: setear `startsAt`/`endsAt` (NOT NULL falla fuerte si falta).

## Known edges / decisiones de review

1. **Block de mantenimiento pre-apertura** (ej. 06:00 con apertura 08:00) en tenant `closes_next_day`: `slotIsPhysicallyNextDay` lo trata como madrugada → se fila next-day. Comportamiento **pre-existente**, no introducido acá. Documentado, no bloqueante.
2. **Overlap cross-operating-date**: con instantes, dos slots físicamente solapados en distinto `date` chocan (más correcto). Confirmar que ningún flujo dependía del scoping viejo por `date`.

## Fuera de scope

- Tabla `abonados` (plantilla semanal — no tiene instante absoluto; su constraint `no_overlapping_abonados` sigue en wall-clock).
- Rename `bookings.date` → `operating_date` (churn cosmético; `date` ya significa día operativo).
- Migración a tz-database / multi-timezone.
- Reescritura read-side de los workers puede ir en el mismo PR o el siguiente (no bloquea el write-path + constraint).

## Restricciones

- No reescribir migraciones existentes (004/035); migración aditiva nueva.
- `pnpm typecheck` + `pnpm lint` verdes tras cada cambio (CLAUDE.md).
- TDD sobre los race tests.
