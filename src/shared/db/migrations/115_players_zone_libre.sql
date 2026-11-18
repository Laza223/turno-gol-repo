-- ============================================================
-- 115: players.zone deja de ser una lista cerrada de 13 zonas
--
-- La 099 la creó con CHECK (zone IN (...13 zonas del corredor de Luján...)).
-- RIVAL se abre a cualquier localidad del país (decisión del 2026-11-16,
-- docs/decisions/2026-11-16-rival-zona-libre.md): el valor pasa a ser texto
-- ("Luján, Buenos Aires"). Se saca el CHECK cerrado y queda solo uno de largo.
-- Los valores viejos ("Jáuregui", "Otra zona", ...) siguen siendo válidos.
--
-- Compatible hacia atrás: el código anterior solo escribe valores de la lista
-- vieja, que pasan el CHECK nuevo. La columna sigue text y admite NULL.
-- Idempotente.
--
-- Rollback (a mano; falla si ya hay zonas fuera de la lista vieja):
--   ALTER TABLE players DROP CONSTRAINT IF EXISTS players_zone_len_check;
--   ALTER TABLE players ADD CONSTRAINT players_zone_check CHECK (zone IN (
--     'Luján', 'Jáuregui', 'Open Door', 'Torres', 'Pueblo Nuevo', 'Olivera',
--     'Carlos Keen', 'General Rodríguez', 'Mercedes', 'Pilar', 'Moreno',
--     'Exaltación de la Cruz', 'Otra zona'
--   ));
-- ============================================================

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_zone_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'players_zone_len_check' AND conrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE players ADD CONSTRAINT players_zone_len_check CHECK (char_length(zone) <= 120);
  END IF;
END $$;

COMMENT ON COLUMN players.zone IS
  'Localidad declarada para RIVAL, texto libre de hasta 120 caracteres ("Luján, Buenos Aires"; los valores viejos van sueltos: "Jáuregui", "Otra zona"). La ve solo el organizador.';
