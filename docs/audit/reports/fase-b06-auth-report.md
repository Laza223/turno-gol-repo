# Fase B6 — Auth / Sesiones / Seguridad

**Branch:** `audit/backend-b06`
**Fecha:** 2026-05-25
**Veredicto:** 🟡 1 P1 FIXED + sistemas validados

---

## Resumen ejecutivo

Auditoría de capa de seguridad: middleware Next.js, magic link Supabase, sesiones, PIN gate, rate limits, headers, MP OAuth CSRF. **1 bug P1 fixed**: PIN brute-force sin defensa (4 dígitos = 10k combinaciones → search trivial). Aplicado rate limit `pinAttempts` (5 intentos / 5 min por tenant, fail-closed).

**Sistemas validados sin bug**:
- HMAC + TTL del cookie PIN (rechaza tampering, signatures, secret swap, expiry)
- MP OAuth state CSRF (HMAC + timing-safe + length check + payload tamper rejected)
- Rate limit login magic link (5/min per email + case normalization, ya cubierto)
- Headers de seguridad CSP/HSTS/X-Frame/Referrer-Policy (ya cubierto)
- Cookie flags HttpOnly/Secure/SameSite (ya cubierto)
- RLS isolation cross-tenant + IDOR (ya cubierto en B2)

---

## Bugs encontrados

### P1 — PIN brute-force sin defensa (FIXED)

**Síntoma**: `verifyPinAction` aceptaba intentos ilimitados de PIN. 4-dígito PIN = 10k combinaciones; sin lockout, exhaustive search ~minutos con script automatizado.

**Root cause**: `verifyPin` solo comparaba hash sin contar intentos ni aplicar rate limit.

**Fix aplicado**:
- Nueva policy `pinAttempts` en `src/shared/rate-limit/policies.ts`: 5 intentos / 5 min por `tenant_id`, fail-closed.
- `src/app/(admin)/actions/pin.ts` llama `enforce('pinAttempts', tenant.id)` antes de `verifyPin`. Si rate-limited → return error con retry-after en minutos. Cookie NO se setea en ese caso.
- Análisis matemático: con 5/5min, búsqueda exhaustiva de 10k combinaciones → ~7 días. Suficiente para detectar/alertar y rotar PIN.
- Fail-closed: si Upstash cae, deniega intentos (prefer locks falsos sobre brute-force sin medir).

**Test (B6.2)**: `tests/integration/pin-brute-force.test.ts` (4 tests).
- 5 wrong attempts allowed, 6th rate-limited even with correct PIN
- Cookie NOT set when rate-limited
- Correct PIN within budget → cookie + ok:true
- Per-tenant isolation (different tenants no share budget)

**Archivos modificados**:
- `src/shared/rate-limit/policies.ts` — añade `pinAttempts`
- `src/app/(admin)/actions/pin.ts` — `enforce` antes de `verifyPin`
- `tests/unit/pin.test.ts` — mock Upstash para no romper happy-path tests

---

## Tests nuevos (16)

| Archivo | Cantidad | Status |
|---------|----------|--------|
| `tests/integration/pin-brute-force.test.ts` | 4 | ✅ |
| `tests/unit/pin-cookie-tampering.test.ts` | 6 | ✅ (HMAC tamper + TTL + secret swap) |
| `tests/unit/mp-oauth-state-csrf.test.ts` | 6 | ✅ (HMAC + length + tampering) |
| **Total** | **16** | **16/16** |

---

## Hallazgos documentados (no fix)

### P1 — Magic link TTL + single-use gestionados por Supabase
- TurnoGol no controla TTL ni single-use; ambos son defaults Supabase (~24h, PKCE).
- **Mitigación**: si seguridad lo requiere, configurar SMTP rate limit + email template warnings.
- **Riesgo bajo**: PKCE + Supabase Auth bien hardened.

### P1 — JWT secret rotation strategy = Supabase project keys
- Sin estrategia custom de rotación. Rotación = girar `SUPABASE_SERVICE_ROLE_KEY` en dashboard → invalida sesiones.
- **Documentar en B11**: runbook para emergency key rotation.

### P2 — Server Actions CSRF = Next.js built-in
- Sin tokens CSRF custom para formularios admin. Confía en Next.js + `SameSite=Lax`.
- **Riesgo**: si attacker tiene XSS, podría llamar Server Actions (mismo origen). Mitigación: CSP + escape adecuado.

### Deferido (Fase B6.7 ya cubierto)
- B2.7 JWT forgery defense → Supabase verifies signed tokens; no custom JWT layer. Resuelto.

---

## Cobertura final B6

| Área | Estado |
|------|--------|
| Auth middleware (root + SET LOCAL) | ✅ cubierto B2 |
| Magic link flow (Supabase) | ✅ tests existentes |
| Session management (Supabase JWT) | ✅ delegado a Supabase |
| PIN gate (hash, cookie, lockout) | ✅ B6.2 + B6.3 + B6.4 |
| Rate limits (5 policies + nuevo `pinAttempts`) | ✅ tests existentes + nuevos |
| CSRF Server Actions | ⚠️ Next.js built-in (P2 doc) |
| MP OAuth state CSRF | ✅ B6.6 (6 tests) |
| Security headers (CSP/HSTS/etc) | ✅ tests existentes |
| Cookie flags (HttpOnly/Secure/SameSite) | ✅ tests existentes |
| JWT rotation | ⚠️ Supabase-managed (P1 doc) |

---

## Sanity check no-regresión

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test` (unit) → ✅ **330/330** (31 files)
- `pnpm test:integration` → ✅ **291/291** (55 files, 79s)

---

## Criterios "done" Fase B6

| Criterio | Status |
|----------|--------|
| PIN brute-force defense | ✅ FIX + tests |
| PIN cookie integrity (HMAC + TTL) | ✅ 6 tests |
| MP OAuth state CSRF validation | ✅ 6 tests |
| Magic link rate limit | ✅ cubierto |
| Security headers | ✅ cubierto |
| 0 regresión | ✅ |
