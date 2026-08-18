-- 076 — Backfill de staff_users.last_login_at (F-024, QA prod 2026-08-17)
--
-- CONTEXTO. `staff_users.last_login_at` existe desde 003_global_tables.sql
-- pero nunca se escribía para staff (sí para players y system_admins) — el fix
-- de F-024 hace que `provisionAndRouteStaff` (auth.service.ts) la stampee en
-- cada login/aceptación de invitación, y el panel de Equipo la usa para
-- distinguir "Invitación pendiente" (isActive=true, nunca hizo login) de
-- "Activo" (isActive=true, ya hizo login).
--
-- SIN ESTE BACKFILL, el día del deploy TODO staff activo existente tiene
-- last_login_at = NULL (nadie lo escribió nunca) — o sea que el 100% del
-- staff real, sin importar cuánto lleve operando, se vería con el badge
-- "Invitación pendiente" y el botón "Reenviar invitación" apenas se abre
-- /settings/equipo. El estado se autocorrige recién cuando cada persona
-- vuelve a loguearse — no en el próximo request. Hallazgo de verificación
-- adversarial post-fix, no parte del QA original.
--
-- `created_at` no es la fecha exacta del último login, pero es infinitamente
-- mejor que NULL para gente que ya está operando: el próximo login real
-- corrige la fecha con precisión. Solo toca filas con last_login_at IS NULL,
-- así que es seguro correrla más de una vez.

BEGIN;

UPDATE staff_users
SET last_login_at = created_at
WHERE last_login_at IS NULL;

COMMIT;
