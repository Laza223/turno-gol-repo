# Fase B7 — API Contracts / Endpoints Públicos

**Branch:** `audit/backend-b07`
**Fecha:** 2026-05-25
**Veredicto:** 🟡 1 P2 FIXED + 2 P2 docs

---

## Resumen ejecutivo

Auditoría de 34 endpoints `/api/**/route.ts`. **Cobertura Zod input: 100%**. Bug P2 fixed: route params `[id]` extraídos con `.pop()!` sin validación → UUID malformado filtraba error Postgres crudo (500 con stack trace). Helper `parseRouteUuid()` aplicado en endpoints `bookings/[id]` y `courts/[id]`.

**Sistemas validados sin bug**:
- Mass assignment: 0 patterns `{...body}` detectados — todos los PATCH whitelistean fields
- SQL injection via UUID: Drizzle parametriza ✓ (RLS también protege)
- Player ban "enumeration": by-design (revela ban al player autenticado, no permite enumerar otros)

---

## Bugs encontrados

### P2 — UUID malformado en `[id]` filtra 500 (FIXED)

**Síntoma**: `req.nextUrl.pathname.split('/').pop()!` pasaba string directo a Drizzle. Inputs adversariales (`not-a-uuid`, `' OR '1'='1`, path traversal) llegaban a Postgres → `22P02 invalid input syntax for type uuid` → Next.js retornaba 500 con SQL query parcial en el body.

**Test reproductor**: `tests/integration/api-adversarial-uuid.test.ts` (8 tests). Sin fix: 6/8 fail (Postgres exception bubbles). Con fix: 8/8 ✅.

**Fix aplicado**:
- Nuevo helper `src/shared/api/route-params.ts` con `parseRouteUuid(req)` — Zod UUID validation early. Returns `{ uuid }` or `{ response: NextResponse(400) }`.
- Aplicado en:
  - `src/app/api/bookings/[id]/route.ts` (GET + PATCH)
  - `src/app/api/courts/[id]/route.ts` (GET + PATCH)

**Endpoints similares NO fixed (documentados como deuda)**:
- `src/app/api/bookings/[id]/cancel/route.ts:23` — usa `pathname.split('/')` con index manual
- `src/app/api/bookings/[id]/complete/route.ts:14` — idem
- `src/app/api/bookings/[id]/no-show/route.ts:14` — idem
- `src/app/api/courts/[id]/status/route.ts:13` — idem
- `src/app/api/player/bookings/[id]/cancel/route.ts:26` — idem
- `src/app/api/abonados/[id]/route.ts:26` — idem

**Mitigación parcial**: estos endpoints están detrás de `withTenant` que abre tx con tenant_id setteado. Postgres aún lanzaría 22P02, pero la tx se aborta y rollback. Cliente recibe 500 pero sin mutation. **Recomendado en B8/B11**: refactor batch para que TODOS los `[id]` usen `parseRouteUuid()`.

**Endpoint que YA validaba**: `src/app/api/player/bookings/[id]/route.ts:13` — único con Zod UUID. Patrón a propagar.

---

## Tests nuevos (8)

| Archivo | Tests | Status |
|---------|-------|--------|
| `tests/integration/api-adversarial-uuid.test.ts` | 8 | ✅ |

Coverage:
- Malformed UUID (literal strings)
- SQL injection attempt en URL param
- Path traversal (`..%2F..%2Fetc%2Fpasswd`)
- Invalid JSON body (graceful 400)
- Oversized notes (>2000 chars → 422 validation)
- Misma cobertura para GET + PATCH en `/bookings/[id]` y `/courts/[id]`

---

## Hallazgos documentados (no fix)

### P2 — Output schema validation ausente
- Ninguno de los 34 endpoints valida response con Zod antes de `NextResponse.json()`.
- Riesgo: contrato API puede divergir de implementación silenciosamente. Cliente confía pero docs (doc15) y código pueden quedar fuera de sync.
- **Mitigación recomendada** (no fix ahora): añadir `.parse(data)` en responses críticos o type-narrow con DTO. Backlog.

### P2 — Error format inconsistente
- Algunos endpoints retornan `{ error: 'string' }`, otros `{ error: { code, message } }`, otros `{ error: { code, message, details } }`.
- Ejemplos:
  - `/api/bookings/[id]:36` → `{ error: 'not_found' }`
  - `/api/bookings/[id]:87` → `{ error: { code: 'VALIDATION_ERROR', message: ... } }`
  - `/api/player/bookings:124` → `{ error: { code, message, details } }`
- **Riesgo**: cliente debe parsear ambos formatos. UX inconsistente.
- **Recomendación**: estandarizar a `{ error: { code, message, details? } }`. Backlog.

### P2 — No API versioning
- Todos los endpoints bajo `/api/` sin prefijo `/v1/`. Sin negociación via `Accept`.
- **Riesgo**: breaking changes fuerzan migración coordinada de todos los clientes. Para v1 mobile/PWA futura, conviene introducir `/api/v1/`.
- **Recomendación**: documentar como decisión consciente o planificar `/v1` antes de Año 2.

### P2 — Payload size limits = Next.js default (1MB)
- Sin límites custom por endpoint. Webhook MP no chequea `Content-Length`.
- **Riesgo**: bajo (1MB ya muy grande para mayoría de payloads). Pero CSV export no pagina → memoria server.
- **Recomendación**: backlog.

### Validado sin riesgo (by-design)
- **Player ban enumeration**: `/api/player/bookings:POST` retorna `PLAYER_BANNED` code. NO permite enumerar otros players (requiere JWT propio del player banned). Info disclosure al dueño del JWT solamente → by-design.

---

## Cobertura final B7

| Área | Estado |
|------|--------|
| Input Zod validation (34 endpoints) | ✅ 100% |
| Route params UUID validation | 🟡 2/8 fixed, 6 documentados |
| Output schema validation | ⚠️ 0/34 — P2 documentado |
| Mass assignment | ✅ 0 patterns inseguros |
| SQL injection | ✅ Drizzle parametriza + RLS |
| Path traversal | ✅ no endpoints serve files de input user |
| Error format | ⚠️ inconsistente — P2 documentado |
| API versioning | ⚠️ ausente — P2 documentado |
| Payload size limits | ⚠️ default — P2 documentado |
| User enumeration | ✅ Supabase magic link (no leak) |

---

## Sanity check no-regresión

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test` (unit) → ✅ **330/330** (31 files)
- `pnpm test:integration` → ✅ **299/299** (56 files, 81s)

---

## Hand-off

- **P2 batch refactor `parseRouteUuid()` en 6 endpoints restantes** → backlog B8/B11
- **P2 output schema validation** → backlog
- **P2 error format consistency** → backlog
- **P2 API versioning strategy** → backlog
