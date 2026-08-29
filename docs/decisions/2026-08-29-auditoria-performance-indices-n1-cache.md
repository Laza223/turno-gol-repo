# Auditoría de performance: qué se tocó, qué no, y por qué

**Fecha**: 2026-08-29 · **Rama**: `perf/indices-n1-cache` · **Migración**: `081_perf_indexes.sql`

Disparador: el dueño vio un reel que nombra tres causas clásicas de lentitud (N+1, falta de
índices, falta de caché) y pidió auditar el sistema con foco en eso. Cierra los puntos 1, 2, 3 y 7
de [BACKLOG-PERFORMANCE-DB.md](../audit/BACKLOG-PERFORMANCE-DB.md), que estaban escritos desde
2026-08-12 sin ejecutar.

## La premisa que ordenó todo el esfuerzo

**La base de producción son 15 reservas, 21 pagos, 3 jugadores y 2 complejos — 200 kB en total.**
Medido con `pg_stat_user_tables` antes de tocar nada. Nada estaba lento ni podía estarlo.

Eso cambia el criterio de aceptación de cada fix: no se trata de recuperar latencia que hoy se
pierde, sino de dejar el sistema preparado y poner los medidores. Y sobre todo, **descalifica como
evidencia todo lo que dependa de tráfico acumulado** — que es exactamente la trampa en la que caen
las herramientas automáticas (ver el punto siguiente).

Cómo re-medirlo cuando haga falta:

```sql
SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;
```

## Decisión 1: los 100 avisos `auth_rls_initplan` de Supabase son un falso positivo

**Alternativa descartada: reescribir las 100 policies.** Era el hallazgo aparentemente más grande
de la auditoría — el linter de Supabase dice que las policies re-evalúan `current_setting()` por
cada fila, que es el error de RLS más caro que existe.

Es falso. `052_rls_initplan_wrap.sql` ya las envolvió. Verificado contra la base viva:

```sql
SELECT count(*) FILTER (WHERE qual ~* '\(\s*select' OR with_check ~* '\(\s*select') AS envueltas,
       count(*) AS total
FROM pg_policies WHERE schemaname='public';
-- envueltas: 100 | total: 101
```

El detector busca `current_setting(` en la expresión y no reconoce el envoltorio cuando hay un
`NULLIF()` entre el `SELECT` y la llamada:

```
(tenant_id = ( SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid ))
```

**El gotcha que va a volver a morder**: un `grep` sobre las migraciones ORIGINALES tampoco lo
detecta — `006_rls_policies.sql` crea las policies sin envolver, y la 052 las recrea después. Un
barrido sobre los archivos de migración da "0 envueltas" y confirma el falso positivo del linter.
La única fuente válida para el estado de las policies es `pg_policies` en la base, nunca el SQL de
las migraciones.

## Decisión 2: un solo índice `(created_at)` en `audit_logs`, no `(action, created_at)`

Tres consumidores cross-tenant sin `tenant_id`: dos workers filtran por `action` dentro de una
ventana de 20 h, y la purga de retención borra por `created_at`.

**Alternativa descartada: `(action, created_at)`.** Serviría perfecto a uno de los dos workers
(`action = 'subscription.mp_desync'`, igualdad) pero **no al otro**, que filtra
`action LIKE 'reconciliation.drift_%'` — un `LIKE` con prefijo constante no usa un btree en la
collation por defecto, hace falta `text_pattern_ops`. Y no serviría a la purga, que no filtra por
`action`.

`(created_at)` solo los sirve a los tres: la ventana de 20 h es muy selectiva sobre una tabla de
crecimiento monótono, y el filtro por `action` queda como residual sobre un puñado de filas. Un
índice en vez de dos o tres, sin trampas de collation.

## Decisión 3: no se dropea ningún índice por falta de uso

**Alternativa descartada: dropear los 20 que el advisor marca con `idx_scan = 0`.** Con 15
reservas, "nunca usado" no significa "inútil" — significa "no hubo tráfico". Varios son de
Torneos, un módulo detrás de un feature flag global apagado: por supuesto que no se usaron.

Los 4 que **sí** se dropearon salieron de análisis estructural, no de estadísticas: cada uno está
contenido en otro índice que ya existe (un prefijo, o la misma clave bajo un `UNIQUE`). Eso es
verificable hoy, con la base vacía, mirando `pg_indexes`.

Los otros 20 quedaron en [tech-debt.md](../tech-debt.md) con el disparador puesto en tráfico real
acumulado, no en una fecha.

## Decisión 4: los 48 `multiple_permissive_policies` se dejan como están

Es la RLS dual documentada a propósito (policy de admin + policy de jugador sobre `bookings` y
`player_tenant_relationships`, entre otras). Postgres evalúa ambas con `OR` por fila.

**Alternativa descartada: consolidarlas en una sola policy con `OR`.** Ahorra dos comparaciones de
uuid contra un InitPlan ya cacheado — o sea, casi nada — y a cambio mete un cambio en el mecanismo
de aislamiento entre complejos. Mala relación riesgo/beneficio en lo último que conviene tocar de
gusto.

## Decisión 5: tres N+1 reales que NO se arreglaron

Los tres se identificaron, se midieron y se dejaron. El motivo en cada caso es el mismo: el costo
del fix supera al del problema.

- **`chargeSplitPayment`** ([cashflow.service.ts](../../src/modules/cashflow/cashflow.service.ts)):
  cada línea de un cobro mixto repite `assertDayOpen`, que son un advisory lock más dos `SELECT`.
  Sacarlo del loop obliga a agregar un flag a `createCashFlow` para saltear el guard — una función
  con 7+ llamadores, en el camino de plata, donde un flag mal pasado saltea el control de día
  cerrado. El ahorro son ~6 consultas triviales sobre índices, con N acotado a 5 por diseño.
- **`push.service.ts`**: un `boss.send` por dispositivo suscrito. `boss.insert([...])` haría el
  lote, pero recibe `JobInsert[]`, no las `SendOptions` que hoy llevan el horario silencioso
  (`startAfter`) y la clave de deduplicación. Re-mapear eso a mano arriesga romper una regla de
  producto explícita (nada de push entre las 00 y las 08) para ahorrar entre 1 y 10 INSERTs.
- **`getFirstBookingSlots`** (onboarding): 3 consultas por cancha, una de ellas idéntica en cada
  vuelta. El fix limpio es extraer una variante en lote de `getAvailableSlots`, que vive en
  `booking.service.ts` y tiene varios llamadores y muchos tests que la mockean. El paso corre
  **una vez en la vida de cada complejo**, con N entre 1 y 7.

## Decisión 6: `updateTag` y no `revalidateTag` para el listado público

Next 16 cambió la firma: `revalidateTag(tag, profile)`, con semántica stale-while-revalidate.
`updateTag(tag)` expira en el acto pero **solo se puede llamar desde una Server Action**.

Se eligió `updateTag` porque el caso es un complejo que acaba de guardar su nombre o su precio y va
a mirar si se ve: con stale-while-revalidate, la primera visita después del guardado sigue
mostrando lo viejo, que es justo el síntoma que esto viene a arreglar. La contrapartida está
anotada en [public-listings.ts](../../src/shared/cache/public-listings.ts): si algún día hace falta
invalidar desde un Route Handler o un worker, ahí va `revalidateTag(tag, 'max')`.

## Decisión 7: el test de drift compara índices en UNA sola dirección

La sección nueva de [schema-drift.test.ts](../../tests/integration/schema-drift.test.ts) exige que
todo índice declarado en Drizzle exista en la DB. Eso atrapa el drift que efectivamente pasó: el
schema declaraba 21 índices que `053_index_hygiene.sql` había dropeado, y las secciones existentes
(tablas, columnas, enums) no miran índices.

**Alternativa descartada: validar también DB → Drizzle.** Necesitaría una allowlist de ~28
entradas, porque las migraciones a mano crean cosas que Drizzle no modela: las `EXCLUDE`
constraints GiST, los índices parciales con predicado sobre enums, y los `UNIQUE` inline que
Drizzle sí declara pero con otra sintaxis (`.unique()` en la columna, que no aparece como índice en
`getTableConfig`). Una allowlist de ese tamaño se pudre sola y deja de proteger.

## Gotcha: dropear un índice obliga a tocar DOS lugares

**Una migración que hace `DROP INDEX` tiene que borrar también su declaración en
`src/shared/db/schema/*.ts`, o el test de drift queda rojo.** Pasó en esta misma sesión: la `081`
dropea cuatro índices redundantes, se borraron las 21 declaraciones heredadas de la `053` y se
olvidaron las 4 nuevas — justo las que esta migración dropeaba. La verificación adversarial lo
encontró aplicando la migración de verdad y corriendo el test, no leyendo el código.

Cómo se manifiesta: `Integration & Isolation` (required check) queda rojo con
`"<tabla>: índice '<nombre>' declarado en Drizzle, ausente en la DB"`. El CI aplica **todas** las
migraciones con un glob (`for f in src/shared/db/migrations/0*.sql`) antes de correr la suite, así
que agarra la migración nueva del working tree y el fallo aparece en el primer push.

Antes de dar por cerrada una migración con `DROP INDEX`, el chequeo es de una línea:

```bash
grep -rn "$(grep -oP 'DROP INDEX IF EXISTS \K[a-z0-9_]+' src/shared/db/migrations/<NNN>_*.sql | tr '
' '|' | sed 's/|$//')" src/shared/db/schema/
```

## Lo que quedó verificado, y cómo

La `081` se aplicó con `pnpm supabase:reset` (cadena limpia, las 81 migraciones desde cero) y se
midió contra `seed-d3-volume.sql`: 15.695 reservas, 22.431 movimientos de caja, 25.000 registros de
auditoría. El control es un `DROP INDEX` dentro de una transacción con `ROLLBACK`, o sea el mismo
momento y las mismas estadísticas en los dos lados.

**INV9 de la conciliación, sobre `cash_flows` (22.431 filas):**

|               | Plan                                                             | Buffers | Tiempo  |
| ------------- | ---------------------------------------------------------------- | ------- | ------- |
| sin el índice | `Seq Scan` + `Sort`, `Rows Removed by Filter: 22431`             | 391     | 2,45 ms |
| con el índice | `Index Scan using idx_cash_flows_booking_mp_created`, sin `Sort` | **1**   | 0,09 ms |

El `Sort` desaparece porque el índice ya entrega el orden que pide el `ORDER BY created_at`. Esta
consulta corre **cada hora**.

**Ventana de 20 h sobre `audit_logs` (25.000 filas):**

|               | Plan                                                                                                                                     | Buffers |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| sin el índice | `Index Scan using idx_audit_logs_tenant_created` — recorre el índice compuesto ENTERO aplicando el `Index Cond` sobre su segunda columna | 214     |
| con el índice | `Bitmap Index Scan on idx_audit_logs_created`                                                                                            | **57**  |

Vale la corrección: acá **no** era un `Seq Scan`. Postgres 17 igual usa el índice compuesto
salteando su primera columna, así que la mejora es de 3,7× y no de 400×. El comentario de la
migración se corrigió para decir eso y no lo que se había asumido.

**Lo que el seed NO pudo demostrar**: la consulta de reservas expiradas
(`idx_bookings_expired_updated`) no discrimina con este fixture — no hay reservas `expired`
recientes sembradas, así que los dos planes cortan temprano por otro camino. El índice se justifica
por otra vía: `pg_stat_statements` de producción la muestra con 10.904 llamadas en 2 días 21 h,
entre las consultas más ejecutadas del sistema.

`test:integration` y `test:isolation` corrieron después del reset, con los roles locales
restaurados según [setup-local-roles.md](../operations/setup-local-roles.md) — ese paso hace falta
después de CADA `supabase:reset`, porque las migraciones crean los roles `NOLOGIN` a propósito.
