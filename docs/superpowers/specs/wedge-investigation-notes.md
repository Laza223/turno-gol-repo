# Investigación: flakes de integración por "wedge" de transacción

Fecha: 2026-06-18. Estado: **causa raíz CONFIRMADA y verificada**. El fix NO quedó
aplicado (revertido a pedido); ver §6 para reaplicarlo.

## 1. Síntoma

`pnpm test:integration` (vitest, `singleThread`) falla de forma flaky con 3 tests
que hacen **timeout** (no aserción). Determinístico: casi siempre los mismos.

- `bans.test.ts > expired per-tenant ban → booking succeeds`
- `booking-checkout.test.ts > creates pending_payment booking ...`
- `webhook-notification-url.test.ts > sets notificationUrl ...`

Más una **cascada** intermitente a `staff-actions.test.ts` / `staff-roles.test.ts`.
En aislamiento o en grupos chicos: pasan. Solo fallan en el run completo.

## 2. Causa raíz (CONFIRMADA)

Cadena completa:

1. 6 suites de rate-limit setean en su `beforeAll`:
   `process.env.UPSTASH_REDIS_REST_URL = 'https://stub'` +
   `UPSTASH_REDIS_REST_TOKEN = 'stub-token'` y **nunca lo restauran**.
   Archivos: `admin-rate-limit`, `middleware-rate-limit`, `login-rate-limit`,
   `player-rate-limit`, `pin-brute-force`, `rate-limit-fail-mode`.
2. `process.env` es **global del worker**. dotenv `config()` por defecto NO
   sobrescribe vars ya presentes, así que el stub leakeado persiste a los
   archivos siguientes.
3. Los módulos se re-evalúan **aislados por archivo** (probado: ver §4), así que
   el PRIMER booking test posterior al polucionador re-resuelve
   `getSlotsCacheStore()` (`src/shared/cache/slots-cache.ts`) leyendo el env
   contaminado → construye un cliente Upstash **real** apuntando a `https://stub`
   (host inalcanzable). `pin-brute-force` corre justo antes de `bans`.
4. `createOnlineBooking` (`src/modules/bookings/booking.service.ts`) llama
   `await invalidateCourtDateSlots(...)` JUSTO después del `INSERT` de la reserva
   y antes de `ensurePTR`. Esa llamada hace `store.del(...)` por red → **cuelga
   ~37 s** (timeout interno del cliente Upstash contra el host falso).
5. La transacción queda `idle in transaction` reteniendo lock sobre `bookings`.
   El test revienta el timeout de 10 s, y el `TRUNCATE` de `cleanupAll` de los
   archivos siguientes **se bloquea** sobre ese lock → cascada de timeouts.

Medición directa (instrumentando duración con `Date.now()` dentro de
`createOnlineBooking`): `invalidate took 37232ms / 36898ms / 36893ms`, con log
`slots store = REAL Redis (url set)` exactamente para los 3 tests víctima.

## 3. Hipótesis DESCARTADAS (con cómo se descartaron)

| Hipótesis | Cómo se descartó |
|---|---|
| Conexión/txn leakeada de un test de **abonados** (multi-row insert) | El query stuck `insert into "bookings" (...)` resultó ser drizzle listando TODAS las columnas con `default` para un insert **single-row** → era el `createOnlineBooking` del propio test víctima, no abonado. |
| **pg-boss** real booteado (scheduler no stubeado) | Sin logs de pg-boss; conexiones totales se mantuvieron ~10-15 (no salto por su pool). |
| **Sentry `startSpan` / withSpan** (contexto async OTel) | Bypass de `withSpan` (`WITHSPAN_BYPASS=1`) → mismos fallos. Sentry ni siquiera se inicializa en tests. |
| Quirk de **worker_threads** con sockets postgres.js | `--pool=forks --poolOptions.forks.singleFork=true` → mismos fallos. No es thread vs fork. |
| **Lentitud** (subir timeout alcanza) | `--testTimeout=25000` → siguen colgando a los 25 s. No es lento, es un hang de ~37 s. |
| **Starvation del event loop** (GC / backlog de microtasks) | Monitor de event-loop-lag (setTimeout drift): **0 picos > 800 ms**. El loop estaba sano; el hang era I/O async real. |
| Persistencia del **global pool** `__turnogolSql` en globalThis cruzando archivos | Gate `!process.env.VITEST` para no persistir → mismos fallos. No era el carrier. |
| Agotamiento de `max_connections` de Postgres | El poller mostró total estable ~10-15, nunca trepando. |

## 4. Evidencia clave / técnica de diagnóstico

- **Vitest BUFEA los `console.log` de un test que hace timeout** → el ORDEN de los
  logs miente. No confiar en orden; medir duraciones con `Date.now()` y loguear
  el número DESPUÉS.
- La evidencia confiable fue un **poller independiente** (conexión `max:1` propia)
  sobre `pg_stat_activity` cada 750 ms: mostró el `INSERT` en estado
  `idle in transaction` / `wait_event=ClientRead` creciendo 30 s+, y en paralelo
  el `TRUNCATE` `active` / `wait_event=Lock relation` bloqueado.
- Prueba de que los módulos están **aislados por archivo**: `bookings.test.ts`
  (posición ~4) resuelve `getSlotsCacheStore()` cuando el env aún está limpio
  (→ null). Si el módulo fuera compartido, ese null quedaría cacheado y `bans`
  no colgaría. Como `bans` SÍ cuelga (re-resuelve con env contaminado), cada
  archivo re-evalúa el módulo.
- `singleThread: true` es **obligatorio**: `cleanupAll` hace `TRUNCATE` global, así
  que correr archivos en paralelo se pisarían entre sí. No se puede paralelizar
  para "aislar" sin romper el cleanup.

## 5. Riesgo latente de producción (separado del test)

`invalidateCourtDateSlots` está documentado como "fail-open / best-effort", pero
solo falla-abierto ante un **error**; ante un **HANG** (Upstash caído o mal
configurado, sin timeout en el cliente Redis) **cuelga la reserva ~37 s** dentro
de la transacción. Considerar un `AbortController`/timeout en las llamadas a Redis
o sacar la invalidación de cache fuera del camino crítico de la transacción.

## 6. Fix recomendado (NO aplicado — revertido a pedido)

Una línea en `tests/setup.ts`:

```ts
config({ path: envTest, override: true })  // antes: config({ path: envTest })
```

`override: true` recarga el baseline de `.env.test` (UPSTASH vacío) al inicio de
cada archivo, reseteando el leak por archivo.

Verificado antes de revertir: **2 corridas integration 530/530** + **unit 1240/1240**,
sin un solo fallo (antes: 3-9 fallos consistentes por corrida).

Alternativa (más explícita, sin depender de semántica de setup-per-file): que cada
una de las 6 suites de rate-limit guarde y restaure `process.env.UPSTASH_*` en
`beforeAll`/`afterAll`.
