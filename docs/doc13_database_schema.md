# DOC 13 — Esquema de Base de Datos
## TurnoGol: El SQL Completo Derivado de las Entidades

> **Propósito**: Traducir el modelo de dominio (Doc 6) en tablas SQL concretas, con tipos,
> constraints, índices, RLS y triggers. Este documento es la fuente de verdad para el schema
> de PostgreSQL. De acá salen las migrations.

> [!IMPORTANT]
> Convenciones obligatorias:
> - **Todos los timestamps en UTC** (Doc 5 §8). Se convierten a ART solo en el frontend.
> - **Montos en centavos de ARS** (integer, no decimal). $8.000 ARS = 800000.
> - **UUIDs como primary keys** (gen_random_uuid()). No autoincremental.
> - **`tenant_id` como primer campo después del PK** en tablas aisladas (Doc 12).
> - **snake_case** para nombres de tablas y columnas.
> - **Soft-delete NO se usa**. Los registros se eliminan o se archivan. Los estados finales son inmutables.

---

## 1. Tipos Enumerados (ENUMs)

```sql
-- ============================================================
-- ENUMS — Definidos antes de las tablas que los usan
-- ============================================================

-- Estado del tenant (complejo) — 8 estados según Doc 4 §2
CREATE TYPE tenant_status AS ENUM (
  'trialing',   -- Prueba gratuita activa (30 días, acceso completo)
  'active',     -- Suscripción activa y al día
  'past_due',   -- Cobro fallido, período de gracia 7 días (acceso completo)
  'suspended',  -- Sin pago día 7-14, admin solo lectura, jugadores siguen
  'blocked',    -- Sin pago día 14+, o trial expirado: sin acceso total
  'canceled',   -- Canceló voluntariamente, activo hasta fin del período
  'churned',    -- Sin acceso, datos en retención
  'deleted'     -- Datos eliminados/anonimizados (estado final definitivo)
);

-- Estado de la suscripción SaaS (espeja tenant_status)
CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned'
);

-- Ciclo de facturación
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');

-- Estado de la cancha
CREATE TYPE court_status AS ENUM ('active', 'inactive');

-- Tipo de superficie
CREATE TYPE surface_type AS ENUM (
  'synthetic_grass',  -- Césped sintético
  'natural_grass',    -- Césped natural
  'cement',           -- Cemento
  'indoor'            -- Piso indoor
);

-- Tipo de reserva
CREATE TYPE booking_type AS ENUM (
  'spontaneous',  -- Reserva normal (online o manual)
  'fixed',        -- Turno fijo de abonado
  'block',        -- Bloqueo de cancha (mantenimiento, evento privado)
  'event'         -- Evento especial
);

-- Estado de la reserva (state machine más crítica del sistema)
CREATE TYPE booking_status AS ENUM (
  'pending_payment',      -- Esperando pago de seña (timeout 15 min o 48hs si CBU)
  'confirmed',            -- Confirmada (con o sin seña)
  'expired',              -- Timeout sin pago → estado final
  'canceled_refunded',    -- Cancelada con reembolso (americano: una L)
  'canceled_no_refund',   -- Cancelada sin reembolso (fuera de plazo)
  'completed',            -- Turno jugado → estado final inmutable
  'no_show'               -- No se presentó → estado final inmutable
);

-- Estado del depósito (seña)
CREATE TYPE deposit_status AS ENUM (
  'not_required',  -- El complejo no exige seña o seña es 0%
  'pending',       -- Seña pendiente de pago
  'paid',          -- Seña pagada
  'refunded',      -- Seña devuelta
  'captured'       -- Seña capturada (no reembolsable)
);

-- Quién canceló la reserva
CREATE TYPE cancellation_actor AS ENUM ('player', 'admin', 'system');

-- Estado del abonado
CREATE TYPE abonado_status AS ENUM ('active', 'paused', 'canceled'); -- 'canceled' americano, una L

-- Método de pago del abonado
CREATE TYPE abonado_payment_method AS ENUM ('cash', 'transfer');

-- Estado del jugador
CREATE TYPE player_status AS ENUM ('active', 'banned', 'suspended', 'anonymized');

-- Estado del staff user
CREATE TYPE staff_status AS ENUM ('active', 'inactive');

-- Rol del staff en un tenant
CREATE TYPE staff_role AS ENUM ('admin', 'receptionist', 'readonly');

-- Tipo de pago
CREATE TYPE payment_type AS ENUM (
  'deposit',       -- Seña de reserva
  'full_payment',  -- Pago completo de reserva
  'refund',        -- Reembolso
  'penalty'        -- Penalidad
);

-- Método de pago
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'mercadopago', 'other');

-- Estado del pago
CREATE TYPE payment_status AS ENUM (
  'pending',    -- Iniciado, esperando confirmación (incl. in_process CBU 24-48hs)
  'approved',   -- Pago exitoso
  'rejected',   -- Pago rechazado
  'refunded',   -- Reembolsado (total o parcial)
  'canceled'    -- Cancelado (americano, una L)
);

-- Tipo de movimiento de caja
CREATE TYPE cashflow_type AS ENUM ('income', 'expense');

-- Categoría de movimiento de caja (simplificado — Doc 7 §6)
CREATE TYPE cashflow_category AS ENUM (
  'booking',              -- Cobro de reserva
  'product_sale',         -- Venta de cantina
  'other'                 -- Otros ingresos/egresos
);



-- Tipo de destinatario de notificación
CREATE TYPE recipient_type AS ENUM ('player', 'staff', 'tenant_owner');

-- Canal de notificación
CREATE TYPE notification_channel AS ENUM ('email', 'push');

-- Estado de notificación
CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'delivered', 'failed');

-- Tipo de actor en audit log
CREATE TYPE audit_actor_type AS ENUM ('staff', 'player', 'system');
```

---

## 2. Tablas Globales (sin tenant_id, sin RLS)

### 2.1 `tenants` — Complejos deportivos

```sql
-- ============================================================
-- TABLA: tenants
-- La entidad raíz. Cada complejo es un tenant.
-- NO tiene tenant_id (ES el tenant).
-- NO tiene RLS (es global, pero protegida por auth).
-- ============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,          -- URL amigable: "complejo-san-martin"
  name            TEXT NOT NULL,
  description     TEXT,
  logo_url        TEXT,                          -- URL en Supabase Storage
  cover_url       TEXT,                          -- URL en Supabase Storage
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  province        TEXT NOT NULL,
  latitude        NUMERIC(10, 7),                -- Precisión: ~1.1 cm
  longitude       NUMERIC(10, 7),
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',

  -- Horarios de apertura (JSONB flexible por día de la semana)
  opening_hours   JSONB NOT NULL DEFAULT '{
    "mon": {"open": "08:00", "close": "00:00"},
    "tue": {"open": "08:00", "close": "00:00"},
    "wed": {"open": "08:00", "close": "00:00"},
    "thu": {"open": "08:00", "close": "00:00"},
    "fri": {"open": "08:00", "close": "01:00"},
    "sat": {"open": "09:00", "close": "01:00"},
    "sun": {"open": "09:00", "close": "23:00"}
  }'::JSONB,

  closed_dates    DATE[] DEFAULT '{}',           -- Feriados, vacaciones

  -- Estado del tenant (state machine Doc 6 §1)
  status          tenant_status NOT NULL DEFAULT 'trialing',
  trial_ends_at   TIMESTAMPTZ,                   -- Solo si status = 'trialing'

  -- Configuraciones del complejo (JSONB, desglose en Doc 6 §1)
  settings        JSONB NOT NULL DEFAULT '{
    "requires_deposit": true,
    "deposit_percentage": 30,
    "cancellation_policy": {
      "hours_before": 3,
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
    "booking_advance_days": 14,
    "booking_duration_minutes": [60, 90, 120],
    "auto_complete_minutes": 30
  }'::JSONB,

  -- Feature flag overrides por tenant (Doc 11 ADR-010)
  feature_overrides JSONB NOT NULL DEFAULT '{}',

  -- Credenciales OAuth de MercadoPago del complejo (para cobrar señas)
  -- El complejo conecta su cuenta MP durante el onboarding (Doc 4 §7, Doc 10 §2)
  -- IMPORTANTE: mp_access_token y mp_refresh_token se almacenan ENCRIPTADOS at-rest
  mp_access_token   TEXT,                        -- Token OAuth del complejo en MP (encriptado)
  mp_refresh_token  TEXT,                        -- Refresh token para renovar acceso (encriptado)
  mp_user_id        TEXT,                        -- ID de la cuenta de MP del complejo
  mp_public_key     TEXT,                        -- Clave pública para el frontend de checkout
  mp_connected_at   TIMESTAMPTZ,                 -- Cuándo conectó su cuenta

  -- Data retention
  scheduled_deletion_at TIMESTAMPTZ,             -- 90 días post-churn

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_city ON tenants(city);

COMMENT ON TABLE tenants IS 'Complejos deportivos. Entidad raíz del multi-tenancy.';
COMMENT ON COLUMN tenants.slug IS 'URL amigable. turnogol.com.ar/{slug}';
COMMENT ON COLUMN tenants.settings IS 'Configuraciones del complejo: seña, cancelación, medios de pago, etc.';
```

### 2.2 `players` — Jugadores (cross-tenant)

```sql
-- ============================================================
-- TABLA: players
-- Usuarios B2C. Cross-tenant: un jugador puede reservar en N complejos.
-- NO tiene tenant_id. NO tiene RLS de tenant.
-- Acceso controlado vía JOINs con tablas aisladas (Doc 12 §7).
-- ============================================================
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,                          -- Celular (opcional en registro)
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  avatar_url      TEXT,
  preferred_area  TEXT,                          -- Ciudad/zona preferida

  status          player_status NOT NULL DEFAULT 'active',
  ban_reason      TEXT,
  ban_until       TIMESTAMPTZ,                   -- NULL = ban permanente

  -- Términos y condiciones (Ley 26.061 — declaración jurada +18)
  agreed_to_terms_at TIMESTAMPTZ,               -- Cuándo aceptó los TyC (incluye declaración jurada de mayoría de edad)
  terms_version   TEXT,                         -- Versión de los TyC aceptados (ej: '2026-04')

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

-- Índices
CREATE UNIQUE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_phone ON players(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_players_status ON players(status);

COMMENT ON TABLE players IS 'Jugadores (B2C). Cross-tenant: reservan en múltiples complejos.';
```

### 2.3 `staff_users` — Usuarios del sistema (cross-tenant)

```sql
-- ============================================================
-- TABLA: staff_users
-- Usuarios del panel admin. Un staff puede ser admin de N complejos.
-- Su relación con tenants está en tenant_staff_members.
-- ============================================================
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
```

### 2.4 `plans` — Planes de suscripción SaaS

```sql
-- ============================================================
-- TABLA: plans
-- Planes globales del SaaS. Definidos por TurnoGol, no por cada tenant.
-- Los feature flags de cada plan se almacenan en JSONB (ADR-010).
-- ============================================================
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                 -- 'Básico', 'Estándar', 'Full'
  slug            TEXT NOT NULL UNIQUE,          -- 'basico', 'estandar', 'full'
  max_courts      INTEGER,                       -- NULL = ilimitado
  max_staff       INTEGER,                       -- NULL = ilimitado

  features        JSONB NOT NULL DEFAULT '{
    "history_months": 6,
    "advanced_reports": false,
    "export_formats": ["csv_basic"],
    "api_access": false,
    "support_channels": ["email"],
    "auto_collect_abonados": true
  }'::JSONB,

  price_monthly   INTEGER NOT NULL,              -- Centavos ARS
  price_annual    INTEGER NOT NULL,              -- Centavos ARS (mensualizado)

  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,    -- Orden de presentación en UI

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plans IS 'Planes de suscripción SaaS. Globales, no por tenant.';
COMMENT ON COLUMN plans.price_monthly IS 'Precio mensual en centavos ARS. Ej: $88.000 = 8800000';
COMMENT ON COLUMN plans.max_courts IS 'NULL = ilimitado. Valor numérico = límite del plan.';
```

### 2.5 `price_versions` — Historial de precios de planes

```sql
-- ============================================================
-- TABLA: price_versions
-- Versionado de precios para manejar inflación ARS (Doc 4 §5).
-- Cada cambio de precio crea una nueva versión. No se editan las existentes.
-- ============================================================
CREATE TABLE price_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES plans(id),
  price_monthly   INTEGER NOT NULL,              -- Centavos ARS
  price_annual    INTEGER NOT NULL,              -- Centavos ARS (mensualizado)
  valid_from      DATE NOT NULL,                 -- Fecha desde la que aplica
  valid_until     DATE,                          -- NULL = vigente
  reason          TEXT,                          -- "Ajuste por inflación Q2 2026"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_versions_plan ON price_versions(plan_id, valid_from DESC);

COMMENT ON TABLE price_versions IS 'Historial de precios. INSERT only. Nunca UPDATE.';
```

### 2.6 `processed_webhooks` — Idempotencia de webhooks

```sql
-- ============================================================
-- TABLA: processed_webhooks
-- Garantiza idempotencia de webhooks de MercadoPago (Doc 4 §7).
-- Antes de procesar un webhook, se verifica si ya fue procesado.
-- ============================================================
CREATE TABLE processed_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_event_id     TEXT NOT NULL UNIQUE,          -- ID del evento de MercadoPago
  event_type      TEXT NOT NULL,                 -- 'payment', 'subscription', etc.
  payload         JSONB,                         -- Payload original (para debugging)
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_processed_webhooks_mp_id ON processed_webhooks(mp_event_id);

COMMENT ON TABLE processed_webhooks IS 'Idempotencia de webhooks. INSERT ante cada webhook, ON CONFLICT = ya procesado.';
```

---

## 3. Tablas Aisladas (con tenant_id, con RLS)

### 3.1 `courts` — Canchas

```sql
-- ============================================================
-- TABLA: courts
-- Canchas del complejo. Cada cancha es independiente (sin transformables).
-- ============================================================
CREATE TABLE courts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                 -- "Cancha 1", "Cancha Norte"
  description     TEXT,
  surface_type    surface_type NOT NULL DEFAULT 'synthetic_grass',
  capacity        INTEGER NOT NULL,              -- Cantidad de jugadores (10, 14, 22)
  photos          TEXT[] DEFAULT '{}',           -- URLs en Supabase Storage

  status          court_status NOT NULL DEFAULT 'active',

  -- Precios por franja horaria (JSONB flexible)
  pricing         JSONB NOT NULL DEFAULT '{
    "weekday_morning":   {"price": 800000,  "hours": ["08:00-12:00"]},
    "weekday_afternoon": {"price": 1000000, "hours": ["12:00-18:00"]},
    "weekday_night":     {"price": 1200000, "hours": ["18:00-23:00"]},
    "weekend_morning":   {"price": 1000000, "hours": ["08:00-14:00"]},
    "weekend_night":     {"price": 1500000, "hours": ["14:00-23:00"]}
  }'::JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_capacity_positive CHECK (capacity > 0)
);

-- Índices
CREATE INDEX idx_courts_tenant ON courts(tenant_id);
CREATE INDEX idx_courts_tenant_status ON courts(tenant_id, status);

-- RLS
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON courts FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON courts FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON courts FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON courts FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE courts IS 'Canchas del complejo. Cada cancha es independiente.';
COMMENT ON COLUMN courts.pricing IS 'Precios en centavos ARS por franja horaria.';
```

### 3.2 `bookings` — Reservas (la tabla más crítica)

```sql
-- ============================================================
-- TABLA: bookings
-- Entidad central del sistema. Toda reserva de cancha.
-- State machine documentada en Doc 6 §3.
-- Concurrencia documentada en Doc 5 §9.
-- ============================================================
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  court_id        UUID NOT NULL REFERENCES courts(id),
  player_id       UUID REFERENCES players(id),   -- NULL si es bloqueo o sin jugador registrado
  abonado_id      UUID REFERENCES abonados(id),  -- Populated si viene de turno fijo
  created_by_staff UUID REFERENCES staff_users(id), -- Quién la creó si fue manual

  date            DATE NOT NULL,                 -- Fecha de la reserva (en timezone del complejo)
  time_start      TIME NOT NULL,
  time_end        TIME NOT NULL,

  type            booking_type NOT NULL DEFAULT 'spontaneous',
  status          booking_status NOT NULL DEFAULT 'pending_payment',

  -- Precio y seña
  price_snapshot  INTEGER NOT NULL,              -- Precio en centavos ARS al momento de crear (INMUTABLE)
  deposit_amount  INTEGER NOT NULL DEFAULT 0,    -- Monto de seña en centavos (0 si no se exigió)
  deposit_status  deposit_status NOT NULL DEFAULT 'not_required',
  payment_id      UUID REFERENCES payments(id),  -- Cobro de la seña

  -- Notas
  notes_internal  TEXT,                          -- Solo visible para staff
  notes_player    TEXT,                          -- Visible para el jugador

  -- Cancelación
  canceled_reason TEXT,
  canceled_by     cancellation_actor,
  canceled_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_time_valid CHECK (time_end > time_start),
  CONSTRAINT chk_price_positive CHECK (price_snapshot >= 0),
  CONSTRAINT chk_deposit_non_negative CHECK (deposit_amount >= 0)
);

-- ==============================================================
-- EXCLUSION CONSTRAINT: Previene doble booking en la misma cancha
-- Dos reservas activas no pueden tener overlap de horario
-- en la misma cancha. Esto es el guardián contra race conditions.
-- Requiere la extensión btree_gist.
-- ==============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exclusion constraint: no overlap de bookings activos en la misma cancha+fecha
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

-- Índices
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, date);
CREATE INDEX idx_bookings_tenant_court_date ON bookings(tenant_id, court_id, date);
CREATE INDEX idx_bookings_player ON bookings(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_bookings_abonado ON bookings(abonado_id) WHERE abonado_id IS NOT NULL;
CREATE INDEX idx_bookings_status ON bookings(tenant_id, status);
CREATE INDEX idx_bookings_date_status ON bookings(tenant_id, date, status);

-- RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy staff: ve bookings de su tenant
CREATE POLICY tenant_isolation_select ON bookings FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Policy jugador: ve SUS PROPIAS reservas en todos los complejos (cross-tenant)
-- El middleware setea app.current_player_id cuando el JWT es de tipo 'player'
-- Múltiples policies en la misma tabla se evalúan con OR (Supabase/PG behavior)
CREATE POLICY player_own_bookings_select ON bookings FOR SELECT
  USING (
    player_id IS NOT NULL AND
    player_id = current_setting('app.current_player_id', true)::UUID
  );

-- Policy Realtime (Supabase subscriptions usan JWT, no current_setting)
-- Permite que el cliente Supabase reciba eventos en tiempo real de su tenant
CREATE POLICY realtime_tenant_select ON bookings FOR SELECT
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

CREATE POLICY tenant_isolation_insert ON bookings FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON bookings FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON bookings FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Index para mp_preference_id (búsqueda por webhook de seña)
CREATE INDEX idx_payments_mp_preference ON payments(mp_preference_id) WHERE mp_preference_id IS NOT NULL;

COMMENT ON TABLE bookings IS 'Reservas de cancha. Entidad central del sistema.';
COMMENT ON COLUMN bookings.price_snapshot IS 'Precio en centavos ARS al momento de crear. NUNCA se modifica después.';
COMMENT ON COLUMN bookings.status IS 'State machine: pending_payment → confirmed → completed/no_show/canceled_*.';
```

### 3.3 `abonados` — Turnos fijos recurrentes

```sql
-- ============================================================
-- TABLA: abonados
-- Acuerdos de turno fijo semanal. Genera instancias de booking.
-- State machine documentada en Doc 6 §4.
-- ============================================================
CREATE TABLE abonados (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  court_id         UUID NOT NULL REFERENCES courts(id),
  player_id        UUID REFERENCES players(id),   -- Responsable del grupo (puede no ser jugador registrado)
  contact_name     TEXT NOT NULL,
  contact_phone    TEXT NOT NULL,                  -- Teléfono del responsable

  day_of_week      SMALLINT NOT NULL,              -- 0=Domingo ... 6=Sábado
  time_start       TIME NOT NULL,
  time_end         TIME NOT NULL,

  price_per_session INTEGER NOT NULL,              -- Centavos ARS (puede diferir de lista)
  monthly_price    INTEGER NOT NULL,               -- ≈ price_per_session × 4.33

  starts_on        DATE NOT NULL,
  ends_on          DATE,                           -- NULL = indefinido

  status           abonado_status NOT NULL DEFAULT 'active',
  payment_method   abonado_payment_method NOT NULL DEFAULT 'cash',

  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_abonado_time_valid CHECK (time_end > time_start),
  CONSTRAINT chk_abonado_day_valid CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_abonado_price_positive CHECK (price_per_session > 0)
);

-- Exclusion: no overlap de abonados activos en la misma cancha+día+horario
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

-- Índices
CREATE INDEX idx_abonados_tenant ON abonados(tenant_id);
CREATE INDEX idx_abonados_tenant_status ON abonados(tenant_id, status);
CREATE INDEX idx_abonados_court ON abonados(tenant_id, court_id);
CREATE INDEX idx_abonados_player ON abonados(player_id) WHERE player_id IS NOT NULL;

-- RLS
ALTER TABLE abonados ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON abonados FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON abonados FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON abonados FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON abonados FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE abonados IS 'Turnos fijos semanales. Genera instancias de booking automáticamente.';
```

### 3.4 `payments` — Cobros

```sql
-- ============================================================
-- TABLA: payments
-- Transacciones financieras. Inmutables después de aprobadas.
-- Para reembolsos, se crea un nuevo payment de tipo 'refund'.
-- ============================================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  booking_id      UUID REFERENCES bookings(id),  -- NULL si es pago de suscripción SaaS
  player_id       UUID REFERENCES players(id),

  amount          INTEGER NOT NULL,              -- Centavos ARS (SIEMPRE positivo)
  currency        TEXT NOT NULL DEFAULT 'ARS',
  type            payment_type NOT NULL,
  method          payment_method NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',

  -- MercadoPago
  mp_payment_id   TEXT UNIQUE,                   -- ID del pago en MP (idempotencia)
  mp_preference_id TEXT,                         -- ID de la preferencia generada

  description     TEXT,

  processed_at    TIMESTAMPTZ,                   -- Cuándo se procesó efectivamente
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_payment_amount_positive CHECK (amount > 0)
);

-- Índices
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_booking ON payments(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_payments_player ON payments(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_payments_mp_id ON payments(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX idx_payments_tenant_status ON payments(tenant_id, status);
CREATE INDEX idx_payments_tenant_created ON payments(tenant_id, created_at);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON payments FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON payments FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON payments FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON payments FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE payments IS 'Cobros financieros. Inmutables post-aprobación. amount siempre en centavos ARS.';
COMMENT ON COLUMN payments.mp_payment_id IS 'UNIQUE: garantiza idempotencia de webhooks de MercadoPago.';
```

### 3.5 `cash_flows` — Movimientos de caja

```sql
-- ============================================================
-- TABLA: cash_flows
-- Todo movimiento de dinero del complejo. Categorías simplificadas:
-- booking, product_sale, other (Doc 7 §6).
-- ============================================================
CREATE TABLE cash_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  type            cashflow_type NOT NULL,
  category        cashflow_category NOT NULL,

  amount          INTEGER NOT NULL,              -- Centavos ARS (SIEMPRE positivo)
  method          payment_method NOT NULL,
  description     TEXT NOT NULL,

  -- Relaciones opcionales
  booking_id      UUID REFERENCES bookings(id),
  product_id      UUID REFERENCES products(id),

  registered_by   UUID NOT NULL REFERENCES staff_users(id),
  occurred_at     TIMESTAMPTZ NOT NULL,          -- Cuándo ocurrió (puede diferir de created_at)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_cashflow_amount_positive CHECK (amount > 0)
);

-- Índices
CREATE INDEX idx_cash_flows_tenant ON cash_flows(tenant_id);
CREATE INDEX idx_cash_flows_tenant_date ON cash_flows(tenant_id, occurred_at);
CREATE INDEX idx_cash_flows_tenant_type ON cash_flows(tenant_id, type);
CREATE INDEX idx_cash_flows_tenant_category ON cash_flows(tenant_id, category);

-- RLS
ALTER TABLE cash_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON cash_flows FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON cash_flows FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON cash_flows FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON cash_flows FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE cash_flows IS 'Movimientos de caja. income/expense por categoría.';
```

### 3.6 `products` — Productos de cantina/stock

```sql
-- ============================================================
-- TABLA: products
-- Stock de cantina del complejo (bebidas, comida, equipamiento).
-- ============================================================
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                 -- "Gaseosa", "Pelota"
  sku             TEXT,                          -- Código interno
  category        TEXT,                          -- "bebida", "comida", "equipamiento"
  price           INTEGER NOT NULL,              -- Centavos ARS
  stock           INTEGER NOT NULL DEFAULT 0,
  low_stock_alert INTEGER NOT NULL DEFAULT 5,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_product_price_positive CHECK (price > 0),
  CONSTRAINT chk_product_stock_non_negative CHECK (stock >= 0)
);

-- Índices
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON products FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON products FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON products FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON products FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```


### 3.7 `tenant_staff_members` — Relación staff ↔ tenant

```sql
-- ============================================================
-- TABLA: tenant_staff_members
-- Tabla de unión: un staff puede tener roles en N complejos.
-- "Marcelo es admin de Complejo A y recepcionista de Complejo B"
-- ============================================================
CREATE TABLE tenant_staff_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  staff_user_id   UUID NOT NULL REFERENCES staff_users(id),
  role            staff_role NOT NULL DEFAULT 'readonly',
  added_by        UUID REFERENCES staff_users(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un staff solo puede tener un rol por tenant
  CONSTRAINT uq_tenant_staff UNIQUE (tenant_id, staff_user_id)
);

-- Índices
CREATE INDEX idx_tenant_staff_tenant ON tenant_staff_members(tenant_id);
CREATE INDEX idx_tenant_staff_user ON tenant_staff_members(staff_user_id);
CREATE INDEX idx_tenant_staff_active ON tenant_staff_members(tenant_id, is_active);

-- RLS
ALTER TABLE tenant_staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON tenant_staff_members FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON tenant_staff_members FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON tenant_staff_members FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON tenant_staff_members FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

### 3.10 `tenant_subscriptions` — Suscripción SaaS del complejo

```sql
-- ============================================================
-- TABLA: tenant_subscriptions
-- La suscripción mensual/anual del complejo a TurnoGol.
-- Un tenant tiene exactamente UNA suscripción activa (UNIQUE).
-- ============================================================
CREATE TABLE tenant_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) UNIQUE, -- 1:1 con tenant
  plan_id               UUID NOT NULL REFERENCES plans(id),
  billing_cycle         billing_cycle NOT NULL DEFAULT 'monthly',
  status                subscription_status NOT NULL DEFAULT 'trialing',

  current_period_start  TIMESTAMPTZ NOT NULL,
  current_period_end    TIMESTAMPTZ NOT NULL,
  price_locked_until    TIMESTAMPTZ,             -- Clientes anuales con precio congelado

  -- MercadoPago
  mp_subscription_id    TEXT,                    -- ID de la suscripción en MP

  -- Cambios de plan pendientes (downgrade se aplica al próximo ciclo)
  pending_plan_change   UUID REFERENCES plans(id),
  pending_change_at     TIMESTAMPTZ,

  -- Cancelación
  canceled_at           TIMESTAMPTZ,
  cancellation_reason   TEXT,

  -- Data retention
  scheduled_deletion_at TIMESTAMPTZ,             -- 90 días post-churn

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_tenant_subs_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subs_status ON tenant_subscriptions(status);
CREATE INDEX idx_tenant_subs_period_end ON tenant_subscriptions(current_period_end);

-- RLS
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON tenant_subscriptions FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON tenant_subscriptions FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON tenant_subscriptions FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON tenant_subscriptions FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

COMMENT ON TABLE tenant_subscriptions IS 'Suscripción SaaS del complejo. 1:1 con tenants.';
```

### 3.11 `notifications` — Notificaciones enviadas

```sql
-- ============================================================
-- TABLA: notifications
-- Registro de cada notificación. Permite auditar comunicaciones.
-- ============================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),   -- NULL para notificaciones del sistema

  recipient_type  recipient_type NOT NULL,
  recipient_id    UUID NOT NULL,                 -- FK a players o staff_users
  channel         notification_channel NOT NULL,
  trigger_event   TEXT NOT NULL,                 -- 'booking.confirmed', 'trial.day_21', etc.

  status          notification_status NOT NULL DEFAULT 'queued',
  content         JSONB NOT NULL,                -- El contenido del mensaje
  template_name   TEXT,                          -- Nombre del template de email usado

  attempt_count   INTEGER NOT NULL DEFAULT 1,
  last_error      TEXT,

  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_trigger ON notifications(trigger_event);
CREATE INDEX idx_notifications_queued ON notifications(status, queued_at)
  WHERE status = 'queued';

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON notifications FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON notifications FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON notifications FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON notifications FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

### 3.10 `audit_logs` — Registro de auditoría

```sql
-- ============================================================
-- TABLA: audit_logs
-- INSERT ONLY. Nunca UPDATE, nunca DELETE.
-- Documenta quién hizo qué, cuándo, y qué cambió.
-- Retención: 12 meses mínimo (Doc 5 §6).
-- ============================================================
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  actor_id        UUID NOT NULL,                 -- Quién (staff_user, player o system UUID)
  actor_type      audit_actor_type NOT NULL,
  action          TEXT NOT NULL,                 -- 'booking.created', 'payment.refunded', etc.

  resource_type   TEXT NOT NULL,                 -- 'booking', 'payment', 'court', etc.
  resource_id     UUID NOT NULL,                 -- ID del objeto afectado

  before_state    JSONB,                         -- Estado antes del cambio (NULL si es CREATE)
  after_state     JSONB,                         -- Estado después del cambio (NULL si es DELETE)
  metadata        JSONB,                         -- IP, user agent, motivo, etc.

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(tenant_id, actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(tenant_id, action);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON audit_logs FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON audit_logs FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
-- NO hay UPDATE ni DELETE policies: audit_logs es INSERT ONLY

-- Revocar UPDATE y DELETE para el rol de la app
REVOKE UPDATE, DELETE ON audit_logs FROM turnogol_app;

COMMENT ON TABLE audit_logs IS 'Registro de auditoría. INSERT ONLY. Retención 12 meses.';
COMMENT ON COLUMN audit_logs.action IS 'Formato: resource_type.verb → booking.created, payment.refunded';
```

### 3.11 `tenant_player_bans` — Bans de jugadores por complejo

```sql
-- ============================================================
-- TABLA: tenant_player_bans
-- Ban de un jugador en un complejo específico (no global).
-- Los bans globales se manejan con players.status = 'banned'.
-- ============================================================
CREATE TABLE tenant_player_bans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  player_id       UUID NOT NULL REFERENCES players(id),

  reason          TEXT NOT NULL,
  banned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_until    TIMESTAMPTZ,                   -- NULL = permanente
  banned_by       UUID REFERENCES staff_users(id),

  -- Un jugador solo puede tener un ban activo por complejo
  CONSTRAINT uq_tenant_player_ban UNIQUE (tenant_id, player_id)
);

-- Índices
CREATE INDEX idx_tenant_player_bans_tenant ON tenant_player_bans(tenant_id);
CREATE INDEX idx_tenant_player_bans_player ON tenant_player_bans(player_id);

-- RLS
ALTER TABLE tenant_player_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON tenant_player_bans FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON tenant_player_bans FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON tenant_player_bans FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON tenant_player_bans FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
```

### 3.12 `player_tenant_relationships` — Relación jugador ↔ complejo

```sql
-- ============================================================
-- TABLA: player_tenant_relationships
-- Registra la relación entre un jugador y cada complejo donde
-- ha interactuado. Habilita: lista negra, historial de no-shows
-- por complejo, consentimiento de datos y derecho al olvido granular.
-- Creada automáticamente en la primera reserva del jugador en un complejo.
-- ============================================================
CREATE TABLE player_tenant_relationships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  player_id        UUID NOT NULL REFERENCES players(id),

  -- Métricas de comportamiento (actualizadas por triggers/jobs)
  bookings_count   INTEGER NOT NULL DEFAULT 0,      -- Total de reservas
  noshow_count     INTEGER NOT NULL DEFAULT 0,      -- Total de no-shows
  last_booking_at  TIMESTAMPTZ,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Estado de la relación
  status           TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'blocked'
                   CHECK (status IN ('active', 'blocked')),

  -- Consentimiento de datos (Ley 25.326)
  -- El jugador consintió que este complejo vea sus datos al hacer la primera reserva
  data_consent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un jugador tiene una única relación por complejo
  CONSTRAINT uq_player_tenant UNIQUE (player_id, tenant_id)
);

-- Índices
CREATE INDEX idx_ptr_tenant ON player_tenant_relationships(tenant_id);
CREATE INDEX idx_ptr_player ON player_tenant_relationships(player_id);
CREATE INDEX idx_ptr_tenant_status ON player_tenant_relationships(tenant_id, status);

-- RLS: el complejo solo ve sus propias relaciones
ALTER TABLE player_tenant_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON player_tenant_relationships FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON player_tenant_relationships FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON player_tenant_relationships FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- El jugador puede ver en qué complejos tiene relación activa
-- (para implementar "mis complejos" en el perfil del jugador)
CREATE POLICY player_own_relationships_select ON player_tenant_relationships FOR SELECT
  USING (
    player_id = current_setting('app.current_player_id', true)::UUID
  );

COMMENT ON TABLE player_tenant_relationships IS
  'Relación jugador ↔ complejo. Creada en primera reserva. Habilita historial, no-shows y lista negra por complejo.';
```

### 3.13 `daily_cash_closes` — Cierres de caja diarios

```sql
-- ============================================================
-- TABLA: daily_cash_closes
-- Registro de cierre de caja por día. Generado en Flujo 9 §4.
-- Una vez cerrado, es INMUTABLE (no se edita el pasado).
-- Correcciones post-cierre se registran en cash_flows compensatorios.
-- ============================================================
CREATE TABLE daily_cash_closes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),

  date             DATE NOT NULL,                   -- El día que se está cerrando

  -- Totales calculados automáticamente de cash_flows del día
  total_income     INTEGER NOT NULL DEFAULT 0,      -- Centavos ARS (suma de ingresos)
  total_expense    INTEGER NOT NULL DEFAULT 0,      -- Centavos ARS (suma de egresos)
  balance          INTEGER NOT NULL DEFAULT 0,      -- total_income - total_expense

  -- Efectivo del cajón (declarado manualmente por el admin)
  declared_cash    INTEGER NOT NULL DEFAULT 0,      -- Lo que hay físicamente en el cajón
  diff_amount      INTEGER NOT NULL DEFAULT 0,      -- declared_cash - balance_esperado_efectivo

  -- Metadata
  note             TEXT,                            -- Observaciones del cierre
  closed_by        UUID NOT NULL REFERENCES staff_users(id),
  closed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_daily_close_per_tenant UNIQUE (tenant_id, date),
  CONSTRAINT chk_income_non_negative CHECK (total_income >= 0),
  CONSTRAINT chk_expense_non_negative CHECK (total_expense >= 0)
);

-- Índices
CREATE INDEX idx_daily_closes_tenant ON daily_cash_closes(tenant_id);
CREATE INDEX idx_daily_closes_tenant_date ON daily_cash_closes(tenant_id, date DESC);

-- RLS
ALTER TABLE daily_cash_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON daily_cash_closes FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_insert ON daily_cash_closes FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
-- NO UPDATE ni DELETE: el cierre es inmutable. Correcciones = nuevos cash_flows compensatorios.
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;

COMMENT ON TABLE daily_cash_closes IS
  'Cierre de caja diario. INMUTABLE post-cierre. Correcciones = cash_flows compensatorios.';
COMMENT ON COLUMN daily_cash_closes.diff_amount IS
  'Diferencia entre efectivo declarado y balance esperado. Positivo = sobrante, negativo = faltante.';
```

---

## 4. Triggers y Funciones

### 4.1 Auto-update de `updated_at`

```sql
-- ============================================================
-- TRIGGER: Actualizar updated_at automáticamente en cada UPDATE
-- Se aplica a todas las tablas que tienen updated_at.
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON abonados
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

### 4.2 Inmutabilidad de reservas completadas

```sql
-- ============================================================
-- TRIGGER: Prevenir modificación de reservas en estado final
-- (completed, no_show, expired) — Doc 6 §3 Invariante 3.
-- Solo se permite agregar/editar notes_internal.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_immutable_booking_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('completed', 'no_show', 'expired') THEN
    -- Permitir SOLO cambio de notes_internal
    IF (
      NEW.status = OLD.status AND
      NEW.court_id = OLD.court_id AND
      NEW.player_id IS NOT DISTINCT FROM OLD.player_id AND
      NEW.date = OLD.date AND
      NEW.time_start = OLD.time_start AND
      NEW.time_end = OLD.time_end AND
      NEW.price_snapshot = OLD.price_snapshot AND
      NEW.deposit_amount = OLD.deposit_amount
    ) THEN
      RETURN NEW; -- Solo notas cambiaron, OK
    ELSE
      RAISE EXCEPTION 'No se puede modificar una reserva en estado %', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_booking_immutability
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_booking_changes();
```

### 4.3 Inmutabilidad de price_snapshot

```sql
-- ============================================================
-- TRIGGER: El price_snapshot de una reserva NUNCA se modifica
-- después de la creación (Doc 6 §3 Invariante 2).
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_price_snapshot_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.price_snapshot != NEW.price_snapshot THEN
    RAISE EXCEPTION 'price_snapshot es inmutable después de la creación de la reserva.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_price_snapshot_immutability
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_price_snapshot_change();
```

---

## 5. Seed Data — Datos Iniciales

```sql
-- ============================================================
-- SEED: Planes de suscripción (datos globales del sistema)
-- Precios basados en Doc 4 — Monetización
-- ============================================================
INSERT INTO plans (name, slug, max_courts, max_staff, price_monthly, price_annual, sort_order, features) VALUES
(
  'Básico', 'basico', 3, 2,
  5500000,   -- $55.000 ARS en centavos
  3685000,   -- $36.850 ARS en centavos (mensualizado, 33% descuento anual)
  1,
  '{"history_months": 6, "advanced_reports": false, "export_formats": ["csv_basic"], "api_access": false, "support_channels": ["email"]}'
),
(
  'Estándar', 'estandar', 6, 5,
  8800000,   -- $88.000 ARS
  5896000,   -- $58.960 ARS (33% descuento anual)
  2,
  '{"history_months": 12, "advanced_reports": true, "export_formats": ["csv_basic", "csv_full"], "api_access": false, "support_channels": ["email"]}'
),
(
  'Full', 'full', NULL, NULL,  -- NULL = ilimitado
  12000000,  -- $120.000 ARS
  8040000,   -- $80.400 ARS (33% descuento anual)
  3,
  '{"history_months": null, "advanced_reports": true, "export_formats": ["csv_basic", "csv_full", "excel"], "api_access": true, "support_channels": ["email", "priority_email"]}'
);

-- Versión de precios inicial
INSERT INTO price_versions (plan_id, price_monthly, price_annual, valid_from, reason)
SELECT id, price_monthly, price_annual, '2026-04-01', 'Precio de lanzamiento'
FROM plans;
```

---

## 6. Mapa de Relaciones (ERD Textual)

```
┌─────────────────────────────────────────────────────────────────┐
│                        TABLAS GLOBALES                          │
│                                                                 │
│  plans ◄──── price_versions                                     │
│    │                                                            │
│    │  1:N                                                       │
│    │                                                            │
│  tenants (+ credenciales MP OAuth) ───────────────────────────┐ │
│    │ 1:1                                                       │ │
│    │                                                           │ │
│  tenant_subscriptions                                          │ │
│                                                                │ │
│  staff_users ─── tenant_staff_members ────────────────────────┘ │
│                                                                 │
│  players (+ agreed_to_terms_at)  [cross-tenant, sin RLS]        │
│    │                                                            │
│    └── player_tenant_relationships ──── tenants                 │
│         (RLS dual: staff ve por tenant, jugador ve los suyos)   │
│                                                                 │
│  processed_webhooks (idempotencia MP)                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            TABLAS AISLADAS (RLS por tenant_id)                  │
│                                                                 │
│  tenants (1) ──┬── courts (N) ────── bookings (N)              │
│                │                       │                       │
│                │                       ├── payments (N)        │
│                │                                               │
│                ├── abonados (N) ──── bookings (type='fixed')   │
│                │                                               │
│                ├── cash_flows (N)                              │
│                ├── daily_cash_closes (N)                       │
│                ├── products (N)                                │
│                ├── notifications (N)                           │
│                ├── audit_logs (N)                              │
│                ├── tenant_player_bans (N)                      │
│                └── tenant_staff_members (N)                    │
│                                                                 │
│  players ──┬── bookings.player_id (cross-tenant, RLS dual)     │
│            ├── tenant_player_bans.player_id                     │
│            └── player_tenant_relationships.player_id            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Resumen de Tablas

| # | Tabla | Tipo | RLS | Filas estimadas (Y1, 200 complejos) |
|---|---|---|---|---|
| 1 | `tenants` | Global | No | 200 |
| 2 | `players` | Global | No | 40.000 |
| 3 | `staff_users` | Global | No | 500 |
| 4 | `plans` | Global | No | 3 |
| 5 | `price_versions` | Global | No | ~12 |
| 6 | `processed_webhooks` | Global | No | ~50.000/año |
| 7 | `player_tenant_relationships` | Global* | Dual† | ~80.000 |
| 8 | `courts` | Aislada | Sí | 800 |
| 9 | `bookings` | Aislada | Dual† | ~2.400.000/año |
| 10 | `abonados` | Aislada | Sí | ~2.000 |
| 11 | `payments` | Aislada | Sí | ~1.200.000/año |
| 12 | `cash_flows` | Aislada | Sí | ~500.000/año |
| 13 | `daily_cash_closes` | Aislada | Sí | ~70.000/año |
| 14 | `products` | Aislada | Sí | ~2.000 |
| 15 | `tenant_staff_members` | Aislada | Sí | 500 |
| 16 | `tenant_subscriptions` | Aislada | Sí | 200 |
| 17 | `notifications` | Aislada | Sí | ~1.500.000/año |
| 18 | `audit_logs` | Aislada | Sí | ~3.000.000/año |
| 19 | `tenant_player_bans` | Aislada | Sí | ~500 |

**Total: 19 tablas** (7 globales + 12 aisladas con RLS).

> [!NOTE]
> **† RLS Dual**: `bookings` y `player_tenant_relationships` tienen dos tipos de policies que se evalúan con OR:
> - **Policy staff**: filtra por `app.current_tenant_id` (seteado por el middleware de staff)
> - **Policy jugador**: filtra por `app.current_player_id` (seteado por el middleware de player)
> - **Policy Realtime**: filtra por JWT `app_metadata.tenant_id` para Supabase subscriptions

> [!NOTE]
> **Las tablas más grandes** son `bookings` (~2.4M filas/año) y `audit_logs` (~3M filas/año).
> Con índices correctos en `tenant_id` + campos de filtro frecuente, PostgreSQL maneja
> estas cifras sin problemas en una instancia de 2-4GB de RAM.
> La tabla `audit_logs` necesitará una estrategia de archivado después de Year 2
> (mover logs > 12 meses a cold storage).

---

## 8. Queries Frecuentes y sus Índices

### 8.1 Grilla de disponibilidad (el query más ejecutado)

```sql
-- Ejecutado ~20-30 veces por turno del recepcionista por día
-- Target: < 500ms (Doc 5)

SELECT b.id, b.court_id, b.time_start, b.time_end, b.status, b.type,
       b.player_id, p.first_name, p.last_name, p.phone
FROM bookings b
LEFT JOIN players p ON p.id = b.player_id
WHERE b.date = $1                                -- fecha seleccionada
  AND b.status IN ('pending_payment', 'confirmed')
ORDER BY b.court_id, b.time_start;

-- Índice que lo soporta:
-- CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, date);
-- RLS filtra por tenant_id automáticamente
```

### 8.2 Verificación de disponibilidad para reservar

```sql
-- ¿Hay conflicto con una reserva existente en esta cancha/fecha/hora?

SELECT COUNT(*) FROM bookings
WHERE court_id = $1
  AND date = $2
  AND time_start < $4     -- $4 = time_end del nuevo slot
  AND time_end > $3       -- $3 = time_start del nuevo slot
  AND status IN ('pending_payment', 'confirmed');

-- Índice: idx_bookings_tenant_court_date
-- + Exclusion constraint como safety net
```

### 8.3 Reservas del jugador (cross-tenant)

```sql
-- Vista del jugador: sus reservas en todos los complejos

SELECT b.*, c.name as court_name, t.name as complex_name, t.address
FROM bookings b
JOIN courts c ON c.id = b.court_id
JOIN tenants t ON t.id = b.tenant_id
WHERE b.player_id = $1
  AND b.date >= CURRENT_DATE
ORDER BY b.date, b.time_start;

-- Índice: idx_bookings_player
-- Sin RLS de tenant (el jugador es cross-tenant)
```

### 8.4 Cierre de caja diario

```sql
-- Resumen del día para el admin

SELECT
  type,
  category,
  method,
  COUNT(*) as count,
  SUM(amount) as total_centavos
FROM cash_flows
WHERE occurred_at >= $1::DATE
  AND occurred_at < ($1::DATE + INTERVAL '1 day')
GROUP BY type, category, method
ORDER BY type, category;

-- Índice: idx_cash_flows_tenant_date
```

### 8.5 Dashboard del admin

```sql
-- Métricas del día

SELECT
  (SELECT COUNT(*) FROM bookings WHERE date = CURRENT_DATE AND status = 'confirmed') as bookings_today,
  (SELECT COUNT(*) FROM bookings WHERE date = CURRENT_DATE AND status = 'completed') as completed_today,
  (SELECT COUNT(*) FROM bookings WHERE date = CURRENT_DATE AND status = 'no_show') as no_shows_today,
  (SELECT COALESCE(SUM(amount), 0) FROM cash_flows
   WHERE type = 'income' AND occurred_at >= CURRENT_DATE) as revenue_today_centavos;
```

---

## 9. Extensiones PostgreSQL Requeridas

```sql
-- ============================================================
-- EXTENSIONES necesarias en PostgreSQL / Supabase
-- ============================================================

-- UUIDs como primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- O usar gen_random_uuid() que ya está disponible en PostgreSQL 13+

-- Para exclusion constraints (prevenir doble booking)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Para búsqueda de texto (nombres de jugadores, complejos)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

---

## 10. Migration Order

Las migrations deben ejecutarse en este orden por dependencias de foreign keys:

```
1. Extensiones (uuid-ossp, btree_gist, pg_trgm)
2. ENUMs (todos los tipos enumerados)
3. Tablas globales sin FK a otras tablas
   3.1  plans
   3.2  tenants
   3.3  players
   3.4  staff_users
   3.5  price_versions (FK → plans)
   3.6  processed_webhooks
4. Tablas aisladas sin FK cruzadas
   4.1  courts (FK → tenants)
   4.2  tenant_staff_members (FK → tenants, staff_users)
   4.3  tenant_subscriptions (FK → tenants, plans)
   4.4  products (FK → tenants)
   4.5  tenant_player_bans (FK → tenants, players)
   4.6  player_tenant_relationships (FK → tenants, players)
5. Tablas aisladas con FK cruzadas
   5.1  abonados (FK → tenants, courts, players)
   5.2  bookings (FK → tenants, courts, players, abonados) — SIN FK a payments aún
   5.3  payments (FK → tenants, bookings, players)
   5.4  ALTER bookings ADD FK payment_id → payments (referencia circular resuelta)
   5.5  cash_flows (FK → tenants, bookings, products)
   5.6  daily_cash_closes (FK → tenants, staff_users)
   5.7  notifications (FK → tenants)
   5.8  audit_logs (FK → tenants)
6. Triggers y funciones
7. Seed data (plans, price_versions)
8. RLS policies (todas las tablas aisladas)
```

> [!IMPORTANT]
> **La referencia circular bookings ↔ payments se resuelve así:**
> Primero se crea `bookings` sin la FK a `payments`.
> Luego se crea `payments` con FK a `bookings`.
> Finalmente se agrega la FK `bookings.payment_id → payments`.
