import { describe, expect, it } from 'vitest'
import {
  uuid,
  dateStr,
  hhmm,
  hhmmEnd,
  moneyCents,
  boundedText,
  slug,
} from '@/shared/validation/primitives'

describe('shared validation primitives', () => {
  it('uuid: valid v4', () => {
    expect(uuid.safeParse('11111111-2222-3333-4444-555555555555').success).toBe(true)
  })
  it('uuid: rejects malformed', () => {
    expect(uuid.safeParse('not-a-uuid').success).toBe(false)
    expect(uuid.safeParse('11111111-2222-3333-4444').success).toBe(false)
  })
  it('dateStr: accepts YYYY-MM-DD', () => {
    expect(dateStr.safeParse('2026-05-22').success).toBe(true)
  })
  it('dateStr: rejects 2026/05/22 and other formats', () => {
    expect(dateStr.safeParse('2026/05/22').success).toBe(false)
    expect(dateStr.safeParse('22-05-2026').success).toBe(false)
  })
  it('hhmm: accepts 00:00 to 23:59', () => {
    expect(hhmm.safeParse('00:00').success).toBe(true)
    expect(hhmm.safeParse('23:59').success).toBe(true)
  })
  it('hhmm: rejects 24:00 and 12:60', () => {
    expect(hhmm.safeParse('24:00').success).toBe(false)
    expect(hhmm.safeParse('12:60').success).toBe(false)
  })
  it('hhmmEnd: accepts 00:00 to 23:59 same as hhmm', () => {
    expect(hhmmEnd.safeParse('00:00').success).toBe(true)
    expect(hhmmEnd.safeParse('23:59').success).toBe(true)
  })
  it('hhmmEnd: accepts 24:00 (ENS-13, medianoche)', () => {
    expect(hhmmEnd.safeParse('24:00').success).toBe(true)
  })
  it('hhmmEnd: rejects 25:00, 24:01 and 12:60', () => {
    expect(hhmmEnd.safeParse('25:00').success).toBe(false)
    expect(hhmmEnd.safeParse('24:01').success).toBe(false)
    expect(hhmmEnd.safeParse('12:60').success).toBe(false)
  })
  it('moneyCents: integer >= 0', () => {
    expect(moneyCents.safeParse(0).success).toBe(true)
    expect(moneyCents.safeParse(100).success).toBe(true)
    expect(moneyCents.safeParse(-1).success).toBe(false)
    expect(moneyCents.safeParse(1.5).success).toBe(false)
  })
  it('boundedText: enforces max length', () => {
    const s100 = boundedText(100)
    expect(s100.safeParse('a'.repeat(100)).success).toBe(true)
    expect(s100.safeParse('a'.repeat(101)).success).toBe(false)
  })
  it('slug: lowercase alphanumeric + dashes, 1-64', () => {
    expect(slug.safeParse('valid-slug-123').success).toBe(true)
    expect(slug.safeParse('Invalid_Slug').success).toBe(false)
    expect(slug.safeParse('a'.repeat(65)).success).toBe(false)
    expect(slug.safeParse('').success).toBe(false)
  })
  it('boundedText: rejects payload large enough to be DoS bait', () => {
    const s = boundedText(1000)
    expect(s.safeParse('a'.repeat(100_000)).success).toBe(false)
  })
})
