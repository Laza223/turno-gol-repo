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
COMMENT ON TYPE subscription_status IS
  'No incluye deleted porque al eliminarse el tenant, la fila de tenant_subscriptions se borra
   en cascada. El estado final de una suscripción antes de su eliminación física es churned.';

-- Ciclo de facturación
CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');

-- Estado de la cancha
CREATE TYPE court_status AS ENUM ('online', 'offline');

-- Tipo de superficie
CREATE TYPE surface_type AS ENUM (
  'synthetic_grass',  -- Césped sintético
  'natural_grass',    -- Césped natural
  'cement',           -- Cemento
  'tile'              -- Baldosa (antes indoor)
);

-- Tipo de reserva
CREATE TYPE booking_type AS ENUM (
  'spontaneous',  -- Reserva normal (online o manual)
  'fixed',        -- Turno fijo de abonado
  'block',        -- Bloqueo de cancha (mantenimiento, evento privado)
  'tournament'    -- Horas que posee un torneo (migr. 062, módulo Torneos). price_snapshot=0
);

-- Estado de la reserva (state machine más crítica del sistema)
CREATE TYPE booking_status AS ENUM (
  'pending_payment',      -- Esperando pago de seña (timeout 6 min)
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
CREATE TYPE player_status AS ENUM ('active', 'banned', 'anonymized');

-- Estado del staff user
CREATE TYPE staff_status AS ENUM ('active', 'inactive');

-- Rol del staff en un tenant (Modelo ATC, 2 roles — migración 029 quitó 'read_only')
--   admin   = Dueño. Acceso total; único que conecta MP, gestiona facturación y staff.
--   manager = Encargado permisivo. Grilla/reservas/caja, reportes, métricas y
--             configuración general. Sin sistema de PIN.
CREATE TYPE staff_role AS ENUM ('admin', 'manager');

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
  'pending',      -- Iniciado, esperando confirmación del webhook de MP
  'in_process',   -- En proceso (transferencias bancarias/CVU que tardan 24-48hs) — Fix #12 F1
  'approved',     -- Pago exitoso
  'rejected',     -- Pago rechazado
  'refunded',     -- Reembolsado (total o parcial)
  'canceled'      -- Cancelado (americano, una L)
);

-- Tipo de movimiento de caja ('expense' agregado en migración 025)
CREATE TYPE cashflow_type AS ENUM ('income', 'adjustment', 'expense');

CREATE TYPE cashflow_category AS ENUM (
  'booking',              -- Cobro de reserva
  'product_sale',         -- Venta de cantina
  'other',                -- Otros ingresos/egresos
  'no_show_correction',   -- Corrección compensatoria por no-show (Doc 7 Flujo 4D)
  'operating_expense',    -- Gasto operativo (migración 025) — legacy, la UI ya no lo ofrece
  'merchandise',          -- Gasto categorizado (migración 050)
  'salaries',             -- Gasto categorizado (migración 050)
  'utilities',            -- Gasto categorizado (migración 050)
  'maintenance',          -- Gasto categorizado (migración 050)
  'other_expense',        -- Gasto categorizado (migración 050)
  'tournament'            -- Inscripción a torneo (migración 066). Siempre con tournament_team_id
);
-- NOTA: 'abonado_payment' (migración 033, cambio #4) fue removida del enum en migración 042
-- (2026-07-10): el sistema de saldo a favor de abonados se descartó (modelo ATC no aplica a fútbol).



-- Tipo de destinatario de notificación
CREATE TYPE recipient_type AS ENUM ('player', 'staff', 'tenant_owner');

-- Canal de notificación
-- Canal de notificaciones POR EMAIL (registro de mails transaccionales).
-- v1 email-only para este registro (ADR-003). Las push notifications al admin NO
-- usan esta tabla: van por Web Push API con su propia tabla `push_subscriptions`
-- (ver §3.15) y se entregan directo al navegador, no se materializan acá.
CREATE TYPE notification_channel AS ENUM ('email');

-- Estado de notificación
CREATE TYPE notification_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed');

-- Tipo de actor en audit log
CREATE TYPE audit_actor_type AS ENUM ('staff', 'player', 'system');

-- Etiquetas de cliente sobre player_tenant_relationships (B12 / decisión v2 D3,
-- migración 074). ENUM CERRADO a propósito: sin texto libre sobre personas
-- (Ley 25.326). Labels en español en src/modules/relationships/player-tags.ts.
CREATE TYPE player_tag AS ENUM (
  'gets_credit',      -- Se le fía
  'no_credit',         -- No fiar (mutuamente excluyente con gets_credit)
  'group_organizer',   -- Organiza el grupo
  'agreed_price',       -- Tiene precio acordado
  'difficult'           -- Trato conflictivo
);
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
  whatsapp        TEXT,                          -- WhatsApp del complejo (solo display en página pública, no canal del sistema)
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

  -- Día operativo: si true, un día de opening_hours cuyo close <= open (ej.
  -- open 08:00, close 02:00) cierra en la madrugada del día calendario
  -- SIGUIENTE. Esos turnos pertenecen al MISMO día operativo (bookings.date =
  -- la noche anterior). El slot 23:00→00:00 se guarda con time_end='24:00'
  -- (TIME válido y > '23:00' → pasa chk_time_valid). Migración 035.
  closes_next_day BOOLEAN NOT NULL DEFAULT false,

  -- Estado del tenant (state machine Doc 6 §1)
  status          tenant_status NOT NULL DEFAULT 'trialing',
  trial_ends_at   TIMESTAMPTZ,                   -- Solo si status = 'trialing'
  -- Umbral en días del último aviso de fin de prueba enviado (el más chico).
  -- NULL = ninguno todavía. Gate de idempotencia del cron de avisos (migr. 068).
  trial_warning_days_sent INTEGER,

  -- Configuraciones del complejo (JSONB, desglose en Doc 6 §1)
  settings        JSONB NOT NULL DEFAULT '{
    "requires_deposit": true,
    "deposit_percentage": 30,
    "cancellation_policy": {
      "hours_before": 12,
      "penalty_type": "deposit",
      "penalty_amount": null
    },
    "accepts_cash": true,
    "accepts_transfer": true,
    "accepts_mercadopago": true,
    "allow_online_booking": true,
    "booking_advance_days": 6,
    "auto_complete_minutes": 30
  }'::JSONB,

  -- Feature flag overrides por tenant (Doc 11 ADR-010)
  feature_overrides JSONB NOT NULL DEFAULT '{}',

  -- Servicios del complejo para filtros/badges de la interfaz pública
  -- { duchas, estacionamiento, bar, parrilla, vestuario, wifi, techado, iluminacion }
  amenities       JSONB NOT NULL DEFAULT '{}',

  -- Facets denormalizados de las canchas 'online' (cambios #16/#17). Mantenidos por
  -- el trigger courts_recalc_from_price; evitan tocar courts (RLS-aislada) en la
  -- interfaz pública. NULL/{} = sin canchas online.
  from_price_cents INTEGER,                       -- "Desde $X" en las cards (centavos ARS)
  court_surfaces  TEXT[] NOT NULL DEFAULT '{}',   -- surface_type distintos disponibles
  court_formats   INTEGER[] NOT NULL DEFAULT '{}',-- formatos de Fútbol distintos disponibles

  -- Credenciales OAuth de MercadoPago del complejo (para cobrar señas)
  -- El complejo conecta su cuenta MP durante el onboarding (Doc 4 §7, Doc 10 §2)
  -- IMPORTANTE: mp_access_token y mp_refresh_token se almacenan ENCRIPTADOS at-rest
  mp_access_token   TEXT,                        -- Token OAuth del complejo en MP (encriptado)
  mp_refresh_token  TEXT,                        -- Refresh token para renovar acceso (encriptado)
  mp_user_id        TEXT,                        -- ID de la cuenta de MP del complejo. UNIQUE parcial
                                                 -- (migr. 069, WHERE mp_user_id IS NOT NULL): una cuenta
                                                 -- de MP cobra para UN solo complejo.
  mp_nickname       TEXT,                        -- Nombre visible de la cuenta MP conectada (migr. 069)
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
COMMENT ON COLUMN tenants.slug IS 'URL amigable. turnogol.app/{slug}';
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
  phone_hint8     TEXT,                          -- Últimos 8 dígitos, GENERATED ALWAYS ... STORED
                                                 -- (migr. 075). Solo lectura: la escribe Postgres, para
                                                 -- que el JOIN de sugerencia de /jugadores use índice.
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  avatar_url      TEXT,
  preferred_area  TEXT,                          -- Ciudad/zona preferida

  -- Preferencias de notificación del jugador (toggles en /perfil, migr. 024).
  -- notify_email solo gobierna emails opcionales (recordatorios); los
  -- transaccionales se envían siempre. notify_push: pipeline al jugador pendiente.
  notify_email    BOOLEAN NOT NULL DEFAULT true,
  notify_push     BOOLEAN NOT NULL DEFAULT true,

  status          player_status NOT NULL DEFAULT 'active',
  ban_reason      TEXT,
  ban_until       TIMESTAMPTZ,                   -- NULL = ban permanente

  -- Términos y condiciones (declaración jurada +18: capacidad CCyC/Ley 26.579 + consentimiento Ley 25.326; NO 26.061)
  agreed_to_terms_at TIMESTAMPTZ,               -- Cuándo aceptó los TyC (incluye declaración jurada de mayoría de edad)
  terms_version   TEXT,                         -- Versión de los TyC aceptados (ej: '2026-04')

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

-- Índices
CREATE UNIQUE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_phone ON players(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_players_status ON players(status);

-- RLS RELACIONAL en players (Fix #5 — Hallazgo cross-layer Opus 4.7)
-- players es tabla global (sin tenant_id), pero si no tiene RLS, un staff del Tenant A
-- podría ejecutar SELECT * FROM players y obtener PII de jugadores de otros complejos.
-- Solución: RLS basada en relación (player_tenant_relationships o bookings).
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Staff ve solo jugadores que tienen al menos una relación con su complejo
CREATE POLICY staff_can_see_related_players ON players FOR SELECT
  USING (
    -- El jugador tiene una PTR (relación) con el complejo del staff
    EXISTS (
      SELECT 1 FROM player_tenant_relationships ptr
      WHERE ptr.player_id = players.id
        AND ptr.tenant_id = current_setting('app.current_tenant_id', true)::UUID
    )
    -- O el propio jugador autenticado accediendo a su perfil
    OR id = current_setting('app.current_player_id', true)::UUID
  );

-- El jugador puede actualizar su propio perfil
CREATE POLICY player_update_self ON players FOR UPDATE
  USING (id = current_setting('app.current_player_id', true)::UUID)
  WITH CHECK (id = current_setting('app.current_player_id', true)::UUID);

-- INSERT: solo el sistema puede crear jugadores (registro, rol de servicio bypasea RLS)
-- Los background jobs usan service role que bypasea RLS. No se necesita policy de INSERT aquí.

COMMENT ON TABLE players IS 'Jugadores (B2C). Cross-tenant: reservan en múltiples complejos.';
COMMENT ON COLUMN players.status IS 'banned = ban global del sistema. anonymized = ARCO Ley 25.326. Bans per-tenant en tenant_player_bans.';
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

-- RLS RELACIONAL en staff_users (Fix #5 — Hallazgo cross-layer Opus 4.7)
-- staff_users es global. Sin RLS, un admin del Tenant A podría ver emails y datos
-- de todos los admins de TODOS los complejos de la plataforma.
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

-- Staff ve solo colegas que están en el mismo tenant
CREATE POLICY staff_see_same_tenant_staff ON staff_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_staff_members tsm
      WHERE tsm.staff_user_id = staff_users.id
        AND tsm.tenant_id = current_setting('app.current_tenant_id', true)::UUID
        AND tsm.is_active = true
    )
  );

-- El sistema (service role) bypasea RLS para onboarding y login. No se agregan policies
-- de INSERT/UPDATE aquí: esas operaciones se hacen siempre con el service role.

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
  name            TEXT NOT NULL,                 -- 'Predio', 'Complejo', 'Estadio'
  slug            TEXT NOT NULL UNIQUE,          -- 'predio', 'complejo', 'estadio'
  max_courts      INTEGER,                       -- NULL = ilimitado

  features        JSONB NOT NULL DEFAULT '{
    "history_months": 6,
    "export_formats": ["csv"],
    "api_access": false,
    "support_channels": ["email"]
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

> [!NOTE]
> **`features.history_months` es un soft-limit de query, NUNCA un borrado físico** (Decisión de auditoría 2026-07-21).
> El valor (6 / 12 / `null` = ilimitado) solo acota **hasta dónde hacia atrás** puede consultar y exportar
> el complejo su historial en la UI y los reportes. NO dispara ninguna purga ni `DELETE` de `bookings`,
> `payments`, `cash_flows` ni `audit_logs`: los datos viejos quedan intactos en la DB (los requiere la
> Ley 25.326 y la trazabilidad contable). Si el complejo sube de plan, el historial más antiguo vuelve a
> ser visible sin restaurar nada. Consistente con doc6 (entidad Plan, desglose de `features`).
> (Implementación de código pendiente: el gate se aplica en la capa de query/reportes, no en el schema.)

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
  format          INTEGER NOT NULL DEFAULT 5,    -- 4, 5, 6, 7, etc.
  is_covered      BOOLEAN NOT NULL DEFAULT false,
  has_lighting    BOOLEAN NOT NULL DEFAULT true,
  capacity        INTEGER NOT NULL,              -- Cantidad de jugadores (ej: format * 2)
  photos          TEXT[] DEFAULT '{}',           -- URLs en Supabase Storage

  status          court_status NOT NULL DEFAULT 'online',

  -- Precios por franja horaria (JSONB flexible — reglas de puntos de corte)
  pricing         JSONB NOT NULL DEFAULT '{
    "rules": [
      {"days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "price": 800000},
      {"days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "price": 1200000},
      {"days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "price": 1500000}
    ]
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
  -- Migr. 062: espejo exacto de abonado_id para el módulo Torneos. FK sin
  -- ON DELETE a propósito: borrar un torneo con horas tomadas tiene que fallar.
  tournament_id   UUID REFERENCES tournaments(id),
  created_by_staff UUID REFERENCES staff_users(id), -- Quién la creó si fue manual

  date            DATE NOT NULL,                 -- Día OPERATIVO (no calendario). Día operativo: un
                                                 -- turno de madrugada (01:00) de un complejo con
                                                 -- closes_next_day pertenece a la noche anterior.
  time_start      TIME NOT NULL,
  time_end        TIME NOT NULL,                 -- El slot 23:00→00:00 se guarda como '24:00'
                                                 -- (TIME válido, > '23:00' → pasa chk_time_valid).

  -- Instante físico absoluto en UTC (migr. 040/041). Fuente única para lógica
  -- fuerte ("ya pasó" / "falta X"); date/time_start/time_end quedan para día
  -- operativo y display.
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,

  type            booking_type NOT NULL DEFAULT 'spontaneous',
  status          booking_status NOT NULL DEFAULT 'pending_payment',

  -- Precio y seña
  price_snapshot  INTEGER NOT NULL,              -- Precio en centavos ARS al momento de crear (INMUTABLE)
  deposit_amount  INTEGER NOT NULL DEFAULT 0,    -- Monto de seña en centavos (0 si no se exigió)
  deposit_status  deposit_status NOT NULL DEFAULT 'not_required',
  payment_method  payment_method,                -- Medio de pago de la seña (nullable). Fuente de verdad
                                                 -- para reservas manuales donde no hay fila en payments.
                                                 -- Para pagos MP: derivar de payments.method vía FK payment_id.
  payment_id      UUID REFERENCES payments(id),  -- Cobro de la seña (MP)

  -- Notas
  notes_internal  TEXT,                          -- Solo visible para staff. Largo validado en la
                                                 -- capa app (Zod max 1000, createManualBookingSchema);
                                                 -- sin CHECK en DB (a diferencia de reviews.comment).
  notes_player    TEXT,                          -- Visible para el jugador (Zod max 1000)

  -- Datos del jugador no registrado (reserva manual sin player_id)
  guest_name      TEXT,                          -- Nombre del jugador si player_id IS NULL
  guest_phone     TEXT,                          -- Teléfono del jugador si player_id IS NULL

  -- Cancelación
  canceled_reason TEXT,
  canceled_by     cancellation_actor,
  canceled_at     TIMESTAMPTZ,

  -- Quién marcó completed manualmente, si fue el staff (migr. 047)
  completed_by_staff UUID REFERENCES staff_users(id),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_time_valid CHECK (time_end > time_start),  -- '24:00' es TIME válido y > '23:00': el slot que cierra a medianoche pasa
                                                            -- (día operativo, ver tenants.closes_next_day).
  CONSTRAINT chk_price_positive CHECK (price_snapshot >= 0),
  CONSTRAINT chk_deposit_non_negative CHECK (deposit_amount >= 0),
  -- Fix #13: Consistencia semántica entre payment_method y payment_id (Auditoría Opus 4.7 #2)
  -- Si payment_method='mercadopago' debe existir payment_id (el cobro está en payments).
  -- Para cash/transfer/other (cobro manual), payment_id IS NULL (el cobro está en cash_flows).
  -- payment_method IS NULL no exige deposit_status='not_required': la migración 009 relajó
  -- esta condición para permitir pending_payment con seña aún no reflejada en payment_method.
  CONSTRAINT chk_booking_payment_consistency CHECK (
    (payment_method = 'mercadopago' AND payment_id IS NOT NULL) OR
    (payment_method IN ('cash', 'transfer', 'other') AND payment_id IS NULL) OR
    (payment_method IS NULL)
  )
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

-- Policy Realtime: SOLO para rol 'authenticated' (clientes Supabase JS).
-- El rol turnogol_app (backend) queda sujeto ÚNICAMENTE a policies de current_setting.
-- Esto preserva la garantía fail-safe: sin contexto seteado = 0 filas incluso con JWT válido.
CREATE POLICY realtime_tenant_select ON bookings FOR SELECT
  TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );

-- Policy jugador INSERT: permite que el flujo B2C cree su propia reserva.
-- El middleware del endpoint de jugador NO setea app.current_tenant_id (es cross-tenant),
-- pero SÍ setea app.current_player_id. El tenant_id se deriva del tenant_slug validado
-- y se pasa explícitamente en el INSERT (ver doc12 §8.5).
CREATE POLICY player_self_insert ON bookings FOR INSERT
  WITH CHECK (
    player_id IS NOT NULL AND
    player_id = current_setting('app.current_player_id', true)::UUID AND
    tenant_id IS NOT NULL
  );

CREATE POLICY tenant_isolation_insert ON bookings FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_update ON bookings FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
CREATE POLICY tenant_isolation_delete ON bookings FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

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
CREATE INDEX idx_payments_mp_preference ON payments(mp_preference_id) WHERE mp_preference_id IS NOT NULL;

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
  -- Migr. 066. Equipo del torneo al que corresponde el cobro de inscripción.
  -- Sin ON DELETE: borrar un equipo que ya pagó tiene que fallar. Va SIEMPRE
  -- junto con category='tournament' (chk_cashflow_tournament_team, bidireccional).
  tournament_team_id UUID REFERENCES tournament_teams(id),

  registered_by   UUID NOT NULL REFERENCES staff_users(id),
  occurred_at     TIMESTAMPTZ NOT NULL,          -- Cuándo ocurrió (puede diferir de created_at)

  -- Fix #55: clave de idempotencia generada por el cliente (UUID v4). Evita que
  -- un doble-submit o reintento de red cree movimientos duplicados. UNIQUE
  -- parcial (WHERE client_idempotency_key IS NOT NULL, migr. 023).
  client_idempotency_key TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_cashflow_amount_positive CHECK (amount > 0),
  -- Combinaciones válidas de type+category (migración 025 sumó expense/operating_expense;
  -- migración 050 sumó los gastos categorizados; migración 066 sumó 'tournament')
  CONSTRAINT chk_cashflow_type_category CHECK (
    (type = 'income'     AND category IN ('booking', 'product_sale', 'other', 'tournament')) OR
    (type = 'adjustment' AND category IN ('other', 'no_show_correction')) OR
    (type = 'expense'    AND category IN ('operating_expense', 'merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'))
  ),
  -- Migr. 066. Bidireccional: categoría 'tournament' ⟺ hay equipo.
  CONSTRAINT chk_cashflow_tournament_team CHECK (
    (category = 'tournament') = (tournament_team_id IS NOT NULL)
  )
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

COMMENT ON TABLE cash_flows IS 'Movimientos de caja. Ingresos, ajustes y egresos (gastos).';
```

### 3.6 Cantina — tablas reales (`canteen_products`, `canteen_tabs`, `stock_movements`)

La tabla `products` original fue **eliminada** (migr. 046, 2026-07-17; con ella se borró también `cash_flows.product_id`, FK nunca poblada — decisión: `docs/decisions/2026-07-17-deprecate-products-table.md`). La cantina pasó primero a `tenants.settings.canteen_products` (JSONB), pero ese diseño **también quedó superado**: el rediseño "Caja y Cantina" (migrs. 048–051, 2026-07-22, `docs/decisions/2026-07-22-caja-cantina-redesign.md`) promovió la cantina a tres tablas reales, todas aisladas (`tenant_id` + RLS estándar):

- **`canteen_products`** — catálogo: `name`, `price` (centavos), `cost` opcional, `stock`/`min_stock` opcionales, `is_active` (soft-delete: nunca se borra una fila porque el ledger la referencia).
- **`canteen_tabs`** — fiados ("anotáselo al capitán"): la venta queda a cobrar con nombre libre; el `cash_flow` se crea recién al saldar (`settleTab`). `canteen_tab_status`: `open` | `paid` | `canceled`.
- **`stock_movements`** — ledger append-only de stock (`stock_movement_kind`: `purchase` | `sale` | `waste` | `courtesy` | `internal_use` | `adjustment`). Toda venta escribe líneas acá aunque el producto no controle stock: es auditoría y la fuente del ranking de ventas.

Una venta simple genera 1 fila en `cash_flows` (categoría `product_sale`) + N líneas en `stock_movements` (`cash_flow_id`). La key JSONB `tenants.settings.canteen_products` se backfilleó a `canteen_products` en la 048 y se **eliminó** en la 051 (muerta desde entonces). Módulo: `src/modules/canteen/`.

> [!NOTE]
> Esta sección resume el módulo Cantina para no dejar la referencia rota tras el rediseño; el detalle
> completo de columnas, constraints, índices y RLS de `canteen_products`/`canteen_tabs`/`stock_movements`
> (y del resto de tablas agregadas después de la v1.0 original de este documento — módulo Torneos,
> `daily_cash_opens`, `push_send_log`, `analytics_events`) **queda pendiente de documentar** en este doc.
> Fuente de verdad mientras tanto: `src/shared/db/migrations/048_canteen_tables.sql` y `src/shared/db/schema/{canteen-products,canteen-tabs,stock-movements}.ts`.


### 3.7 `tenant_staff_members` — Relación staff ↔ tenant

```sql
-- ============================================================
-- TABLA: tenant_staff_members
-- Un staff user puede operar en múltiples complejos.
-- 2 roles (Modelo ATC): 'admin' (dueño, acceso total) y 'manager' (encargado
-- permisivo: grilla/reservas/caja, reportes, configuración general). El gating de
-- acciones sensibles es por ROL en la capa de app (requireAdminStaff /
-- requireOperatorStaff), NO por PIN. No hay sistema de PIN.
-- ============================================================
CREATE TABLE tenant_staff_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  staff_user_id   UUID NOT NULL REFERENCES staff_users(id),
  role            staff_role NOT NULL DEFAULT 'admin',
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

### 3.8 `tenant_subscriptions` — Suscripción SaaS del complejo

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
  -- Con qué cuenta de MP paga el complejo, desacoplado del email de login
  -- (migr. 078). NULL = el del dueño (staff_users).
  mp_payer_email        TEXT,

  -- Cambios de plan pendientes (downgrade se aplica al próximo ciclo)
  pending_plan_change   UUID REFERENCES plans(id),
  pending_change_at     TIMESTAMPTZ,

  -- Cancelación
  canceled_at           TIMESTAMPTZ,
  cancellation_reason   TEXT,

  -- Data retention
  scheduled_deletion_at TIMESTAMPTZ,             -- 90 días post-churn

  -- Dunning (cobro fallido → past_due → suspended)
  dunning_started_at     TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  last_payment_at        TIMESTAMPTZ,

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

### 3.9 `notifications` — Notificaciones enviadas

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

COMMENT ON TABLE audit_logs IS 'Registro de auditoría. INSERT ONLY. Reten ción 12 meses.';
COMMENT ON COLUMN audit_logs.action IS 'Formato: resource_type.verb → booking.created, payment.refunded';
```

### 3.11 `tenant_player_bans` — Bans de jugadores por complejo

```sql
CREATE TABLE tenant_player_bans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  player_id       UUID NOT NULL REFERENCES players(id),

  reason          TEXT NOT NULL,
  banned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_until    TIMESTAMPTZ,                   -- NULL = permanente
  banned_by       UUID REFERENCES staff_users(id)
);

-- Îndices (sin predicado NOW() — solo para performance, no como constraint)
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

-- Fix #10 CRÍTICO (Auditoría Opus 4.7): PostgreSQL rechaza NOW() en índices parciales
-- porque NOW() no es IMMUTABLE. El índice uq_tenant_player_active_ban fue eliminado.
--
-- SOLUCIÓN: Trigger BEFORE INSERT que valida dinámicamente si ya existe un ban activo.
-- El trigger puede usar NOW() sin restricciones (corre en runtime, no en DDL).
CREATE OR REPLACE FUNCTION prevent_duplicate_active_ban()
RETURNS TRIGGER AS $$
BEGIN
  -- Verificar si ya existe un ban activo para este (tenant_id, player_id)
  IF EXISTS (
    SELECT 1 FROM tenant_player_bans
    WHERE tenant_id  = NEW.tenant_id
      AND player_id  = NEW.player_id
      AND (banned_until IS NULL OR banned_until > NOW())
  ) THEN
    RAISE EXCEPTION
      'Ya existe un ban activo para player_id=% en tenant_id=%. '
      'Espera a que expire o levántalo manualmente antes de re-banear.',
      NEW.player_id, NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_active_ban
  BEFORE INSERT ON tenant_player_bans
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_active_ban();

-- Índice de lookup rápido de bans (sin predicado NOW(), solo para performance)
CREATE INDEX idx_tenant_player_bans_active
  ON tenant_player_bans (tenant_id, player_id, banned_until);

-- Fix #7 — Hallazgo Opus 4.7: el endpoint de jugador (POST /api/player/bookings)
-- verifica si el jugador está baneado ANTES de crear la reserva. Cuando corre con
-- contexto de jugador (solo app.current_player_id seteado), las policies de tenant
-- devolverían 0 filas silenciosamente → jugador baneado pasa la verificación (fail-open).
-- Esta policy permite que el jugador lea sus propios bans.
CREATE POLICY player_own_bans_select ON tenant_player_bans FOR SELECT
  USING (player_id = current_setting('app.current_player_id', true)::UUID);

COMMENT ON TABLE tenant_player_bans IS 'Bans de jugadores por complejo. Ban global en players.status.';
COMMENT ON TRIGGER enforce_single_active_ban ON tenant_player_bans IS
  'Previene insertar un ban activo si ya hay otro vigente para el mismo (tenant_id, player_id). '
  'Permite re-banear cuando el ban anterior expiró. '
  'Reemplaza al índice parcial uq_tenant_player_active_ban (eliminado por incompatibilidad de '
  'NOW() con índices parciales en PostgreSQL — Fix #10).';
COMMENT ON INDEX idx_tenant_player_bans_active IS
  'Lookup rápido de bans por (tenant_id, player_id, banned_until). Sin predicado NOW() para cumplir IMMUTABLE.';
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

  -- Métricas de comportamiento (bookings_count por trigger; noshow_count/last_no_show_at por applyNoShowStrike)
  bookings_count   INTEGER NOT NULL DEFAULT 0,      -- Total de reservas
  noshow_count     INTEGER NOT NULL DEFAULT 0,      -- No-shows en la ventana de reincidencia (escrito por applyNoShowStrike, reset a 90 días)
  last_no_show_at  TIMESTAMPTZ,                     -- Fecha del último no-show (para la ventana de reincidencia; migr. 044)
  last_booking_at  TIMESTAMPTZ,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Estado de la relación
  status           TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'blocked'
                   CHECK (status IN ('active', 'blocked')),

  -- Etiquetas del complejo sobre esta persona (B12 / decisión v2 D3, migr. 074).
  -- ENUM cerrado de 5 valores (player_tag[]) — sin texto libre, por Ley 25.326.
  -- '{}' = sin etiquetas, nunca NULL. chk_ptr_tags_unique prohíbe repetidos.
  tags             player_tag[] NOT NULL DEFAULT '{}',

  -- Consentimiento de datos (Ley 25.326)
  -- El jugador consintió que este complejo vea sus datos al hacer la primera reserva
  data_consent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un jugador tiene una única relación por complejo
  CONSTRAINT uq_player_tenant UNIQUE (player_id, tenant_id)
);

-- CHECK adicional (migr. 074): la misma etiqueta no puede repetirse en el array.
-- player_tags_are_unique() es IMMUTABLE (predicado puro sobre el array).
ALTER TABLE player_tenant_relationships
  ADD CONSTRAINT chk_ptr_tags_unique CHECK (player_tags_are_unique(tags));

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

-- Fix #8 — Hallazgo Opus 4.7: la PTR se crea en la primera reserva del jugador.
-- El flujo del jugador solo tiene app.current_player_id seteado (no tenant_id).
-- La policy de INSERT del staff (tenant_isolation_insert) no aplica en ese contexto
-- → el INSERT falla silenciosamente, rompiendo el consent de Ley 25.326.
-- Esta policy permite al jugador crear su propia PTR (el tenant_id viene del INSERT explícito).
CREATE POLICY player_self_ptr_insert ON player_tenant_relationships FOR INSERT
  WITH CHECK (
    player_id = current_setting('app.current_player_id', true)::UUID AND
    tenant_id IS NOT NULL
  );

COMMENT ON TABLE player_tenant_relationships IS
  'Relación jugador ↔ complejo. Creada en primera reserva. Habilita historial, no-shows y lista negra por complejo.';
```

### 3.13 `system_admins` — Administradores internos de TurnoGol

```sql
-- ============================================================
-- TABLA: system_admins
-- Usuarios internos del equipo TurnoGol (super-admin).
-- NO son tenants ni staff de un complejo: son el equipo de la plataforma.
-- Tienen acceso al panel interno en /internal/dashboard (doc12 §9.5).
-- Acceso restringido: IP whitelist + MFA + rol separado de cualquier tenant.
-- ============================================================
CREATE TABLE system_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,

  status          staff_status NOT NULL DEFAULT 'active',

  -- MFA obligatorio para acceder al panel interno
  mfa_secret      TEXT,                            -- TOTP secret (almacenado encriptado)
  mfa_verified_at TIMESTAMPTZ,                     -- Cuándo habilitó MFA

  -- Auditoría de acceso
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice
CREATE UNIQUE INDEX idx_system_admins_email ON system_admins(email);

-- RLS
ALTER TABLE system_admins ENABLE ROW LEVEL SECURITY;

-- Un system_admin solo puede ver/editar su propio registro vía panel interno.
-- El service role (usado por el backend del panel /internal) bypasea RLS.
-- La variable de contexto app.current_system_admin_id se setea en el middleware
-- del panel interno (ruta separada de los endpoints de staff y jugador).
CREATE POLICY system_admin_self ON system_admins FOR SELECT
  USING (id = current_setting('app.current_system_admin_id', true)::UUID);

CREATE POLICY system_admin_self_update ON system_admins FOR UPDATE
  USING (id = current_setting('app.current_system_admin_id', true)::UUID)
  WITH CHECK (id = current_setting('app.current_system_admin_id', true)::UUID);

-- INSERT: solo el service role puede crear system_admins (onboarding manual del equipo TurnoGol)

COMMENT ON TABLE system_admins IS
  'Equipo interno de TurnoGol. Acceso al panel /internal/dashboard. '
  'Require MFA. 3ª variable de contexto: app.current_system_admin_id.';
COMMENT ON COLUMN system_admins.mfa_secret IS
  'TOTP secret encriptado en reposo (no en texto plano). Encriptar con pgsodium o a nivel de aplicación.';
```

### 3.14 `daily_cash_closes` — Cierres de caja diarios

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
  total_income     INTEGER NOT NULL DEFAULT 0,      -- Centavos ARS (suma de ingresos del día)
  total_adjustments INTEGER NOT NULL DEFAULT 0,     -- Centavos ARS (suma de ajustes compensatorios)
  total_expense    INTEGER NOT NULL DEFAULT 0,      -- Centavos ARS (suma de gastos del día, migr. 025)
  balance          INTEGER NOT NULL DEFAULT 0,      -- total_income + total_adjustments

  -- Efectivo del cajón (declarado manualmente por el admin)
  declared_cash    INTEGER NOT NULL DEFAULT 0,      -- Lo que hay físicamente en el cajón
  diff_amount      INTEGER NOT NULL DEFAULT 0,      -- Ver COMMENT abajo

  -- Apertura de caja (migr. 049). NULL = cierre legacy anterior a la apertura:
  -- la UI branchea por NULL y NUNCA reinterpreta diff_amount viejo (semántica
  -- vieja: balance − declared; nueva: declared − expected).
  opening_cash     INTEGER,                         -- Fondo inicial declarado al abrir el día
  expected_cash    INTEGER,                         -- opening_cash + lo esperado en efectivo del día

  -- Metadata
  note             TEXT,                            -- Observaciones del cierre
  closed_by        UUID NOT NULL REFERENCES staff_users(id),
  closed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_daily_close_per_tenant UNIQUE (tenant_id, date),
  CONSTRAINT chk_income_non_negative CHECK (total_income >= 0),
  CONSTRAINT chk_adjustments_non_negative CHECK (total_adjustments >= 0),
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
-- El rol turnogol_app nunca puede UPDATE ni DELETE (igual que audit_logs).
REVOKE UPDATE, DELETE ON daily_cash_closes FROM turnogol_app;

COMMENT ON TABLE daily_cash_closes IS
  'Cierre de caja diario. INMUTABLE post-cierre. Correcciones = cash_flows compensatorios.';
COMMENT ON COLUMN daily_cash_closes.diff_amount IS
  'Semántica NUEVA (cierres con expected_cash NOT NULL, post migr. 049): '
  'declared_cash − expected_cash, donde expected_cash = opening_cash + neto de '
  'cash_flows en efectivo del día. Semántica LEGACY (expected_cash NULL, '
  'cierres previos a la apertura de caja): balance − declared_cash. NUNCA se '
  'reinterpreta un diff_amount viejo con la fórmula nueva. '
  'Positivo = sobrante (más efectivo del esperado). Negativo = faltante. '
  'Calculado en el momento del cierre, NUNCA recalculado después.';
```

### 3.15 `push_subscriptions` — Suscripciones Web Push del admin (aislada)

```sql
-- ============================================================
-- TABLA: push_subscriptions  (migración 014)
-- Suscripciones Web Push API del staff. Habilitan el aviso al admin cuando entra
-- una reserva online (notifyAdminPush). Aislada por tenant_id (RLS estándar).
-- El push se entrega directo al navegador del staff; NO se registra en `notifications`.
-- ============================================================
CREATE TABLE push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_user_id   UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,            -- Endpoint del push service del browser
  p256dh_key      TEXT NOT NULL,                   -- Clave pública del cliente (VAPID)
  auth_key        TEXT NOT NULL,                   -- Secreto de autenticación del cliente
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_push_subscriptions_tenant_staff ON push_subscriptions(tenant_id, staff_user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Policies estándar de aislamiento por tenant (SELECT/INSERT/UPDATE/DELETE), igual patrón que el resto.

COMMENT ON TABLE push_subscriptions IS
  'Suscripciones Web Push del staff para el aviso de reserva online (ver Doc 11 ADR-013-push). '
  'Horario silencioso 00:00–08:00 local: el push se agenda (startAfter) para las 08:00, no suena al instante.';
```

### 3.16 `reviews` — Reseñas de jugadores (híbrida)

```sql
-- ============================================================
-- TABLA: reviews  (migración 016)
-- Reseña post-partido del jugador (interfaz pública estilo ATC).
-- tenant_id denormalizado desde el booking para listados públicos rápidos.
-- Híbrida: lectura PÚBLICA (perfil del complejo) + INSERT solo del jugador dueño
-- de un booking 'completed'. 1 review por booking.
-- ============================================================
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  player_id       UUID NOT NULL REFERENCES players(id),
  booking_id      UUID NOT NULL REFERENCES bookings(id),
  rating          INTEGER NOT NULL,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_review_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_review_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500)
);

CREATE UNIQUE INDEX uq_reviews_booking ON reviews(booking_id);
CREATE INDEX idx_reviews_tenant_created ON reviews(tenant_id, created_at);
CREATE INDEX idx_reviews_player ON reviews(player_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
-- Lectura pública (anon role) + INSERT del jugador dueño del booking 'completed'
-- (app.current_player_id). Ver 016_reviews.sql.
```

### 3.17 `player_favorites` — Complejos favoritos del jugador (híbrida)

```sql
-- ============================================================
-- TABLA: player_favorites  (migración 017)
-- Complejos favoritos (❤️) del jugador. Cross-tenant: un jugador marca N complejos.
-- Híbrida: el jugador SOLO ve/modifica los suyos (app.current_player_id).
-- NO hay lectura pública.
-- ============================================================
CREATE TABLE player_favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_player_favorites_player_tenant ON player_favorites(player_id, tenant_id);
CREATE INDEX idx_player_favorites_player ON player_favorites(player_id);
CREATE INDEX idx_player_favorites_tenant ON player_favorites(tenant_id);

ALTER TABLE player_favorites ENABLE ROW LEVEL SECURITY;
-- Policy única por app.current_player_id (el jugador solo ve/escribe sus favoritos).
```

### 3.18 `feature_flags` — Toggles operacionales (operacional)

```sql
-- ============================================================
-- TABLA: feature_flags  (migración 015)
-- Toggles operacionales (Fase 6). NO son los feature flags por plan (esos viven en
-- plans.features, ADR-010). Una fila con tenant_id = NULL es un DEFAULT GLOBAL;
-- una fila con tenant_id seteado es un OVERRIDE por complejo (ej: kill switch).
-- ============================================================
CREATE TABLE feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL,
  value           BOOLEAN NOT NULL DEFAULT false,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = default global
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unicidad por índices parciales (migración 015): una fila global por key y una
-- fila por key+tenant. NO un UNIQUE(key) plano (impediría global + override del mismo key).
CREATE UNIQUE INDEX uq_feature_flags_global ON feature_flags(key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX uq_feature_flags_tenant ON feature_flags(key, tenant_id) WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE feature_flags IS
  'Toggles operacionales. Fila tenant_id NULL = default global; tenant_id seteado = override por complejo.';
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

### 4.2 Invariantes de reservas — Trigger unificado

```sql
-- ============================================================
-- TRIGGER: enforce_booking_invariants
-- Consolida en UN solo trigger BEFORE UPDATE todas las validaciones
-- de inmutabilidad de bookings (Fix #2 + #9 — Auditoría Opus 4.7).
--
-- Reemplaza los triggers previos:
--   - enforce_booking_immutability (solo cubría 3 estados finales)
--   - enforce_price_snapshot_immutability (superpuesto)
--
-- Valida:
-- (1) Estados terminales: ninguno puede cambiar salvo notes_internal
-- (2) Inmutabilidad de price_snapshot en CUALQUIER estado
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- (1) price_snapshot es siempre inmutable (cualquier estado)
  IF OLD.price_snapshot != NEW.price_snapshot THEN
    RAISE EXCEPTION 'price_snapshot es inmutable después de la creación de la reserva.';
  END IF;

  -- (2) Permitir transición completed -> no_show dentro de 24 horas (corrección de asistencia)
  IF OLD.status = 'completed' AND NEW.status = 'no_show' THEN
    IF NOW() - OLD.updated_at > INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'La corrección de asistencia (completed -> no_show) solo está permitida dentro de las 24 horas de haber finalizado.';
    END IF;
    -- Asegurar que solo se cambia el status (y opcionalmente notes_internal/updated_at)
    IF (
      NEW.court_id       = OLD.court_id AND
      NEW.player_id      IS NOT DISTINCT FROM OLD.player_id AND
      NEW.date           = OLD.date AND
      NEW.time_start     = OLD.time_start AND
      NEW.time_end       = OLD.time_end AND
      NEW.price_snapshot = OLD.price_snapshot AND
      NEW.deposit_amount = OLD.deposit_amount
    ) THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'Al corregir asistencia a no_show, no se pueden modificar otros campos de la reserva.';
    END IF;
  END IF;

  -- (3) Estados terminales: permiten SOLO cambio de notes_internal
  IF OLD.status IN ('completed', 'no_show', 'expired', 'canceled_refunded', 'canceled_no_refund') THEN
    IF (
      NEW.status         = OLD.status AND
      NEW.court_id       = OLD.court_id AND
      NEW.player_id      IS NOT DISTINCT FROM OLD.player_id AND
      NEW.date           = OLD.date AND
      NEW.time_start     = OLD.time_start AND
      NEW.time_end       = OLD.time_end AND
      NEW.price_snapshot = OLD.price_snapshot AND
      NEW.deposit_amount = OLD.deposit_amount
    ) THEN
      RETURN NEW; -- Solo notas internas cambiaron, permitido
    ELSE
      RAISE EXCEPTION
        'No se puede modificar una reserva en estado terminal %. '
        'Solo notes_internal puede editarse post-estado-final.',
        OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_booking_invariants
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_invariants_fn();

-- Nota: los triggers antiguos enforce_booking_immutability y
-- enforce_price_snapshot_immutability quedan DEPRECADOS.
-- Si existían en versiones previas de la migration, ejecutar:
-- DROP TRIGGER IF EXISTS enforce_booking_immutability ON bookings;
-- DROP TRIGGER IF EXISTS enforce_price_snapshot_immutability ON bookings;
-- DROP FUNCTION IF EXISTS prevent_immutable_booking_changes();
-- DROP FUNCTION IF EXISTS prevent_price_snapshot_change();
```

---

### 4.3 Guard de transición atómica — Anti-Race-Condition en bookings

```sql
-- ============================================================
-- PATRÓN OBLIGATORIO: Transición atómica de pending_payment (Fix #9 — Opus 4.7)
--
-- PROBLEMA: dos workers concurrentes (job de expiración + webhook de MP)
-- pueden intentar transicionar el mismo booking desde 'pending_payment'
-- al mismo tiempo (ej: expira en el segundo 14:59, webhook llega en el 15:00).
-- Sin control, ambos pueden tener éxito generando audit logs contradictorios:
--   booking.expired + booking.confirmed sobre la misma reserva.
--
-- SOLUCIÓN: UPDATE CONDICIONAL con check de estado previo.
-- Toda transición desde 'pending_payment' DEBE usar este patrón.
-- Si rowCount = 0, otro worker ya ganó la carrera → no disparar efectos secundarios.
-- ============================================================

-- Patrón en TypeScript (service layer):
--
-- async function transitionFromPendingPayment(
--   bookingId: string,
--   newStatus: 'confirmed' | 'expired',
--   db: PoolClient
-- ): Promise<boolean> {
--   const result = await db.query(`
--     UPDATE bookings
--     SET status = $1, updated_at = NOW()
--     WHERE id = $2
--       AND status = 'pending_payment'  -- GUARD: solo transicionar si sigue en pending_payment
--     RETURNING id
--   `, [newStatus, bookingId]);
--
--   if (result.rowCount === 0) {
--     // Otro worker ya transicionó este booking (race condition ganada por el otro).
--     // NO disparar efectos secundarios (emails, cash_flows, audit_logs de este intento).
--     return false;
--   }
--
--   // rowCount === 1: somos el ganador de la carrera. Disparar efectos secundarios.
--   await sendConfirmationEmail(...);
--   await createAuditLog(...);
--   return true;
-- }
--
-- REGLA INVIOLABLE: este patrón aplica para TODA transición desde pending_payment.
-- Los estados finales (expired, completed, no_show, canceled_refunded, canceled_no_refund)
-- están protegidos adicionalmente por el trigger `enforce_booking_invariants` (§4.2),
-- que rechaza cualquier UPDATE que modifique campos distintos de `notes_internal`
-- cuando OLD.status es terminal.
```

> [!IMPORTANT]
> **Este patrón no es opcional.** El webhook handler de MercadoPago y el job de expiración
> DEBEN implementarlo. Si `rowCount = 0`, el proceso termina sin efectos secundarios.
> Loguear el evento como `booking.transition_skipped` para auditabilidad.

---

## 5. Seed Data — Datos Iniciales

```sql
-- ============================================================
-- SEED: Planes de suscripción (datos globales del sistema)
-- Precios basados en Doc 4 — Monetización
-- ============================================================
INSERT INTO plans (name, slug, max_courts, price_monthly, price_annual, sort_order, features) VALUES
-- Valores vigentes tras la migr. 071 (cortes alineados con ATC: 1-3 / 4-6 / 7+).
-- Este seed es ilustrativo: el estado real sale de 007 + las migraciones de
-- precios posteriores (043, 071).
(
  'Predio', 'predio', 3,
  6300000,   -- $63.000 ARS en centavos
  5040000,   -- $50.400 ARS en centavos (mensualizado, 20% descuento anual)
  1,
  '{"history_months": 6, "export_formats": ["csv"], "api_access": false, "support_channels": ["email"]}'
),
(
  'Complejo', 'complejo', 6,
  9900000,   -- $99.000 ARS
  7920000,   -- $79.200 ARS (20% descuento anual)
  2,
  '{"history_months": 12, "export_formats": ["csv", "excel"], "api_access": false, "support_channels": ["email"]}'
),
(
  'Estadio', 'estadio', NULL,  -- NULL = ilimitado
  12900000,  -- $129.000 ARS
  10320000,  -- $103.200 ARS (20% descuento anual)
  3,
  '{"history_months": null, "export_formats": ["csv", "excel"], "api_access": true, "support_channels": ["email", "priority_email"]}'
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
| 14 | `tenant_staff_members` | Aislada | Sí | 500 |
| 15 | `tenant_subscriptions` | Aislada | Sí | 200 |
| 16 | `notifications` | Aislada | Sí | ~1.500.000/año |
| 17 | `audit_logs` | Aislada | Sí | ~3.000.000/año |
| 18 | `tenant_player_bans` | Aislada | Sí | ~500 |
| 19 | `push_subscriptions` | Aislada | Sí | ~1.000 |
| 20 | `reviews` | Híbrida | Pública + jugador‡ | ~200.000/año |
| 21 | `player_favorites` | Híbrida | Jugador‡ | ~120.000 |
| 22 | `feature_flags` | Operacional | No (service role) | ~50 |

**Total: 34 tablas de negocio + 1 tabla de sistema (`system_admins`)** (6 globales + 23 aisladas con RLS + 3 híbridas + 2 operacionales `feature_flags`/`push_send_log` + 1 sistema) — actualizado 2026-08-27, verificado contra `src/shared/db/schema/*.ts` (35 `pgTable` exports).

> [!NOTE]
> **‡ Tablas híbridas**: tienen `tenant_id` y RLS por jugador (`app.current_player_id`):
> - `reviews`: lectura **pública** (perfil del complejo) + INSERT del jugador dueño de un booking `completed`.
> - `player_favorites`: solo el jugador ve/escribe los suyos (sin lectura pública).
> - `player_tenant_relationships`: dual staff (por tenant) + jugador (por player_id).
> **Operacional**: `feature_flags` con fila `tenant_id = NULL` (default global) o `tenant_id` seteado (override por complejo).

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
   3.5  system_admins  (sin FK externas; es el equipo interno de TurnoGol)
   3.6  price_versions (FK → plans)
   3.7  processed_webhooks
4. Tablas aisladas sin FK cruzadas
   4.1  courts (FK → tenants)
   4.2  tenant_staff_members (FK → tenants, staff_users)
   4.3  tenant_subscriptions (FK → tenants, plans)
   4.4  tenant_player_bans (FK → tenants, players)
   4.5  player_tenant_relationships (FK → tenants, players)
5. Tablas aisladas con FK cruzadas
   5.1  abonados (FK → tenants, courts, players)
   5.2  bookings (FK → tenants, courts, players, abonados) — SIN FK a payments aún
   5.3  payments (FK → tenants, bookings, players)
   5.4  ALTER bookings ADD FK payment_id → payments (referencia circular resuelta)
   5.5  cash_flows (FK → tenants, bookings, abonados)
   5.6  daily_cash_closes (FK → tenants, staff_users)
   5.7  notifications (FK → tenants)
   5.8  audit_logs (FK → tenants)
   5.9  push_subscriptions (FK → tenants, staff_users) — migr. 014, aislada
   5.10 feature_flags (FK → tenants, nullable) — migr. 015, operacional
   5.11 reviews (FK → tenants, players, bookings) — migr. 016, híbrida
   5.12 player_favorites (FK → players, tenants) — migr. 017, híbrida
6. Triggers y funciones
7. Seed data
   7.1  plans (planes de suscripción SaaS)
   7.2  price_versions (versión inicial de precios)
   7.3  system_admins (bootstrap manual del primer super-admin — NUNCA via la app,
        siempre via service role o seed.sql separado con credenciales seguras)
8. RLS policies (todas las tablas aisladas + RLS relacional en players/staff_users/system_admins)
```

> [!IMPORTANT]
> **La referencia circular bookings ↔ payments se resuelve así:**
> Primero se crea `bookings` sin la FK a `payments`.
> Luego se crea `payments` con FK a `bookings`.
> Finalmente se agrega la FK `bookings.payment_id → payments`.
