import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapRivalDbError, RivalError } from '@/modules/rival/rival.errors'

const h = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: h.isFeatureEnabled }))

import { isRivalEnabled } from '@/modules/rival/rival.flags'

/** Como llega de Drizzle 0.45: el error de postgres-js va en `cause`. */
function wrapped(pg: Record<string, unknown>): Error {
  const cause = Object.assign(new Error(String(pg.message ?? '')), pg)
  return Object.assign(new Error('Failed query'), { cause })
}

describe('mapRivalDbError', () => {
  const DB_CODES = [
    'rival_not_found',
    'rival_no_session',
    'rival_expired',
    'rival_canceled',
    'rival_full',
    'rival_banned',
    'rival_limit_active',
    'rival_limit_requests',
    'rival_forbidden_transition',
    'rival_immutable',
    'rival_not_on_board',
    'rival_hidden',
    'rival_booking_mismatch',
    'rival_court_required',
    'rival_contact_required',
    'rival_invalid_report',
    'rival_captain_taken',
  ]

  it.each(DB_CODES)('mapea el RAISE %s a un RivalError con ese código', (code) => {
    const err = mapRivalDbError(wrapped({ code: 'P0001', message: code }))
    expect(err).toBeInstanceOf(RivalError)
    expect(err?.code).toBe(code)
  })

  it.each([
    ['deadlock_detected', '40P01'],
    ['serialization_failure', '40001'],
    ['lock_not_available', '55P03'],
  ])('mapea %s (%s) a rival_try_again, sin reintento adentro', (_name, code) => {
    expect(mapRivalDbError(wrapped({ code }))?.code).toBe('rival_try_again')
  })

  it('mapea el índice único del capitán (23505) a rival_captain_taken', () => {
    const err = mapRivalDbError(
      wrapped({ code: '23505', constraint_name: 'uq_rival_participants_captain' }),
    )
    expect(err?.code).toBe('rival_captain_taken')
  })

  it('mapea el UNIQUE del plantel y el de denuncias', () => {
    expect(
      mapRivalDbError(
        wrapped({ code: '23505', constraint_name: 'uq_rival_participants_match_player' }),
      )?.code,
    ).toBe('rival_already_participant')
    expect(
      mapRivalDbError(
        wrapped({ code: '23505', constraint_name: 'uq_rival_reports_match_reporter_reported' }),
      )?.code,
    ).toBe('rival_already_reported')
  })

  it('mapea el 42501 de la RLS a rival_forbidden', () => {
    expect(mapRivalDbError(wrapped({ code: '42501' }))?.code).toBe('rival_forbidden')
  })

  it('deja pasar (null) lo que no es de RIVAL: infraestructura, otros únicos, otros RAISE', () => {
    expect(mapRivalDbError(new Error('connection terminated'))).toBeNull()
    expect(mapRivalDbError(wrapped({ code: '57P01', message: 'admin shutdown' }))).toBeNull()
    expect(
      mapRivalDbError(wrapped({ code: '23505', constraint_name: 'idx_players_email' })),
    ).toBeNull()
    expect(mapRivalDbError(wrapped({ code: 'P0001', message: 'otra cosa' }))).toBeNull()
    // Un rival_* que la migración no define no se inventa como error de dominio.
    expect(mapRivalDbError(wrapped({ code: 'P0001', message: 'rival_inventado' }))).toBeNull()
    expect(mapRivalDbError(null)).toBeNull()
  })

  it('el RivalError lleva el código como mensaje y como nombre de clase', () => {
    const err = new RivalError('rival_full')
    expect(err.message).toBe('rival_full')
    expect(err.name).toBe('RivalError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('isRivalEnabled', () => {
  beforeEach(() => h.isFeatureEnabled.mockReset())

  it('lee el flag rival SOLO global: nunca le pasa un tenantId', async () => {
    h.isFeatureEnabled.mockResolvedValue(true)
    await expect(isRivalEnabled()).resolves.toBe(true)
    expect(h.isFeatureEnabled).toHaveBeenCalledTimes(1)
    expect(h.isFeatureEnabled.mock.calls[0]).toEqual(['rival'])

    h.isFeatureEnabled.mockResolvedValue(false)
    await expect(isRivalEnabled()).resolves.toBe(false)
  })
})
