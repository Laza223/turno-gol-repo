-- ============================================================
-- 018_open_matches.sql
-- "Falta Uno": partidos abiertos (open_matches) + inscriptos (open_match_players).
--
-- Modelo:
--   open_matches(booking_id, creator_player_id, tenant_id, slots_total,
--                slots_filled DEFAULT 0, restrictions JSONB, status, created_at, expires_at)
--   open_match_players(open_match_id, player_id, joined_at), UNIQUE(open_match_id, player_id)
--
--   slots_total  = jugadores que faltan; slots_filled = inscriptos (≠ creador).
--   status: open → full (al completar cupos) | canceled (creador) | completed.
--
-- RLS:
--   * open_matches: lectura PÚBLICA; escritura solo el creador (insert + update).
--   * open_match_players: lectura PÚBLICA (roster); insert/delete solo el propio jugador.
--
-- INTEGRIDAD DE CUPOS (triggers SECURITY DEFINER):
--   El jugador que se une NO es el creador, por lo que NO puede tocar open_matches
--   bajo RLS (policy creator-only; incluso SELECT ... FOR UPDATE evalúa la policy de
--   UPDATE). Por eso slots_filled y la transición open↔full se mantienen por triggers
--   SECURITY DEFINER (corren como owner, bypassean RLS para el bookkeeping interno).
--   La validación de capacidad/estado es atómica vía SELECT ... FOR UPDATE.
--
-- NOTA: open_matches/open_match_players NO son tablas tenant-isolation (lectura
-- pública), por eso NO van al fail-safe de isolation.test.ts; su contrato RLS se
-- prueba en tests/integration/open-matches.test.ts.
-- ============================================================

-- ─── enum open_match_status (idempotente) ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'open_match_status') THEN
    CREATE TYPE open_match_status AS ENUM ('open', 'full', 'canceled', 'completed');
  END IF;
END $$;

-- ─── open_matches ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_matches (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid              NOT NULL REFERENCES bookings(id),
  creator_player_id  uuid              NOT NULL REFERENCES players(id),
  tenant_id          uuid              NOT NULL REFERENCES tenants(id),
  slots_total        integer           NOT NULL,
  slots_filled       integer           NOT NULL DEFAULT 0,
  restrictions       jsonb             NOT NULL DEFAULT '{}'::jsonb,
  status             open_match_status NOT NULL DEFAULT 'open',
  created_at         timestamptz       NOT NULL DEFAULT now(),
  expires_at         timestamptz,

  CONSTRAINT chk_open_match_slots_total_positive CHECK (slots_total > 0),
  CONSTRAINT chk_open_match_slots_filled_valid   CHECK (slots_filled >= 0 AND slots_filled <= slots_total)
);

-- Un solo partido abierto/lleno activo por booking (permite recrear tras cancelar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_match_active_booking
  ON open_matches(booking_id) WHERE status IN ('open', 'full');
CREATE INDEX IF NOT EXISTS idx_open_matches_tenant_status  ON open_matches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_open_matches_status_created ON open_matches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_open_matches_creator        ON open_matches(creator_player_id);

ALTER TABLE open_matches ENABLE ROW LEVEL SECURITY;

-- Lectura pública (vitrina social en landing / explorar).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_matches' AND policyname = 'open_matches_public_select') THEN
    CREATE POLICY open_matches_public_select ON open_matches FOR SELECT USING (true);
  END IF;
END $$;

-- INSERT: solo el creador, sobre un booking propio del mismo tenant.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_matches' AND policyname = 'open_matches_creator_insert') THEN
    CREATE POLICY open_matches_creator_insert ON open_matches
      FOR INSERT
      WITH CHECK (
        creator_player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id        = open_matches.booking_id
            AND b.player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
            AND b.tenant_id = open_matches.tenant_id
        )
      );
  END IF;
END $$;

-- UPDATE: solo el creador (cancelar / completar). El bookkeeping de cupos lo hace
-- el trigger SECURITY DEFINER, que NO pasa por esta policy.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_matches' AND policyname = 'open_matches_creator_update') THEN
    CREATE POLICY open_matches_creator_update ON open_matches
      FOR UPDATE
      USING (creator_player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid)
      WITH CHECK (creator_player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

COMMENT ON TABLE open_matches IS
  'Partidos abiertos ("Falta Uno"). Lectura pública; escritura solo el creador. slots_filled mantenido por trigger.';

-- ─── open_match_players ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_match_players (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  open_match_id  uuid        NOT NULL REFERENCES open_matches(id) ON DELETE CASCADE,
  player_id      uuid        NOT NULL REFERENCES players(id),
  joined_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_match_players_match_player
  ON open_match_players(open_match_id, player_id);
CREATE INDEX IF NOT EXISTS idx_open_match_players_match  ON open_match_players(open_match_id);
CREATE INDEX IF NOT EXISTS idx_open_match_players_player ON open_match_players(player_id);

ALTER TABLE open_match_players ENABLE ROW LEVEL SECURITY;

-- Lectura pública del roster.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_match_players' AND policyname = 'omp_public_select') THEN
    CREATE POLICY omp_public_select ON open_match_players FOR SELECT USING (true);
  END IF;
END $$;

-- INSERT: el jugador se anota a sí mismo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_match_players' AND policyname = 'omp_player_insert') THEN
    CREATE POLICY omp_player_insert ON open_match_players
      FOR INSERT
      WITH CHECK (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

-- DELETE: el jugador se baja a sí mismo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'open_match_players' AND policyname = 'omp_player_delete') THEN
    CREATE POLICY omp_player_delete ON open_match_players
      FOR DELETE
      USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);
  END IF;
END $$;

COMMENT ON TABLE open_match_players IS
  'Inscriptos a partidos abiertos. Lectura pública; cada jugador inserta/borra su propia inscripción.';

-- ─── Trigger BEFORE INSERT: validación de capacidad/estado (SECURITY DEFINER) ──
-- Lockea la fila del partido (FOR UPDATE) y valida estado/cupo/expiración de forma
-- atómica. SECURITY DEFINER para poder lockear open_matches sin chocar con la policy
-- creator-only de UPDATE (FOR UPDATE evalúa la USING de UPDATE).
CREATE OR REPLACE FUNCTION enforce_open_match_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m RECORD;
BEGIN
  SELECT status, slots_filled, slots_total, expires_at
    INTO m
    FROM open_matches
    WHERE id = NEW.open_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El partido abierto % no existe', NEW.open_match_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'El partido no está abierto (estado %)', m.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF m.expires_at IS NOT NULL AND m.expires_at <= now() THEN
    RAISE EXCEPTION 'El partido ya expiró'
      USING ERRCODE = 'check_violation';
  END IF;

  IF m.slots_filled >= m.slots_total THEN
    RAISE EXCEPTION 'El partido ya está completo'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_open_match_join() IS
  'Valida atómicamente (FOR UPDATE) que un partido esté abierto, no expirado y con cupo antes de anotar a un jugador.';

DROP TRIGGER IF EXISTS open_match_join_guard ON open_match_players;
CREATE TRIGGER open_match_join_guard
  BEFORE INSERT ON open_match_players
  FOR EACH ROW EXECUTE FUNCTION enforce_open_match_join();

-- ─── Trigger AFTER INSERT/DELETE: mantener slots_filled + status (SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION sync_open_match_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE open_matches
      SET slots_filled = slots_filled + 1,
          status = CASE WHEN slots_filled + 1 >= slots_total THEN 'full'::open_match_status ELSE status END
      WHERE id = NEW.open_match_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE open_matches
      SET slots_filled = GREATEST(slots_filled - 1, 0),
          status = CASE WHEN status = 'full' AND slots_filled - 1 < slots_total THEN 'open'::open_match_status ELSE status END
      WHERE id = OLD.open_match_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION sync_open_match_slots() IS
  'Mantiene open_matches.slots_filled y la transición open↔full al anotarse/bajarse jugadores. SECURITY DEFINER (bypassa RLS para el bookkeeping interno).';

DROP TRIGGER IF EXISTS open_match_slots_sync ON open_match_players;
CREATE TRIGGER open_match_slots_sync
  AFTER INSERT OR DELETE ON open_match_players
  FOR EACH ROW EXECUTE FUNCTION sync_open_match_slots();
