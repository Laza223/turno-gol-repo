-- ============================================================
-- 072_analytics_events.sql
-- Instrumentación de producto con destino propio (B4 del plan de deuda cero).
--
-- POR QUÉ EXISTE: `track.*` (src/shared/observability/breadcrumbs.ts) tiene ~46
-- call sites y 9 categorías de evento, y TODO iba a `Sentry.addBreadcrumb`.
-- Un breadcrumb solo se transmite ADJUNTO A UN EVENTO DE ERROR: si el flujo
-- termina bien —que es el caso que interesa medir— nadie lo ve nunca. O sea:
-- había instrumentación completa que no medía absolutamente nada. Esta tabla es
-- el destino que faltaba; el breadcrumb se mantiene, porque para depurar un
-- error el rastro previo sigue sirviendo.
--
-- DATO NO PERSONAL, A PROPÓSITO (Ley 25.326 / doc18): la tabla NO guarda
-- identificadores de persona. `playerId`/`staffUserId` se filtran antes de
-- persistir (ver PII_KEYS en analytics.service.ts) y siguen viajando solo al
-- breadcrumb de Sentry, que tiene otro propósito y otra retención. Sin
-- identificadores de persona, `analytics_events` queda fuera de ARCO, no hay
-- que tocarla en la anonimización de jugador, y no necesita entrada propia en
-- la política de retención de doc18 §7.1.
--   Costo aceptado: no se puede reconstruir el embudo de UN usuario, solo el
--   agregado ("cuántos vieron el portal → cuántos llegaron al checkout"). Con 0
--   clientes es el trade-off correcto; si algún día hace falta el embudo
--   individual, se agrega un id de sesión anónimo, NO el player_id.
--
-- `tenant_id` NULLABLE: hay eventos legítimamente sin complejo (búsqueda
-- pública cross-tenant, login antes de resolver el tenant). El tenant es una
-- empresa, no una persona: no es dato personal.
-- ============================================================

CREATE TABLE analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  event       TEXT NOT NULL,
  tenant_id   UUID REFERENCES tenants(id),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purga por antigüedad (data-retention-cleanup) y ventanas temporales.
CREATE INDEX idx_analytics_events_occurred ON analytics_events(occurred_at DESC);

-- Embudos: "cuántos `checkout.viewed` hubo en los últimos 30 días".
CREATE INDEX idx_analytics_events_funnel ON analytics_events(category, event, occurred_at DESC);

-- Corte por complejo. Parcial: las filas sin tenant son mayoría en tráfico
-- público y solo inflarían el índice.
CREATE INDEX idx_analytics_events_tenant ON analytics_events(tenant_id, occurred_at DESC)
  WHERE tenant_id IS NOT NULL;

-- ─── RLS (patrón 065 = 006/014 + FORCE 021/036, initplan-wrapped 052) ──

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events FORCE ROW LEVEL SECURITY;

-- SELECT: estrictamente el propio tenant. Las filas con tenant_id NULL no las
-- ve NADIE desde la app (NULL = ... nunca es true) — son del sistema y se leen
-- con el pool worker o desde super-admin.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events' AND policyname = 'analytics_events_select'
  ) THEN
    CREATE POLICY analytics_events_select ON analytics_events
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- INSERT: el propio tenant O sin tenant. La rama `IS NULL` es necesaria porque
-- los eventos de tráfico público (búsqueda cross-tenant, portal) se emiten sin
-- contexto de tenant y de otro modo la policy los rechazaría.
-- Lo que habilita: un tenant podría insertar filas con tenant_id NULL. Eso
-- ensucia analytics propio; NO expone datos de nadie (es escritura, y la
-- policy de SELECT sigue siendo estricta). Se acepta explícitamente.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events' AND policyname = 'analytics_events_insert'
  ) THEN
    CREATE POLICY analytics_events_insert ON analytics_events
      FOR INSERT
      WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid)
      );
  END IF;
END $$;

-- DELETE: lo necesita el wipe de tenant de data-retention-cleanup.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events' AND policyname = 'analytics_events_delete'
  ) THEN
    CREATE POLICY analytics_events_delete ON analytics_events
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- SIN policy de UPDATE: la tabla es append-only. Un evento es un hecho que ya
-- pasó; corregirlo no tiene sentido, y permitir UPDATE abriría la puerta a
-- reescribir la propia medición.
REVOKE UPDATE ON analytics_events FROM turnogol_app;
