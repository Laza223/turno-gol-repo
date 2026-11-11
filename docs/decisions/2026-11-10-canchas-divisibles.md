# Canchas divisibles: una cancha grande que se reserva entera o partida

**Fecha:** 2026-11-10. **Estado:** PAUSADA por el dueño el mismo día ("no es prioridad, dejémosla para otro momento"). No se implementó nada. Queda escrita para retomarla: diseño revisado (ACOMPAÑO CON CONDICIONES, ver al final) y una pregunta de negocio abierta. **Origen:** decisión del founder del 2026-11-08 de sumar las canchas divisibles a la grilla ([`2026-11-08-referencia-deporturnos.md`](../planning/2026-11-08-referencia-deporturnos.md), decisión 5).

## Problema

Un complejo tiene una cancha de 11 que también se alquila como dos canchas de 7. Hoy cada cancha es una fila de `courts` y el único freno contra pisar un horario es la constraint `no_overlapping_bookings` (migr. 041): `EXCLUDE (court_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`. Si el complejo carga las tres como canchas sueltas, nada impide reservar la de 11 y una de 7 a la misma hora: las dos filas tienen `court_id` distinto. El sistema tiene que saber que la de 11 ocupa el mismo pasto que las dos de 7, y que la garantía viva en la base, igual que hoy.

## Modelo

- `courts.parent_court_id` (nullable, misma tabla). Una cancha "hija" (la de 7) apunta a su cancha "entera" (la de 11). Un solo nivel: la entera no tiene padre y la hija no tiene hijas.
- Cada cancha sigue siendo una cancha completa: su nombre, su formato, su tarifa (`pricing`) y su estado. La entera y las partes se reservan, se cobran, se ven en la grilla y en el portal como cualquier cancha. No cambia nada de `bookings`.
- **Qué pasto ocupa una reserva:** una reserva sobre una cancha con hijas ocupa **todas sus hijas**; sobre cualquier otra cancha, ocupa **esa cancha**. Las hojas del árbol son las porciones de pasto.

## Decisión

Una tabla nueva, `booking_court_claims (tenant_id, booking_id, court_id, starts_at, ends_at)`, con su propia constraint:

```sql
EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
```

`court_id` acá es siempre una **hoja**. La mantiene un trigger sobre `bookings` (`AFTER INSERT OR UPDATE OF court_id, starts_at, ends_at, status OR DELETE`): borra los reclamos del turno y, si el turno está activo (`pending_payment` o `confirmed`, el mismo predicado de la 041), inserta un reclamo por cada hoja que ocupa. Corre en la misma transacción que la escritura del turno, así que un choque aborta la reserva con `exclusion_violation` (23P01), que la app ya traduce a `SlotTakenError` (`isExclusionViolation` mira el código, no el nombre de la constraint).

Ejemplo: la de 11 (E) tiene dos hijas (A y B).
- Reserva en A → reclama {A}. Reserva en B → reclama {B}. No chocan.
- Reserva en E → reclama {A, B}. Choca con cualquier reserva en A o en B.
- Cancha suelta C → reclama {C}. Es exactamente la garantía de hoy.

`no_overlapping_bookings` (041) se queda: no se toca una migración existente y sigue cubriendo el caso de siempre. La tabla nueva es una segunda red, más fina.

**Cambiar la composición** (hacer o deshacer una cancha divisible) recalcula en la misma transacción los reclamos de los turnos activos de esas canchas. Si ya hay turnos que se pisarían, la constraint falla y el cambio se rechaza con un mensaje claro: no se puede armar una cancha divisible encima de reservas que chocan.

**Lo que se toca en la app** (la constraint es la red; esto es para mostrar bien y fallar temprano):
- Los chequeos previos de choque (`checkOverlapOrThrow`, `assertSlotFreeForOther` de reprogramar, `findActiveBookingOverlaps` de torneos y bloqueos, `checkAbonadoSlotConflict`) miran las canchas "hermanas por pasto" además de la propia.
- La disponibilidad (portal, buscador, alta y reprogramación del staff) da por ocupada una cancha si cualquier cancha que comparte pasto tiene un turno a esa hora.
- La grilla pinta como no disponible la celda de una cancha cuyo pasto está ocupado por otra, con el nombre de la que la ocupa.
- Configuración de canchas: elegir "Es parte de: …" en la cancha chica.

## Alternativas descartadas

1. **Filas sombra en `bookings`** (reservar la de 11 crea además un `block` en cada de 7). Reusa la 041 sin tabla nueva, pero mete filas falsas en la tabla que leen la caja, los reportes, Hoy, los mails, Realtime y las métricas; cancelar, mover o cobrar un turno tendría que arrastrar sus sombras en cada camino. El radio de impacto es todo el dominio de reservas.
2. **Tabla puente `booking_courts` que reemplaza a `bookings.court_id`** (una reserva con N canchas). Es el modelo "correcto" en abstracto, pero cambia el contrato de la tabla central: ~15 módulos, el payload de Realtime, la API y los tests asumen una cancha por reserva. Caro y sin beneficio extra para el caso real (la entera es una cancha más).
3. **Solo chequeo en la aplicación** (sin constraint nueva). Dos reservas concurrentes —una online en la de 11 y una del mostrador en la de 7— pasan las dos el chequeo previo y se pisan. La regla del repo es que la base garantice el choque, como hoy.
4. **Tabla de "sectores" aparte** (cada cancha mapea a N sectores). Más general (sirve para tres niveles o particiones raras), pero para el caso pedido —una entera partida en dos o tres— el árbol de un nivel en `courts` alcanza y no suma una tabla de configuración.

## Reversibilidad

**Cara de revertir.** Suma una tabla con datos (los reclamos), una columna en `courts` y un trigger en el camino de escritura de todas las reservas. Revertir es aditivo (dropear trigger, tabla y columna), pero el trigger corre en cada reserva desde el día uno: un error ahí rompe la reserva online de todos los complejos, no solo de los que usan divisibles. Por eso: test de concurrencia (entera contra parte en paralelo) y test de aislamiento antes de mergear, y revisión de arquitectura con contexto fresco.

## Consecuencias aceptadas

- Cada escritura de un turno hace además un `DELETE` + `INSERT` chico en `booking_court_claims` (1 fila para una cancha suelta, N para una entera).
- La migración rellena los reclamos de los turnos activos existentes (uno por turno, ya garantizados sin choque por la 041).
- Un solo nivel de división. Una cancha partida en tres (11 → tres de 5) entra; una partida en dos que a su vez se parte otra vez, no.
- La entera y las partes son canchas de verdad: se cuentan, se listan y se cobran como canchas.

## REQUIERE INPUT

1. **Cobro del SaaS.** Hoy el plan cuesta $30.000 por cancha en línea (`src/modules/billing/pricing.ts`). Una cancha de 11 que se parte en dos de 7 son tres filas en `courts`. ¿Se cobran como 3 canchas, como 2 (las partes, que es el pasto que se alquila a la vez) o como 1 (el pasto físico)?

## Revisión de arquitectura (2026-11-10): ACOMPAÑO CON CONDICIONES

El diseño central (reclamos por hoja con su EXCLUDE) se sostiene y las alternativas descartadas siguen descartadas. Antes de implementar tiene que quedar cierto todo esto:

1. **Solo canchas agrupadas.** El trigger escribe reclamos solo si la cancha tiene padre o hijas. Para una cancha suelta no hace nada (la 041 ya la cubre): costo cero y riesgo acotado para quien no usa la feature, y sin backfill masivo.
2. **Seguridad del trigger.** Función `SECURITY DEFINER` con `SET search_path = 'public'` (ojo: `CREATE OR REPLACE` resetea `proconfig`, ver la 089) y `REVOKE EXECUTE` de `PUBLIC`, `anon` y `authenticated` (precedente: 080). Tabla de reclamos con RLS + FORCE y sin permisos para `turnogol_app` (como `push_send_log`). Sin esto, una reserva del jugador sin tenant seteado (`withPlayerContext`) borraría 0 reclamos en silencio y dejaría un horario bloqueado para siempre.
3. **Borrado por FK.** `booking_id REFERENCES bookings(id) ON DELETE CASCADE` y sin `DELETE` en la lista del trigger. Igual se suma el borrado explícito en el wipe de `data-retention-cleanup` y los casos de `isolation.test.ts` / `isolation-app-role.test.ts` (checklist de `convenciones-stack`).
4. **Sin deadlocks.** Reclamos insertados en orden (`ORDER BY court_id`) y lock del grupo (entera y después hijas, por id) en `lockCourtOrThrow`, `lockCourtRow` de abonados, torneos (`tournament-slots.service.ts`, inserta en lote sin lock) y el worker de abonados. Un 40P01 se traduce a `SlotTakenError` o se reintenta.
5. **Integridad del árbol en la base:** un solo nivel, misma tenant, sin ciclos (FK compuesta `(tenant_id, parent_court_id)` o trigger en `courts` con lock ordenado).
6. **Recálculo en un trigger sobre `courts`** (`AFTER INSERT/UPDATE OF parent_court_id`), no en el service, con el 23P01 traducido a "hay reservas que se pisarían".
7. **Errores con `cause`:** `isExclusionViolation` mira solo el `code` de primer nivel y no ve el 23P01 cuando viene envuelto por el query builder de Drizzle (abonados y torneos insertan así). Unificar con `@/shared/db/pg-errors`.
8. **`WHEN` en el trigger** para no rehacer reclamos en UPDATEs que no tocan cancha, horario ni estado (confirmaciones de pago).
9. **Tests de concurrencia en paralelo:** entera contra parte, entera contra entera, y un lote de torneo contra una entera. Más la suite de integración sin cambios con ninguna cancha agrupada (comportamiento idéntico al actual).
10. **Chequeos previos y disponibilidad** (`checkOverlapOrThrow`, `assertSlotFreeForOther`, `findActiveBookingOverlaps`, `checkAbonadoSlotConflict`, `availability-search`, `getAvailableSlots`, `public.service`) mirando las canchas que comparten pasto. Es UX y falla temprana; la garantía es el EXCLUDE.
