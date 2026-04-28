-- ============================================================
-- 003_global_tables.sql
-- Tablas sin tenant_id (cross-tenant o del sistema). doc13 §2 + §3.7.
-- Orden: plans → tenants → players → staff_users → system_admins → price_versions → processed_webhooks.
-- RLS se ENABLE en 006_rls_policies.sql (junto con sus policies).
-- ============================================================

-- ─── plans ──────────────────────────────────────────────────────
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  max_courts      INTEGER,
  features        JSONB NOT NULL DEFAULT '{
    "history_months": 6,
    "export_formats": ["csv"],
    "api_access": false,
    "support_channels": ["email"]
  }'::JSONB,
  price_monthly   INTEGER NOT NULL,
  price_annual    INTEGER NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plans IS 'Planes de suscripción SaaS. Globales, no por tenant.';
COMMENT ON COLUMN plans.price_monthly IS 'Precio mensual en centavos ARS.';
COMMENT ON COLUMN plans.max_courts IS 'NULL = ilimitado.';

-- ─── tenants ────────────────────────────────────────────────────
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  cover_url       TEXT,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  province        TEXT NOT NULL,
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  phone           TEXT NOT NULL,
  whatsapp        TEXT,
  email           TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',

  opening_hours   JSONB NOT NULL DEFAULT '{
    "mon": {"open": "08:00", "close": "00:00"},
    "tue": {"open": "08:00", "close": "00:00"},
    "wed": {"open": "08:00", "close": "00:00"},
    "thu": {"open": "08:00", "close": "00:00"},
    "fri": {"open": "08:00", "close": "01:00"},
    "sat": {"open": "09:00", "close": "01:00"},
    "sun": {"open": "09:00", "close": "23:00"}
  }'::JSONB,

  closed_dates    DATE[] DEFAULT '{}',

  status          tenant_status NOT NULL DEFAULT 'trialing',
  trial_ends_at   TIMESTAMPTZ,

  settings        JSONB NOT NULL DEFAULT '{
    "requires_deposit": true,
    "deposit_percentage": 30,
    "cancellation_policy": {
      "hours_before": 12,
      "penalty_type": "deposit",
      "penalty_amount": null
    },
    "no_show_penalty": {
      "type": "ban_days",
      "days": 7
    },
    "accepts_cash": true,
    "accepts_transfer": true,
    "accepts_mercadopago": true,
    "allow_online_booking": true,
    "booking_advance_days": 6,
    "booking_duration_minutes": [60, 120],
    "auto_complete_minutes": 30
  }'::JSONB,

  feature_overrides JSONB NOT NULL DEFAULT '{}',

  -- Credenciales OAuth de MercadoPago (encriptadas at-rest)
  mp_access_token   TEXT,
  mp_refresh_token  TEXT,
  mp_user_id        TEXT,
  mp_public_key     TEXT,
  mp_connected_at   TIMESTAMPTZ,

  scheduled_deletion_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug   ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_city   ON tenants(city);

COMMENT ON TABLE  tenants IS 'Complejos deportivos. Entidad raíz del multi-tenancy.';
COMMENT ON COLUMN tenants.slug IS 'URL amigable. turnogol.com.ar/{slug}';
COMMENT ON COLUMN tenants.settings IS 'Configuraciones del complejo: seña, cancelación, medios de pago, etc.';

-- ─── players ────────────────────────────────────────────────────
CREATE TABLE players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL UNIQUE,
  phone               TEXT,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  avatar_url          TEXT,
  preferred_area      TEXT,

  status              player_status NOT NULL DEFAULT 'active',
  ban_reason          TEXT,
  ban_until           TIMESTAMPTZ,

  -- Declaración jurada +18 (ADR-012)
  agreed_to_terms_at  TIMESTAMPTZ,
  terms_version       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_players_email  ON players(email);
CREATE INDEX        idx_players_phone  ON players(phone) WHERE phone IS NOT NULL;
CREATE INDEX        idx_players_status ON players(status);

COMMENT ON TABLE  players IS 'Jugadores (B2C). Cross-tenant: reservan en múltiples complejos.';
COMMENT ON COLUMN players.status IS
  'banned = ban global del sistema. anonymized = ARCO Ley 25.326. Bans per-tenant en tenant_player_bans.';

-- ─── staff_users ────────────────────────────────────────────────
CREATE TABLE staff_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone           TEXT,
  status          staff_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_staff_users_email ON staff_users(email);

COMMENT ON TABLE staff_users IS 'Usuarios de staff. La relación con tenants está en tenant_staff_members.';

-- ─── system_admins (Fix #4 Fase 3 + Fix #10 Fase 2) ─────────────
-- Equipo interno de TurnoGol. Acceso al panel /internal con MFA + IP whitelist.
-- 3ª variable de contexto: app.current_system_admin_id (configurada en RLS, archivo 006).
CREATE TABLE system_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,

  status          staff_status NOT NULL DEFAULT 'active',

  -- MFA obligatorio (TOTP)
  mfa_secret      TEXT,
  mfa_verified_at TIMESTAMPTZ,

  -- Auditoría de acceso
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_system_admins_email ON system_admins(email);

COMMENT ON TABLE  system_admins IS
  'Equipo interno de TurnoGol. Acceso al panel /internal/dashboard. '
  'Require MFA. 3ª variable de contexto: app.current_system_admin_id.';
COMMENT ON COLUMN system_admins.mfa_secret IS
  'TOTP secret encriptado en reposo. Encriptar con pgsodium o a nivel de aplicación.';

-- ─── price_versions ─────────────────────────────────────────────
CREATE TABLE price_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES plans(id),
  price_monthly   INTEGER NOT NULL,
  price_annual    INTEGER NOT NULL,
  valid_from      DATE NOT NULL,
  valid_until     DATE,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_versions_plan ON price_versions(plan_id, valid_from DESC);

COMMENT ON TABLE price_versions IS 'Historial de precios. INSERT only. Nunca UPDATE.';

-- ─── processed_webhooks ─────────────────────────────────────────
CREATE TABLE processed_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_event_id     TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  payload         JSONB,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_processed_webhooks_mp_id ON processed_webhooks(mp_event_id);

COMMENT ON TABLE processed_webhooks IS
  'Idempotencia de webhooks. INSERT ante cada webhook, ON CONFLICT = ya procesado.';
