-- ============================================================
-- 017_player_favorites.sql
-- Complejos favoritos del jugador (❤️). Cross-tenant.
--
-- Modelo: player_favorites(player_id, tenant_id, created_at), UNIQUE(player_id, tenant_id).
--
-- RLS: el jugador SOLO ve/modifica los suyos (app.current_player_id). Sin lectura
-- pública (un favorito es dato privado del jugador). Sin contexto -> 0 filas.
-- Contrato RLS probado en tests/integration/favorites.test.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS player_favorites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid        NOT NULL REFERENCES players(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_favorites_player_tenant
  ON player_favorites(player_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_player_favorites_player ON player_favorites(player_id);
CREATE INDEX IF NOT EXISTS idx_player_favorites_tenant ON player_favorites(tenant_id);

ALTER TABLE player_favorites ENABLE ROW LEVEL SECURITY;

-- El jugador ve solo sus favoritos.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_favorites' AND policyname = 'favorites_player_select'
  ) THEN
    CREATE POLICY favorites_player_select ON player_favorites
      FOR SELECT
      USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

-- El jugador agrega solo favoritos a su nombre.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_favorites' AND policyname = 'favorites_player_insert'
  ) THEN
    CREATE POLICY favorites_player_insert ON player_favorites
      FOR INSERT
      WITH CHECK (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

-- El jugador borra solo sus favoritos (toggle off).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_favorites' AND policyname = 'favorites_player_delete'
  ) THEN
    CREATE POLICY favorites_player_delete ON player_favorites
      FOR DELETE
      USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

COMMENT ON TABLE player_favorites IS
  'Complejos favoritos del jugador. Privado: RLS por app.current_player_id, sin lectura pública.';
