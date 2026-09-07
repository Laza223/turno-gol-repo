-- ============================================================
-- 084_reviews_hide_player_id.sql
-- H-2 de la auditoría de aislamiento del 2026-09-05
-- (docs/audit/2026-09-05-aislamiento-rls.md).
--
-- `reviews_public_select` es la ÚNICA policy `USING (true)` del esquema, y es
-- deliberada: el portal público muestra reseñas sin sesión. Lo que la auditoría
-- midió es el ALCANCE de esa excepción: sin ningún contexto se leen las reseñas
-- de TODOS los complejos incluyendo `player_id` y `booking_id`, y con eso se
-- reconstruye quién jugó en qué complejo (Ley 25.326).
--
-- Hoy la barrera es la proyección del código (`getReviewsByTenantImpl` recorta
-- las dos columnas y lo tiene comentado citando la ley), pero es una capa de
-- arriba: cualquier consulta futura que traiga la fila entera queda expuesta y
-- ningún test lo frenaría.
--
-- RLS es por FILA: no puede esconder una columna. La herramienta es el permiso
-- por columna. Se esconde `player_id`, que es el que ata la reseña a una
-- persona; `booking_id` se conserva porque el propio service filtra por él para
-- detectar la reseña duplicada, y por sí solo no resuelve a nadie (la tabla
-- `bookings` sí tiene RLS).
--
-- OJO al agregar una columna a esta tabla: con permisos por columna, una
-- columna nueva NO queda legible para `turnogol_app` hasta que se la otorgue
-- explícitamente. Sumarla acá, en una migración nueva.
--
-- El rol de workers (`turnogol_worker`, BYPASSRLS) no se toca: el barrido de
-- retención necesita la fila entera.
-- ============================================================

REVOKE SELECT ON reviews FROM turnogol_app;

GRANT SELECT (id, tenant_id, booking_id, rating, comment, created_at)
  ON reviews TO turnogol_app;
