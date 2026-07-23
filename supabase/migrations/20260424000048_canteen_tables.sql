-- ============================================================
-- 048_canteen_tables.sql
-- Rediseño "Caja y Cantina": la cantina se promueve del JSONB
-- tenants.settings->'canteen_products' a tablas reales.
-- Spec: docs/superpowers/specs/2026-07-22-caja-cantina-redesign-design.md
--
--   * canteen_products  — catálogo (precio, costo opcional, stock opcional,
--                         stock mínimo por producto). Soft delete via
--                         is_active: NUNCA se borra una fila (el ledger la
--                         referencia).
--   * canteen_tabs      — fiados ("anotáselo al capitán"): la venta queda
--                         a cobrar con nombre libre; el cash_flow se crea
--                         recién al saldar.
--   * stock_movements   — ledger append-only de stock. TODA venta escribe
--                         líneas acá (aunque el producto no controle stock):
--                         es auditoría Y la fuente del ranking de ventas.
--
-- La key JSONB vieja queda muerta una release (el backfill de abajo copia
-- los datos); se elimina en una migración de cleanup posterior.
--
-- Nota histórica: la tabla `products` (dropeada en 046) era dead code sin
-- escritores; canteen_products nace con feature real atrás y otro shape.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

CREATE TYPE stock_movement_kind AS ENUM
  ('purchase', 'sale', 'waste', 'courtesy', 'internal_use', 'adjustment');

-- 'canceled' con una L (convención del repo).
CREATE TYPE canteen_tab_status AS ENUM ('open', 'paid', 'canceled');

-- ─── canteen_products ────────────────────────────────────────

CREATE TABLE canteen_products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  name        text        NOT NULL,
  price       integer     NOT NULL,  -- centavos ARS
  cost        integer,               -- centavos ARS; costo actual (sin historial)
  stock       integer,               -- NULL = sin control de stock
  min_stock   integer,               -- NULL = sin alerta de stock bajo
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_canteen_name_nonempty   CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_canteen_price_positive  CHECK (price > 0),
  CONSTRAINT chk_canteen_cost_nonneg     CHECK (cost IS NULL OR cost >= 0),
  CONSTRAINT chk_canteen_stock_nonneg    CHECK (stock IS NULL OR stock >= 0),
  CONSTRAINT chk_canteen_minstock_nonneg CHECK (min_stock IS NULL OR min_stock >= 0)
);

CREATE INDEX idx_canteen_products_tenant
  ON canteen_products(tenant_id, is_active, sort_order);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON canteen_products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── canteen_tabs ────────────────────────────────────────────

CREATE TABLE canteen_tabs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id),
  debtor_name            text        NOT NULL,  -- nombre libre, no exige jugador registrado
  status                 canteen_tab_status NOT NULL DEFAULT 'open',
  total_amount           integer     NOT NULL,  -- centavos, snapshot al entregar
  note                   text,
  created_by             uuid        NOT NULL REFERENCES staff_users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  settled_at             timestamptz,
  settled_by             uuid        REFERENCES staff_users(id),
  settled_cash_flow_id   uuid        REFERENCES cash_flows(id),
  canceled_at            timestamptz,
  canceled_by            uuid        REFERENCES staff_users(id),
  canceled_reason        text,
  -- Crear un fiado no genera cash_flow, así que necesita idempotencia propia
  -- (mismo patrón que 023_cashflow_idempotency_key).
  client_idempotency_key uuid,
  CONSTRAINT chk_tab_debtor_nonempty  CHECK (length(trim(debtor_name)) > 0),
  CONSTRAINT chk_tab_amount_positive  CHECK (total_amount > 0),
  CONSTRAINT chk_tab_paid_consistency CHECK
    (status <> 'paid' OR (settled_at IS NOT NULL AND settled_cash_flow_id IS NOT NULL)),
  CONSTRAINT chk_tab_canceled_consistency CHECK
    (status <> 'canceled' OR canceled_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_canteen_tabs_idem
  ON canteen_tabs(client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE INDEX idx_canteen_tabs_open
  ON canteen_tabs(tenant_id, created_at DESC)
  WHERE status = 'open';

CREATE INDEX idx_canteen_tabs_tenant
  ON canteen_tabs(tenant_id, created_at DESC);

-- ─── stock_movements ─────────────────────────────────────────

CREATE TABLE stock_movements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id),
  product_id             uuid        NOT NULL REFERENCES canteen_products(id),
  kind                   stock_movement_kind NOT NULL,
  qty                    integer     NOT NULL,  -- con signo: entradas +, salidas −
  unit_cost              integer,               -- centavos; solo purchase, opcional
  unit_price             integer,               -- centavos; snapshot del precio (sale)
  note                   text,                  -- motivo (obligatorio en salidas no comerciales, a nivel service)
  cash_flow_id           uuid        REFERENCES cash_flows(id),   -- agrupador de ticket cobrado
  tab_id                 uuid        REFERENCES canteen_tabs(id), -- agrupador de fiado
  created_by             uuid        NOT NULL REFERENCES staff_users(id),
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- Idempotencia para movimientos SIN cash_flow (reposición, merma, ajuste).
  client_idempotency_key uuid,
  CONSTRAINT chk_stock_qty_sign CHECK (
    (kind = 'purchase' AND qty > 0)
    OR (kind IN ('sale', 'waste', 'courtesy', 'internal_use') AND qty < 0)
    OR (kind = 'adjustment' AND qty <> 0)
  ),
  CONSTRAINT chk_sale_has_price  CHECK (kind <> 'sale' OR unit_price IS NOT NULL),
  CONSTRAINT chk_sale_has_parent CHECK (kind <> 'sale' OR cash_flow_id IS NOT NULL OR tab_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_stock_movements_idem
  ON stock_movements(client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE INDEX idx_stock_movements_tenant_day ON stock_movements(tenant_id, occurred_at);
CREATE INDEX idx_stock_movements_product    ON stock_movements(tenant_id, product_id);
CREATE INDEX idx_stock_movements_cash_flow  ON stock_movements(cash_flow_id) WHERE cash_flow_id IS NOT NULL;
CREATE INDEX idx_stock_movements_tab        ON stock_movements(tab_id) WHERE tab_id IS NOT NULL;

-- ─── RLS (patrón 006/014 + FORCE 021/036) ────────────────────

ALTER TABLE canteen_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE canteen_products FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_products' AND policyname = 'canteen_products_select'
  ) THEN
    CREATE POLICY canteen_products_select ON canteen_products
      FOR SELECT
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_products' AND policyname = 'canteen_products_insert'
  ) THEN
    CREATE POLICY canteen_products_insert ON canteen_products
      FOR INSERT
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_products' AND policyname = 'canteen_products_update'
  ) THEN
    CREATE POLICY canteen_products_update ON canteen_products
      FOR UPDATE
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
-- Sin policy de DELETE: soft delete via is_active (el ledger referencia la fila).

ALTER TABLE canteen_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE canteen_tabs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_tabs' AND policyname = 'canteen_tabs_select'
  ) THEN
    CREATE POLICY canteen_tabs_select ON canteen_tabs
      FOR SELECT
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_tabs' AND policyname = 'canteen_tabs_insert'
  ) THEN
    CREATE POLICY canteen_tabs_insert ON canteen_tabs
      FOR INSERT
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canteen_tabs' AND policyname = 'canteen_tabs_update'
  ) THEN
    CREATE POLICY canteen_tabs_update ON canteen_tabs
      FOR UPDATE
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
-- Sin policy de DELETE: anular = status 'canceled'.

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_movements' AND policyname = 'stock_movements_select'
  ) THEN
    CREATE POLICY stock_movements_select ON stock_movements
      FOR SELECT
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_movements' AND policyname = 'stock_movements_insert'
  ) THEN
    CREATE POLICY stock_movements_insert ON stock_movements
      FOR INSERT
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
-- Sin policies de UPDATE/DELETE: ledger append-only (patrón audit_logs).

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya otorgan CRUD a turnogol_app y
-- turnogol_worker sobre tablas nuevas; acá solo se recorta lo intencional.
-- turnogol_worker conserva DELETE (data-retention-cleanup necesita purgar).

REVOKE UPDATE, DELETE ON stock_movements FROM turnogol_app;
REVOKE DELETE ON canteen_products FROM turnogol_app;
REVOKE DELETE ON canteen_tabs FROM turnogol_app;

-- ─── Backfill JSONB → filas ──────────────────────────────────
-- Copia el catálogo existente. Idempotente: si el tenant ya tiene filas
-- (re-run), no duplica. IDs nuevos: los del JSONB eran strings arbitrarios
-- del cliente; el ledger arranca vacío así que nada los referencia.

INSERT INTO canteen_products (tenant_id, name, price, stock, sort_order)
SELECT t.id,
       trim(e.p->>'name'),
       (e.p->>'price')::integer,
       CASE WHEN e.p ? 'stock' THEN (e.p->>'stock')::integer END,
       e.ord - 1
FROM tenants t
CROSS JOIN LATERAL jsonb_array_elements(t.settings->'canteen_products')
  WITH ORDINALITY AS e(p, ord)
WHERE jsonb_typeof(t.settings->'canteen_products') = 'array'
  AND length(trim(coalesce(e.p->>'name', ''))) > 0
  AND (e.p->>'price') ~ '^[0-9]+$'
  AND (e.p->>'price')::integer > 0
  AND NOT EXISTS (SELECT 1 FROM canteen_products cp WHERE cp.tenant_id = t.id);
