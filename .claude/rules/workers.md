---
paths:
  - "src/shared/jobs/**"
  - "src/modules/notifications/**"
  - "Dockerfile.worker"
  - "railway.toml"
---

# Background jobs (pg-boss)

- Workers en `src/shared/jobs/workers/`, nombres de cola en `src/shared/jobs/queue-names.ts` / `definitions.ts`, proceso con `pnpm jobs:start`.
- **pg-boss 12, schema `pgboss_v12`** (`PGBOSS_SCHEMA` en `boss.ts`). El schema vacío lo crea la migración 104 y `boss.ts` pasa `createSchema: false`: `turnogol_app` no puede crear schemas. El schema viejo `pgboss` (la 9) ya no se lee en `src/` salvo en `legacy-v9-drain.ts` (se borra con él); el test `queue-registry` lo verifica por grep. Columnas en snake_case (`completed_on`, `start_after`) y sin tabla `archive`.
- **Registro de colas obligatorio:** toda cola nueva va en `QUEUE_DEFINITIONS` (`definitions.ts`). La 12 tira `PGBOSS_QUEUE_NOT_FOUND` en `send`/`schedule` si la cola no existe; `ensureQueues` (dentro de `getBoss()`) las crea. Todas con `retryLimit: 0` (el default de la 12 es 2; el reintento es cada `send`). Las `SendOptions` se tipan `satisfies SendOptions`: la 12 ignora en silencio `expireInHours`, `teamSize`, `useSingletonQueue`, `onComplete`… (usar `expireInSeconds`, `localConcurrency`, política de cola, cola `dead-letter`). Y el handler de `work()` recibe SIEMPRE un array.
- No hay conteo en vivo de profundidad (`getQueueSize` no existe): SQL `state < 'active'` sobre `pgboss_v12.job` por el pool de la app (el worker no tiene permisos ahí).
- **`getBoss()` sin argumentos es productor (sin supervisor ni cron); todo entrypoint que procese jobs pide `getBoss('worker')` primero** — si no, `/health` da 200 y los crons no se disparan nunca, sin ningún error. La guarda de `run-workers.ts` está en `tests/unit/worker-health-server.test.ts`.
- Todo job debe ser idempotente (webhooks deduplican vía `processed_webhooks` / idempotency keys en cash_flows).
- Efectos con horario (push en madrugada 00–08): patrón `startAfter` de `src/modules/notifications/push-quiet-hours.ts`, nunca sleep.
- **Un estado intermedio que sólo se sale dentro de la misma invocación del worker es una fila que se puede clavar para siempre.** Si el proceso muere en el medio (deploy de Railway, OOM), el barrido —que filtra por el estado de entrada— no la vuelve a ver nunca: falla en silencio, sin reintento ni alerta. Todo estado así necesita su marca de tiempo propia y un rescate al inicio del barrido. (pasó: 2026-09-07, AUD-15 — `notifications` en `'sending'`; el rescate está en `reclaimStalledSendingNotifications`.)
- **Para medir "hace cuánto está en este estado" hace falta una columna que se escriba AL ENTRAR al estado.** `created_at` y la marca del alta no sirven: no se mueven en la transición, así que una fila vieja en la cola cuyo trabajo arrancó recién se reclamaría en vuelo — y para un envío de mail eso es mandarlo dos veces. Verificá que la columna exista antes de construir sobre un hallazgo que la nombra: el informe de AUD-15 proponía `updated_at` y `notifications` no la tiene. Racional: `docs/decisions/2026-09-07-lote3-auditoria-integral.md` D2.
