import { describe, expect, it } from 'vitest'
import { shouldAutoJoin } from '@/modules/rival/rival-join-rule'

describe('shouldAutoJoin: el intent suma solo a quien todavía no está en el partido', () => {
  it('intent válido, bienvenida aceptada y sin fila previa: se suma solo', () => {
    expect(shouldAutoJoin({ intentOk: true, welcomeDone: true, myStatus: null })).toBe(true)
  })

  it.each(['left', 'confirmed', 'bench', 'requested', 'declined', 'removed'] as const)(
    'con fila previa (%s) NO se suma solo: quien se bajó vuelve tocando "Voy"',
    (myStatus) => {
      expect(shouldAutoJoin({ intentOk: true, welcomeDone: true, myStatus })).toBe(false)
    },
  )

  it('sin intent válido o con la bienvenida pendiente, nunca', () => {
    expect(shouldAutoJoin({ intentOk: false, welcomeDone: true, myStatus: null })).toBe(false)
    expect(shouldAutoJoin({ intentOk: true, welcomeDone: false, myStatus: null })).toBe(false)
  })
})
