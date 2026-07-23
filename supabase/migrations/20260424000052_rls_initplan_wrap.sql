-- ============================================================
-- 052_rls_initplan_wrap.sql
-- Auditoría de datos wave 2, fase D2 (RLS performance).
--
-- Problema: toda expresión de policy que llama current_setting(...) o
-- auth.jwt() "desnuda" se re-evalúa POR FILA (queda dentro del Filter del
-- plan). Envuelta en un scalar subquery — (SELECT ...) — el planner la
-- eleva a un InitPlan: UNA evaluación por query, el Filter compara contra
-- $0. Cero cambio semántico: mismo valor, mismo aislamiento (los tests de
-- aislamiento son el gate BLOQUEANTE de esta migración).
--
-- Alcance: las 73 policies vivas con el patrón (72 current_setting en los
-- 3 contextos app.current_tenant_id / app.current_player_id /
-- app.current_system_admin_id + realtime_tenant_select con auth.jwt()).
-- Generado desde pg_policies del schema migrado a 051 (2026-07-23) y
-- revisado a mano — NO desde los archivos históricos (018 open_matches
-- está dropeada desde 028). ALTER POLICY preserva roles y cmd.
--
-- Evidencia y report: docs/audit/reports/fase-d2-rls-performance-report.md
-- ============================================================

ALTER POLICY tenant_isolation_delete ON public.abonados
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.abonados
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.abonados
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.abonados
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.audit_logs
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.audit_logs
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_own_bookings_select ON public.bookings
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_self_insert ON public.bookings
  WITH CHECK (((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)) AND (tenant_id IS NOT NULL)));

ALTER POLICY tenant_isolation_delete ON public.bookings
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.bookings
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.bookings
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.bookings
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_products_insert ON public.canteen_products
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_products_select ON public.canteen_products
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_products_update ON public.canteen_products
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_tabs_insert ON public.canteen_tabs
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_tabs_select ON public.canteen_tabs
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY canteen_tabs_update ON public.canteen_tabs
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_delete ON public.cash_flows
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.cash_flows
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.cash_flows
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.cash_flows
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_read_court ON public.courts
  USING ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.court_id = courts.id) AND (b.player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid))))));

ALTER POLICY tenant_isolation_delete ON public.courts
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.courts
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.courts
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.courts
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.daily_cash_closes
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.daily_cash_closes
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY daily_cash_opens_insert ON public.daily_cash_opens
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY daily_cash_opens_select ON public.daily_cash_opens
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY daily_cash_opens_update ON public.daily_cash_opens
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY feature_flags_select ON public.feature_flags
  USING (((tenant_id IS NULL) OR (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))));

ALTER POLICY tenant_isolation_delete ON public.notifications
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.notifications
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.notifications
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.notifications
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_delete ON public.payments
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.payments
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.payments
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.payments
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY favorites_player_delete ON public.player_favorites
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY favorites_player_insert ON public.player_favorites
  WITH CHECK ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY favorites_player_select ON public.player_favorites
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_own_relationships_select ON public.player_tenant_relationships
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_self_ptr_insert ON public.player_tenant_relationships
  WITH CHECK (((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)) AND (tenant_id IS NOT NULL)));

ALTER POLICY tenant_isolation_insert ON public.player_tenant_relationships
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.player_tenant_relationships
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.player_tenant_relationships
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_update_self ON public.players
  USING ((id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY staff_can_see_related_players ON public.players
  USING (((EXISTS ( SELECT 1
   FROM player_tenant_relationships ptr
  WHERE ((ptr.player_id = players.id) AND (ptr.tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))))) OR (id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid))));

ALTER POLICY push_subs_modify ON public.push_subscriptions
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY push_subs_select ON public.push_subscriptions
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY reviews_player_insert ON public.reviews
  WITH CHECK (((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = reviews.booking_id) AND (b.player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)) AND (b.tenant_id = reviews.tenant_id) AND (b.status = 'completed'::booking_status))))));

ALTER POLICY staff_see_same_tenant_staff ON public.staff_users
  USING ((EXISTS ( SELECT 1
   FROM tenant_staff_members tsm
  WHERE ((tsm.staff_user_id = staff_users.id) AND (tsm.tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)) AND (tsm.is_active = true)))));

ALTER POLICY stock_movements_insert ON public.stock_movements
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY stock_movements_select ON public.stock_movements
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY system_admin_self ON public.system_admins
  USING ((id = (SELECT (NULLIF(current_setting('app.current_system_admin_id'::text, true), ''::text))::uuid)));

ALTER POLICY system_admin_self_update ON public.system_admins
  USING ((id = (SELECT (NULLIF(current_setting('app.current_system_admin_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((id = (SELECT (NULLIF(current_setting('app.current_system_admin_id'::text, true), ''::text))::uuid)));

ALTER POLICY player_own_bans_select ON public.tenant_player_bans
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_delete ON public.tenant_player_bans
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.tenant_player_bans
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.tenant_player_bans
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.tenant_player_bans
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_delete ON public.tenant_staff_members
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.tenant_staff_members
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.tenant_staff_members
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.tenant_staff_members
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_delete ON public.tenant_subscriptions
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_insert ON public.tenant_subscriptions
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_select ON public.tenant_subscriptions
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

ALTER POLICY tenant_isolation_update ON public.tenant_subscriptions
  USING ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)));

-- Realtime (rol authenticated): mismo fix para auth.jwt() — el deparse de
-- pg_policies lo muestra como jwt() a secas; acá va calificado explícito.
ALTER POLICY realtime_tenant_select ON public.bookings
  USING ((tenant_id = (SELECT (((auth.jwt() -> 'app_metadata'::text) ->> 'tenant_id'::text))::uuid)));
