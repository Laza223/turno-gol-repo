# Backlog: auditorías de performance de base de datos

> **Estado: pendiente, decidido no ejecutar por ahora** (2026-08-12). Sale de B11: al medir los
> hot paths aparecieron varias cosas de la misma familia, y el dueño pidió dejar el mapa escrito
> antes de meterse. Nada de acá está hecho salvo lo que dice explícitamente "ya existe".

## Por qué existe este documento

B11 midió **16 queries elegidas a mano** porque parecían las calientes. Funcionó —apareció un
hallazgo real— pero el método tiene un techo obvio: solo encuentra problemas donde uno ya sospecha
que están. Las técnicas de abajo son las que dan cobertura sistemática.

Vocabulario, para buscar después: esto se llama en general **database performance auditing** o
**query tuning**. Lo de B11 puntualmente fue **análisis de planes de ejecución** (`EXPLAIN`).

---

## 1. `pg_stat_statements` — qué queries cuestan de verdad

**Es lo de mayor retorno de esta lista y ya está instalado** (verificado 2026-08-12: versión 1.10,
local y en Supabase por defecto).

Guarda estadísticas de cada query ejecutada: cuántas veces corrió, cuánto tardó en total, cuánto en
promedio. Convierte "yo elegí 16 queries" en "la base me dice cuáles son las 16".

```sql
SELECT calls,
       round(total_exec_time::numeric, 0) AS ms_total,
       round(mean_exec_time::numeric, 2)  AS ms_prom,
       left(regexp_replace(query, '\s+', ' ', 'g'), 90) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_%'
ORDER BY total_exec_time DESC
LIMIT 20;
```

**Ordenar por `total_exec_time`, no por `mean_exec_time`.** Una query de 5 ms que corre 100.000
veces cuesta más que una de 900 ms que corre 3. El promedio alto llama la atención; el total es el
que paga.

Pendiente: dejarlo como `scripts/audit/top-queries.sql` para correrlo contra local o producción.

## 2. Índices sin usar

Cada índice hace **más lenta cada escritura** y ocupa disco. Los que nunca se leen son costo puro.

**La query ya existe**: es la Q13 de `scripts/audit/explain-d3-hotpaths.sql`
(`pg_stat_user_indexes` con `idx_scan = 0`). **Nunca se revisó el resultado.**

Cuidado al interpretarlo: `idx_scan = 0` sobre una base de desarrollo solo dice que _en esa corrida_
no se usó. Hay que mirarlo en producción y con tiempo de acumulación, y descartar los índices que
existen para hacer cumplir una restricción (`UNIQUE`, exclusión) — esos no se dropean aunque nunca
se "escaneen".

## 3. Índices faltantes

El reverso: tablas donde Postgres lee todo (`seq_scan`) en vez de usar un índice.

```sql
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;
```

Ojo: en tablas chicas leer todo **es lo correcto** y más rápido que el índice. La señal es
`seq_tup_read` alto, no `seq_scan` alto.

## 4. `auto_explain` — capturar planes lentos solos

Extensión que guarda automáticamente el plan de ejecución de toda query que pase de X ms. Es la
versión continua de lo que B11 hizo a mano. En Supabase se activa por configuración del proyecto.

## 5. Bloat y vacuum

Postgres no borra en el momento: marca filas como muertas y deja que `VACUUM` las recupere. Si el
ritmo de escritura supera al del autovacuum, las tablas se hinchan y todo se vuelve más lento sin
que ninguna query cambie. Se mide con `pgstattuple` (disponible, no instalada).

Candidatas naturales acá: `audit_logs`, `analytics_events` y `notifications` — append-only y con
worker de retención, o sea mucho INSERT y mucho DELETE.

## 6. Locks y contención

Cuándo una transacción hace esperar a otra. `pg_stat_activity` (qué está corriendo ahora) y
`pg_locks` (quién bloquea a quién). Relevante en este repo porque hay varios `FOR UPDATE` y advisory
locks en los caminos de plata.

## 7. Advisors de Supabase

Supabase corre su propio chequeo de seguridad y performance sobre el proyecto. Es de solo lectura.
Se puede consultar desde una sesión de Claude con el MCP de Supabase (`get_advisors`).

---

## Las clases de bug que ya aparecieron, con nombre

Sirven de checklist para reconocerlas al leer código, sin herramientas:

| Síntoma                                                            | Nombre                                                        | Cómo se detecta                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------ |
| `/deudas` procesaba 10.922 filas para devolver 0                   | **Filtrar después de agregar** + scan sin cota                | `Rows Removed by Filter` grande en el plan |
| Las queries de caja hacían Seq Scan pese al índice                 | **Predicado no sargable** (función aplicada sobre la columna) | `Seq Scan` donde esperabas índice          |
| `/caja` traía la lista entera de deuda para mostrar un total (B10) | **Sobre-fetch**                                               | Muchas filas leídas, pocas mostradas       |
| Un `Nested Loop` con `loops=10922`                                 | **N+1**, versión SQL                                          | `loops=` alto en un nodo del plan          |

## Lo que sí quedó hecho

- **Presupuestos de latencia en código**: `src/shared/observability/latency-budgets.ts`, atados a
  `doc5_rnf.md` §2 por `tests/unit/latency-budgets.test.ts`.
- **Canario de plan de ejecución**: `tests/integration/query-plan-canary.test.ts` protege la clase
  del predicado no sargable bajo RLS.
- **Presupuesto de la búsqueda cross-tenant**: `tests/integration/availability-search-perf.test.ts`.
- **Harness de planes**: `scripts/audit/explain-d3-hotpaths.sql` + `seed-d3-volume.sql`.
  ⚠️ Un harness **congela el estado en que se escribió**: antes de creerle, diffear sus queries
  contra el service que dice replicar. En B11 medía una forma que el código ya no ejecuta.
