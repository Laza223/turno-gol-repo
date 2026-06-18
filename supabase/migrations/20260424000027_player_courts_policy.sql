-- ════════════════════════════════════════════════════════════════════
-- 027 — Player-facing SELECT policy on courts
-- ════════════════════════════════════════════════════════════════════
-- Problema: las rutas de jugador corren con app.current_player_id pero SIN
-- app.current_tenant_id (el jugador es cross-tenant). `courts` tenía solo la
-- policy tenant_isolation_select (por app.current_tenant_id) + FORCE ROW LEVEL
-- SECURITY (migración 021). Bajo un rol no-superusuario, cualquier JOIN a courts
-- desde una ruta de jugador devolvía 0 filas → la grilla "Mis Reservas"
-- (GET /api/player/bookings) quedaba vacía y el detalle 404eaba.
--
-- Fix: el jugador puede leer una cancha SOLO si tiene al menos una reserva
-- propia en ella. El EXISTS sobre bookings está acotado por player_id =
-- app.current_player_id (además de respetar player_own_bookings_select sobre la
-- subconsulta), así que no amplía la superficie: ve el nombre de las canchas
-- donde ya reservó, nada más. No hay recursión (courts→bookings; las policies de
-- bookings no consultan courts).
--
-- Idempotente: re-ejecutable sin error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'courts' AND policyname = 'player_read_court'
  ) THEN
    CREATE POLICY player_read_court ON courts FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.court_id = courts.id
            AND b.player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
        )
      );
  END IF;
END $$;

COMMENT ON POLICY player_read_court ON courts IS
  'El jugador (app.current_player_id) lee solo las canchas donde tiene reservas propias. Habilita Mis Reservas + detalle sin app.current_tenant_id.';
