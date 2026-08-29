-- ============================================================
-- 081_perf_indexes.sql
-- Auditoria de performance 2026-08-29 (indices / N+1 / cache).
-- Cierra los puntos 2, 3 y 7 de docs/audit/BACKLOG-PERFORMANCE-DB.md.
--
-- Todo lo de aca son consultas que HOY hacen Seq Scan y que ningun indice
-- existente puede servir. La mayoria son sweeps cross-tenant de workers
-- (corren bajo turnogol_worker, BYPASSRLS, sin tenant_id en el WHERE), o sea
-- que ningun indice compuesto que arranque en tenant_id las alcanza. Mismo
-- patron y mismo razonamiento que 061_reconciliation_indexes.sql.
--
-- CREATE INDEX normal, no CONCURRENTLY: la base de produccion son 200 kB
-- (medido 2026-08-29 con pg_stat_user_tables), asi que cada indice se crea en
-- milisegundos. CONCURRENTLY ademas no corre dentro de transaccion y este
-- repo aplica las migraciones envueltas.
--
-- Indices NO agregados a proposito, para que no se repropongan:
--   * feature_flags.tenant_id - la tabla tiene 4 filas; el Seq Scan es mas
--     rapido que el indice y va a seguir siendolo (una fila por flag por
--     complejo que lo overridee). Es la unica tabla aislada sin indice
--     tenant_id-lider, y es deliberado.
--   * Las 23 FK restantes que reporta el advisor de Supabase (bookings.
--     created_by_staff, cash_flows.registered_by, canteen_tabs.*_by, etc.):
--     el lado padre (staff_users, players, courts, plans, tenants) NUNCA se
--     borra duro - el wipe de data-retention hace anonimizacion blanda. Sin
--     DELETE del padre no hay chequeo de integridad que escanee el hijo.
--     Ya estaba justificado en docs/audit/reports/fase-d1-schema-indices-report.md.
--   * player_tenant_relationships(tenant_id, last_booking_at): NO sirve. Los
--     tres ORDER BY de src/app/(admin)/jugadores/queries.ts ordenan el
--     resultado de un UNION ALL de CTEs (:207) o filtran antes por ILIKE
--     (:252) / hint de telefono (:200). El planner ordena igual.
-- ============================================================

-- ------------------------------------------------------------
-- 1. cash_flows - INV9 de la conciliacion contable
--
-- src/modules/payments/reconciliation.service.ts:366-379, cada hora:
--   WHERE category='booking' AND method='mercadopago' AND booking_id IS NOT NULL
--     AND created_at < NOW() - INTERVAL '15 minutes' ORDER BY created_at
--
-- 061 cubrio INV1-INV5 sobre payments/bookings y se salteo este, que es el
-- unico que pega contra cash_flows - la tabla mas caliente de Caja y la que
-- mas rapido crece. Los 5 indices vivos de cash_flows arrancan en tenant_id
-- o son parciales por booking_id/tournament_team_id: ninguno sirve.
--
-- Medido con EXPLAIN (ANALYZE, BUFFERS) sobre 22.431 filas del seed de
-- volumen: sin este indice es Seq Scan con "Rows Removed by Filter: 22431"
-- mas un Sort, 391 buffers; con el, Index Scan de 1 buffer y sin Sort (el
-- indice ya entrega el orden que pide el ORDER BY created_at).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cash_flows_booking_mp_created
  ON cash_flows(created_at)
  WHERE category = 'booking' AND method = 'mercadopago' AND booking_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. audit_logs - ventana temporal cross-tenant
--
-- Tres consumidores, todos sin tenant_id:
--   * reconcile-accounting-drift.worker.ts:34-41
--       WHERE action LIKE 'reconciliation.drift_%' AND created_at > NOW()-20h
--   * reconcile-subscriptions.worker.ts:111-117
--       WHERE action = 'subscription.mp_desync' AND created_at > NOW()-20h
--   * data-retention-cleanup.worker.ts:188-193
--       DELETE WHERE created_at < NOW() - INTERVAL '24 months'
--
-- Un solo indice sobre created_at los sirve a los tres: la ventana de 20h es
-- muy selectiva sobre una tabla de crecimiento monotono, y el filtro por
-- action queda como residual sobre un puniado de filas. Deliberadamente NO se
-- usa (action, created_at): el primero de los tres filtra con LIKE 'prefijo%',
-- que en la collation por defecto no puede usar un btree sin text_pattern_ops
-- - mas complejidad para servir a un solo consumidor.
--
-- Los 4 indices vivos de audit_logs arrancan todos en tenant_id. Sin este,
-- Postgres 17 igual usa idx_audit_logs_tenant_created, pero recorriendolo
-- ENTERO: aplica el Index Cond sobre su SEGUNDA columna, salteando la primera.
-- Medido con EXPLAIN (ANALYZE, BUFFERS) sobre 25.000 filas del seed de
-- volumen, la ventana de 20h: 214 buffers sin este indice contra 57 con el.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at);

-- ------------------------------------------------------------
-- 3. processed_webhooks - orden y purga por processed_at
--
--   * super-admin/dashboard.service.ts:236-246 - ORDER BY processed_at DESC
--     LIMIT 10, en cada carga del dashboard de super admin.
--   * data-retention-cleanup.worker.ts:144-150 - DELETE WHERE processed_at
--     < NOW() - INTERVAL '30 days'.
--
-- La tabla solo tiene la PK y el UNIQUE de mp_event_id: hoy los dos hacen
-- Seq Scan + Sort completo. Crece con cada notificacion de MercadoPago.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed
  ON processed_webhooks(processed_at DESC);

-- ------------------------------------------------------------
-- 4. notifications - purga y dedupe de recordatorios
--
--   * data-retention-cleanup.worker.ts:206-212 - DELETE WHERE created_at
--     < NOW() - INTERVAL '6 months'.
--   * retry-refunds.worker.ts:83-87 - NOT EXISTS correlacionado por
--     template_name (dedupe del recordatorio de devolucion pendiente).
--
-- Los 5 indices vivos cubren tenant_id, status, recipient_id y trigger_event;
-- ninguno cubre created_at ni template_name.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_template
  ON notifications(template_name);

-- ------------------------------------------------------------
-- 5. bookings - rescate de reservas expiradas con senia pendiente
--
-- reconcile-pending-payments.worker.ts:170-184, cross-tenant:
--   WHERE b.status='expired' AND b.updated_at > NOW()-24h ORDER BY updated_at
--
-- idx_bookings_deposit_mp tambien indexa updated_at pero con otro predicado
-- (payment_method='mercadopago' AND deposit_status IN (...)), asi que no
-- alcanza a las expiradas.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_expired_updated
  ON bookings(updated_at) WHERE status = 'expired';

-- ------------------------------------------------------------
-- 6. push_send_log - purga por sent_at
--
-- data-retention-cleanup.worker.ts:166-172 - DELETE WHERE sent_at
-- < NOW() - INTERVAL '30 days'. La tabla solo tiene la PK sobre dedupe_key
-- (059_push_send_log.sql:27) y recibe una fila por push enviado.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_push_send_log_sent
  ON push_send_log(sent_at);

-- ------------------------------------------------------------
-- 7. tournament_matches - las tres FK cuyo padre SI se borra
--
-- A diferencia de las 23 FK justificadas arriba, aca el padre se borra duro
-- en el flujo normal del producto y sin indice cada DELETE dispara un Seq
-- Scan de tournament_matches por fila borrada:
--   * walkover_winner_team_id -> tournament_teams(id). Los equipos se borran
--     en tournament-team.service.ts:239-241 y tournament.service.ts:266-269.
--   * home_source_match_id / away_source_match_id -> autorreferencia. El
--     borrado en bloque de tournament-fixture.service.ts:431-434 queda O(n^2):
--     el UPDATE ... SET *_source_match_id = NULL previo solo limpia los
--     punteros de ESE torneo, asi que el chequeo de integridad corre igual.
--
-- Parciales porque las tres columnas son mayormente NULL (solo playoffs).
-- Mismo patron que idx_tournament_matches_home_team (064:146).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tournament_matches_walkover_winner
  ON tournament_matches(walkover_winner_team_id)
  WHERE walkover_winner_team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_home_source
  ON tournament_matches(home_source_match_id)
  WHERE home_source_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_away_source
  ON tournament_matches(away_source_match_id)
  WHERE away_source_match_id IS NOT NULL;

-- ============================================================
-- Indices redundantes que se dropean
--
-- 053_index_hygiene.sql barrio los btrees NO parciales; todo lo parcial quedo
-- afuera, y 062/064 introdujeron dos casos nuevos despues. Cada indice de mas
-- encarece TODA escritura de la tabla y ocupa disco sin dar nada a cambio.
-- Verificado uno por uno contra pg_indexes de produccion.
-- ============================================================

-- (mp_payment_id) WHERE NOT NULL - lo cubre entero payments_mp_payment_id_key,
-- que es UNIQUE sobre la misma columna. Esta en el camino de los webhooks MP,
-- o sea que el costo lo paga cada notificacion de pago.
DROP INDEX IF EXISTS idx_payments_mp_id;

-- (tournament_id) - prefijo estricto de uq_tournament_stages_order
-- (tournament_id, order_index). Misma clase que 053 ya limpio, entro despues.
DROP INDEX IF EXISTS idx_tournament_stages_tournament;

-- (tenant_id, slug) WHERE is_public - misma clave que uq_tournaments_tenant_slug,
-- que ademas no tiene predicado y sirve a toda consulta del parcial.
DROP INDEX IF EXISTS idx_tournaments_public;

-- (tenant_id) WHERE NOT NULL - prefijo de idx_notifications_tenant_status
-- (tenant_id, status).
DROP INDEX IF EXISTS idx_notifications_tenant;

-- NO se dropea idx_canteen_tabs_open, aunque comparta clave con
-- idx_canteen_tabs_tenant: tiene lectores reales que filtran status='open'
-- (canteen-tab.service.ts:344, street-money.service.ts:216) y el parcial es
-- mucho mas chico que el completo.
