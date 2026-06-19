import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CircuitBreaker, CircuitOpenError } from '@/modules/payments/mp-circuit-breaker'

const KEY = 'tenant-1'
const ok = () => Promise.resolve('ok')
const boom = () => Promise.reject(new Error('boom'))

describe('CircuitBreaker', () => {
  let now: number
  let cb: CircuitBreaker

  beforeEach(() => {
    now = 0
    cb = new CircuitBreaker({ failureThreshold: 3, openMs: 60_000, now: () => now })
  })

  describe('CLOSED', () => {
    it('passes calls through and returns the result', async () => {
      await expect(cb.execute(KEY, ok)).resolves.toBe('ok')
      expect(cb.stateOf(KEY)).toBe('closed')
    })

    it('stays closed below the failure threshold', async () => {
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      expect(cb.stateOf(KEY)).toBe('closed')
    })

    it('a success resets the consecutive-failure counter', async () => {
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      await expect(cb.execute(KEY, ok)).resolves.toBe('ok') // reset
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      expect(cb.stateOf(KEY)).toBe('closed') // only 2 since reset
    })

    it('a burst of concurrent failures surfaces the original error, never CircuitOpenError', async () => {
      // 5 calls admitted while closed; the breaker trips mid-flight (failures
      // crosses the threshold) but already-admitted calls must keep their real
      // error — they were authorized to hit MP, so workers retry the real cause.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => cb.execute(KEY, boom)),
      )

      expect(results.every((r) => r.status === 'rejected')).toBe(true)
      for (const r of results) {
        const reason = (r as PromiseRejectedResult).reason
        expect(reason).not.toBeInstanceOf(CircuitOpenError)
        expect(reason).toHaveProperty('message', 'boom')
      }
      expect(cb.stateOf(KEY)).toBe('open') // ≥3 failures accumulated
    })
  })

  describe('OPEN', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
    })

    it('opens after 3 consecutive failures', () => {
      expect(cb.stateOf(KEY)).toBe('open')
    })

    it('fails fast without invoking the operation while open', async () => {
      const op = vi.fn(ok)
      await expect(cb.execute(KEY, op)).rejects.toBeInstanceOf(CircuitOpenError)
      expect(op).not.toHaveBeenCalled()
    })

    it('stays open until the cooldown elapses', async () => {
      now += 59_999
      const op = vi.fn(ok)
      await expect(cb.execute(KEY, op)).rejects.toBeInstanceOf(CircuitOpenError)
      expect(op).not.toHaveBeenCalled()
    })
  })

  describe('HALF_OPEN', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      now += 60_000 // cooldown elapsed
    })

    it('transitions to half_open once the cooldown passes', () => {
      expect(cb.stateOf(KEY)).toBe('half_open')
    })

    it('a successful trial closes the circuit', async () => {
      await expect(cb.execute(KEY, ok)).resolves.toBe('ok')
      expect(cb.stateOf(KEY)).toBe('closed')
    })

    it('a failed trial re-opens the circuit and resets the cooldown', async () => {
      await expect(cb.execute(KEY, boom)).rejects.toThrow('boom')
      expect(cb.stateOf(KEY)).toBe('open')
      // cooldown restarted: still open just before 60s
      now += 59_999
      const op = vi.fn(ok)
      await expect(cb.execute(KEY, op)).rejects.toBeInstanceOf(CircuitOpenError)
      expect(op).not.toHaveBeenCalled()

      // ...and recovers to half_open exactly at the FULL restarted cooldown,
      // proving the cooldown reset to the re-open instant (not the original one).
      now += 1
      expect(cb.stateOf(KEY)).toBe('half_open')
      await expect(cb.execute(KEY, ok)).resolves.toBe('ok')
      expect(cb.stateOf(KEY)).toBe('closed')
    })

    it('admits only ONE trial request concurrently', async () => {
      let release: (v: string) => void = () => {}
      const slow = () => new Promise<string>((res) => { release = res })
      const trial = cb.execute(KEY, slow) // claims the single trial slot
      const op = vi.fn(ok)
      await expect(cb.execute(KEY, op)).rejects.toBeInstanceOf(CircuitOpenError)
      expect(op).not.toHaveBeenCalled()
      release('ok')
      await expect(trial).resolves.toBe('ok')

      // trial success closes the circuit and frees the slot for normal traffic
      expect(cb.stateOf(KEY)).toBe('closed')
      await expect(cb.execute(KEY, ok)).resolves.toBe('ok')
    })
  })

  describe('isolation + reset', () => {
    it('keeps per-key state independent', async () => {
      for (let i = 0; i < 3; i++) await expect(cb.execute('a', boom)).rejects.toThrow('boom')
      expect(cb.stateOf('a')).toBe('open')
      expect(cb.stateOf('b')).toBe('closed')
      await expect(cb.execute('b', ok)).resolves.toBe('ok')
    })

    it('reset(key) clears a single circuit; reset() clears all', async () => {
      for (let i = 0; i < 3; i++) await expect(cb.execute('a', boom)).rejects.toThrow('boom')
      cb.reset('a')
      expect(cb.stateOf('a')).toBe('closed')
      for (let i = 0; i < 3; i++) await expect(cb.execute('a', boom)).rejects.toThrow('boom')
      cb.reset()
      expect(cb.stateOf('a')).toBe('closed')
    })
  })

  describe('defaults (production config)', () => {
    // Production wires `new CircuitBreaker()` with NO explicit config
    // (mp-breaker.gateway.ts). Every other test injects 3 / 60_000 by hand, so a
    // regression to the defaults would slip through. This pins the real defaults.
    it('opens after exactly 3 failures and uses a 60s cooldown with no config', async () => {
      let t = 0
      const def = new CircuitBreaker({ now: () => t }) // threshold + openMs = defaults

      await expect(def.execute(KEY, boom)).rejects.toThrow('boom')
      await expect(def.execute(KEY, boom)).rejects.toThrow('boom')
      expect(def.stateOf(KEY)).toBe('closed') // 2 < default threshold (3)

      await expect(def.execute(KEY, boom)).rejects.toThrow('boom')
      expect(def.stateOf(KEY)).toBe('open') // 3rd failure trips the default threshold

      t += 59_999
      expect(def.stateOf(KEY)).toBe('open') // still open just before the default 60s
      t += 1
      expect(def.stateOf(KEY)).toBe('half_open') // half_open exactly at the 60s default
    })
  })

  describe('CircuitOpenError contract', () => {
    // The gateway relies on CircuitOpenError being a *transient* Error subclass:
    // workers re-throw it as retryable (webhook tx rollback → pg-boss retry).
    // If it stopped extending Error, that retry assumption breaks silently.
    it('is an Error subclass carrying the offending key', async () => {
      for (let i = 0; i < 3; i++) await expect(cb.execute('tenant-42', boom)).rejects.toThrow('boom')

      const err = await cb.execute('tenant-42', ok).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(CircuitOpenError)
      expect(err).toBeInstanceOf(Error) // workers treat any thrown Error as retryable
      expect((err as CircuitOpenError).key).toBe('tenant-42')
    })
  })
})
