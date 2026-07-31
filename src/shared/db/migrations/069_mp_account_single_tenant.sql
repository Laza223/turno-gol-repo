-- ============================================================
-- 069_mp_account_single_tenant.sql
-- Una cuenta de MercadoPago cobra para UN solo complejo.
--
-- Decisión del dueño (2026-07-31). El caso que la motiva no es teórico: se
-- reprodujo en producción con dos cuentas de TurnoGol distintas
-- (elitepadeloficial@ y feijoolazaro@) conectando la MISMA cuenta de MP
-- (`mp_user_id` 381048203). No fue un fallo de autorización — el callback
-- exige state firmado + sesión del mismo tenant + rol admin, y las tres se
-- cumplieron — sino la ausencia de esta regla: MercadoPago guarda el
-- consentimiento por (usuario, aplicación), no por complejo, así que a partir
-- del segundo intento conecta sin volver a preguntar nada.
--
-- El riesgo que cierra: un socio o encargado conecta SU MercadoPago, se va, y
-- las señas le siguen cayendo a él. El dueño que queda no tenía forma de
-- notarlo, porque la UI solo mostraba un booleano "conectado".
--
-- `mp_nickname` va en la misma migración porque ataca la otra mitad del mismo
-- problema: poder ver QUÉ cuenta quedó conectada, no solo que hay una.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mp_nickname TEXT;

-- Desempate de los duplicados que ya existen, ANTES de crear el índice (si no,
-- el CREATE UNIQUE INDEX falla y la migración no puede aplicarse).
--
-- Criterio: gana el que conectó PRIMERO. Es el único desempate defendible sin
-- intervención humana — el complejo que venía cobrando con esa cuenta la
-- conserva, y el que la tomó después queda desconectado. No se borra plata ni
-- reservas: solo se limpian las credenciales, y ese complejo vuelve a ver el
-- botón "Conectar MercadoPago" como si nunca lo hubiera hecho.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY mp_user_id
           ORDER BY mp_connected_at ASC NULLS LAST, created_at ASC
         ) AS pos
  FROM tenants
  WHERE mp_user_id IS NOT NULL
)
UPDATE tenants t
SET mp_access_token = NULL,
    mp_refresh_token = NULL,
    mp_user_id = NULL,
    mp_public_key = NULL,
    mp_connected_at = NULL,
    updated_at = NOW()
FROM ranked r
WHERE t.id = r.id AND r.pos > 1;

-- Parcial: la enorme mayoría de los complejos tiene `mp_user_id` NULL (todavía
-- no conectaron), y en un índice único los NULL no colisionan entre sí de todos
-- modos — el WHERE lo hace explícito y mantiene el índice chico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_mp_user_id
  ON tenants (mp_user_id)
  WHERE mp_user_id IS NOT NULL;

COMMENT ON INDEX uq_tenants_mp_user_id IS
  'Una cuenta de MercadoPago cobra para un solo complejo. El chequeo amable vive en api/mp/callback (mp_already_connected); este índice es la red por si dos requests corren a la vez.';
