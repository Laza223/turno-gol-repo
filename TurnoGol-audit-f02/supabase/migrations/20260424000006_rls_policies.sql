-- ============================================================
-- 006_rls_policies.sql
-- Row-Level Security policies para todas las tablas con RLS.
--
-- Variables de contexto (set por middleware vía SET LOCAL):
--   * app.current_tenant_id        — staff con sesión activa en un tenant
--   * app.current_player_id        — jugador autenticado (cross-tenant)
--   * app.current_system_admin_id  — equipo interno TurnoGol (Fix #10 F2)
--
-- Policies se evalúan con OR cuando hay múltiples policies por tabla/comando.
--
-- Fixes aplicados:
--   * #10 F2: system_admins con RLS por app.current_system_admin_id.
--   * #13 F1: bookings.player_own_bookings_select + player_self_insert.
--   * #14 F1: bookings.realtime_tenant_select TO authenticated (fail-safe).
--   * #15 F1: RLS relacional en players y staff_users.
--   * #16 F1: tenant_player_bans.player_own_bans_select.
--   * #17 F1: player_tenant_relationships.player_self_ptr_insert.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- TABLAS GLOBALES CON RLS RELACIONAL
-- ════════════════════════════════════════════════════════════════

-- ─── players (Fix #15 F1) ────────────────────────────────────────
-- Acceso staff: solo a jugadores con relación con su tenant (player_tenant_relationships).
-- Acceso jugador: a su propio registro.
-- INSERT no tiene policy: solo service role (auth callbacks, signup).
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_can_see_related_players ON players
  FOR SELECT
  USING (
    -- Staff con tenant activo: ve los players relacionados con ese tenant.
    EXISTS (
      SELECT 1 FROM player_tenant_relationships ptr
      WHERE ptr.player_id = players.id
        AND ptr.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    -- O el propio jugador.
    OR id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
  );

CREATE POLICY player_update_self ON players
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_player_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);

-- ─── staff_users (Fix #15 F1) ────────────────────────────────────
-- Staff ve a otros staff del MISMO tenant (vía tenant_staff_members).
-- Sin INSERT/UPDATE: gestión vía service role.
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_see_same_tenant_staff ON staff_users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_staff_members tsm
      WHERE tsm.staff_user_id = staff_users.id
        AND tsm.tenant_id     = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        AND tsm.is_active     = true
    )
  );

-- ─── system_admins (Fix #10 F2) ──────────────────────────────────
-- Acceso solo al propio registro vía app.current_system_admin_id.
ALTER TABLE system_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_admin_self ON system_admins
  FOR SELECT
  USING (id = NULLIF(current_setting('app.current_system_admin_id', true), '')::uuid);

CREATE POLICY system_admin_self_update ON system_admins
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_system_admin_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_system_admin_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════
-- TABLAS AISLADAS — PATRÓN BASE (4 policies tenant_isolation_*)
-- ════════════════════════════════════════════════════════════════

-- ─── courts ──────────────────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON courts FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON courts FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON courts FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON courts FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── tenant_staff_members ────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON tenant_staff_members FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON tenant_staff_members FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON tenant_staff_members FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON tenant_staff_members FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── tenant_subscriptions ────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON tenant_subscriptions FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON tenant_subscriptions FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON tenant_subscriptions FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON tenant_subscriptions FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── products ────────────────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON products FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON products FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON products FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON products FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── abonados ────────────────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON abonados FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON abonados FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON abonados FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON abonados FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── payments ────────────────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON payments FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON payments FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON payments FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON payments FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── cash_flows ──────────────────────────────────────────────────
CREATE POLICY tenant_isolation_select ON cash_flows FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON cash_flows FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON cash_flows FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON cash_flows FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── notifications ───────────────────────────────────────────────
-- tenant_id puede ser NULL (notificaciones globales, ej. system_admin → tenant_owner).
-- Cuando tenant_id IS NULL, sólo se accede vía service role (no matchea ningún app.current_tenant_id).
CREATE POLICY tenant_isolation_select ON notifications FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON notifications FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON notifications FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON notifications FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════
-- TABLAS AISLADAS INMUTABLES — solo SELECT + INSERT
-- ════════════════════════════════════════════════════════════════

-- ─── daily_cash_closes (REVOKE UPDATE/DELETE en 008) ──────────────
CREATE POLICY tenant_isolation_select ON daily_cash_closes FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON daily_cash_closes FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─── audit_logs (REVOKE UPDATE/DELETE en 008) ─────────────────────
CREATE POLICY tenant_isolation_select ON audit_logs FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON audit_logs FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════
-- BOOKINGS — RLS DUAL (staff + jugador) + REALTIME
-- ════════════════════════════════════════════════════════════════

-- Staff: aislamiento tenant clásico (4 policies).
CREATE POLICY tenant_isolation_select ON bookings FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON bookings FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON bookings FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON bookings FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Fix #13 F1: jugador ve sus propias reservas (cross-tenant).
CREATE POLICY player_own_bookings_select ON bookings FOR SELECT
  USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);

-- Fix #13 F1: jugador puede crear reservas a su nombre.
-- WITH CHECK garantiza que no pueda suplantar a otro player ni escapar del tenant.
CREATE POLICY player_self_insert ON bookings FOR INSERT
  WITH CHECK (
    player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
    AND tenant_id IS NOT NULL
  );

-- Fix #14 F1: Realtime requiere policy en el rol authenticated (Supabase Realtime usa JWT).
-- Limitada a TO authenticated para preservar fail-safe en el resto de roles (anon, service).
CREATE POLICY realtime_tenant_select ON bookings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ════════════════════════════════════════════════════════════════
-- TENANT_PLAYER_BANS — staff isolation + jugador ve sus bans
-- ════════════════════════════════════════════════════════════════

CREATE POLICY tenant_isolation_select ON tenant_player_bans FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON tenant_player_bans FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON tenant_player_bans FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_delete ON tenant_player_bans FOR DELETE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Fix #16 F1: jugador puede ver sus propios bans (transparencia).
CREATE POLICY player_own_bans_select ON tenant_player_bans FOR SELECT
  USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);

-- ════════════════════════════════════════════════════════════════
-- PLAYER_TENANT_RELATIONSHIPS — sin DELETE (relación histórica)
-- ════════════════════════════════════════════════════════════════

CREATE POLICY tenant_isolation_select ON player_tenant_relationships FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_insert ON player_tenant_relationships FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_update ON player_tenant_relationships FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Jugador ve sus propias relaciones (cross-tenant).
CREATE POLICY player_own_relationships_select ON player_tenant_relationships FOR SELECT
  USING (player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid);

-- Fix #17 F1: jugador puede crear su propia relación al primer booking.
CREATE POLICY player_self_ptr_insert ON player_tenant_relationships FOR INSERT
  WITH CHECK (
    player_id = NULLIF(current_setting('app.current_player_id', true), '')::uuid
    AND tenant_id IS NOT NULL
  );

-- \echo '006_rls_policies.sql aplicado: 12 tablas con RLS + ~50 policies'
