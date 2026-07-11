-- ============================================================
-- 041: NOT NULL sobre starts_at/ends_at + exclusion constraint por instante.
-- El constraint deja de keyear 'date WITH =': el overlap depende del instante
-- físico, no del día operativo bajo el que se archiva el slot. btree_gist ya
-- cargado (migr. 001); tstzrange no requiere extensión nueva.
-- ============================================================

ALTER TABLE bookings ALTER COLUMN starts_at SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN ends_at   SET NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT no_overlapping_bookings;
ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  )
  WHERE (status IN ('pending_payment', 'confirmed'));

CREATE INDEX IF NOT EXISTS idx_bookings_starts_at ON bookings(starts_at);
