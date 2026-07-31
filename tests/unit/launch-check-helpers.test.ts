import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ENCRYPTION_KEY_PLACEHOLDER,
  encryptionKeyStrengthCheck,
  e2eBypassDisabledCheck,
  mpMockModeDisabledCheck,
  webhookTestBypassSecretAbsentCheck,
  selectSteps,
  REQUIRED_ENV,
} from '../../scripts/launch-check.helpers'

describe('encryptionKeyStrengthCheck', () => {
  it('rejects undefined with empty/length error', () => {
    const r = encryptionKeyStrengthCheck(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/empty|undefined|length/i)
  })

  it('rejects empty string', () => {
    const r = encryptionKeyStrengthCheck('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/empty|undefined|length/i)
  })

  it('rejects length 32 (too short)', () => {
    const r = encryptionKeyStrengthCheck('a'.repeat(32))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/64|length|short/i)
  })

  it('rejects 64 chars non-hex (G*64)', () => {
    const r = encryptionKeyStrengthCheck('G'.repeat(64))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/hex/i)
  })

  it('rejects the .env.example placeholder (64 zeros)', () => {
    const r = encryptionKeyStrengthCheck(ENCRYPTION_KEY_PLACEHOLDER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/example|placeholder|zero/i)
  })

  it('accepts a fresh 64-char hex key', () => {
    // Random-ish 64 hex chars (not all zeros).
    const key = 'a1b2c3d4e5f607182930415263748596a1b2c3d4e5f6071829304152637485ff'
    expect(key).toHaveLength(64)
    const r = encryptionKeyStrengthCheck(key)
    expect(r.ok).toBe(true)
  })

  it('accepts 65 hex chars (length >= 64 is fine)', () => {
    const key =
      'a1b2c3d4e5f607182930415263748596a1b2c3d4e5f6071829304152637485ffa'
    expect(key).toHaveLength(65)
    const r = encryptionKeyStrengthCheck(key)
    expect(r.ok).toBe(true)
  })
})

describe('e2eBypassDisabledCheck', () => {
  it('rejects NEXT_PUBLIC_E2E=1 (the test bypass must never reach prod)', () => {
    const r = e2eBypassDisabledCheck('1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/E2E|bypass|rate.?limit|brute/i)
  })

  it('accepts undefined (not set — correct for production)', () => {
    expect(e2eBypassDisabledCheck(undefined).ok).toBe(true)
  })

  it('accepts empty string', () => {
    expect(e2eBypassDisabledCheck('').ok).toBe(true)
  })

  it('accepts "0" and other non-"1" values', () => {
    expect(e2eBypassDisabledCheck('0').ok).toBe(true)
    expect(e2eBypassDisabledCheck('false').ok).toBe(true)
  })
})

describe('mpMockModeDisabledCheck (MP-WEBHOOK-001)', () => {
  it('rejects MP_MOCK_MODE=1 (the inline mock gateway must never reach prod)', () => {
    const r = mpMockModeDisabledCheck('1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/mock/i)
  })

  it('accepts undefined (not set — correct for production)', () => {
    expect(mpMockModeDisabledCheck(undefined).ok).toBe(true)
  })

  it('accepts "0" and other non-"1" values', () => {
    expect(mpMockModeDisabledCheck('0').ok).toBe(true)
  })
})

describe('webhookTestBypassSecretAbsentCheck (MP-WEBHOOK-001)', () => {
  it('rejects any non-empty value (staging-only credential must never reach prod)', () => {
    const r = webhookTestBypassSecretAbsentCheck('some-staging-secret')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bypass|staging/i)
  })

  it('accepts undefined (not set — correct for production)', () => {
    expect(webhookTestBypassSecretAbsentCheck(undefined).ok).toBe(true)
  })

  it('accepts empty string', () => {
    expect(webhookTestBypassSecretAbsentCheck('').ok).toBe(true)
  })
})

describe('selectSteps (--probe-only)', () => {
  // Espejo de la forma real de `steps` en launch-check.ts: sondas de ambiente
  // con `check`, comandos locales con `cmd`.
  const fixture = [
    { name: 'env vars present', check: async () => true },
    { name: 'bypassrls role check', check: async () => true },
    { name: 'typecheck', cmd: () => undefined },
    { name: 'integration tests', cmd: () => undefined },
    { name: '/api/status healthy', check: async () => true },
  ]

  it('en probe-only deja SOLO las sondas de ambiente', () => {
    const selected = selectSteps(fixture, true)
    expect(selected.map((s) => s.name)).toEqual([
      'env vars present',
      'bypassrls role check',
      '/api/status healthy',
    ])
  })

  it('en probe-only NINGÚN step ejecuta un comando local', () => {
    // El punto del modo: sin steps `cmd` no hay nada que pueda escribir en la
    // DB apuntada por el env file (p. ej. `pnpm test:integration` contra prod).
    for (const step of selectSteps(fixture, true)) {
      expect(step).not.toHaveProperty('cmd')
    }
  })

  it('control positivo: sin probe-only conserva la lista completa', () => {
    expect(selectSteps(fixture, false)).toHaveLength(fixture.length)
  })

  it('no muta el array recibido', () => {
    const original = [...fixture]
    selectSteps(fixture, true)
    expect(fixture).toEqual(original)
  })
})

describe('launch-check.ts main() usa la lista filtrada', () => {
  // Guard de regresión de la clase peligrosa: si main() vuelve a iterar `steps`
  // en vez de `selected`, `--probe-only` pasa a ser un no-op silencioso y el
  // próximo que lo apunte a producción corre `pnpm test:integration` contra la
  // base del cliente. El test es textual a propósito: importar launch-check.ts
  // ejecutaría `void main()` y con él todos los checks contra una DB real.
  const source = readFileSync(
    path.resolve(process.cwd(), 'scripts/launch-check.ts'),
    'utf8',
  )

  it('itera la lista filtrada, no el array completo', () => {
    expect(source).toContain('for (const step of selected)')
    expect(source).not.toContain('for (const step of steps)')
  })

  it('deriva la selección de selectSteps con el flag --probe-only', () => {
    expect(source).toContain('selectSteps(steps,')
    expect(source).toContain('--probe-only')
  })
})

describe('REQUIRED_ENV', () => {
  it('cubre las 2 vars del camino de la plata que ningún otro mecanismo valida', () => {
    // MP_TURNOGOL_ACCESS_TOKEN: billing.gateway.ts la lee con `?? ''` → el
    // dueño no puede pagar el plan. APP_URL: billing.service.ts cae a
    // http://localhost:3000 → el webhook de la suscripción nunca llega.
    // Ninguna de las dos está en el schema Zod de src/shared/env.ts.
    expect(REQUIRED_ENV).toContain('MP_TURNOGOL_ACCESS_TOKEN')
    expect(REQUIRED_ENV).toContain('APP_URL')
  })

  it('no tiene duplicados', () => {
    expect(new Set(REQUIRED_ENV).size).toBe(REQUIRED_ENV.length)
  })
})
