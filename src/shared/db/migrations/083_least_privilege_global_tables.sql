-- ============================================================
-- 083_least_privilege_global_tables.sql
-- H-3 de la auditoría de aislamiento del 2026-09-05
-- (docs/audit/2026-09-05-aislamiento-rls.md).
--
-- La migración 037 otorgó SELECT/INSERT/UPDATE/DELETE sobre TODAS las tablas
-- del esquema a `turnogol_app`, porque hasta ahí el rol no tenía ningún
-- privilegio y no podía ni leer. El efecto colateral quedó vivo: las seis
-- tablas GLOBALES (sin tenant_id, y cuatro de ellas sin RLS) quedaron abiertas
-- a borrado desde el runtime web, y el catálogo comercial quedó abierto a
-- escritura. Medido en la auditoría: desde el contexto de un complejo se pisó
-- el nombre de otro y se modificó el catálogo de planes.
--
-- No es una fuga: hoy ningún camino de código hace nada de esto. Es alcance de
-- más, y en `tenants` viven las credenciales de MercadoPago cifradas, donde el
-- cifrado es la única barrera porque la tabla no tiene RLS.
--
-- Verificado antes de revocar, con barrido sobre `src/`:
--   * ningún DELETE del runtime web sobre estas seis tablas. El único DELETE
--     de producción es el de `processed_webhooks` en el worker de retención,
--     que corre con el pool `turnogol_worker` y no se toca acá.
--   * `plans` y `price_versions` sólo se escriben desde migraciones (007, 043,
--     071), que corren como `postgres`. Para el runtime son catálogo de lectura.
--   * los guiones de siembra (e2e, demo, volumen) se conectan como `postgres`
--     con un DSN propio, no con el del rol de la app.
--
-- Idempotente: REVOKE se puede re-ejecutar sin efecto.
-- ============================================================

-- Borrado: ninguna de las seis se borra desde el runtime web. La baja de un
-- complejo es un estado (`tenant_status = 'deleted'`), no un DELETE, y la de un
-- jugador es `player_status = 'anonymized'` (Ley 25.326).
REVOKE DELETE ON tenants FROM turnogol_app;
REVOKE DELETE ON players FROM turnogol_app;
REVOKE DELETE ON staff_users FROM turnogol_app;
REVOKE DELETE ON processed_webhooks FROM turnogol_app;

-- Catálogo comercial: sólo lectura desde el runtime. Los precios los mueve una
-- migración, que es lo que deja el cambio registrado y revisable.
REVOKE INSERT, UPDATE, DELETE ON plans FROM turnogol_app;
REVOKE INSERT, UPDATE, DELETE ON price_versions FROM turnogol_app;
