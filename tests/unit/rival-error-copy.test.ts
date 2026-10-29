import { describe, expect, it } from 'vitest'
import { RIVAL_ERROR_CODES, RivalError } from '@/modules/rival/rival.errors'
import {
  RIVAL_DISABLED_MESSAGE,
  RIVAL_NO_SESSION_MESSAGE,
  RIVAL_OFFLINE_MESSAGE,
  RIVAL_RATE_LIMITED_MESSAGE,
  rivalErrorMessage,
} from '@/modules/rival/rival-copy'

describe('rivalErrorMessage: cada código de dominio tiene copy humano', () => {
  it.each(RIVAL_ERROR_CODES)('%s tiene un texto en español, sin código técnico', (code) => {
    const msg = rivalErrorMessage(new RivalError(code))
    expect(msg.length).toBeGreaterThan(10)
    expect(msg).not.toMatch(/rival_|_/)
    // Voz de empresa: nunca "cancelled" (americano, una L) ni el nombre de la competencia.
    expect(msg).not.toMatch(/cancelled|Falta Uno/i)
  })

  it('los casos que ve el organizador al armar dicen lo que tiene que hacer', () => {
    expect(rivalErrorMessage(new RivalError('rival_limit_active'))).toBe(
      'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
    )
    expect(rivalErrorMessage(new RivalError('rival_court_required'))).toBe(
      'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
    )
    expect(rivalErrorMessage(new RivalError('rival_profile_required'))).toBe(
      'Antes de sumarte, contanos tu posición y tu zona.',
    )
    expect(rivalErrorMessage(new RivalError('rival_expired'))).toMatch(/empezó/)
    expect(rivalErrorMessage(new RivalError('rival_welcome_required'))).toMatch(/reglas/)
  })

  it('el mensaje de un ban NO dice por qué (spec §8)', () => {
    expect(rivalErrorMessage(new RivalError('rival_banned'))).toBe(
      'No podés sumarte a partidos en este complejo.',
    )
  })

  it('un error que no es de RIVAL cae en el mensaje genérico', () => {
    expect(rivalErrorMessage(new Error('boom'))).toBe(
      'Algo falló de nuestro lado. Probá de nuevo en unos segundos.',
    )
  })
})

describe('textos compartidos: sin jerga ni código interno, y dicen cómo seguir', () => {
  it('cada uno es una frase entera sin guion bajo', () => {
    for (const msg of [
      RIVAL_NO_SESSION_MESSAGE,
      RIVAL_DISABLED_MESSAGE,
      RIVAL_RATE_LIMITED_MESSAGE,
      RIVAL_OFFLINE_MESSAGE,
    ]) {
      expect(msg.length).toBeGreaterThan(10)
      expect(msg).not.toMatch(/_/)
    }
    expect(RIVAL_NO_SESSION_MESSAGE).toBe(rivalErrorMessage(new RivalError('rival_no_session')))
  })

  it('el tope de velocidad no promete una ventana de tiempo que no verificamos', () => {
    expect(RIVAL_RATE_LIMITED_MESSAGE).toBe(
      'Hiciste muchos cambios seguidos. Esperá un momento y probá de nuevo.',
    )
  })
})
