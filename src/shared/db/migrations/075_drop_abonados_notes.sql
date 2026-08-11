-- 075 — El contract de la 074: se va `abonados.notes`
--
-- ⚠️ **MERGEAR SOLO DESPUÉS DE QUE LA 074 ESTÉ DEPLOYADA EN PRODUCCIÓN.**
-- Esta migración es la mitad "contract" de un expand-contract; la mitad
-- "expand" (dejar de usar la columna) viajó en la 074.
--
-- POR QUÉ EN DOS RELEASES. `db-migrate.yml` corre en el push a main, pero Vercel
-- deploya por integración Git y no desde ese workflow: no hay garantía de orden,
-- y sin required reviewers en el Environment `Production` (verificado el
-- 2026-08-11) la migración le gana al build de Next. Si el DROP hubiera viajado
-- en la 074, durante esa ventana el código VIEJO —que sigue arriba— rompía:
--
--   * `createAbonado`  → `.insert(abonados).values({ …, notes })` nombra la columna.
--   * `pause/reactivate/cancelAbonado` → `.returning()` sin argumentos, que
--     Drizzle expande a TODAS las columnas del schema viejo, `notes` incluida.
--   * `getAbonados` zafaba (usa `SELECT *`), pero crear o pausar un fijo no.
--
-- El propio `db-migrate.yml` lo dice: "renombrar o dropear algo que el código
-- viejo todavía usa NO es seguro y va en dos releases". Ya pasó tres veces en
-- este repo (048–051, 059/061, 060–066).
--
-- QUÉ SE PIERDE. Nada. `abonados.notes` era texto libre asociado a una persona
-- con nombre y teléfono — exactamente lo que la decisión D3 prohíbe (Ley 25.326:
-- lo que un cliente puede leer ejerciendo derecho de acceso queda controlado en
-- origen). Verificado contra producción ANTES de escribir la 074, no asumido:
-- 0 filas en `abonados`, 0 con notas, 3 tenants vivos (todos de prueba).
--
-- AL MERGEAR ESTA MIGRACIÓN, borrar también la entrada `'abonados.notes'` de
-- `KNOWN_DB_ONLY_COLUMNS` en `tests/integration/schema-drift.test.ts`. Si
-- sobrevive, ese test deja de ver un drift real.

BEGIN;

ALTER TABLE abonados DROP COLUMN IF EXISTS notes;

COMMIT;

-- ROLLBACK (manual): `ALTER TABLE abonados ADD COLUMN notes text;`
-- Recrea la columna VACÍA. No restaura contenido — que en producción no había
-- (0 filas), y que es la única razón por la que este DROP es aceptable.
