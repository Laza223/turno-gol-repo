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
 * Validates that ENCRYPTION_KEY is suitable for production use:
 * - defined (not undefined/empty)
 * - at least 64 chars (32 bytes hex-encoded)
 * - hex-only ([0-9a-fA-F]+)
 * - not equal to the .env.example placeholder
 *
 * Pure (no I/O): safe to import from tests.
 */
export function encryptionKeyStrengthCheck(
  key: string | undefined,
): CheckResult {
  if (key === undefined || key.length === 0) {
    return {
      ok: false,
      error: 'ENCRYPTION_KEY is empty or undefined (must be >= 64 hex chars)',
    }
  }
  if (key.length < 64) {
    return {
      ok: false,
      error: `ENCRYPTION_KEY must be >= 64 hex chars (got length ${key.length})`,
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
      error:
        'ENCRYPTION_KEY equals the .env.example placeholder (64 zeros) — generate a fresh key',
    }
  }
  return { ok: true }
}
