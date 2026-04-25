-- ============================================================
-- 004_isolated_tables.sql
-- Tablas aisladas con tenant_id (doc13 §3) + 1 híbrida (player_tenant_relationships).
-- Cada tabla termina con ENABLE ROW LEVEL SECURITY (las policies van en 006).
--
-- Fixes aplicados:
--   * #1 F3:  courts.status DEFAULT 'online' (NO 'active')
--   * #3 F3:  courts.pricing JSONB con estructura nueva {rules:[...]}
--   * #5 F2:  tenant_staff_members.role DEFAULT 'admin'
--   * #7 F2:  cash_flows con chk_cashflow_type_category (sin 'expense')
--   * #8 F2:  daily_cash_closes.total_adjustments (NO total_expense)
--   * #9 F2:  tenant_player_bans SIN uq_tenant_player_active_ban (el trigger lo cubre, archivo 005)
--   * #11 F2: bookings.payment_method nullable + chk_booking_payment_consistency
-- ============================================================

-- ─── courts (Fixes #1 + #3 Fase 3) ──────────────────────────────
CREATE TABLE courts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  description     TEXT,
  surface_type    surface_type NOT NULL DEFAULT 'synthetic_grass',
  capacity        INTEGER NOT NULL,
  photos          TEXT[] DEFAULT '{}',

  -- Fix #1 Fase 3: el ENUM court_status solo admite 'online'|'offline'.
  status          court_status NOT NULL DEFAULT 'online',

  -- Fix #3 Fase 3: estructura nueva con rules[].days/from/to/prices.{60,120}.
  pricing         JSONB NOT NULL DEFAULT '{
    "rules": [
      {"days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "prices": {"60": 800000,  "120": 1500000}},
      {"days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "prices": {"60": 1200000, "120": 2300000}},
      {"days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "prices": {"60": 1500000, "120": 2900000}}
    ]
  }'::JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_capacity_positive CHECK (capacity > 0)
);

CREATE INDEX idx_courts_tenant        ON courts(tenant_id);
CREATE INDEX idx_courts_tenant_status ON courts(tenant_id, status);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  courts          IS 'Canchas del complejo. Cada cancha es independiente.';
COMMENT ON COLUMN courts.pricing  IS
  'Reglas de precios por franja horaria. Estructura: {"rules":[{"days":[...],"from":"HH:MM","to":"HH:MM","prices":{"60":<centavos>,"120":<centavos>}}]}. '
  'Duraciones permitidas: 60 o 120 minutos.';

-- ─── tenant_staff_members (Fix #5 Fase 2) ───────────────────────
CREATE TABLE tenant_staff_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  staff_user_id   UUID NOT NULL REFERENCES staff_users(id),
  -- Fix #5 Fase 2: el ENUM staff_role solo tiene 'admin'. NO 'readonly'.
  role            staff_role NOT NULL DEFAULT 'admin',
  added_by        UUID REFERENCES staff_users(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_tenant_staff UNIQUE (tenant_id, staff_user_id)
);

CREATE INDEX idx_tenant_staff_tenant ON tenant_staff_members(tenant_id);
CREATE INDEX idx_tenant_staff_user   ON tenant_staff_members(staff_user_id);
CREATE INDEX idx_tenant_staff_active ON tenant_staff_members(tenant_id, is_active);

ALTER TABLE tenant_staff_members ENABLE ROW LEVEL SECURITY;

-- ─── tenant_subscriptions ───────────────────────────────────────
CREATE TABLE tenant_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  plan_id               UUID NOT NULL REFERENCES plans(id),
  billing_cycle         billing_cycle NOT NULL DEFAULT 'monthly',
  status                subscription_status NOT NULL DEFAULT 'trialing',

  current_period_start  TIMESTAMPTZ NOT NULL,
  current_period_end    TIMESTAMPTZ NOT NULL,
  price_locked_until    TIMESTAMPTZ,

  mp_subscription_id    TEXT,

  pending_plan_change   UUID REFERENCES plans(id),
  pending_change_at     TIMESTAMPTZ,

  canceled_at           TIMESTAMPTZ,
  cancellation_reason   TEXT,

  scheduled_deletion_at TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_subs_tenant     ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subs_status     ON tenant_subscriptions(status);
CREATE INDEX idx_tenant_subs_period_end ON tenant_subscriptions(current_period_end);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tenant_subscriptions IS 'Suscripción SaaS del complejo. 1:1 con tenants.';

-- ─── products ───────────────────────────────────────────────────
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  sku             TEXT,
  category        TEXT,
  price           INTEGER NOT NULL,
  stock           INTEGER NOT NULL DEFAULT 0,
  low_stock_alert INTEGER NOT NULL DEFAULT 5,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_product_price_positive    CHECK (price > 0),
  CONSTRAINT chk_product_stock_non_negative CHECK (stock >= 0)
);

CREATE INDEX idx_products_tenant        ON products(tenant_id);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ─── tenant_player_bans (Fix #9 Fase 2) ─────────────────────────
-- SIN índice parcial uq_tenant_player_active_ban (NOW() no es IMMUTABLE).
-- El trigger enforce_single_active_ban (archivo 005) hace la validación dinámica.
CREATE TABLE tenant_player_bans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  player_id       UUID NOT NULL REFERENCES players(id),
  reason          TEXT NOT NULL,
  banned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_until    TIMESTAMPTZ,
  banned_by       UUID REFERENCES staff_users(id)
);

CREATE INDEX idx_tenant_player_bans_tenant ON tenant_player_bans(tenant_id);
CREATE INDEX idx_tenant_player_bans_player ON tenant_player_bans(player_id);
-- Lookup rápido para verificación de bans (sin predicado NOW() — IMMUTABLE).
CREATE INDEX idx_tenant_player_bans_active
  ON tenant_player_bans (tenant_id, player_id, banned_until);

ALTER TABLE tenant_player_bans ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tenant_player_bans IS
  'Bans de jugadores por complejo. Ban global en players.status. '
  'Validación de unicidad activa: trigger enforce_single_active_ban (archivo 005).';

-- ─── player_tenant_relationships ────────────────────────────────
CREATE TABLE player_tenant_relationships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  player_id        UUID NOT NULL REFERENCES players(id),

  bookings_count   INTEGER NOT NULL DEFAULT 0,
  noshow_count     INTEGER NOT NULL DEFAULT 0,
  last_booking_at  TIMESTAMPTZ,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'blocked')),

  data_consent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_player_tenant UNIQUE (player_id, tenant_id)
);

CREATE INDEX idx_ptr_tenant        ON player_tenant_relationships(tenant_id);
CREATE INDEX idx_ptr_player        ON player_tenant_relationships(player_id);
CREATE INDEX idx_ptr_tenant_status ON player_tenant_relationships(tenant_id, status);

ALTER TABLE player_tenant_relationships ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE player_tenant_relationships IS
  'Relación jugador ↔ complejo. Creada en primera reserva. Habilita historial, no-shows y lista negra por complejo.';

-- ─── abonados ───────────────────────────────────────────────────
CREATE TABLE abonados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  court_id          UUID NOT NULL REFERENCES courts(id),
  player_id         UUID REFERENCES players(id),
  contact_name      TEXT NOT NULL,
  contact_phone     TEXT NOT NULL,

  day_of_week       SMALLINT NOT NULL,
  time_start        TIME NOT NULL,
  time_end          TIME NOT NULL,

  price_per_session INTEGER NOT NULL,
  monthly_price     INTEGER NOT NULL,

  starts_on         DATE NOT NULL,
  ends_on           DATE,

  status            abonado_status NOT NULL DEFAULT 'active',
  payment_method    abonado_payment_method NOT NULL DEFAULT 'cash',

  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_abonado_time_valid     CHECK (time_end > time_start),
  CONSTRAINT chk_abonado_day_valid      CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_abonado_price_positive CHECK (price_per_session > 0)
);

ALTER TABLE abonados ADD CONSTRAINT no_overlapping_abonados
  EXCLUDE USING gist (
    court_id WITH =,
    day_of_week WITH =,
    tsrange(
      ('2000-01-01'::date + time_start)::timestamp,
      ('2000-01-01'::date + time_end)::timestamp
    ) WITH &&
  )
  WHERE (status = 'active');

CREATE INDEX idx_abonados_tenant        ON abonados(tenant_id);
CREATE INDEX idx_abonados_tenant_status ON abonados(tenant_id, status);
CREATE INDEX idx_abonados_court         ON abonados(tenant_id, court_id);
CREATE INDEX idx_abonados_player        ON abonados(player_id) WHERE player_id IS NOT NULL;

ALTER TABLE abonados ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE abonados IS 'Turnos fijos semanales. Genera instancias de booking automáticamente.';

-- ─── bookings (Fix #11 Fase 2) ──────────────────────────────────
-- SIN la FK a payments todavía (referencia circular se resuelve más abajo con ALTER).
CREATE TABLE bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  court_id         UUID NOT NULL REFERENCES courts(id),
  player_id        UUID REFERENCES players(id),
  abonado_id       UUID REFERENCES abonados(id),
  created_by_staff UUID REFERENCES staff_users(id),

  date             DATE NOT NULL,
  time_start       TIME NOT NULL,
  time_end         TIME NOT NULL,

  type             booking_type   NOT NULL DEFAULT 'spontaneous',
  status           booking_status NOT NULL DEFAULT 'pending_payment',

  price_snapshot   INTEGER NOT NULL,
  deposit_amount   INTEGER NOT NULL DEFAULT 0,
  deposit_status   deposit_status NOT NULL DEFAULT 'not_required',

  -- Fix #11 Fase 2: medio de pago de la seña (nullable). Fuente de verdad para
  -- reservas manuales sin fila en `payments`. Para MP, derivar de payments.method.
  payment_method   payment_method,
  -- payment_id se popula tras crear el cobro MP. FK se agrega abajo (referencia circular).
  payment_id       UUID,

  notes_internal   TEXT,
  notes_player     TEXT,

  guest_name       TEXT,
  guest_phone      TEXT,

  canceled_reason  TEXT,
  canceled_by      cancellation_actor,
  canceled_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_time_valid           CHECK (time_end > time_start),
  CONSTRAINT chk_price_positive       CHECK (price_snapshot >= 0),
  CONSTRAINT chk_deposit_non_negative CHECK (deposit_amount >= 0),

  -- Fix #11 Fase 2: consistencia semántica entre payment_method y payment_id.
  CONSTRAINT chk_booking_payment_consistency CHECK (
    (payment_method = 'mercadopago' AND payment_id IS NOT NULL) OR
    (payment_method IN ('cash', 'transfer', 'other') AND payment_id IS NULL) OR
    (payment_method IS NULL AND deposit_status = 'not_required')
  )
);

-- Exclusion: no overlap de bookings activos en la misma cancha+fecha.
ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    court_id WITH =,
    date WITH =,
    tsrange(
      ('2000-01-01'::date + time_start)::timestamp,
      ('2000-01-01'::date + time_end)::timestamp
    ) WITH &&
  )
  WHERE (status IN ('pending_payment', 'confirmed'));

CREATE INDEX idx_bookings_tenant            ON bookings(tenant_id);
CREATE INDEX idx_bookings_tenant_date       ON bookings(tenant_id, date);
CREATE INDEX idx_bookings_tenant_court_date ON bookings(tenant_id, court_id, date);
CREATE INDEX idx_bookings_player            ON bookings(player_id)  WHERE player_id IS NOT NULL;
CREATE INDEX idx_bookings_abonado           ON bookings(abonado_id) WHERE abonado_id IS NOT NULL;
CREATE INDEX idx_bookings_status            ON bookings(tenant_id, status);
CREATE INDEX idx_bookings_date_status       ON bookings(tenant_id, date, status);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  bookings                IS 'Reservas de cancha. Entidad central del sistema.';
COMMENT ON COLUMN bookings.price_snapshot IS 'Precio en centavos ARS al momento de crear. NUNCA se modifica después.';
COMMENT ON COLUMN bookings.status         IS 'State machine: pending_payment → confirmed → completed/no_show/canceled_*.';

-- ─── payments ───────────────────────────────────────────────────
CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  booking_id       UUID REFERENCES bookings(id),
  player_id        UUID REFERENCES players(id),

  amount           INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'ARS',
  type             payment_type   NOT NULL,
  method           payment_method NOT NULL,
  status           payment_status NOT NULL DEFAULT 'pending',

  mp_payment_id    TEXT UNIQUE,
  mp_preference_id TEXT,

  description      TEXT,

  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_payment_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_payments_tenant         ON payments(tenant_id);
CREATE INDEX idx_payments_booking        ON payments(booking_id)    WHERE booking_id IS NOT NULL;
CREATE INDEX idx_payments_player         ON payments(player_id)     WHERE player_id IS NOT NULL;
CREATE INDEX idx_payments_mp_id          ON payments(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX idx_payments_mp_preference  ON payments(mp_preference_id) WHERE mp_preference_id IS NOT NULL;
CREATE INDEX idx_payments_tenant_status  ON payments(tenant_id, status);
CREATE INDEX idx_payments_tenant_created ON payments(tenant_id, created_at);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  payments              IS 'Cobros financieros. Inmutables post-aprobación. amount siempre en centavos ARS.';
COMMENT ON COLUMN payments.mp_payment_id IS 'UNIQUE: garantiza idempotencia de webhooks de MercadoPago.';

-- ─── Cierre de la referencia circular bookings.payment_id → payments.id ──
ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_payment
  FOREIGN KEY (payment_id) REFERENCES payments(id);

-- ─── cash_flows (Fix #7 Fase 2) ─────────────────────────────────
CREATE TABLE cash_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  type            cashflow_type     NOT NULL,
  category        cashflow_category NOT NULL,

  amount          INTEGER NOT NULL,
  method          payment_method NOT NULL,
  description     TEXT NOT NULL,

  booking_id      UUID REFERENCES bookings(id),
  product_id      UUID REFERENCES products(id),

  registered_by   UUID NOT NULL REFERENCES staff_users(id),
  occurred_at     TIMESTAMPTZ NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_cashflow_amount_positive CHECK (amount > 0),
  -- Fix #7 Fase 2: solo combinaciones válidas. Sin 'expense'.
  CONSTRAINT chk_cashflow_type_category CHECK (
    (type = 'income'     AND category IN ('booking', 'product_sale', 'other')) OR
    (type = 'adjustment' AND category IN ('other', 'no_show_correction'))
  )
);

CREATE INDEX idx_cash_flows_tenant         ON cash_flows(tenant_id);
CREATE INDEX idx_cash_flows_tenant_date    ON cash_flows(tenant_id, occurred_at);
CREATE INDEX idx_cash_flows_tenant_type    ON cash_flows(tenant_id, type);
CREATE INDEX idx_cash_flows_tenant_category ON cash_flows(tenant_id, category);

ALTER TABLE cash_flows ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cash_flows IS
  'Movimientos de caja. Solo ingresos y ajustes (sin gastos — ver DECISIONES_SISTEMA.md P10.1).';

-- ─── daily_cash_closes (Fix #8 Fase 2) ──────────────────────────
-- Inmutable post-cierre. REVOKE en archivo 008.
CREATE TABLE daily_cash_closes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),

  date              DATE NOT NULL,

  total_income      INTEGER NOT NULL DEFAULT 0,
  -- Fix #8 Fase 2: total_adjustments (NO total_expense — TurnoGol no tiene gastos).
  total_adjustments INTEGER NOT NULL DEFAULT 0,
  balance           INTEGER NOT NULL DEFAULT 0,

  declared_cash     INTEGER NOT NULL DEFAULT 0,
  diff_amount       INTEGER NOT NULL DEFAULT 0,

  note              TEXT,
  closed_by         UUID NOT NULL REFERENCES staff_users(id),
  closed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_daily_close_per_tenant     UNIQUE (tenant_id, date),
  CONSTRAINT chk_income_non_negative       CHECK (total_income >= 0),
  CONSTRAINT chk_adjustments_non_negative  CHECK (total_adjustments >= 0)
);

CREATE INDEX idx_daily_closes_tenant      ON daily_cash_closes(tenant_id);
CREATE INDEX idx_daily_closes_tenant_date ON daily_cash_closes(tenant_id, date DESC);

ALTER TABLE daily_cash_closes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  daily_cash_closes               IS
  'Cierre de caja diario. INMUTABLE post-cierre. Correcciones = cash_flows compensatorios.';
COMMENT ON COLUMN daily_cash_closes.diff_amount   IS
  'Diferencia entre declared_cash y la suma de cash_flows del día filtrados por method=''cash''. '
  'Positivo = sobrante, negativo = faltante. Calculado en el momento del cierre, NUNCA recalculado.';

-- ─── notifications ──────────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),

  recipient_type  recipient_type NOT NULL,
  recipient_id    UUID NOT NULL,

  channel         notification_channel NOT NULL,
  trigger_event   TEXT NOT NULL,

  status          notification_status NOT NULL DEFAULT 'queued',
  content         JSONB NOT NULL,
  template_name   TEXT,

  attempt_count   INTEGER NOT NULL DEFAULT 1,
  last_error      TEXT,

  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant        ON notifications(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_notifications_recipient     ON notifications(recipient_id);
CREATE INDEX idx_notifications_trigger       ON notifications(trigger_event);
CREATE INDEX idx_notifications_queued        ON notifications(status, queued_at) WHERE status = 'queued';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ─── audit_logs ─────────────────────────────────────────────────
-- INSERT ONLY. REVOKE UPDATE, DELETE en archivo 008.
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  actor_id        UUID NOT NULL,
  actor_type      audit_actor_type NOT NULL,
  action          TEXT NOT NULL,

  resource_type   TEXT NOT NULL,
  resource_id     UUID NOT NULL,

  before_state    JSONB,
  after_state     JSONB,
  metadata        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant         ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource       ON audit_logs(tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_logs_actor          ON audit_logs(tenant_id, actor_id);
CREATE INDEX idx_audit_logs_action         ON audit_logs(tenant_id, action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  audit_logs        IS 'Registro de auditoría. INSERT ONLY. Retención 12 meses.';
COMMENT ON COLUMN audit_logs.action IS 'Formato: resource_type.verb → booking.created, payment.refunded';
