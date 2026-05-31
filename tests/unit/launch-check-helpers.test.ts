import { describe, expect, it } from 'vitest'
import {
  ENCRYPTION_KEY_PLACEHOLDER,
  encryptionKeyStrengthCheck,
  e2eBypassDisabledCheck,
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
