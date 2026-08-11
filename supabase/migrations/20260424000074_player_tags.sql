-- 074 — Etiquetas de cliente (B12, decisión de fase v2 D3)
--
-- CONTEXTO. El complejo necesita anotar cosas de una persona que el sistema no
-- puede medir solo ("a este se le fía", "este organiza el grupo"). La decisión
-- D3 (`docs/planning/2026-08-01-decisiones-de-fase-v2.md:41-45`) resolvió que
-- eso se hace con un SET CERRADO de etiquetas y NUNCA con texto libre. El
-- motivo es legal, no de UI: lo que un cliente puede leer ejerciendo derecho de
-- acceso (Ley 25.326) queda controlado en origen — nunca aparece un "chanta, no
-- atenderle el teléfono" escrito a las 2 AM.
--
-- Por eso es un ENUM y no una tabla de configuración por complejo: un set
-- abierto reintroduce exactamente el problema que D3 cierra. El set final está
-- cerrado en `2026-08-07-analisis-rubro-y-decisiones.md:129-166`, con la regla
-- que lo gobierna: **una etiqueta solo se justifica si captura algo que el
-- sistema no puede medir solo**. Por eso quedaron afuera "VIP" (categoría sin
-- consecuencia = decoración que igual es dato personal) y "Paga tarde" (el
-- sistema ya lo mide con deuda real). Si aparece 2+ veces una necesidad no
-- cubierta se agrega una sexta al ENUM (aditivo); si aparece la necesidad de
-- texto libre NO se concede, se reabre D3 con el dueño.
--
-- DÓNDE VIVE. `player_tenant_relationships`: ya es la tabla por tenant+jugador
-- (noshow_count, last_no_show_at, status, data_consent_at) y sus policies de
-- SELECT/INSERT/UPDATE ya scopean por `app.current_tenant_id`, así que la
-- columna hereda el aislamiento sin policy nueva. `players` NO sirve: es global
-- y cross-tenant, y la etiqueta es del complejo — que un complejo le ponga
-- "No fiar" no puede viajar al complejo de al lado.
--
-- COLUMNA ARRAY Y NO TABLA HIJA: una tabla nueva arrastra RLS + FORCE +
-- policies + DELETE en data-retention-cleanup.worker.ts + caso en
-- isolation.test.ts, y no compra nada — la trazabilidad de quién puso qué
-- etiqueta ya la da `audit_logs` (acción `player.tags_updated`).
--
-- ABONADOS.NOTES. La columna es texto libre asociado a una persona con nombre y
-- teléfono: exactamente lo que D3 prohíbe, y existía desde antes de la decisión.
-- Se elimina. Verificado contra producción ANTES de escribir esta migración:
-- 0 filas en `abonados`, 0 con notas (3 tenants vivos, todos de prueba). El
-- rollback de este bloque es recrear la columna vacía — no hay dato que
-- restaurar. Decisión del dueño, tomada explícitamente el 2026-08-11.

BEGIN;

-- ─── El set cerrado ────────────────────────────────────────────────────────
-- Orden = orden de presentación en la ficha. Agregar una etiqueta futura es
-- ADITIVO (ALTER TYPE ... ADD VALUE en una migración nueva); quitar una exige
-- limpiar las filas que la usen primero.
CREATE TYPE player_tag AS ENUM (
  'gets_credit',        -- Se le fía
  'no_credit',          -- No fiar
  'group_organizer',    -- Organiza el grupo
  'agreed_price',       -- Tiene precio acordado
  'difficult'           -- Trato conflictivo
);

-- ─── La columna ────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT '{}': "sin etiquetas" es un array vacío, nunca NULL, así el
-- consumidor no tiene dos formas de decir lo mismo. Es aditiva y con default,
-- así que el código viejo sigue corriendo contra el schema nuevo durante toda
-- la ventana de deploy (expand-contract: no hay contract, la columna nace vacía).
ALTER TABLE player_tenant_relationships
  ADD COLUMN tags player_tag[] NOT NULL DEFAULT '{}';

-- ─── La garantía de "sin repetidos" ────────────────────────────────────────
-- Un CHECK no puede llevar subquery, así que la comparación va en una función
-- IMMUTABLE. `SET search_path` explícito: sin él, un search_path hostil podría
-- resolver `unnest` a otra cosa (y un CREATE OR REPLACE futuro que se olvide de
-- esta línea deshace el hardening en silencio — ya pasó en este repo).
CREATE OR REPLACE FUNCTION player_tags_are_unique(tags player_tag[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT cardinality(tags) = (SELECT count(DISTINCT t) FROM unnest(tags) AS t)
$$;

COMMENT ON FUNCTION player_tags_are_unique(player_tag[]) IS
  'Predicado del CHECK chk_ptr_tags_unique: la misma etiqueta no puede estar dos veces.';

ALTER TABLE player_tenant_relationships
  ADD CONSTRAINT chk_ptr_tags_unique CHECK (player_tags_are_unique(tags));

COMMENT ON COLUMN player_tenant_relationships.tags IS
  'Etiquetas del complejo sobre esta persona (D3). Set CERRADO: sin texto libre sobre personas, por Ley 25.326.';

-- ─── Texto libre sobre personas: fuera (D3) ────────────────────────────────
ALTER TABLE abonados DROP COLUMN IF EXISTS notes;

COMMIT;

-- ROLLBACK (manual, si hiciera falta):
--   ALTER TABLE abonados ADD COLUMN notes text;
--   ALTER TABLE player_tenant_relationships DROP CONSTRAINT chk_ptr_tags_unique;
--   DROP FUNCTION player_tags_are_unique(player_tag[]);
--   ALTER TABLE player_tenant_relationships DROP COLUMN tags;
--   DROP TYPE player_tag;
-- No restaura el contenido de `abonados.notes` — en producción estaba vacío
-- (0 filas), que es la única razón por la que el DROP es aceptable acá.
