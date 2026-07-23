-- ============================================================================
-- D3 — EXPLAIN (ANALYZE, BUFFERS) de hot paths BAJO ROL REAL.
-- Requiere el seed de scripts/audit/seed-d3-volume.sql aplicado.
--
--   docker exec -i supabase_db_TurnoGol psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < scripts/audit/explain-d3-hotpaths.sql
--
-- Cada bloque replica el contexto de ejecución de producción:
--   * staff/público → SET LOCAL ROLE turnogol_app (+ set_config del contexto)
--   * workers cron  → SET LOCAL ROLE turnogol_worker (BYPASSRLS)
-- Nunca superusuario: los planes con RLS difieren (trampa ya mordida, PR #30).
-- Los UPDATE se ejecutan dentro de BEGIN…ROLLBACK (no persisten).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

SELECT id AS heavy_id FROM tenants WHERE slug = 'd3-heavy' \gset
SELECT id AS player_id FROM players WHERE email = 'd3seed+42@example.com' \gset
SELECT array_agg(id)::text AS cand_ids
FROM tenants WHERE slug LIKE 'd3-%' AND status IN ('active', 'trialing') \gset

-- ────────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== Q1: grilla del día — bookings+players (turnogol_app, tenant ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id, b.court_id, b.date, b.time_start, b.time_end, b.status, b.type,
       b.guest_name, b.price_snapshot, b.payment_method, b.deposit_status,
       b.deposit_amount, p.first_name, p.last_name
FROM bookings b
LEFT JOIN players p ON b.player_id = p.id
WHERE b.tenant_id = :'heavy_id'
  AND b.date = CURRENT_DATE
  AND b.status IN ('confirmed', 'pending_payment', 'completed', 'no_show');
ROLLBACK;

\echo ''
\echo '=== Q2: caja del día ART — getCashFlows (turnogol_app, tenant ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM cash_flows
WHERE tenant_id = :'heavy_id'
  AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      = (CURRENT_DATE - 1)
ORDER BY occurred_at DESC;
ROLLBACK;

\echo ''
\echo '=== Q3: getDaySummary — agregado del día (turnogol_app, tenant ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT type, category, method, SUM(amount)::int AS total
FROM cash_flows
WHERE tenant_id = :'heavy_id'
  AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      = (CURRENT_DATE - 1)
GROUP BY type, category, method;
ROLLBACK;

\echo ''
\echo '=== Q4: getDayComparisons — 7 días por expresión ART (turnogol_app) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day,
       type, SUM(amount)::int AS total
FROM cash_flows
WHERE tenant_id = :'heavy_id'
  AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      BETWEEN (CURRENT_DATE - 8) AND (CURRENT_DATE - 2)
GROUP BY 1, 2;
ROLLBACK;

\echo ''
\echo '=== Q5: dashboard cantina — product_sale del día (turnogol_app) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*), COALESCE(SUM(amount), 0)::int
FROM cash_flows
WHERE tenant_id = :'heavy_id'
  AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      = (CURRENT_DATE - 1)
  AND category = 'product_sale';
ROLLBACK;

\echo ''
\echo '=== Q6a: /explorar search — LEFT JOIN ratings, ORDER name (turnogol_app, SIN ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.id, t.slug, t.name, t.address, t.city, t.province, t.logo_url,
       t.cover_url, t.settings, t.from_price_cents, t.amenities, t.latitude,
       t.longitude, t.court_surfaces, t.court_formats,
       COALESCE(r.avg_rating, 0), COALESCE(r.review_count, 0), NULL::float8
FROM tenants t
LEFT JOIN (
  SELECT tenant_id, ROUND(AVG(rating)::numeric, 2)::float8 AS avg_rating,
         COUNT(*)::int AS review_count
  FROM reviews GROUP BY tenant_id
) r ON r.tenant_id = t.id
WHERE t.status IN ('active', 'trialing')
ORDER BY t.name ASC
LIMIT 20 OFFSET 0;
ROLLBACK;

\echo ''
\echo '=== Q6b: /explorar count(*) (turnogol_app, SIN ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)::int FROM tenants t WHERE t.status IN ('active', 'trialing');
ROLLBACK;

\echo ''
\echo '=== Q6c: /explorar sort=distance — Haversine por fila (turnogol_app) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.id, t.slug, t.name,
       COALESCE(r.avg_rating, 0), COALESCE(r.review_count, 0),
       CASE
         WHEN t.latitude IS NULL OR t.longitude IS NULL THEN NULL
         ELSE 6371 * acos(least(1, greatest(-1,
           cos(radians(-34.6037)) * cos(radians(t.latitude::float8)) *
             cos(radians(t.longitude::float8) - radians(-58.3816)) +
           sin(radians(-34.6037)) * sin(radians(t.latitude::float8))
         )))
       END AS distance_km
FROM tenants t
LEFT JOIN (
  SELECT tenant_id, ROUND(AVG(rating)::numeric, 2)::float8 AS avg_rating,
         COUNT(*)::int AS review_count
  FROM reviews GROUP BY tenant_id
) r ON r.tenant_id = t.id
WHERE t.status IN ('active', 'trialing')
ORDER BY distance_km ASC NULLS LAST
LIMIT 20 OFFSET 0;
ROLLBACK;

\echo ''
\echo '=== Q7: disponibilidad cross-tenant — anti-join (turnogol_worker) ==='
BEGIN;
SET LOCAL ROLE turnogol_worker;
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT c.tenant_id
FROM unnest(:'cand_ids'::uuid[]) AS cand(tenant_id)
JOIN courts c ON c.tenant_id = cand.tenant_id AND c.status = 'online'
WHERE NOT EXISTS (
  SELECT 1 FROM bookings b
  WHERE b.tenant_id = c.tenant_id
    AND b.court_id = c.id
    AND b.date = CURRENT_DATE + 1
    AND b.status IN ('pending_payment', 'confirmed')
    AND b.time_start < '20:00'::time
    AND (CASE WHEN b.time_end = '00:00'::time THEN '24:00'::time ELSE b.time_end END)
        > '19:00'::time
);
ROLLBACK;

\echo ''
\echo '=== Q8: auto-complete cron — UPDATE confirmed vencidos (turnogol_worker, ROLLBACK) ==='
BEGIN;
SET LOCAL ROLE turnogol_worker;
EXPLAIN (ANALYZE, BUFFERS)
UPDATE bookings b
SET status = 'completed', updated_at = NOW()
WHERE b.status = 'confirmed'
  AND b.ends_at < NOW() - interval '30 minutes';
ROLLBACK;

\echo ''
\echo '=== Q9: expiry sweep — pending_payment vencidos (turnogol_worker) ==='
BEGIN;
SET LOCAL ROLE turnogol_worker;
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id FROM bookings b
WHERE b.status = 'pending_payment'
  AND b.created_at < NOW() - (360 * INTERVAL '1 second')
ORDER BY b.created_at ASC
LIMIT 500;
ROLLBACK;

\echo ''
\echo '=== Q10: /deudas — getDebts histórico completo (turnogol_app, tenant ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
       c.name, b.player_id,
       CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END,
       b.price_snapshot, b.deposit_amount, b.deposit_status,
       COALESCE(SUM(cf.amount) FILTER (
         WHERE cf.type = 'income' AND cf.category = 'booking'
           AND cf.description <> ('Seña MercadoPago — turno ' || b.id::text)
       ), 0)::int AS charges_total
FROM bookings b
JOIN courts c ON b.court_id = c.id
LEFT JOIN players p ON b.player_id = p.id
LEFT JOIN staff_users su ON b.completed_by_staff = su.id
LEFT JOIN cash_flows cf ON cf.booking_id = b.id AND cf.tenant_id = b.tenant_id
WHERE b.tenant_id = :'heavy_id'
  AND b.status = 'completed'
GROUP BY b.id, c.name, b.player_id, p.id, su.id
HAVING (b.price_snapshot
        - CASE WHEN b.deposit_status IN ('paid', 'captured') THEN b.deposit_amount ELSE 0 END
        - COALESCE(SUM(cf.amount) FILTER (
            WHERE cf.type = 'income' AND cf.category = 'booking'
              AND cf.description <> ('Seña MercadoPago — turno ' || b.id::text)
          ), 0)) > 0
ORDER BY b.date DESC, b.time_start DESC;
ROLLBACK;

\echo ''
\echo '=== Q11: mis-reservas del jugador (turnogol_app, player ctx) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_player_id', :'player_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id, b.date, b.time_start, b.time_end, b.status, b.price_snapshot,
       b.deposit_amount, b.deposit_status
FROM bookings b
WHERE b.player_id = :'player_id'
ORDER BY b.starts_at DESC;
ROLLBACK;

\echo ''
\echo '=== Q12a: métricas — bookings por día, ventana 30d (turnogol_app) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT date::text, count(*)::int
FROM bookings
WHERE tenant_id = :'heavy_id'
  AND date >= (CURRENT_DATE - 30) AND date <= CURRENT_DATE
  AND status IN ('confirmed', 'completed', 'no_show')
GROUP BY date;
ROLLBACK;

\echo ''
\echo '=== Q12b: métricas — revenue rango UTC sargable, ventana 30d (turnogol_app) ==='
BEGIN;
SET LOCAL ROLE turnogol_app;
SELECT set_config('app.current_tenant_id', :'heavy_id', true);
EXPLAIN (ANALYZE, BUFFERS)
SELECT category, coalesce(sum(amount), 0)::bigint
FROM cash_flows
WHERE tenant_id = :'heavy_id'
  AND type = 'income'
  AND occurred_at >= ((CURRENT_DATE - 30) + interval '3 hours') AT TIME ZONE 'UTC'
  AND occurred_at < ((CURRENT_DATE + interval '1 day 3 hours') AT TIME ZONE 'UTC')
GROUP BY category;
ROLLBACK;

\echo ''
\echo '=== Q13: pg_stat_user_indexes — índices sin uso tras la corrida ==='
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, relname
LIMIT 40;
