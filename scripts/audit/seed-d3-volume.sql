-- ============================================================================
-- Seed sintético de volumen — fases D3 (planes bajo rol real) y D6 (carga k6).
--
-- Modela ~1 año de un complejo activo ("d3-heavy": 5 canchas, ~14-15k bookings,
-- ~25-30k cash_flows) + 200 tenants de fondo para las superficies cross-tenant
-- (/explorar, disponibilidad, sweeps de workers).
--
-- SOLO PARA DB LOCAL. Ejecutar:
--   docker exec -i supabase_db_TurnoGol psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < scripts/audit/seed-d3-volume.sql
--
-- Idempotente: borra todo lo sembrado (tenants slug 'd3-%', players/staff
-- email 'd3seed%') y re-siembra. Reproducible: setseed fijo.
-- Los días se generan RELATIVOS a CURRENT_DATE (hay pasado y futuro reales).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SELECT setseed(0.42);

-- ─── Cleanup de corridas previas (orden FK) ─────────────────────────────────
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM audit_logs WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM notifications WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM reviews WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM stock_movements WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM canteen_tabs WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM canteen_products WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM cash_flows WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM payments WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM daily_cash_opens WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM daily_cash_closes WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM bookings WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM abonados WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM player_tenant_relationships WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM courts WHERE tenant_id IN (SELECT id FROM seed_tenants);
WITH seed_tenants AS (SELECT id FROM tenants WHERE slug LIKE 'd3-%')
DELETE FROM tenant_staff_members WHERE tenant_id IN (SELECT id FROM seed_tenants);
DELETE FROM tenants WHERE slug LIKE 'd3-%';
DELETE FROM staff_users WHERE email LIKE 'd3seed%';
DELETE FROM players WHERE email LIKE 'd3seed%';

-- ─── Staff (1 owner por tenant; el heavy usa el suyo como registered_by) ────
INSERT INTO staff_users (id, email, first_name, last_name)
SELECT gen_random_uuid(), 'd3seed-staff-' || n || '@example.com', 'Staff', 'D3-' || n
FROM generate_series(0, 200) n;

-- ─── Tenants: 1 heavy + 200 de fondo (geo ~AMBA para el Haversine) ──────────
INSERT INTO tenants (slug, name, address, city, province, phone, email,
                     latitude, longitude, status,
                     from_price_cents, court_surfaces, court_formats)
SELECT
  'd3-heavy', 'Complejo D3 Heavy', 'Av. Siempreviva 100', 'Buenos Aires', 'Buenos Aires',
  '+5411000000', 'd3seed-heavy@example.com',
  -34.6037, -58.3816, 'active',
  800000, ARRAY['synthetic_grass'], ARRAY[5, 7];

INSERT INTO tenants (slug, name, address, city, province, phone, email,
                     latitude, longitude, status,
                     from_price_cents, court_surfaces, court_formats)
SELECT
  'd3-t-' || lpad(n::text, 3, '0'),
  'Complejo D3 ' || n,
  'Calle ' || n,
  (ARRAY['Buenos Aires','La Plata','Quilmes','Morón','Tigre'])[1 + (n % 5)],
  'Buenos Aires',
  '+54110000' || n,
  'd3seed-t' || n || '@example.com',
  -34.6037 + (random() - 0.5) * 0.8,
  -58.3816 + (random() - 0.5) * 0.8,
  CASE WHEN random() < 0.8 THEN 'active'::tenant_status ELSE 'trialing'::tenant_status END,
  (600 + floor(random() * 1000))::int * 1000,
  ARRAY['synthetic_grass'],
  CASE WHEN random() < 0.5 THEN ARRAY[5] ELSE ARRAY[5, 7] END
FROM generate_series(1, 200) n;

-- Owner membership por tenant
INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
SELECT t.id, s.id, 'admin'
FROM (SELECT id, row_number() OVER (ORDER BY slug) - 1 AS rn
      FROM tenants WHERE slug LIKE 'd3-%') t
JOIN (SELECT id, row_number() OVER (ORDER BY email) - 1 AS rn
      FROM staff_users WHERE email LIKE 'd3seed-staff-%') s USING (rn);

-- ─── Courts: heavy 5; fondo 2-5 ─────────────────────────────────────────────
INSERT INTO courts (tenant_id, name, capacity, format, status)
SELECT t.id, 'Cancha ' || g, 10, 5, 'online'
FROM tenants t, generate_series(1, 5) g
WHERE t.slug = 'd3-heavy';

INSERT INTO courts (tenant_id, name, capacity, format, status)
SELECT t.id, 'Cancha ' || g, 10,
       CASE WHEN g <= 2 THEN 5 ELSE 7 END,
       'online'
FROM tenants t
CROSS JOIN LATERAL generate_series(1, 2 + (abs(hashtext(t.slug)) % 4)) g
WHERE t.slug LIKE 'd3-t-%';

-- ─── Players (800 globales) ─────────────────────────────────────────────────
INSERT INTO players (email, first_name, last_name, phone)
SELECT 'd3seed+' || n || '@example.com', 'Jugador', 'D3-' || n, '+54911' || (1000000 + n)
FROM generate_series(1, 800) n;

-- ─── Bookings del heavy: [-365, +5] días × 5 canchas × slots 9..22 ──────────
-- Elección de slot con random < 0.55 → ~7.7 slots/día/cancha → ~14k filas.
-- Unicidad (court, date, hora) por construcción → nunca viola la exclusión GiST.
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     ),
     grid AS (
       SELECT c.id AS court_id, h.id AS tenant_id, o.id AS staff_id,
              (CURRENT_DATE + d) AS day, hr,
              random() AS r_pick, random() AS r_status, random() AS r_player,
              random() AS r_method, random() AS r_deposit
       FROM heavy h
       CROSS JOIN owner o
       CROSS JOIN LATERAL (SELECT id FROM courts WHERE tenant_id = h.id) c
       CROSS JOIN generate_series(-365, 5) d
       CROSS JOIN generate_series(9, 22) hr
     )
INSERT INTO bookings (tenant_id, court_id, player_id, created_by_staff,
                      date, time_start, time_end, type, status,
                      price_snapshot, deposit_amount, deposit_status,
                      payment_method, guest_name, starts_at, ends_at, created_at)
SELECT
  g.tenant_id,
  g.court_id,
  CASE WHEN g.r_player < 0.7
       THEN (SELECT id FROM players WHERE email = 'd3seed+' || (1 + floor(g.r_pick * 800)::int) || '@example.com')
       ELSE NULL END,
  g.staff_id,
  g.day,
  make_time(g.hr, 0, 0),
  make_time(g.hr + 1, 0, 0),
  CASE WHEN g.r_method < 0.85 THEN 'spontaneous'::booking_type ELSE 'fixed'::booking_type END,
  CASE
    WHEN g.day < CURRENT_DATE THEN
      CASE
        WHEN g.r_status < 0.78 THEN 'completed'::booking_status
        WHEN g.r_status < 0.84 THEN 'no_show'::booking_status
        WHEN g.r_status < 0.90 THEN 'canceled_no_refund'::booking_status
        WHEN g.r_status < 0.94 THEN 'canceled_refunded'::booking_status
        ELSE 'expired'::booking_status
      END
    ELSE
      CASE WHEN g.r_status < 0.9 THEN 'confirmed'::booking_status
           ELSE 'pending_payment'::booking_status END
  END,
  CASE
    WHEN extract(isodow FROM g.day) >= 5 THEN 1500000
    WHEN g.hr >= 18 THEN 1200000
    ELSE 800000
  END,
  CASE WHEN g.r_deposit < 0.3 THEN 360000 ELSE 0 END,
  CASE
    WHEN g.r_deposit >= 0.3 THEN 'not_required'::deposit_status
    WHEN g.day < CURRENT_DATE AND g.r_status >= 0.78 AND g.r_status < 0.84 THEN 'captured'::deposit_status
    ELSE 'paid'::deposit_status
  END,
  CASE WHEN g.r_method < 0.7 THEN 'cash'::payment_method
       WHEN g.r_method < 0.9 THEN 'transfer'::payment_method
       ELSE 'other'::payment_method END,
  CASE WHEN g.r_player >= 0.7 THEN 'Invitado ' || g.hr ELSE NULL END,
  ((g.day::text || ' ' || lpad(g.hr::text, 2, '0') || ':00')::timestamp
     AT TIME ZONE 'America/Argentina/Buenos_Aires'),
  ((g.day::text || ' ' || lpad((g.hr + 1)::text, 2, '0') || ':00')::timestamp
     AT TIME ZONE 'America/Argentina/Buenos_Aires'),
  ((g.day::text || ' ' || lpad(g.hr::text, 2, '0') || ':00')::timestamp
     AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '2 days'
FROM grid g
WHERE g.r_pick < 0.55;

-- ─── Bookings de fondo: 60 tenants con pasado (reviews) y futuro (search) ───
WITH bg AS (
  SELECT id AS tenant_id, slug FROM tenants
  WHERE slug LIKE 'd3-t-%'
    AND (abs(hashtext(slug)) % 10) < 3          -- ~60 tenants
),
grid AS (
  SELECT b.tenant_id, c.id AS court_id, (CURRENT_DATE + d) AS day, hr, random() AS r
  FROM bg b
  CROSS JOIN LATERAL (SELECT id FROM courts WHERE tenant_id = b.tenant_id LIMIT 2) c
  CROSS JOIN LATERAL (VALUES (-45), (-30), (-15), (-7), (1), (2)) AS days(d)
  CROSS JOIN generate_series(18, 22) hr
)
INSERT INTO bookings (tenant_id, court_id, player_id, date, time_start, time_end,
                      type, status, price_snapshot, deposit_amount, deposit_status,
                      payment_method, guest_name, starts_at, ends_at)
SELECT
  g.tenant_id, g.court_id,
  (SELECT id FROM players WHERE email = 'd3seed+' || (1 + floor(g.r * 800)::int) || '@example.com'),
  g.day, make_time(g.hr, 0, 0), make_time(g.hr + 1, 0, 0),
  'spontaneous',
  CASE WHEN g.day < CURRENT_DATE THEN 'completed'::booking_status ELSE 'confirmed'::booking_status END,
  1000000, 0, 'not_required', 'cash', NULL,
  ((g.day::text || ' ' || lpad(g.hr::text, 2, '0') || ':00')::timestamp
     AT TIME ZONE 'America/Argentina/Buenos_Aires'),
  ((g.day::text || ' ' || lpad((g.hr + 1)::text, 2, '0') || ':00')::timestamp
     AT TIME ZONE 'America/Argentina/Buenos_Aires')
FROM grid g
WHERE g.r < 0.5;

-- ─── Cash flows del heavy ───────────────────────────────────────────────────
-- (a) income/booking por cada booking completado (~11k)
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                        booking_id, registered_by, occurred_at)
SELECT b.tenant_id, 'income', 'booking', b.price_snapshot,
       b.payment_method, 'Cobro reserva', b.id, o.id,
       b.ends_at + interval '30 minutes'
FROM bookings b
JOIN heavy h ON h.id = b.tenant_id
CROSS JOIN owner o
WHERE b.status = 'completed';

-- (b) ventas de cantina: ~30/día × 365 (~11k)
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                        registered_by, occurred_at)
SELECT h.id, 'income', 'product_sale',
       (15 + floor(random() * 65))::int * 10000,
       CASE WHEN random() < 0.8 THEN 'cash'::payment_method ELSE 'transfer'::payment_method END,
       'Venta cantina', o.id,
       ((CURRENT_DATE + d)::text || ' ' || lpad((10 + floor(random() * 13))::text, 2, '0')
         || ':' || lpad(floor(random() * 60)::text, 2, '0'))::timestamp
         AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM heavy h
CROSS JOIN owner o
CROSS JOIN generate_series(-365, -1) d
CROSS JOIN generate_series(1, 30) s
WHERE random() < 0.95;

-- (c) gastos: ~3/día (~1.1k)
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                        registered_by, occurred_at)
SELECT h.id, 'expense',
       (ARRAY['merchandise','salaries','utilities','maintenance','other_expense'])[1 + floor(random() * 5)::int]::cashflow_category,
       (50 + floor(random() * 450))::int * 10000,
       'cash', 'Gasto operativo', o.id,
       ((CURRENT_DATE + d)::text || ' 1' || floor(random() * 10)::int || ':00')::timestamp
         AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM heavy h
CROSS JOIN owner o
CROSS JOIN generate_series(-365, -1) d
CROSS JOIN generate_series(1, 3) s;

-- ─── Cantina: productos + ledger de stock ───────────────────────────────────
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy')
INSERT INTO canteen_products (tenant_id, name, price, cost, stock, min_stock, sort_order)
SELECT h.id, 'Producto ' || n, (10 + n) * 10000, (5 + n) * 8000, 100, 10, n
FROM heavy h, generate_series(1, 25) n;

-- sale lines: 1 por venta de cantina (~11k) + compras semanales
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO stock_movements (tenant_id, product_id, kind, qty, unit_price,
                             cash_flow_id, created_by, occurred_at)
SELECT cf.tenant_id,
       (SELECT id FROM canteen_products p
        WHERE p.tenant_id = cf.tenant_id
        ORDER BY abs(hashtext(cf.id::text || p.id::text)) LIMIT 1),
       'sale', -1 - (abs(hashtext(cf.id::text)) % 2), cf.amount,
       cf.id, o.id, cf.occurred_at
FROM cash_flows cf
JOIN heavy h ON h.id = cf.tenant_id
CROSS JOIN owner o
WHERE cf.category = 'product_sale';

WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO stock_movements (tenant_id, product_id, kind, qty, unit_cost,
                             created_by, occurred_at)
SELECT h.id, p.id, 'purchase', 24, p.cost, o.id,
       ((CURRENT_DATE - 7 * w)::text || ' 09:00')::timestamp
         AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM heavy h
CROSS JOIN owner o
CROSS JOIN LATERAL (SELECT id, cost FROM canteen_products WHERE tenant_id = h.id) p
CROSS JOIN generate_series(1, 52) w;

-- fiados abiertos (150) — sin settle para no fabricar cash_flows inconsistentes
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO canteen_tabs (tenant_id, debtor_name, status, total_amount, created_by, created_at)
SELECT h.id, 'Fiado ' || n, 'open', (20 + n) * 10000, o.id,
       now() - (n || ' days')::interval
FROM heavy h, owner o, generate_series(1, 150) n;

-- ─── Reviews: heavy (~800) + fondo (~300) ───────────────────────────────────
INSERT INTO reviews (tenant_id, player_id, booking_id, rating, comment)
SELECT b.tenant_id, b.player_id, b.id,
       3 + (abs(hashtext(b.id::text)) % 3),
       CASE WHEN random() < 0.4 THEN 'Muy buena cancha' ELSE NULL END
FROM bookings b
JOIN tenants t ON t.id = b.tenant_id
WHERE t.slug LIKE 'd3-%'
  AND b.status = 'completed'
  AND b.player_id IS NOT NULL
  AND (abs(hashtext('rev' || b.id::text)) % 100) < 8;

-- ─── PTR: vínculo player↔tenant derivado de bookings reales ─────────────────
INSERT INTO player_tenant_relationships (tenant_id, player_id, bookings_count, last_booking_at)
SELECT b.tenant_id, b.player_id, count(*), max(b.starts_at)
FROM bookings b
JOIN tenants t ON t.id = b.tenant_id
WHERE t.slug LIKE 'd3-%' AND b.player_id IS NOT NULL
GROUP BY b.tenant_id, b.player_id;

-- ─── Payments: señas MP históricas + colgadas (para sweeps/reconcile) ───────
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy')
INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method,
                      status, mp_payment_id, processed_at, created_at)
SELECT b.tenant_id, b.id, b.player_id, b.deposit_amount, 'deposit', 'mercadopago',
       CASE WHEN (abs(hashtext('pay' || b.id::text)) % 100) < 95
            THEN 'approved'::payment_status ELSE 'pending'::payment_status END,
       'd3-mp-' || abs(hashtext(b.id::text)),
       b.starts_at - interval '1 day',
       b.starts_at - interval '2 days'
FROM bookings b
JOIN heavy h ON h.id = b.tenant_id
WHERE b.deposit_amount > 0
  AND (abs(hashtext('paysel' || b.id::text)) % 100) < 40;

-- ─── Audit logs (~25k) + notifications (~8k) del heavy ──────────────────────
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO audit_logs (tenant_id, actor_id, actor_type, action, resource_type,
                        resource_id, metadata, created_at)
SELECT h.id, o.id, 'staff',
       (ARRAY['booking.created','booking.canceled','cash_flow.created','booking.completed'])[1 + (n % 4)],
       'booking', gen_random_uuid(),
       jsonb_build_object('seed', 'd3', 'n', n),
       now() - (random() * 365 || ' days')::interval
FROM heavy h, owner o, generate_series(1, 25000) n;

WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO notifications (tenant_id, recipient_type, recipient_id, channel,
                           trigger_event, status, content, queued_at, sent_at)
SELECT h.id, 'staff', o.id, 'email', 'booking.confirmed', 'sent',
       jsonb_build_object('seed', 'd3', 'n', n),
       now() - (random() * 365 || ' days')::interval,
       now() - (random() * 365 || ' days')::interval
FROM heavy h, owner o, generate_series(1, 8000) n;

-- ─── Apertura/cierre de caja del heavy (300 días pasados) ───────────────────
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO daily_cash_opens (id, tenant_id, date, opening_cash, opened_by, opened_at, updated_at)
SELECT gen_random_uuid(), h.id, CURRENT_DATE + d, 500000, o.id,
       ((CURRENT_DATE + d)::text || ' 09:00')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires',
       now()
FROM heavy h, owner o, generate_series(-300, -1) d;

WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy'),
     owner AS (
       SELECT tsm.staff_user_id AS id FROM tenant_staff_members tsm
       JOIN heavy h ON h.id = tsm.tenant_id LIMIT 1
     )
INSERT INTO daily_cash_closes (id, tenant_id, date, total_income, total_adjustments,
                               total_expense, balance, declared_cash, diff_amount,
                               opening_cash, expected_cash, closed_by, closed_at)
SELECT gen_random_uuid(), h.id, CURRENT_DATE + d,
       s.inc, 0, s.exp, s.inc - s.exp, s.inc - s.exp + 500000, 0,
       500000, s.inc - s.exp + 500000, o.id,
       ((CURRENT_DATE + d + 1)::text || ' 02:00')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM heavy h
CROSS JOIN owner o
CROSS JOIN generate_series(-300, -1) d
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(amount) FILTER (WHERE type <> 'expense'), 0)::int AS inc,
         COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)::int AS exp
  FROM cash_flows cf
  WHERE cf.tenant_id = h.id
    AND (cf.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = CURRENT_DATE + d
) s;

-- ─── Abonados del heavy (30 turnos fijos) ───────────────────────────────────
WITH heavy AS (SELECT id FROM tenants WHERE slug = 'd3-heavy')
INSERT INTO abonados (tenant_id, court_id, contact_name, contact_phone,
                      day_of_week, time_start, time_end, price_per_session, starts_on)
SELECT h.id,
       -- (n%5, n%7) es único para n=1..30 → nunca colisiona la exclusión
       -- (court, day_of_week, horario)
       (SELECT id FROM (SELECT id, row_number() OVER (ORDER BY name) - 1 AS rn
                        FROM courts c WHERE c.tenant_id = h.id) cc
        WHERE cc.rn = n % 5),
       'Abonado ' || n, '+54911' || (2000000 + n),
       n % 7, make_time(19 + (n % 3), 0, 0), make_time(20 + (n % 3), 0, 0),
       1200000, CURRENT_DATE - 180
FROM heavy h, generate_series(1, 30) n;

COMMIT;

ANALYZE;

-- Resumen post-seed
SELECT 'tenants' AS tabla, count(*) AS filas FROM tenants WHERE slug LIKE 'd3-%'
UNION ALL SELECT 'bookings', count(*) FROM bookings b JOIN tenants t ON t.id = b.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'cash_flows', count(*) FROM cash_flows c JOIN tenants t ON t.id = c.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements s JOIN tenants t ON t.id = s.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'reviews', count(*) FROM reviews r JOIN tenants t ON t.id = r.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'payments', count(*) FROM payments p JOIN tenants t ON t.id = p.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs a JOIN tenants t ON t.id = a.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'notifications', count(*) FROM notifications n JOIN tenants t ON t.id = n.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'ptr', count(*) FROM player_tenant_relationships p JOIN tenants t ON t.id = p.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'courts', count(*) FROM courts c JOIN tenants t ON t.id = c.tenant_id WHERE t.slug LIKE 'd3-%'
UNION ALL SELECT 'players', count(*) FROM players WHERE email LIKE 'd3seed%';
