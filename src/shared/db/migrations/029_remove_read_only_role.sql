-- ============================================================
-- 029 — staff_role: quitar 'read_only'
-- ============================================================
-- Decisión de negocio (2026-06-18): el rol de staff queda en 2 niveles,
-- 'admin' (dueño) y 'manager' (encargado, opcional). Se elimina 'read_only'.
--
-- Postgres no permite DROP VALUE de un enum: se recrea el tipo. Cualquier
-- miembro en 'read_only' (no esperado, pre-prod) se degrada a 'manager'.
-- ============================================================

-- 1. Degradar filas que usen el valor a eliminar.
UPDATE tenant_staff_members SET role = 'manager' WHERE role = 'read_only';

-- 2. Recrear el enum sin 'read_only'.
ALTER TABLE tenant_staff_members ALTER COLUMN role DROP DEFAULT;
ALTER TYPE staff_role RENAME TO staff_role_old;
CREATE TYPE staff_role AS ENUM ('admin', 'manager');
ALTER TABLE tenant_staff_members
  ALTER COLUMN role TYPE staff_role USING role::text::staff_role;
ALTER TABLE tenant_staff_members ALTER COLUMN role SET DEFAULT 'admin';
DROP TYPE staff_role_old;
