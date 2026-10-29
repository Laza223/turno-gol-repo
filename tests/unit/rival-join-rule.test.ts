import { describe, expect, it } from 'vitest'
import { shouldAutoJoin, welcomeNeeds } from '@/modules/rival/rival-join-rule'

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

describe('welcomeNeeds: la bienvenida pide solo lo que falta', () => {
  const state = (welcomed: boolean, position: string | null, zone: string | null) => ({
    welcomed,
    position,
    zone,
  })
  const FULL = state(true, 'any', 'Luján')

  it('armar necesita nombre y reglas, nunca posición ni zona', () => {
    expect(welcomeNeeds(state(false, null, null), 'armar')).toEqual({
      identity: true,
      profile: false,
      position: false,
    })
    expect(welcomeNeeds(state(true, null, null), 'armar')).toBeNull()
    expect(welcomeNeeds(FULL, 'armar')).toBeNull()
  })

  it('sumarse necesita además posición y zona si faltan', () => {
    expect(welcomeNeeds(state(false, null, null), 'sumarse')).toEqual({
      identity: true,
      profile: true,
      position: true,
    })
    expect(welcomeNeeds(state(false, 'any', 'Luján'), 'sumarse')).toEqual({
      identity: true,
      profile: false,
      position: false,
    })
    expect(welcomeNeeds(state(true, null, null), 'sumarse')).toEqual({
      identity: false,
      profile: true,
      position: true,
    })
    expect(welcomeNeeds(state(true, 'any', null), 'sumarse')).toEqual({
      identity: false,
      profile: true,
      position: false,
    })
    expect(welcomeNeeds(FULL, 'sumarse')).toBeNull()
  })

  it('desafiar (capitán) pide solo la zona: la posición nunca', () => {
    expect(welcomeNeeds(state(false, null, null), 'desafiar')).toEqual({
      identity: true,
      profile: true,
      position: false,
    })
    expect(welcomeNeeds(state(true, null, null), 'desafiar')).toEqual({
      identity: false,
      profile: true,
      position: false,
    })
    expect(welcomeNeeds(state(true, null, 'Luján'), 'desafiar')).toBeNull()
    expect(welcomeNeeds(state(false, null, 'Luján'), 'desafiar')).toEqual({
      identity: true,
      profile: false,
      position: false,
    })
  })

  it('el intent por mail no suma solo a quien tiene las reglas pero no el perfil', () => {
    const needs = welcomeNeeds(state(true, null, null), 'sumarse')
    expect(shouldAutoJoin({ intentOk: true, welcomeDone: needs === null, myStatus: null })).toBe(
      false,
    )
    const done = welcomeNeeds(FULL, 'sumarse')
    expect(shouldAutoJoin({ intentOk: true, welcomeDone: done === null, myStatus: null })).toBe(
      true,
    )
  })
})
