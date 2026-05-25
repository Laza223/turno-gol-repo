-- Backport from src/shared/db/migrations/009_relax_payment_consistency.sql
-- (B11 unification — supabase tree was missing this migration).
-- Relax chk_booking_payment_consistency to allow pending_payment bookings
-- before the MP preference is created (P10 sets payment_method='mercadopago'
-- and payment_id once the preference is generated).
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS chk_booking_payment_consistency;

ALTER TABLE bookings
  ADD CONSTRAINT chk_booking_payment_consistency CHECK (
    (payment_method = 'mercadopago' AND payment_id IS NOT NULL)
    OR (payment_method IN ('cash', 'transfer', 'other') AND payment_id IS NULL)
    OR (payment_method IS NULL)
  );
