-- Migration 047: Add completed_by_staff to bookings
-- Tracks which staff member completed (charged) the booking.
-- NULL for historically completed bookings and auto-completed ones (cron).

ALTER TABLE bookings
  ADD COLUMN completed_by_staff UUID REFERENCES staff_users (id);

-- Index for audit/reporting: "which bookings did this staff complete today?"
CREATE INDEX idx_bookings_completed_by_staff
  ON bookings (completed_by_staff)
  WHERE completed_by_staff IS NOT NULL;

-- Grant to application role (matches 037_turnogol_app_grants pattern)
GRANT SELECT, INSERT, UPDATE ON bookings TO turnogol_app;
