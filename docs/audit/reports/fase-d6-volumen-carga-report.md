# D6 — Volumen y carga

**Fecha**: 2026-08-13 · **Rama**: `worktree-d6-carga-concurrencia` · **Precedida por**: B11 (`docs/audit/reports/2026-08-12-b11-carga-hot-paths.md`, 2026-08-12)

## Qué pedía D6 y qué de eso ya estaba hecho

`docs/audit/MASTER_PLAN.md:300-305` pedía k6 contra 2 endpoints calientes (disponibilidad pública, webhook MP), sobre el seed de D3, midiendo p95/p99 real vs `doc5_rnf.md` §2.

Un día antes (2026-08-12), B11 ya había cubierto la mitad — 16 planes `EXPLAIN ANALYZE` bajo rol real y volumen — y dejó documentado, con evidencia, que el k6 local que pedía D6 **no contesta la pregunta que doc5 hace**: prod es Vercel serverless + pooler de Supabase, local es escritorio + Postgres local. El camino real al p95 de producción es Sentry (`doc5_rnf.md:64`), ya instrumentado, con los 6 presupuestos por operación cargados como alertas desde ese mismo día (`src/shared/observability/latency-budgets.ts`).

Esta sesión no repite esa capa. Cierra las dos partes que quedaban:

1. **3 hallazgos de volumen nuevos** (aparecieron explorando el drift de schema desde D1, no estaban en el radar de B11) — medidos con el mismo harness EXPLAIN.
2. **Un smoke de concurrencia local** — lo que ningún `EXPLAIN` solo puede ver: contención bajo carga simultánea real y procesamiento duplicado de webhooks.

## Parte 1 — Harness EXPLAIN extendido (`scripts/audit/explain-d3-hotpaths.sql`)

Corrido contra el seed de D3 re-aplicado (mismos conteos que B11: 15.695 bookings, 22.431 cash_flows, 11.714 stock_movements, 1.785 player_tenant_relationships).

### Q10 / Q10b — `getDebts`, ventana default (12 meses) vs `'all'`

El propio harness estaba desactualizado *de nuevo*: medía la forma de `getDebts` **anterior** a `perf(deudas)` (#144, el mismo día que B11), que ya le agregó la ventana de 12 meses por defecto. Se corrigió Q10 para reflejar el código actual y se agregó Q10b para el escape hatch (`window: 'all'`, botón "Ver anteriores").

| | Buffers | Tiempo | Filas descartadas por el `HAVING` |
|---|---|---|---|
| Q10 (12 meses, default) | 56.147 | ~63ms | 10.922 |
| Q10b (`'all'`) | 56.152 | ~89ms | 10.922 |

**Resultado honesto, no el esperado**: la ventana de 12 meses no excluye ninguna fila con este seed. El seed modela ~1 año de historia (`seed-d3-volume.sql:4`), así que el cutoff de 12 meses coincide con el borde exacto de los datos sintéticos — no hay nada más viejo que excluir. La mejora real de #144 se ve en un complejo con más de 1 año de antigüedad real; reproducirla con `EXPLAIN` exigiría extender el seed a >12 meses, que quedó fuera de alcance de esta sesión (no es gratis: tocar `seed-d3-volume.sql` para eso arriesga romper los otros 15 hot paths que ya calibra). Q10b confirma, eso sí, que el escape hatch sigue siendo caro **por diseño** — no es un hallazgo nuevo, es el costo aceptado del botón (`street-money-window.ts:11-19`).

### Q14 — `getPlayerActivity` (`src/modules/players/activity.service.ts:22`)

Sospecha original: sin ventana de fecha, crece con toda la carrera del jugador. Medido sobre el jugador con más historial del seed (`d3seed+42@example.com`, 26 bookings totales): **28 buffers, 0,14-0,16ms**. Trivial.

**No es un hallazgo real, y vale decir por qué se descarta en vez de solo reportar el número**: a diferencia de `getDebts` (crece con TODO el historial del TENANT — miles de turnos/año), esta query crece con el historial de UNA PERSONA, acotado por una frecuencia de reserva humana realista (nadie juega miles de partidos). El riesgo de escala es estructuralmente distinto y mucho menor. Queda comprobado, no arreglado — no había nada que arreglar.

### Q15 — `listTenantClients` (`src/app/(admin)/jugadores/queries.ts:89`)

Confirmado: el `LIMIT`/`OFFSET` final solo recorta el resultado — ninguna CTE interna (`registered`/`unlinked`/`grouped`/`group_bookings`/`contacts`) lleva límite propio. Página 0 sobre `d3-heavy` (440 personas con cuenta + 30 fijos sin cuenta): **41.692 buffers, 54ms**. El 96% del costo (39.912 buffers) es la CTE `contacts` — cada uno de los 30 fijos sin cuenta dispara un `LEFT JOIN LATERAL` que re-escanea `player_tenant_relationships` buscando coincidencia de teléfono para la sugerencia de vínculo.

**🟡 Hallazgo, no fixeado esta sesión**: 54ms hoy es cómodo (muy por debajo del presupuesto de dashboard admin, 800ms), pero el costo escala con `personas_registradas × personas_sin_cuenta`, no con el tamaño de la página. Un complejo con años de antigüedad y miles de personas podría sentirlo. No se toca sin evidencia de que duela — mismo criterio que el plan de esta fase pactó: reportar, no arreglar a ciegas. Candidato natural para `docs/audit/BACKLOG-PERFORMANCE-DB.md` si algún complejo real lo empieza a notar.

## Parte 2 — Smoke de concurrencia local (`scripts/audit/loadsmoke-d3.ts`, `pnpm audit:loadsmoke`)

**Decisión técnica**: `autocannon` (devDependency nueva) en vez de k6. k6 es un binario Go — instalarlo agrega una pieza móvil nueva para medir algo que B11 ya documentó como "no es el p95 de prod". `autocannon` da los mismos percentiles, corre como script Node, cero fricción de instalación.

Corrido contra `pnpm dev` (Turbopack) local con `MP_MOCK_MODE=1`, 15 conexiones, 10s por endpoint:

| Endpoint | p50 | p95 (≈p97.5) | p99 | Budget doc5 (p95/p99) | Resultado |
|---|---|---|---|---|---|
| `GET /api/public/availability` (grilla) | 502ms | 608ms | 787ms | 500/800ms | OK, al límite |
| `GET /api/public/search` (búsqueda) | 426ms | 587ms | 768ms | 600/1000ms | OK |

**Caveat importante, medido y no solo afirmado**: la primera corrida (server recién levantado, Turbopack compilando en frío) dio p99=1413ms en `availability` — muy por encima del presupuesto. La segunda corrida (mismo código, server ya "tibio") dio 727ms. Esa diferencia es compilación on-demand de Turbopack, no una query lenta — confirma lo que ya advertía B11: un número de `next dev` local sobre-estima la latencia real y no debe leerse como "el código es lento" sin cruzarlo contra Sentry. Se intentó además medir contra un build de producción (`next build && next start`) para sacar el ruido de Turbopack, pero `next start` fija `NODE_ENV=production` y el schema de env (`src/shared/env.ts:36-37`) exige credenciales productivas reales de Upstash/VAPID/R2 que no están provisionadas en local por diseño — mismo motivo por el que el propio `test:e2e` del repo corre sobre `next dev`, nunca `next start` (`CLAUDE.md`). No se armaron credenciales falsas para forzarlo: hubiera sido más rabbit hole que señal para una sesión de este tamaño.

### Webhook — 12 POSTs concurrentes, mismo evento (idempotencia bajo carrera real)

Simula MP reintentando la misma notificación (escenario real: timeout de MP, reintento automático). 12 requests concurrentes con el mismo `mp_event_id` y el mismo `data.id`, contra un booking `pending_payment` con seña del seed:

```
HTTP status: 200×12
processed_webhooks rows: 1
bookings.status final: confirmed
payments rows creadas: 1 (no 12)
```

**OK — el lock transaccional (`lockMpEvent`, `mp-webhook.handler.ts:198`) sostiene la idempotencia real bajo concurrencia**, no solo en el caso feliz de una sola entrega. Único ajuste necesario para poder correr esto: el `mp_payment_id` sintético del seed (`d3-mp-<hash>`) no matcheaba ni el formato real de MP ni `MOCK_MP_ID_RE` — se cambió el objetivo del test a un booking `pending_payment` + `MOCK-APPROVED-<bookingId>` (el formato que el propio gateway mock espera, `mock-mp.ts:46`), y se agregó `mp_access_token` placeholder al tenant `d3-heavy` del seed (el handler exige "tenant conectado a MP" antes de llegar al gateway, incluso bajo mock — el valor nunca se lee de verdad en modo mock, `mp-oauth.ts:122`).

## Qué queda abierto, a propósito

- **p95 de producción real**: se lee de Sentry, no de acá — cuando el cliente instalado genere tráfico real, las 6 alertas por operación (B11) son la señal que importa.
- **`listTenantClients` bajo volumen real** (🟡, Parte 1): no se toca sin evidencia de que un complejo real lo sienta.
- **`getDebts` con ventana `'all'` bajo volumen >12 meses**: no se pudo demostrar la mejora de #144 con el seed actual (ver Parte 1) — no es un hallazgo, es un límite del fixture.

## Verificación
- `pnpm typecheck` y `pnpm lint` verdes tras cada cambio de código
- Harness EXPLAIN corrido contra el seed real, con evidencia pegada arriba
- Smoke de concurrencia corrido contra `pnpm dev` real (no mock de UI), 3/3 checks en verde en la corrida final
- Ningún hallazgo de esta sesión requirió tocar código de producto — todo quedó en `scripts/audit/` + reporte
