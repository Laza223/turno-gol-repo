# Backlog: auditorías de performance de base de datos

> **Estado: los puntos 1, 2, 3 y 7 se ejecutaron el 2026-08-29** — ver "Lo que se hizo el
> 2026-08-29" al final. Los puntos 4, 5 y 6 (`auto_explain`, bloat/vacuum, locks) siguen
> pendientes y sin fecha.
>
> Origen (2026-08-12): sale de B11, al medir los hot paths aparecieron varias cosas de la misma
> familia y el dueño pidió dejar el mapa escrito antes de meterse.

## ⚠️ Falso positivo del linter de Supabase: `auth_rls_initplan`

**El advisor de performance de Supabase reporta 100 avisos `auth_rls_initplan` que NO son reales.**
Dicen que las policies re-evalúan `current_setting()` por fila. **Ya está arreglado** desde
`052_rls_initplan_wrap.sql`.

Verificado contra la base de producción el 2026-08-29 — 100 de 101 policies están envueltas:

```sql
SELECT count(*) FILTER (WHERE qual ~* '\(\s*select' OR with_check ~* '\(\s*select') AS envueltas,
       count(*) AS total
FROM pg_policies WHERE schemaname = 'public';
-- envueltas: 100 | total: 101
```

```
tenant_isolation_select ON bookings:
  (tenant_id = ( SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid ))
```

El detector del linter busca `current_setting(` en la expresión y no reconoce el envoltorio cuando
hay un `NULLIF()` entre el `SELECT` y la llamada. **No reescribir esas 100 policies**: es trabajo
inútil sobre el mecanismo de aislamiento entre complejos, que es lo último que conviene tocar de
gusto. Si el conteo baja de 100, algo se rompió; si sube, entró una policy nueva sin envolver.

## Por qué existe este documento

B11 midió **16 queries elegidas a mano** porque parecían las calientes. Funcionó —apareció un
hallazgo real— pero el método tiene un techo obvio: solo encuentra problemas donde uno ya sospecha
que están. Las técnicas de abajo son las que dan cobertura sistemática.

Vocabulario, para buscar después: esto se llama en general **database performance auditing** o
**query tuning**. Lo de B11 puntualmente fue **análisis de planes de ejecución** (`EXPLAIN`).

---

## 1. `pg_stat_statements` — qué queries cuestan de verdad ✅ HECHO (2026-08-29)

Quedó en **`scripts/audit/top-queries.sql`**, con cuatro bloques: top-20 por tiempo total, tablas
con lectura secuencial alta, índices nunca usados (marcando cuáles respaldan un constraint) y la
ventana de acumulación. Corrido contra producción el 2026-08-29, con 2 días 21 h acumulados:

| calls  | ms total | %     | consulta                                                                                |
| ------ | -------- | ----- | --------------------------------------------------------------------------------------- |
| 16.257 | 111.880  | 36,6% | `SELECT wal->>...` — **Realtime de Supabase, no es nuestra**                            |
| 26.310 | 76.905   | 25,1% | `DISCARD ALL` — reciclado de conexiones del pooler                                      |
| 54.570 | 23.685   | 7,7%  | `SELECT id FROM notifications WHERE status=$1 AND attempt_count<=$2 ORDER BY queued_at` |
| 10.904 | 6.403    | 2,1%  | el sweep de reservas expiradas de `reconcile-pending-payments.worker.ts`                |

Las dos consultas nuestras del top son **las dos que esta auditoría tocó**: el barrido de mails
(que además devolvió 45 filas en 54.570 llamadas — casi siempre vacío) y el de reservas expiradas,
que ahora tiene su índice (`idx_bookings_expired_updated`, migr. 081).

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

## 2. Índices sin usar ✅ REVISADO (2026-08-29) — resultado: no se dropea ninguno por esta vía

Cada índice hace **más lenta cada escritura** y ocupa disco. Los que nunca se leen son costo puro.

**La query ya existe** (Q13 de `scripts/audit/explain-d3-hotpaths.sql`) y ahora también como
bloque 3 de `top-queries.sql`, que además marca cuáles respaldan un constraint.

**Revisado el 2026-08-29: el advisor de Supabase reporta 20 índices con `idx_scan = 0`, y NINGUNO
se dropeó por eso.** El motivo es el que este mismo documento advertía: la base de producción tiene
15 reservas y 2 complejos, así que "nunca usado" no prueba nada — buena parte son de Torneos, un
módulo detrás de un feature flag apagado. Queda anotado en `docs/tech-debt.md` con el disparador
"cuando haya 6 meses de tráfico real".

Lo que SÍ se dropeó en la migr. 081 son **4 índices redundantes**, por análisis estructural y no por
falta de uso: cada uno está contenido en otro índice que ya existe (`idx_payments_mp_id` bajo el
UNIQUE de la misma columna, `idx_tournament_stages_tournament` como prefijo de
`uq_tournament_stages_order`, `idx_tournaments_public` bajo `uq_tournaments_tenant_slug`,
`idx_notifications_tenant` como prefijo de `idx_notifications_tenant_status`).

Cuidado al interpretarlo: `idx_scan = 0` sobre una base de desarrollo solo dice que _en esa corrida_
no se usó. Hay que mirarlo en producción y con tiempo de acumulación, y descartar los índices que
existen para hacer cumplir una restricción (`UNIQUE`, exclusión) — esos no se dropean aunque nunca
se "escaneen".

## 3. Índices faltantes ✅ HECHO (2026-08-29)

Salieron 9 índices nuevos en `081_perf_indexes.sql`, todos para consultas cross-tenant de workers
(sin pantalla, o sea que nadie las mira) que ningún índice existente podía servir porque todos los
de esas tablas arrancan en `tenant_id`. Los dos que más costaban: el INV9 de la conciliación sobre
`cash_flows` (corre cada hora) y la ventana de 20 h sobre `audit_logs` (dos workers + la purga de
retención). Detalle y racional de cada uno, en la propia migración.

La técnica, para volver a aplicarla — el reverso del punto 2: tablas donde Postgres lee todo
(`seq_scan`) en vez de usar un índice.

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

## 7. Advisors de Supabase ✅ HECHO (2026-08-29)

Corrido con `get_advisors` del MCP: **196 avisos de performance**. Triage completo:

| Aviso                          | Cantidad | Veredicto                                                                                                                                                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth_rls_initplan`            | 100      | **FALSO POSITIVO** — ver el bloque de arriba. No tocar.                                                                                                                                    |
| `multiple_permissive_policies` | 48       | Es la RLS dual deliberada (policy de admin + policy de jugador). Consolidarlas ahorra poco y arriesga un agujero de aislamiento. Se deja.                                                  |
| `unindexed_foreign_keys`       | 26       | 3 arreglados (los de Torneos, donde el padre SÍ se borra duro). Los otros 23 quedan justificados: `staff_users`/`players`/`courts`/`plans`/`tenants` nunca se borran duro.                 |
| `unused_index`                 | 20       | Sin evidencia con esta base. Ver punto 2.                                                                                                                                                  |
| `no_primary_key`               | 1        | `pgboss.archive` — tabla interna de pg-boss, no nuestra.                                                                                                                                   |
| `auth_db_connections_absolute` | 1        | El servidor de Auth está fijado en 10 conexiones; subir el tamaño de la instancia no lo mejora sin cambiar eso a asignación por porcentaje. **Queda abierto**, es de infra y no de código. |

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

---

## Lo que se hizo el 2026-08-29

Auditoría de performance disparada por el dueño (N+1, índices, caché). El dato que ordenó todo el
esfuerzo: **la base de producción son 15 reservas, 21 pagos y 2 complejos — 200 kB**. Nada estaba
lento ni podía estarlo; todo lo de abajo es preventivo.

**Base de datos** — `081_perf_indexes.sql`: 9 índices nuevos (los dos que más pesaban son
consultas cross-tenant de workers: el INV9 de conciliación sobre `cash_flows`, cada hora, y la
ventana de 20 h sobre `audit_logs`, dos workers más la purga), 3 claves foráneas de Torneos donde
el padre sí se borra duro, y 4 índices redundantes dropeados.

**N+1** — 11 arreglados. Los más caros: la ficha de torneo hacía una consulta por equipo en cada
carga; la reserva de horas de torneo hacía `fechas × canchas × horarios` consultas (144 típicas)
manteniendo los `FOR UPDATE` de las canchas tomados durante todo el barrido; el barrido de mails
releía las 50 filas de a una cada minuto. La grilla de reservas, "Hoy" y `/explorar` —los caminos
más calientes del producto— **ya estaban bien**: no se tocaron.

**Caché** — el borrado de cuenta de un jugador invalidaba el layout raíz y con él TODA la app
(home, cada perfil público, `/precios`, el blog); ahora está acotado. Y las dos superficies que
agregan complejos (`/explorar` y la home) ya se enteran de un cambio de nombre, logo o precio en
vez de esperar 5 minutos.

**Schema** — Drizzle declaraba 21 índices que `053` había dropeado. Se borraron, y el test de
drift ganó una sección que compara índices para que no vuelva a pasar.

**Lo que NO se tocó, a propósito**: los 100 `auth_rls_initplan` (falso positivo, arriba), las 48
policies permisivas duplicadas (es la RLS dual deliberada), los 20 índices sin usar (sin evidencia
con esta base), `chargeSplitPayment` (hoistear `assertDayOpen` obliga a un flag nuevo en el camino
de plata para un ahorro de 6 consultas triviales), `push.service.ts` (pasar a `boss.insert` obliga
a re-mapear las opciones de horario silencioso y deduplicación, con N entre 1 y 10) y el escaneo de
usuarios de Supabase Auth en la invitación de staff, que quedó anotado en `docs/tech-debt.md`.
