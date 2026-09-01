-- 083_private_plans.sql
-- Planes ofrecibles a UN solo complejo (precio especial, plan heredado, piloto).
--
-- Hasta acá `plans` sólo tenía `is_active`: un plan estaba prendido para todos o
-- apagado para todos. El workaround era prenderlo, suscribir y apagarlo, con dos
-- agujeros: durante esa ventana cualquier complejo que abriera
-- /settings/facturacion veía el plan interno, y REACTIVAR una suscripción de un
-- plan apagado fallaba con PlanNotFoundError (ese camino pasa por `loadPlan`,
-- que filtra `is_active`).
--
-- `owner_tenant_id` NULL = plan público, que es el comportamiento de todas las
-- filas existentes. `is_active` NO cambia de significado: sigue siendo el
-- interruptor de encendido, y esta columna es el alcance de visibilidad. Son dos
-- cosas distintas a propósito — y separarlas es lo que arregla la reactivación,
-- porque un plan privado ya no necesita apagarse para dejar de ofrecerse.
--
-- ── Por qué NO lleva FOREIGN KEY a tenants(id) ──────────────────────────────
-- Una FK haría de `plans` una tabla dependiente de `tenants`, y `TRUNCATE
-- tenants ... CASCADE` —lo que hace `cleanupAll` del harness de tests -- pasaría
-- a truncar `plans` también. Las filas de `plans` se siembran UNA sola vez, en
-- la migración 007, así que no volverían: el primer `cleanupAll` de la corrida
-- dejaría la tabla vacía y todo test de billing que resuelve un plan por slug
-- se caería, en cascada y por un motivo que no tiene nada que ver con lo que
-- está probando.
--
-- Lo que se pierde a cambio es poco: los complejos NO se borran duro (el ciclo
-- de vida es soft-delete + anonimización, ver `wipeTenant`), así que la FK
-- estaría protegiendo contra algo que el sistema no hace. Un `owner_tenant_id`
-- colgado tampoco es peligroso: el plan simplemente deja de ser visible para
-- nadie, que es el lado seguro del error.
--
-- Si algún día los tenants se borraran de verdad, la respuesta correcta NO es
-- agregar la FK acá sino re-sembrar `plans` en `cleanupAll` primero.

ALTER TABLE plans ADD COLUMN owner_tenant_id uuid;

-- Índice parcial: la enorme mayoría de las filas son públicas (NULL). Mismo
-- criterio que el UNIQUE parcial de `tenants.mp_user_id` en la migr. 069.
CREATE INDEX idx_plans_owner_tenant ON plans (owner_tenant_id)
  WHERE owner_tenant_id IS NOT NULL;

COMMENT ON COLUMN plans.owner_tenant_id IS 'Complejo dueño del plan cuando es privado (precio especial, plan heredado, piloto). NULL = plan público, ofrecible a cualquiera. Sin FK a propósito: ver la cabecera de 083_private_plans.sql.';
