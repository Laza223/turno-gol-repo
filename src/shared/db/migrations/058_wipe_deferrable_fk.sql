-- ============================================================
-- 058 — Wipe de retención sin session_replication_role (D5 continuación)
-- Decisión: docs/decisions/2026-07-23-wipe-retencion-sin-replica-role.md
--
-- wipeTenant abría su tx con SET LOCAL session_replication_role='replica'
-- (GUC SUSET): bajo el rol real de prod (turnogol_worker) fallaba con
-- "permission denied to set parameter" en el PRIMER statement → wipe legal
-- Ley 25.326 §16 roto en prod. GRANT SET ON PARAMETER es inaplicable en
-- Supabase (postgres no es superusuario real — probado local).
--
-- Censo empírico (pg_trigger + pg_constraint, 2026-07-23): ningún trigger
-- de usuario bloquea DELETE en las tablas del wipe, y de las 11 aristas de
-- FK entre ellas el orden de DELETEs del worker solo viola UNA: la circular
-- bookings.payment_id → payments(id) (payments se borra antes que
-- bookings). Con hacer esa FK DEFERRABLE alcanza: la tx del wipe la difiere
-- con SET CONSTRAINTS (per-tx, sin privilegios) y el chequeo corre al
-- COMMIT, cuando ambos lados ya no existen.
--
-- INITIALLY IMMEDIATE: en operación normal la semántica es idéntica a hoy
-- (chequeo por statement); solo una tx que pida SET CONSTRAINTS ... DEFERRED
-- lo pospone.
-- ============================================================

ALTER TABLE bookings
  ALTER CONSTRAINT fk_bookings_payment DEFERRABLE INITIALLY IMMEDIATE;

-- Re-afirmación idempotente de la migr. 057 (worker_wipe_grants): 057 está
-- aplicada en prod y en local pero vive SIN commitear en la rama
-- claude/practical-kilby-322fa9. El wipe (y su test de rol real) necesita
-- estos GRANT; si 057 mergea después, esto es un no-op. El UPDATE sigue
-- revocado en ambas tablas (append-only: el trail no se reescribe, se purga).
GRANT DELETE ON audit_logs TO turnogol_worker;
GRANT DELETE ON daily_cash_closes TO turnogol_worker;
