ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'sending' AFTER 'queued';
COMMENT ON TYPE notification_status IS
  'Lifecycle: queued -> sending -> sent | delivered | failed. The `sending` claim prevents double-dispatch under sweep races (B5/B10).';
