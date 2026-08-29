-- ============================================================
-- top-queries.sql — qué consultas cuestan de verdad
--
-- Lo que pedía el punto 1 de docs/audit/BACKLOG-PERFORMANCE-DB.md: convierte
-- "yo elegí 16 queries que me parecían las calientes" en "la base me dice
-- cuáles son". `pg_stat_statements` ya está instalado (v1.10, local y en
-- Supabase por defecto) — no hace falta habilitar nada.
--
-- Cómo correrlo:
--   * Producción: pegarlo en el SQL Editor de Supabase.
--   * Local: psql "$DATABASE_URL" -f scripts/audit/top-queries.sql
--
-- OJO con leerlo antes de tiempo: con poco tráfico acumulado los números no
-- dicen nada. Al 2026-08-29 la base de producción tiene 15 reservas y 2
-- complejos; este script recién empieza a tener valor cuando haya semanas de
-- uso real. Igual queda listo para ese día.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Las 20 que más tiempo total consumen
--
-- Ordenado por `total_exec_time`, NO por `mean_exec_time`: una consulta de 5 ms
-- que corre 100.000 veces cuesta más que una de 900 ms que corre 3 veces. El
-- promedio alto llama la atención; el total es el que se paga.
-- ------------------------------------------------------------
SELECT calls,
       round(total_exec_time::numeric, 0)                  AS ms_total,
       round(mean_exec_time::numeric, 2)                   AS ms_prom,
       round((100 * total_exec_time / NULLIF(SUM(total_exec_time) OVER (), 0))::numeric, 1)
                                                           AS pct_del_total,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110)   AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_%'
  AND query NOT ILIKE '%information_schema%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- ------------------------------------------------------------
-- 2. Tablas donde Postgres lee todo (posibles índices faltantes)
--
-- La señal es `seq_tup_read` alto, NO `seq_scan` alto: en una tabla chica leer
-- todo ES lo correcto y más rápido que usar el índice. Lo que delata un índice
-- faltante son muchas FILAS leídas secuencialmente.
-- ------------------------------------------------------------
SELECT relname                                    AS tabla,
       n_live_tup                                 AS filas,
       seq_scan,
       seq_tup_read,
       idx_scan,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamano
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_tup_read > 0
ORDER BY seq_tup_read DESC
LIMIT 20;

-- ------------------------------------------------------------
-- 3. Índices que nunca se usaron
--
-- Cada índice hace más lenta CADA escritura de su tabla y ocupa disco; el que
-- nunca se lee es costo puro.
--
-- Antes de dropear nada, dos filtros que este SELECT no puede hacer solo:
--   a) `idx_scan = 0` sobre una base sin tráfico no prueba nada. Necesita
--      semanas de uso real acumulado.
--   b) Un índice que respalda un UNIQUE o una EXCLUDE constraint NO se dropea
--      aunque nunca se "escanee" — está ahí para hacer cumplir la restricción.
--      La columna `respalda_constraint` los marca.
-- ------------------------------------------------------------
SELECT s.relname                                   AS tabla,
       s.indexrelname                              AS indice,
       s.idx_scan                                  AS veces_usado,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamano,
       (i.indisunique OR i.indisexclusion)         AS respalda_constraint
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND s.idx_scan = 0
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- ------------------------------------------------------------
-- 4. Desde cuándo se vienen acumulando estos números
--
-- Sin esto, los tres bloques de arriba no se pueden interpretar: `pg_stat_*` se
-- reinicia con el servidor y con `pg_stat_reset()`.
--
-- En Supabase `stats_reset` viene NULL (verificado 2026-08-29: nunca se llamó
-- `pg_stat_reset()`), así que el arranque del servidor es la cota real de la
-- ventana. `COALESCE` deja la lectura correcta en los dos casos.
-- ------------------------------------------------------------
SELECT COALESCE(s.stats_reset, pg_postmaster_start_time()) AS estadisticas_desde,
       now() - COALESCE(s.stats_reset, pg_postmaster_start_time()) AS ventana_acumulada,
       s.stats_reset IS NULL AS nunca_reseteadas
FROM pg_stat_database s
WHERE s.datname = current_database();
