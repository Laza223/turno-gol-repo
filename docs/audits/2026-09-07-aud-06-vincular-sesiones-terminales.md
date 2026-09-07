# AUD-06 — Vincular un contacto a un jugador fallaba apenas el fijo tenía una sesión jugada

Tarea T-B del lote 2 de la auditoría técnica integral del 2026-09-06 (hallazgo AUD-06, §D.1).
Rama a partir de `main` = `1caa41c544ba56f12703ed4f29235524e3b81cef`.

## Causa

`linkContactToPlayer` es el único camino para que un turno fijo cargado de mostrador (nombre y
teléfono, sin cuenta) pase a tener dueño registrado. Reasignaba **todas** las reservas de esos
fijos, sin filtrar por estado, a propósito: "pasadas y futuras", para que la ficha no quedara
partida.

El trigger `enforce_booking_invariants_fn` (migración 070) prohíbe modificar una reserva en
estado terminal. Su única excepción para `player_id` exige que el nuevo valor sea `NULL`
(anonimización ARCO). Así que en cuanto el abono tenía una sesión `completed` —o sea, desde su
segunda semana— el `UPDATE` disparaba `check_violation`, la transacción entera hacía rollback y
la Server Action devolvía un error genérico. La vinculación no funcionaba en la práctica.

Sin corrupción de datos: la transacción no dejaba nada a medias. `unlinkContactFromPlayer`
(que pone `player_id` en `NULL`) nunca estuvo afectado, porque cae dentro de la excepción.

## Cambio

El `UPDATE` se restringe a `status IN ('pending_payment', 'confirmed')`.

La lista va **en positivo** y no como "todo menos los terminales": un estado nuevo que se agregue
al enum queda afuera por omisión, que es el lado seguro del error.

`shiftRelationshipCounters` ya contaba sólo las filas efectivamente movidas (`moved.length`), así
que no necesitó cambio: el contador de la relación sigue cuadrando.

**Consecuencia asumida, decidida por el dueño el 2026-09-07:** las sesiones ya jugadas quedan
como historial del contacto y no aparecen en la ficha del jugador. La persona no se pierde: sigue
en `abonados` con su nombre y teléfono. La alternativa —ampliar la excepción del trigger para
permitir también `NULL → jugador` en reservas terminales— exige una migración sobre un trigger de
integridad y quedó descartada por costo y riesgo, no por olvido.

## La prueba

Caso nuevo en `tests/integration/contact-link.test.ts`: un abono con una sesión `completed` y dos
futuras. Rojo antes del arreglo, con el error exacto del trigger:

```
Error: Failed query: update "bookings" set "player_id" = $1 where (...)
Caused by: PostgresError: Booking en estado terminal (completed) no puede modificarse
  code: '23514', where: 'PL/pgSQL function enforce_booking_invariants_fn() line 64 at RAISE'
```

Verde después: `{ abonadosLinked: 1, bookingsReassigned: 2 }`, y la sesión jugada sigue con
`player_id` en `NULL`. Los 16 casos que ya existían —incluidos los de `unlink` y el de
idempotencia— siguen pasando: `Tests 17 passed (17)`.

## Validación

Sobre esta rama, con Postgres descartable (`postgres:15-alpine`, las 84 migraciones aplicadas con
la misma receta que el job de CI):

| Comando | Resultado |
|---|---|
| `vitest run tests/integration/contact-link.test.ts` | 17 passed |
| `pnpm format:check` · `pnpm lint` · `pnpm typecheck` · `pnpm knip` | los cuatro limpios |

## Limitaciones

- No se verificó el flujo en la interfaz; el test entra por el service.
- La reasignación del historial queda fuera de alcance por decisión explícita del dueño.
- El resto del lote (AUD-09, AUD-02, AUD-14) va en PRs separados.
