-- ============================================================
-- 105_referral_code_backfill.sql
-- Código de referido para TODOS los complejos existentes.
--
-- Racional: el programa de referidos pasó a ser permanente y para todos
-- (docs/decisions/2026-10-31-referidos-permanentes.md). Hasta ahora el código
-- (`tenants.referral_code`, migr. 094) lo generaba el super-admin o el dueño
-- con "Generar mi link", y el aviso de Hoy exigía que existiera. Las altas
-- nuevas lo reciben al crearse (`createTenantWithTrial`); esto cubre las
-- filas que ya estaban.
--
-- Opaco (R6): 8 caracteres al azar del alfabeto de la 094 (31 símbolos, sin
-- I/L/O ni 0/1), nunca derivado del slug ni del nombre. El azar sale de
-- gen_random_uuid() (CSPRNG de Postgres), no de random().
--
-- Excluye `deleted`/`churned`: `resolveReferralCode` no los resuelve, y el
-- wipe de data-retention deja `referral_code = NULL` en los borrados.
--
-- Idempotente: solo toca filas con `referral_code IS NULL`; una segunda
-- corrida no cambia nada. Ante una colisión del UNIQUE (probabilidad
-- despreciable con 31^8 combinaciones) reintenta con otro candidato.
-- Aditiva: no cambia columnas, constraints ni policies.
-- ============================================================

DO $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  t record;
  candidate text;
  assigned boolean;
BEGIN
  FOR t IN
    SELECT id FROM tenants
    WHERE referral_code IS NULL AND status NOT IN ('deleted', 'churned')
  LOOP
    assigned := false;
    WHILE NOT assigned LOOP
      SELECT string_agg(
               substr(alphabet, 1 + (get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet)), 1),
               '')
        INTO candidate
        FROM generate_series(1, 8);
      BEGIN
        UPDATE tenants SET referral_code = candidate WHERE id = t.id AND referral_code IS NULL;
        assigned := true;
      EXCEPTION WHEN unique_violation THEN
        NULL; -- candidato tomado por otro complejo: sortear de nuevo
      END;
    END LOOP;
  END LOOP;
END $$;
