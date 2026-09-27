-- ============================================================
-- 094_referrals.sql
-- Programa de referidos, fase B1 (alta del código + landing pública `/r/<CODE>`).
--
-- Racional completo: docs/decisions/2026-09-26-referidos.md (PR #395, todavía
-- no mergeado a esta rama) — lo esencial queda repetido acá para que la
-- migración se entienda sola.
--
-- Un complejo activo recomienda TurnoGol con un link `/r/<CODE>`. El código lo
-- reparte el REFERIDOR y vive en SU fila (`tenants.referral_code`); quién trajo
-- a un complejo nuevo y el estado de la recompensa viven en la fila del
-- REFERIDO (`referred_by_tenant_id` + `referral_reward_*`). Separar las dos
-- puntas evita desnormalizar un array de "a quién referí" en el referidor: "a
-- quién referí" es un SELECT por `referred_by_tenant_id`, no un JSONB.
--
-- El staff que se registra puede llegar con `?ref=<CODE>` desde la landing:
-- `staff_users.signup_referral_code` guarda el código CRUDO tal como llegó al
-- formulario de alta, antes de resolverlo a un tenant — esa resolución y el
-- alta de `tenants.referred_by_tenant_id` son de B2/B3, fuera de esta fase.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_reward_status text,
  ADD COLUMN IF NOT EXISTS referral_reward_at timestamptz;

-- Mismo alfabeto sin ambiguos (sin I/L/O/0/1) que el generador de
-- src/modules/referrals/referral.schema.ts: 8 caracteres, mayúsculas y dígitos.
-- Re-ejecutable, como 092/093: cada CHECK se agrega solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_referral_code_format') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_referral_code_format
      CHECK (referral_code IS NULL OR referral_code ~ '^[A-HJKMNP-Z2-9]{8}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_referred_by_not_self') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_referred_by_not_self
      CHECK (referred_by_tenant_id IS NULL OR referred_by_tenant_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_referral_reward_status_valid') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_referral_reward_status_valid
      CHECK (referral_reward_status IS NULL OR referral_reward_status IN
        ('earned', 'manual_pending', 'applied', 'rejected', 'over_cap'));
  END IF;
END $$;

-- Parcial: la inmensa mayoría de los tenants no llegó por referido.
CREATE INDEX IF NOT EXISTS idx_tenants_referred_by_tenant_id
  ON tenants (referred_by_tenant_id)
  WHERE referred_by_tenant_id IS NOT NULL;

COMMENT ON COLUMN tenants.referral_code IS
  'Código público de 8 caracteres (alfabeto sin ambiguos) que ESTE complejo reparte para recomendar TurnoGol — la landing pública es /r/<CODE>. NULL hasta que alguien lo genera (ensureReferralCode, idempotente); único cuando existe.';

COMMENT ON COLUMN tenants.referred_by_tenant_id IS
  'Qué OTRO complejo trajo a este. Vive en la fila del REFERIDO, no del referidor (evita desnormalizar en el referidor un array de "a quién referí"). NULL = no llegó por un link de referido. ON DELETE SET NULL: perder al referidor no debe bloquear el borrado/anonimización de su fila (data-retention-cleanup.worker.ts).';

COMMENT ON COLUMN tenants.referral_reward_status IS
  'Estado de la recompensa del programa de referidos para ESTE complejo (el referido), no del referidor. earned=condición cumplida, manual_pending=a la espera de que soporte la aplique a mano, applied=ya acreditada, rejected=no corresponde, over_cap=tope del programa alcanzado. NULL = todavía no aplica (sin referred_by_tenant_id, o sin cumplir la condición).';

COMMENT ON COLUMN tenants.referral_reward_at IS
  'Cuándo se fijó el referral_reward_status actual de este complejo. NULL mientras referral_reward_status sea NULL.';

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS signup_referral_code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_users_signup_referral_code_format') THEN
    ALTER TABLE staff_users ADD CONSTRAINT staff_users_signup_referral_code_format
      CHECK (signup_referral_code IS NULL OR signup_referral_code ~ '^[A-HJKMNP-Z2-9]{8}$');
  END IF;
END $$;

COMMENT ON COLUMN staff_users.signup_referral_code IS
  'Código de referido tal como llegó en el ?ref=<CODE> del formulario de alta: crudo, sin resolver todavía a un tenant (esa resolución hacia tenants.referred_by_tenant_id es de B2/B3). NULL = alta sin referido.';
