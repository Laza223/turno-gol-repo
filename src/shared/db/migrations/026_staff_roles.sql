-- ============================================================
-- 026 — Roles de staff: manager y read_only
-- ============================================================
-- El ENUM staff_role nacía con solo 'admin' (Fix #5 F2). La Vista Equipo
-- ahora permite invitar con 3 niveles fijos:
--   * 'admin'     → Administrador (acceso total)
--   * 'manager'   → Encargado (grilla + reservas + caja, sin configuración)
--   * 'read_only' → Solo lectura (ver reportes)
--
-- Retrocompatibilidad: la columna tenant_staff_members.role conserva
-- DEFAULT 'admin', así los miembros existentes (todos 'admin') no cambian.
-- El default "Encargado" al invitar se aplica en la capa de aplicación.
--
-- Nota PG: ADD VALUE es transaccional desde PG12 mientras el valor nuevo
-- no se use en la misma transacción (acá no se usa).

ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'read_only';
