import { describe, expect, it } from 'vitest'
import { pushSendOptions, quietHoursReleaseAt } from '@/modules/notifications/push-quiet-hours'
import { PUSH_SEND_SEND_OPTIONS } from '@/shared/jobs/definitions'

// ART = UTC-3 (no DST). Quiet window = [00:00, 08:00) local → release at 08:00 local.
const ART = 'America/Argentina/Buenos_Aires'

// Helper: a UTC instant that corresponds to the given ART wall-clock time.
function artInstant(y: number, mo: number, d: number, h: number, mi = 0): Date {
  // ART local = UTC-3 → UTC hour = local hour + 3.
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi))
}

describe('quietHoursReleaseAt', () => {
  it('02:00 ART (madrugada) → release at 08:00 ART same day', () => {
    const now = artInstant(2026, 6, 22, 2, 0)
    const release = quietHoursReleaseAt(now, ART)
    expect(release).not.toBeNull()
    expect(release!.toISOString()).toBe(artInstant(2026, 6, 22, 8, 0).toISOString())
  })

  it('00:00 ART (medianoche) → release at 08:00 ART same day', () => {
    const now = artInstant(2026, 6, 22, 0, 0)
    const release = quietHoursReleaseAt(now, ART)
    expect(release!.toISOString()).toBe(artInstant(2026, 6, 22, 8, 0).toISOString())
  })

  it('07:59 ART (justo antes del corte) → release at 08:00 ART same day', () => {
    const now = artInstant(2026, 6, 22, 7, 59)
    const release = quietHoursReleaseAt(now, ART)
    expect(release!.toISOString()).toBe(artInstant(2026, 6, 22, 8, 0).toISOString())
  })

  it('08:00 ART (horario operativo) → null (enviar ahora)', () => {
    expect(quietHoursReleaseAt(artInstant(2026, 6, 22, 8, 0), ART)).toBeNull()
  })

  it('21:00 ART (noche, complejo abierto) → null (enviar ahora)', () => {
    expect(quietHoursReleaseAt(artInstant(2026, 6, 22, 21, 0), ART)).toBeNull()
  })

  it('23:30 ART → null, sin cruzar al día siguiente UTC', () => {
    // 23:30 ART = 02:30 UTC del día siguiente; el cálculo debe usar la hora LOCAL (23), no la UTC (2).
    const now = artInstant(2026, 6, 22, 23, 30)
    expect(now.getUTCDate()).toBe(23) // confirma el cruce de fecha UTC
    expect(quietHoursReleaseAt(now, ART)).toBeNull()
  })
})

describe('pushSendOptions', () => {
  it('madrugada → opciones base + startAfter = release (08:00 ART)', () => {
    const opts = pushSendOptions(artInstant(2026, 6, 22, 2, 0), ART)
    expect(opts.retryLimit).toBe(PUSH_SEND_SEND_OPTIONS.retryLimit)
    expect(opts.startAfter).toBeInstanceOf(Date)
    expect((opts.startAfter as Date).toISOString()).toBe(
      artInstant(2026, 6, 22, 8, 0).toISOString(),
    )
  })

  it('horario operativo → opciones base sin startAfter', () => {
    const opts = pushSendOptions(artInstant(2026, 6, 22, 21, 0), ART)
    expect(opts.startAfter).toBeUndefined()
    expect(opts.retryLimit).toBe(PUSH_SEND_SEND_OPTIONS.retryLimit)
  })
})
