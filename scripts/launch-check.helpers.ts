/**
 * Pure helpers for scripts/launch-check.ts, extracted so they can be
 * unit-tested without a live DB or network.
 *
 * Adding a new pure check? Put it here. DB/HTTP-bound checks stay in
 * scripts/launch-check.ts and remain integration-style (manual validation).
 */

/**
 * Well-known placeholder for ENCRYPTION_KEY. Kept here even if `.env.example`
 * does not set ENCRYPTION_KEY explicitly, so we still catch operators who
 * paste an obvious dummy value (64 zeros) into prod env vars.
 */
export const ENCRYPTION_KEY_PLACEHOLDER =
  '0000000000000000000000000000000000000000000000000000000000000000'

export type CheckResult = { ok: true } | { ok: false; error: string }

/**
 * Filtra la lista de steps de launch-check para el modo `--probe-only`: deja
 * solo los que sondean el ambiente (`check`) y saltea los que ejecutan comandos
 * locales (`cmd`: typecheck, lint, test, test:integration, test:isolation,
 * build, e2e, stress).
 *
 * Existe porque no había forma segura de verificar PRODUCCIÓN: apuntar el env
 * file a prod y correr la lista completa dispara `pnpm test:integration`, que
 * escribe y borra filas. La única defensa era `tests/setup.ts`, que re-apunta
 * DATABASE_URL a `.env.test` con `override: true` — pero solo si ese archivo
 * existe y define el DSN. Este modo saca esa dependencia del camino: sin steps
 * `cmd`, no hay nada que pueda tocar datos.
 *
 * Genérico y estructural para no importar el tipo `Step` de launch-check.ts:
 * ese módulo termina en `void main()`, así que importarlo desde un test
 * ejecutaría todos los checks contra una DB real.
 *
 * Pure (no I/O): safe to import from tests.
 */
export function selectSteps<T extends { check?: unknown; cmd?: unknown }>(
  all: readonly T[],
  probeOnly: boolean,
): T[] {
  return probeOnly ? all.filter((s) => s.check !== undefined) : [...all]
}

/**
 * Env vars the app needs to boot in a real (non-local) environment. Shared
 * between launch-check.ts (pre-deploy CI gate) and staging-check.ts
 * (post-deploy staging verification) so the two lists can't drift apart.
 */
export const REQUIRED_ENV = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'IMPERSONATION_COOKIE_SECRET',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_APP_URL',
  // Las dos únicas vars del camino de la plata que NINGÚN otro mecanismo valida
  // (no están en el schema Zod de src/shared/env.ts) y que fallan en silencio:
  //   - MP_TURNOGOL_ACCESS_TOKEN: billing.gateway.ts la lee con `?? ''`. Sin
  //     ella, subscribe()/reactivate() llaman a MP con token vacío y el dueño
  //     del complejo no puede pagar el plan — el trial sigue andando, así que
  //     el síntoma recién aparece cuando vence.
  //   - APP_URL (distinta de NEXT_PUBLIC_APP_URL): billing.service.ts la usa
  //     para el returnUrl/notificationUrl de la suscripción con fallback
  //     silencioso a http://localhost:3000 — el webhook de la suscripción SaaS
  //     nunca llega y la suscripción no se confirma.
  // Van acá y no en el check de /api/status a propósito: `overallFrom` devuelve
  // 503 ante cualquier check en no-ok, así que una var que recién importa a los
  // 30 días pintaría la app como caída ante el uptime monitor.
  'MP_TURNOGOL_ACCESS_TOKEN',
  'APP_URL',
  // `roleIdentityCheck` más abajo la exige, pero sin ella acá el gate no dice
  // "falta esta variable": arranca, corre media docena de checks y recién
  // entonces muere con un mensaje sobre identidades de rol. Ausente en el
  // deploy, `getWorkerSql()` cae a DATABASE_URL (turnogol_app, sin BYPASSRLS)
  // y toda lectura cross-tenant devuelve 0 filas en silencio — a diferencia de
  // las dos de arriba, esta SÍ vale un 503 del uptime monitor, y por eso además
  // tiene su propio check funcional en /api/status.
  'WORKER_DATABASE_URL',
] as const

/**
 * Validates that ENCRYPTION_KEY is suitable for production use:
 * - defined (not undefined/empty)
 * - at least 64 chars (32 bytes hex-encoded)
 * - hex-only ([0-9a-fA-F]+)
 * - not equal to the .env.example placeholder
 *
 * Pure (no I/O): safe to import from tests.
 */
export function encryptionKeyStrengthCheck(key: string | undefined): CheckResult {
  if (key === undefined || key.length === 0) {
    return {
      ok: false,
      error: 'ENCRYPTION_KEY is empty or undefined (must be >= 64 hex chars)',
    }
  }
  // EXACTAMENTE 64, no ">= 64": `encrypt.ts` deriva de acá una clave de
  // AES-256 y rechaza cualquier otro largo. Con `>=`, una clave de 128 hex
  // pasaba este gate y después reventaba en runtime, en el callback de OAuth
  // de MercadoPago.
  if (key.length !== 64) {
    return {
      ok: false,
      error: `ENCRYPTION_KEY must be exactly 64 hex chars (got length ${key.length})`,
    }
  }
  if (!/^[0-9a-f]+$/i.test(key)) {
    return {
      ok: false,
      error: 'ENCRYPTION_KEY must be hex-only ([0-9a-fA-F])',
    }
  }
  if (key === ENCRYPTION_KEY_PLACEHOLDER) {
    return {
      ok: false,
      error: 'ENCRYPTION_KEY equals the .env.example placeholder (64 zeros) — generate a fresh key',
    }
  }
  return { ok: true }
}

/**
 * Fails if NEXT_PUBLIC_E2E=1 in the launch environment.
 *
 * That flag is the Playwright-only switch that makes `enforce()` short-circuit
 * and return ok for every request (src/shared/rate-limit/apply.ts). If it ever
 * leaked into production, the fail-closed brute-force defenses (PIN attempts,
 * magic link, auth verify) would silently stop blocking. It must NEVER be set
 * outside the test webServer.
 *
 * Pure (no I/O): safe to import from tests.
 */
export function e2eBypassDisabledCheck(value: string | undefined): CheckResult {
  if (value === '1') {
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_E2E=1 disables rate limiting (brute-force/PIN/magic-link defenses) — it must NEVER be set in production',
    }
  }
  return { ok: true }
}

/**
 * MP-WEBHOOK-001: fails if MP_MOCK_MODE=1 at the moment of a production
 * launch. That flag routes every MP webhook through the inline mock gateway
 * (mock-mp.ts) instead of real payment processing — safe for local/E2E/
 * staging, catastrophic if it ever reaches prod.
 *
 * Pure (no I/O): safe to import from tests.
 */
export function mpMockModeDisabledCheck(value: string | undefined): CheckResult {
  if (value === '1') {
    return {
      ok: false,
      error:
        'MP_MOCK_MODE=1 routes every MercadoPago webhook through the inline mock gateway ' +
        '(no real payment processing) — it must NEVER be set when deploying to production',
    }
  }
  return { ok: true }
}

/**
 * MP-WEBHOOK-001: fails if MP_WEBHOOK_TEST_BYPASS_SECRET is configured at the
 * moment of a production launch. That var is a staging-only credential
 * consumed by scripts/replay-mp-webhook.ts + webhook-auth.ts's non-production
 * signature fallback — it has no legitimate value in production and reduces
 * the attack surface if simply never present there.
 *
 * Pure (no I/O): safe to import from tests.
 */
export function webhookTestBypassSecretAbsentCheck(value: string | undefined): CheckResult {
  if (value) {
    return {
      ok: false,
      error:
        'MP_WEBHOOK_TEST_BYPASS_SECRET is set — this is a staging-only credential for ' +
        'scripts/replay-mp-webhook.ts and must never be configured in production',
    }
  }
  return { ok: true }
}
