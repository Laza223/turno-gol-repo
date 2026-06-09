import { describe, expect, it, vi } from 'vitest'
import {
  getPlayerBlockState,
  isBlockedForOnlineBooking,
} from '@/modules/relationships/ptr.service'
import type { DbTx } from '@/shared/db/client'

/**
 * BLOCKER (triage_fixes #2/#7/#23): un jugador con saldo deudor (> 0) o con la
 * relación 'blocked' no puede reservar online en ese complejo.
 */
describe('isBlockedForOnlineBooking', () => {
  it('bloquea cuando hay saldo deudor (> 0)', () => {
    expect(isBlockedForOnlineBooking({ balance: 1, status: 'active' })).toBe(true)
    expect(isBlockedForOnlineBooking({ balance: 500000, status: 'active' })).toBe(true)
  })

  it('bloquea cuando la relación está marcada como blocked', () => {
    expect(isBlockedForOnlineBooking({ balance: 0, status: 'blocked' })).toBe(true)
  })

  it('no bloquea con saldo cero y estado active', () => {
    expect(isBlockedForOnlineBooking({ balance: 0, status: 'active' })).toBe(false)
  })

  it('no bloquea con saldo a favor (negativo) y estado active', () => {
    expect(isBlockedForOnlineBooking({ balance: -100, status: 'active' })).toBe(false)
  })
})

describe('getPlayerBlockState', () => {
  function fakeTx(rows: unknown[]): DbTx {
    return { execute: vi.fn(async () => rows) } as unknown as DbTx
  }

  it('devuelve balance y status de la fila del PTR', async () => {
    const state = await getPlayerBlockState('p', 't', fakeTx([{ balance: 250000, status: 'active' }]))
    expect(state).toEqual({ balance: 250000, status: 'active' })
  })

  it('coacciona un balance string a número', async () => {
    const state = await getPlayerBlockState('p', 't', fakeTx([{ balance: '250000', status: 'active' }]))
    expect(state.balance).toBe(250000)
  })

  it('devuelve el default no-bloqueante cuando el PTR aún no existe', async () => {
    const state = await getPlayerBlockState('p', 't', fakeTx([]))
    expect(state).toEqual({ balance: 0, status: 'active' })
    expect(isBlockedForOnlineBooking(state)).toBe(false)
  })
})
