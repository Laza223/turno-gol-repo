# B11 — Hot paths bajo volumen (el report que D6 pedía)

**Fecha**: 2026-08-12 · **Rama**: `worktree-b11-carga` · **Origen**: auditoría D6 (`MASTER_PLAN.md:300-305`)

---

## Qué se midió y qué NO

Lo que D6 pedía era k6 sobre los endpoints calientes con carga de viernes 18-22hs. Esto **no es
eso**, y decirlo importa más que el número:

|                                                                  | Estado                                    |
| ---------------------------------------------------------------- | ----------------------------------------- |
| Planes de ejecución de 16 hot paths, bajo rol real y con volumen | ✅ **medido acá**                         |
| Latencia HTTP end-to-end bajo concurrencia (k6)                  | ❌ **NO medido**                          |
| p95 de producción                                                | ❌ **NO medido, y no se puede desde acá** |

Los dos bloqueos son de entorno, no de decisión: k6 no está instalado, y el worktree no tiene
archivo de env (denegado por permisos), así que no hay dev server contra el cual tirar carga.

**Y aunque los hubiera, el número no sería el p95 de producción.** Prod es Vercel serverless +
pooler de Supabase + otra red; una corrida local mide una máquina de escritorio contra Postgres
local. Sirve para encontrar queries que se derrumban con volumen — que es exactamente lo que se
buscó acá, y en la capa donde el derrumbe realmente pasa.

Para el p95 real, el camino es el que dice `doc5_rnf.md:64` y no k6: latencia por endpoint en
Sentry. Eso **ya está instrumentado** (`tracesSampler`); lo que faltaba eran los umbrales, y se
corrigieron (ver abajo).

## Setup

- Seed: `scripts/audit/seed-d3-volume.sql` — **15.695 bookings · 22.431 cash_flows · 25.000
  audit_logs · 201 tenants · 11.714 stock_movements**. Coincide con lo declarado.
- Harness: `scripts/audit/explain-d3-hotpaths.sql`, 16 `EXPLAIN (ANALYZE, BUFFERS)`.
- Roles reales: `turnogol_app` con RLS y contexto de tenant, `turnogol_worker` para los sweeps.
  Nunca superusuario — los planes con RLS difieren (trampa del PR #30).

## Antes de medir: el harness estaba desactualizado

Las primeras cuatro corridas dieron **Seq Scan sobre `cash_flows`** en Q2–Q5 y casi lo reporto
como hallazgo. No lo era: el harness filtraba con

```sql
AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (CURRENT_DATE - 1)
```

que es la forma **anterior** al fix de D3. Ese fix migró los callers a un rango UTC sargable
(`operatingDayRangeUtc`) y la migración 054 dropeó los índices de expresión — así que hoy esa
forma solo puede dar Seq Scan. **El harness medía una query que la aplicación ya no ejecuta.**

Segunda desactualización, en Q10: filtraba por `'Seña MercadoPago — turno '`, un string que el
código nunca escribe (`depositCashFlowDescription` produce `'Seña — turno '` desde ENS-21).

Las dos corregidas. Que un artefacto de auditoría documente el problema viejo en vez del código
vivo es la misma clase que refutó la premisa central de B8.

## Resultado: la corrección de D3 funciona con volumen

Esta es la primera verificación de ese fix **a 22k filas bajo `turnogol_app` con RLS**. El canario
en CI (`query-plan-canary.test.ts`) prueba que el índice _puede_ usarse, forzando con
`enable_seqscan = off` y pocas filas; no prueba que el planner lo _elija_ con datos reales.

| Query                  | Forma vieja (expresión) | Forma del código (rango)                               |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| Q2 `getCashFlows`      | 8,37 ms · Seq Scan      | **0,157 ms** · index                                   |
| Q3 `getDaySummary`     | 7,10 ms · Seq Scan      | **0,105 ms** · Index Scan `idx_cash_flows_tenant_date` |
| Q4 `getDayComparisons` | 7,62 ms · Seq Scan      | **0,415 ms** · Bitmap Index Scan                       |
| Q5 cantina del día     | 4,34 ms · Seq Scan      | **0,043 ms** · Index Scan                              |

Entre 50× y 100×, y —lo que importa— pasa de O(tabla) a O(filas del día).

## Los 16 hot paths

15 de 16 por debajo de **3 ms** con volumen y rol real:

```
Q1  grilla del día (bookings+players)           0,704 ms
Q2  caja del día — getCashFlows                 0,157 ms
Q3  getDaySummary                               0,105 ms
Q4  getDayComparisons (7 días)                  0,415 ms
Q5  cantina del día                             0,043 ms
Q6a /explorar search + ratings                  0,873 ms
Q6b /explorar count(*)                          0,111 ms
Q6c /explorar sort=distance (Haversine)         0,656 ms
Q7  disponibilidad cross-tenant (anti-join)     2,225 ms
Q8  auto-complete cron (UPDATE)                 0,191 ms
Q9  expiry sweep                                0,018 ms
Q10 /deudas — getDebts                         59,297 ms   ← 🟡
Q11 mis-reservas del jugador                    0,164 ms
Q12a métricas — bookings 30d                    0,524 ms
Q12b métricas — revenue 30d                     0,806 ms
```

## 🟡 El único hallazgo: `/deudas` crece con la historia, no con la deuda

`getDebts` (`src/modules/bookings/booking.debts.ts:39`) es **27× más lento que el siguiente**, y el
plan explica por qué:

```
Sort  (actual time=56.557..56.570 rows=0 loops=1)
  Buffers: shared hit=71480
  ->  GroupAggregate  (actual time=56.528..56.537 rows=0 loops=1)
        Rows Removed by Filter: 10922
        ->  Sort  (rows=10922)  Sort Method: quicksort  Memory: 2194kB
              ->  Nested Loop Left Join  (rows=10922)
```

Construye, ordena y agrega **10.922 filas para descartarlas todas** y devolver **cero**. 71.480
buffers y 2,1 MB de memoria de sort, por request, para una respuesta vacía. El planner estimó 11
filas: error de **993×**.

La causa está en la forma de la query, no en un índice faltante:

```sql
WHERE b.tenant_id = ${tenantId}
  AND b.status = 'completed'          -- sin cota de fecha, sin LIMIT
GROUP BY b.id, c.name, …              -- 10 columnas, sobre TODA la historia
HAVING (price - deposit - charges) > 0 -- el filtro de deuda corre DESPUÉS de agregar
```

El predicado "¿todavía debe?" depende de un agregado, así que ningún índice lo puede resolver: hay
que materializar cada turno completado del complejo para recién después descartarlo.

**Costo real hoy: 59 ms.** No es urgente. Lo que lo hace un hallazgo es que es **el único camino
del sistema que crece con la vida del complejo** en vez de con el día: los 10.922 turnos del seed
son ~1 año de un complejo de 5 canchas. A tres años son ~33k filas por cada apertura de la
pantalla.

**No se arregla en B11, a propósito.** Los dos caminos posibles son decisiones que no me
corresponden:

1. **Acotar la ventana** (ej. últimos 12 meses) — cambia qué ve el complejo. Decisión de producto.
2. **Columna mantenida** (`bookings.pending_cents` actualizada al cobrar) — vuelve el predicado
   indexable y O(deuda), pero es migración de schema más un invariante nuevo que sostener en cada
   escritura de plata.

Hay un tercer atajo parcial que **sí** es sano y no cambia nada visible: como los cargos solo suman
(`cf.type='income'`), `pending > 0` exige `price − depósito > 0`, así que ese pre-filtro puede ir
al `WHERE` y podar antes del join. Solo ayuda cuando la seña cubre el turno entero, así que no
resuelve el caso general — por eso va como nota y no como fix.

## Lo que se corrigió acá

- **Harness actualizado** al código vivo (Q2–Q5 a rango sargable, Q10 al string real).
- **Los 6 presupuestos de doc5 §2, en código**: `src/shared/observability/latency-budgets.ts`,
  cada uno atado a la transacción que lo sirve (verificada contra el árbol de rutas, no adivinada).
  `tests/unit/latency-budgets.test.ts` parsea el spec y falla si las dos copias se separan — manda
  el documento.
- **🟡 Las alertas de Sentry**: había **una sola** de latencia, `p95 > 2000ms` global. Ese umbral
  es el del presupuesto más flojo (reportes), así que la grilla podía correr a **4× de sus 500 ms**
  sin alertar. Reemplazado por una alerta por operación con los 6 umbrales reales. Las reglas se
  cargan en la UI de Sentry (decisión ya tomada, no es código), pero ahora los números a copiar
  están bien.

## Qué queda abierto

1. **Carga HTTP con k6** — bloqueada por entorno (k6 sin instalar + sin env en el worktree).
2. **p95 de producción** — necesita tráfico real; hoy no hay. La instrumentación ya está puesta y
   junta sola.
3. **`/deudas`** — medido y documentado arriba; el fix requiere decisión de producto o de schema.
