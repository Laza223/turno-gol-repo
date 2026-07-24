# 2026-07-23 — Wipe de retención sin `session_replication_role` (migr. 058)

## Problema

`wipeTenant` (`src/shared/jobs/workers/data-retention-cleanup.worker.ts`) abría su transacción con `SET LOCAL session_replication_role = 'replica'`. Ese GUC es SUSET: bajo el rol real de producción (`turnogol_worker`, pool `WORKER_DATABASE_URL`) falla con `permission denied to set parameter "session_replication_role"` en el PRIMER statement de la tx → **todo el wipe legal Ley 25.326 §16 roto en prod**. `GRANT SET ON PARAMETER` es inaplicable en Supabase (el rol `postgres` no es superusuario real; probado local: `permission denied for parameter`). Local y CI no lo reproducen porque `getWorkerSql()` cae a `DATABASE_URL` superusuario (clase "local enmascara", PR #30).

Evidencia prod (2026-07-23, proyecto `dpzicetvrgqlwfrqlaek`): **cero tenants con `scheduled_deletion_at` vencido** — el bug es latente, todavía no salteó ningún borrado real. Los GRANT DELETE de la migr. 057 (audit_logs/daily_cash_closes) ya están aplicados en prod.

## Qué usaba de verdad el replica role

Censo empírico contra la DB real (spike 2026-07-23, `pg_trigger` + `pg_constraint`):

1. **FK circular** `bookings.payment_id ↔ payments.booking_id`: la ÚNICA arista del grafo de FKs que el orden actual de DELETEs viola (payments se borra antes que bookings). Las otras 10 aristas ya están en orden topológico correcto.
2. **Triggers**: NINGÚN trigger de usuario bloquea DELETE en las 20 tablas del wipe. `enforce_booking_invariants` (inmutabilidad de bookings terminales) es BEFORE **UPDATE**; el append-only de `daily_cash_closes` es por REVOKE (resuelto en 057), no por trigger. El único trigger con ON DELETE es `courts_recalc_from_price` (AFTER DELETE, SECURITY DEFINER, recalcula facets de tenants) — benigno, y que ahora dispare es MÁS correcto (deja `from_price_cents`/`court_surfaces`/`court_formats` vacíos en el tenant anonimizado).

La justificación original del replica role ("triggers de inmutabilidad") era incorrecta para DELETE.

## Alternativas descartadas

1. **`GRANT SET ON PARAMETER session_replication_role`** — inaplicable en Supabase (probado: falla incluso como `postgres`). No hay migración posible.
2. **Función SQL `SECURITY DEFINER` owned by postgres que haga el wipe completo** — descartada: mueve ~20 DELETEs + guard de elegibilidad + captura de `mp_subscription_id` bajo lock a SQL (lógica partida en dos lenguajes, drift con el worker TS), depende de que supautils permita el GUC dentro de SECURITY DEFINER (comportamiento Supabase-specific, frágil ante upgrades), y conserva el knob más peligroso: replica role apaga TODA la enforcement de FKs, así que una tabla nueva olvidada en el wipe deja huérfanos EN SILENCIO en vez de fallar.
3. **`UPDATE bookings SET payment_id = NULL` previo para romper el ciclo** — descartada: `enforce_booking_invariants` bloquea cualquier UPDATE sobre bookings terminales; habría que agregarle otra excepción al trigger (más superficie en un invariante de negocio) para un problema que la deferral resuelve sin tocar triggers.

## Decisión

**Eliminar la necesidad del replica role** (opción 2 del planteo original, reducida por evidencia a un cambio quirúrgico):

- **Migr. 058**: `ALTER TABLE bookings ALTER CONSTRAINT fk_bookings_payment DEFERRABLE INITIALLY IMMEDIATE` — semántica idéntica en operación normal (sigue chequeando por statement); solo una tx que lo pida explícitamente puede diferirlo. Incluye además los GRANT DELETE de 057 re-afirmados idempotentes (057 vive sin commitear en la rama `claude/practical-kilby-322fa9` pero YA está aplicada en prod y local; sin re-afirmarlos, el CI de esta rama no los tendría y el test de rol real fallaría).
- **Worker**: la tx de `wipeTenant` reemplaza `SET LOCAL session_replication_role = 'replica'` por `SET CONSTRAINTS fk_bookings_payment DEFERRED` (per-tx, sin privilegios — verificado bajo `turnogol_worker`).
- **Test de rol real**: `tests/integration/data-retention-worker-role.test.ts` corre el wipe con un pool que LOGUEA como `turnogol_worker` (ALTER ROLE ... LOGIN temporal en el test), y asserta `current_user = 'turnogol_worker'` y `rolsuper = false` — si el pool vuelve a caer al superusuario, el test FALLA en vez de enmascarar. Cierra la clase "local enmascara" para este worker.

## Reversibilidad

Barata: `ALTER CONSTRAINT ... NOT DEFERRABLE` + revertir el worker. Sin migración de datos, sin contrato publicado.

## Consecuencias aceptadas

- La FK enforcement queda ACTIVA durante el wipe: una tabla futura que referencie filas wipeadas y no esté en la lista hace FALLAR la tx (loud, job rojo, retry) en vez de dejar huérfanos silenciosos. Es el comportamiento deseado — complementa la trampa CASCADE documentada en `data-retention-wipe-cascade-trap`.
- `courts_recalc_from_price` dispara por cada cancha borrada (≤ ~10 por tenant, costo trivial) y limpia los facets del tenant.
- `fk_bookings_payment` queda DEFERRABLE a nivel schema; cualquier tx podría diferirlo. Riesgo aceptado: diferir un chequeo solo pospone el error al COMMIT, no lo elimina.
- Dependencia de coordinación: la rama `claude/practical-kilby-322fa9` (057 + purgas por edad) toca el mismo worker y `docs/audit/PROGRESS.md` sin commitear — conflicto de merge esperado, resolución trivial (cambios ortogonales dentro del archivo).
