-- ============================================================
-- 104_pgboss_v12_schema.sql
-- Schema propio para pg-boss 12: `pgboss_v12`.
--
-- Racional: pg-boss 12 NO migra un schema de la 9 (`start()` tira "Cannot migrate
-- pg-boss schema from version 20: the oldest supported starting version is 25"),
-- así que la 12 se instala en un schema NUEVO y `legacy-v9-drain.ts` mueve los jobs
-- pendientes que queden en `pgboss`. Ese schema no se toca acá: se borra en el PR
-- de limpieza, cuando el puente ya no tenga nada que mover.
--
-- Por qué se precrea y no lo crea pg-boss (`createSchema: false` en boss.ts):
-- `turnogol_app` no puede crear schemas (`permission denied for database`; 038 le
-- dio CREATE-on-database al worker, que no es el rol que usa pg-boss — ver 039).
-- Con el schema ya creado, pg-boss instala sus tablas como `turnogol_app`, que
-- queda DUEÑO de todo: tiene que serlo, porque los minors de la 12 migran su
-- propio schema en `start()`. Mismo criterio que 039: CREATE a nivel de ESE
-- schema, no de la base.
--
-- Idempotente: CREATE SCHEMA IF NOT EXISTS; el GRANT se puede re-ejecutar.
-- No da grants a otros roles: `turnogol_worker` no lee estas tablas (las lecturas
-- de estado salen por el pool de la app).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS pgboss_v12;

GRANT USAGE, CREATE ON SCHEMA pgboss_v12 TO turnogol_app;
