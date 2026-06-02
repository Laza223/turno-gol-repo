-- ============================================================
-- 016_reviews.sql
-- Reseñas de jugadores post-partido (interfaz pública estilo ATC).
--
-- Modelo: reviews(tenant_id, player_id, booking_id UNIQUE, rating 1-5,
-- comment <=500, created_at). tenant_id denormalizado desde el booking.
--
-- RLS:
--   * Lectura PÚBLICA (sin auth): se muestran en el perfil del complejo.
--     -> policy reviews_public_select USING (true).
--   * INSERT solo el jugador dueño de un booking 'completed' a su nombre
--     en el mismo tenant -> policy reviews_player_insert (defensa en profundidad
--     sobre la validación del service.canReview()).
--   * Sin UPDATE/DELETE en v1 (reseñas inmutables; moderación = fuera de scope).
--
-- NOTA: reviews NO es una tabla tenant-isolation clásica (lectura pública), por
-- eso NO se agrega al fail-safe de isolation.test.ts; su contrato RLS se prueba
-- en tests/integration/reviews.test.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  player_id   uuid        NOT NULL REFERENCES players(id),
  booking_id  uuid        NOT NULL REFERENCES bookings(id),
  rating      integer     NOT NULL,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_review_rating_range   CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_review_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500)
);

-- 1 reseña por booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_booking ON reviews(booking_id);
-- Listado público por complejo, más recientes primero.
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_created ON reviews(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_player ON reviews(player_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Lectura pública (perfil del complejo, cards de /explorar).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'reviews_public_select'
  ) THEN
    CREATE POLICY reviews_public_select ON reviews
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- INSERT: solo el jugador autenticado, sobre un booking propio 'completed' del
-- mismo tenant. El EXISTS sobre bookings respeta player_own_bookings_select.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'reviews_player_insert'
  ) THEN
    CREATE POLICY reviews_player_insert ON reviews
      FOR INSERT
      WITH CHECK (
        player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id        = reviews.booking_id
            AND b.player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
            AND b.tenant_id = reviews.tenant_id
            AND b.status    = 'completed'
        )
      );
  END IF;
END $$;

COMMENT ON TABLE reviews IS
  'Reseñas de jugadores post-partido. Lectura pública; INSERT solo el dueño de un booking completed. Inmutables en v1.';
