# Búsqueda cross-complejo por disponibilidad real — Diseño

**Fecha:** 2026-06-11
**Objetivo:** cuando un jugador busca "Fútbol 5, Jueves 20:00" en `/explorar`, mostrar SOLO los complejos que tienen al menos un turno libre a esa hora.

## Decisiones

### 1. Dónde vive el filtro: extensión de `/api/public/search`

Se extiende el endpoint existente con `date` (YYYY-MM-DD) + `time` (HH:MM) opcionales, en
lugar de crear un endpoint paralelo:

- El rate limit `publicAvailability` (30 req/60s por IP) ya cubre todo `/api/public/*`
  vía el edge middleware — el filtro lo hereda sin cableado nuevo.
- "Sin fecha+hora ⇒ comportamiento idéntico" se cumple por construcción: si falta
  alguno de los dos params, el code path es exactamente el actual.
- El "deporte/formato" del requisito es el param `formats` que ya existe; cuando el
  filtro de disponibilidad está activo, el formato también restringe QUÉ canchas
  deben estar libres (no alcanza con el facet denormalizado de tenants: un complejo
  con F5 y F11 donde solo la F11 está libre NO debe matchear "Fútbol 5 a las 20:00").

### 2. Algoritmo: 2 queries totales, sin N+1

`findAvailableTenantIds({ date, time, formats? })` en
`src/modules/tenants/availability-search.service.ts`:

1. **Candidatos por horario (TS, tabla global `tenants` sin RLS):** una query trae
   id/openingHours/closedDates/settings de los tenants visibles (`active`/`trialing`).
   Por cada tenant se reutiliza `generateSlots()` (la lógica pura ya testeada de
   `public.service`) con pricing dummy y sin bookings para decidir si el horario
   pedido es un slot real de SU grilla: respeta día cerrado, `closed_dates`,
   ventana open/close (incl. cierre `00:00` = 24h), alineación de grilla
   (`open + k·duration`), slots pasados (hoy + hora ya transcurrida) y la duración
   configurada del tenant (`booking_duration_minutes[0] ?? 60`). También se exige
   `date ≤ hoy + booking_advance_days` (misma regla que `/api/public/availability`).
2. **Ocupación (1 query SQL cross-tenant):** con los candidatos y su `time_end`
   per-tenant (depende de la duración), un solo `SELECT DISTINCT c.tenant_id FROM
   unnest($ids, $ends) JOIN courts c (status='online', capacity opcional) WHERE NOT
   EXISTS (booking solapado en `pending_payment`/`confirmed`)`. Usa el índice
   existente `idx_bookings_tenant_court_date` (el predicado incluye `b.tenant_id`).
   Edge `time_end = '00:00'` (medianoche) se normaliza a `'24:00'` en SQL
   (Postgres acepta `time '24:00'`).

La intersección con el resto de los filtros la hace `searchPublicTenants` vía un
nuevo param `tenantIds` (`inArray`), preservando orden, paginación y `total`.
Lista vacía ⇒ short-circuit a `{results: [], total: 0}` sin tocar la DB.

**Estados ocupados:** `IN ('pending_payment','confirmed')` — el mismo criterio que
`checkOverlapOrThrow`/`getAvailableSlots` (fuente de verdad del flujo de reserva).
`getPublicAvailability` usa `NOT IN (canceled_*)`, pero para fechas futuras ambos
conjuntos coinciden (completed/no_show solo existen en pasado).

### 3. Acceso cross-tenant a courts/bookings

`courts` y `bookings` son RLS-aisladas por `app.current_tenant_id` y no existe un
contexto multi-tenant. Iterar `withTenantContext` por tenant sería el N+1 prohibido.
La query corre vía `getDb()` sin contexto — el mismo patrón que los workers de
pg-boss (gap de hardening conocido BK-01: hoy la conexión es owner de las tablas y
RLS no aplica; bajo FORCE RLS + rol sin bypass esta query devolvería 0 filas, es
decir **falla cerrada**, sin fuga). Queda comentado en el código para que el
hardening pass de BK-01 lo levante junto con los workers.

Solo se seleccionan `tenant_id` (datos no sensibles); nunca columnas de bookings.

### 4. Cache (Upstash, TTL 30s, mismo patrón fail-open)

En `src/shared/cache/slots-cache.ts`:

- Key `avail-search:{date}:{time}:{formatsOrdenados|all}` → `string[]` de tenant ids,
  TTL 30s (`AVAIL_SEARCH_TTL_SECONDS = SLOTS_CACHE_TTL_SECONDS`).
- **Invalidación:** cada `set` registra la key en un Redis SET de tracking
  `avail-search:keys:{date}` (TTL 120s). `invalidateAvailSearch(date)` hace
  SMEMBERS + DEL. Se invoca desde **dentro** de `invalidateCourtDateSlots`, que ya
  es el funnel de todas las mutaciones de bookings (create manual/online, cancel
  ×2, expire/confirm de pago, complete, no-show) — cero call sites nuevos.
- Fail-open en todo: cualquier error de Redis degrada a query directa; staleness
  acotada por el TTL de 30s (mismo contrato documentado del cache existente).
- `SlotsCacheStore` se extiende con `sadd`/`smembers`/`expire` (el cliente Upstash
  ya los implementa; los dobles de test se actualizan).

### 5. Integración UI (`/explorar`)

`page.tsx` (server component): si `searchParams.date` y `searchParams.time` validan
contra los primitives Zod (`dateStr`/`hhmm`), resuelve `findAvailableTenantIds` y lo
pasa como `tenantIds` a `searchPublicTenants`. Params inválidos ⇒ se ignoran (sin
500, comportamiento actual). La SearchBar ya manda `date`/`time` a la URL y los
muestra sincronizados — no se toca. El contador del toolbar refleja el total
filtrado automáticamente.

### 6. Contratos Zod

- Input: `querySchema` del route + `date: dateStr.optional()`, `time: hhmm.optional()`.
- Output: `searchResponseSchema` nuevo (cards + total) — el route valida la
  respuesta antes de serializarla.
- `Cache-Control` del route: con filtro activo `s-maxage=30` (coherente con el TTL);
  sin filtro, se mantiene `s-maxage=60`.

## Verificación

- `pnpm typecheck` + lint limpios.
- Unit: matching puro de slot pedido (grilla desalineada, día cerrado, closed_dates,
  pasado, duración 120', cierre 00:00); cache read-through (2ª llamada = hit, loader
  1 vez), invalidación por fecha, fail-open.
- Integración (DB real): con fecha+hora devuelve solo complejos con slot libre
  (ocupado por booking solapado parcial incluido); sin fecha+hora, sin regresión;
  formato restringe canchas libres; multi-cancha (1 de 2 libre ⇒ incluido).
- Perf: 50 tenants × 3 canchas con bookings, `findAvailableTenantIds` sin cache
  < 500ms.
