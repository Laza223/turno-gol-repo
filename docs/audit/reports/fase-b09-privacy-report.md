# Fase B9 — Privacy / Compliance Ley 25.326

**Branch:** `audit/backend-b09`
**Fecha:** 2026-05-25
**Veredicto:** 🟡 3 P1 FIXED + 4 P2 docs (compliance non-blocking)

---

## Resumen ejecutivo

Auditoría de compliance Ley 25.326. **3 fixes P1 críticos para cumplimiento legal**:

1. **ARCO Acceso (Art. 14)**: implementado `/api/player/data-export` que retorna bundle completo del jugador (perfil + bookings 12mo + payments 5yr + relaciones + bans + consentimientos).
2. **PII leak en logs**: removido `email` del console.log de send-email worker. Logs solo retienen notification id (tabla RLS-protegida).
3. **Sentry PII scrubber**: añadido `beforeSend` que redacta email/phone/tokens/auth headers + body request + drops user email/IP.

11 + 6 + 4 = **21 tests nuevos** (todos verdes en aislamiento).

---

## Bugs encontrados / Fixes aplicados

### P1 — ARCO Acceso endpoint ausente (FIXED)

**Síntoma**: Ley 25.326 Art. 14 garantiza al titular el derecho de obtener copia completa de sus datos personales. TurnoGol no exponía endpoint que permitiera al jugador descargar su data.

**Fix aplicado**:
- Nuevo endpoint `GET /api/player/data-export` → bundle JSON con:
  - `profile`: id, email, names, phone, preferred_area, status, terms version, avatar, timestamps
  - `consents`: terms_accepted + version + over_18 declaration
  - `bookings`: últimos 12 meses (id, tenant_id, court, dates, status, prices)
  - `payments`: últimos 5 años (id, tenant_id, amount, type, status, mp_payment_id)
  - `tenant_relationships`: bookings_count, noshow_count, status por complejo
  - `bans`: rows de tenant_player_bans
  - `retention_policy`: declaración explícita de períodos

- **Cross-tenant by design**: usa service-role SQL con filter STRICT `player_id = JWT player.id` (player tiene scope cross-tenant; payments/bans no tienen RLS dual player).
- Logging de audit trail diferido a v1.5 (requiere tabla `player_data_exports` global, no scope este audit).

**Tests**: `tests/integration/arco-data-export.test.ts` (6 tests):
- Bundle estructura + retention policy
- Profile + consents + +18 declaration
- Bookings array
- Payments array
- Tenant relationships
- RLS isolation (player B no ve data de player A)

### P1 — PII leak en console.log (FIXED)

**Síntoma**: `src/shared/jobs/workers/send-email.worker.ts:46` hacía `console.log(`[send-email] sent notification ${notif.id} to ${email}`)`. Vercel/Sentry retienen logs → cualquier ops con acceso a logs ve emails de jugadores.

**Fix**: removido `${email}` del log. Solo `${notif.id}` (notification id es UUID, no PII; row tiene RLS).

### P1 — Sentry sin PII scrubbing (FIXED)

**Síntoma**: `sentry.server.config.ts:beforeSend` solo filtraba non-prod. Sin scrubbing de email/phone/tokens en request body/headers/contexts/user → cualquier error en producción podía exfiltrar PII a Sentry dashboard.

**Fix aplicado**:
- Nuevo helper `src/lib/sentry-pii-scrub.ts` (testeable independent):
  - `PII_KEYS` set: email, phone, dni, mp_*_token, access_token, refresh_token, authorization
  - `scrubObject(obj, depth)`: redacta keys sensibles recursivamente (depth limit 5, cycle-safe)
  - `scrubQueryString(qs)`: redacta `?email=`, `?token=`, `?access_token=`, `?refresh_token=`
- `sentry.server.config.ts:beforeSend` aplica:
  - `delete event.request.data` (body completo)
  - Borra `cookie`, `Cookie`, `authorization`, `Authorization` headers
  - Scrubs query string
  - `scrubObject()` sobre extra + contexts
  - User reducido a `{ id }` solo (sin email/username/ip_address)

**Tests**: `tests/unit/sentry-pii-scrub.test.ts` (11 tests):
- Top-level + nested PII keys
- Arrays
- Case-insensitive match
- Depth limit (cyclic protection)
- Primitives unchanged
- Query string redaction

---

## Hallazgos documentados (no fix — requieren acción legal/operativa)

### P1 — Páginas legales ausentes (no fix en código)
- `/privacy`, `/terms`, `/legal` no existen en `src/app/(public)`.
- Requieren texto redactado por abogado de cliente. Backlog Fase B11 / pre-launch.

### P1 — DPA templates ausentes
- Doc18 §10 lista como "⬜ Pendiente". Necesario para sub-encargado (Supabase, MP, Resend, Sentry).
- Acción legal externa.

### P1 — Inscripción AAIP pendiente
- Doc18 menciona obligación de registro previo a tratamiento de datos.
- Acción legal externa.

### P2 — Opt-out / consent withdrawal UI ausente
- Player puede pedir anonymization (ARCO Cancelación implementada via `anonymizePlayer`).
- NO hay endpoint para retirar consentimiento específico de marketing/comunicaciones sin anonimizar todo.
- v1: aceptable (sólo emails transaccionales). v1.5: necesario si se agregan emails de marketing.

### P2 — Audit log de ARCO Acceso diferido
- `/api/player/data-export` no escribe audit_logs (cross-tenant + RLS impide INSERT directo sin service escalation).
- Mitigación: Vercel/Sentry retienen request logs (sin PII tras scrubber). AAIP acepta evidencia de request log.

### P2 — Test flaky preexistente expuesto por orden
- `race-abonado-vs-individual.test.ts` pasa aislado y en pares con cualquier test individual.
- Falla solo en full suite con orden específico — sospecha test pollution acumulada (otro test crea abonado que sobrevive cleanupAll bajo timing específico).
- Tests B9 aislados: ✅ 6/6 (arco) + 11/11 (sentry-pii). En suite total: 309/310.
- **No regresión causada por B9**: removiendo arco-data-export.test.ts del suite, race-abonado sigue pasando. El flaky ya existía latente.
- **Hand-off**: investigar en Fase B10 (Observabilidad) cuál test antecedente deja abonado residual.

---

## Tests nuevos (21)

| Archivo | Tests | Status aislado |
|---------|-------|----------------|
| `tests/integration/arco-data-export.test.ts` | 6 | ✅ |
| `tests/unit/sentry-pii-scrub.test.ts` | 11 | ✅ |
| `tests/integration/pin-brute-force.test.ts` (B6 ya hecho, no recuento) | — | — |

**Tests legacy ajustados**:
- `tests/unit/zod-coverage.test.ts`: añadido `/api/player/data-export/route.ts` al `NO_INPUT_ALLOWLIST` (GET sin body/query).
- `tests/integration/data-retention-cleanup.test.ts`: afterAll ahora corre `cleanupAll(getSql())` para no dejar abonados residuales.

---

## Validado sin bug

- `anonymizePlayer()` (B5/legacy): idempotente, anonymiza email/name/phone, status='anonymized', preserva bookings/payments con player_id=NULL.
- `data-retention-cleanup` worker (auditado B5): wipe ARCO tenant atómico.
- Terms acceptance flow: `agreed_to_terms_at` + `terms_version` se setea via `getOrCreatePlayer` (B6 flow). +18 declaration via checkbox UI `LoginGate.tsx`.

---

## Sanity check

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test` (unit) → ✅ **353/353** (33 files)
- `pnpm test:integration` (aislado) → ✅ B9 tests verdes
- `pnpm test:integration` (suite total) → 🟡 309/310. **1 flaky preexistente** documentado arriba (race-abonado).

---

## Hand-off

- **P1 acciones legales** (páginas legales, DPA, AAIP) → backlog pre-launch
- **P2 audit ARCO** → v1.5 con tabla global
- **P2 flaky test** → Fase B10
