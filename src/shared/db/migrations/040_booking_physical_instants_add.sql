-- ============================================================
-- 040: bookings.starts_at / ends_at (timestamptz) — instante físico absoluto.
-- Aditiva, nullable + backfill. NOT NULL + swap de constraint van en 041.
-- El backfill usa la lógica PHYSICALLY_NEXT_DAY en SQL UNA sola vez (no runtime).
-- AT TIME ZONE nombrada = -3 para toda fecha real (2026+), idéntico al artDateAt
-- fijo del app. date + '24:00'::time rola a día siguiente 00:00 en Postgres.
-- Pre-deploy sin tenants reales → backfill toca solo filas de seed.
-- (Renumerada de 036 a 040: 036/037 ya estaban ocupadas por RLS/grants pool app.)
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ends_at   TIMESTAMPTZ;

UPDATE bookings b SET
  starts_at = ((b.date + b.time_start) AT TIME ZONE 'America/Argentina/Buenos_Aires')
    + CASE WHEN (
        t.closes_next_day AND b.time_start < COALESCE(
          (t.opening_hours -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[EXTRACT(DOW FROM b.date)::int + 1] ->> 'open')::time,
          '08:00'::time)
      ) THEN INTERVAL '1 day' ELSE INTERVAL '0' END,
  ends_at = ((b.date + b.time_end) AT TIME ZONE 'America/Argentina/Buenos_Aires')
    + CASE WHEN (
        t.closes_next_day AND b.time_start < COALESCE(
          (t.opening_hours -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[EXTRACT(DOW FROM b.date)::int + 1] ->> 'open')::time,
          '08:00'::time)
      ) THEN INTERVAL '1 day' ELSE INTERVAL '0' END
FROM tenants t
WHERE t.id = b.tenant_id AND b.starts_at IS NULL;

COMMENT ON COLUMN bookings.starts_at IS 'Instante físico absoluto de inicio (tstz). Fuente única de lógica fuerte; date=día operativo, time_start=display.';
COMMENT ON COLUMN bookings.ends_at   IS 'Instante físico absoluto de fin (tstz). Corrige slots post-medianoche de complejos closes_next_day.';
