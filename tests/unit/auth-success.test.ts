import { describe, expect, it } from 'vitest'
import { REFERRAL_CODE_ALPHABET } from '@/modules/referrals/referral.schema'
import {
  isBookingPath,
  isRivalPath,
  isRivalReturnPath,
  parseIntent,
  parseVia,
  successVerifyPath,
} from '@/lib/auth-success'

describe('parseVia', () => {
  it('acepta las dos vías del jugador', () => {
    expect(parseVia('email')).toBe('email')
    expect(parseVia('google')).toBe('google')
  })
  it('cualquier otro valor (o ausencia) es "sin marca"', () => {
    expect(parseVia('hacker')).toBeNull()
    expect(parseVia('')).toBeNull()
    expect(parseVia(null)).toBeNull()
    expect(parseVia(undefined)).toBeNull()
  })
})

describe('parseIntent', () => {
  it('acepta los 2 intents válidos', () => {
    expect(parseIntent('login')).toBe('login')
    expect(parseIntent('signup')).toBe('signup')
  })
  it('cae a login ante valor desconocido, vacío o null', () => {
    expect(parseIntent('hacker')).toBe('login')
    // Intents retirados (ya nadie los emite): un link viejo cae al camino genérico.
    expect(parseIntent('booking')).toBe('login')
    expect(parseIntent('booking_returning')).toBe('login')
    expect(parseIntent('')).toBe('login')
    expect(parseIntent(null)).toBe('login')
    expect(parseIntent(undefined)).toBe('login')
  })
})

describe('isBookingPath', () => {
  it('true para la pantalla de confirmar de un complejo, con o sin query', () => {
    expect(isBookingPath('/club-norte/reservar')).toBe(true)
    expect(isBookingPath('/club-norte/reservar?court=1&date=2026-06-25&time=20:00')).toBe(true)
  })
  it('false para cualquier otro destino', () => {
    expect(isBookingPath('/mis-reservas')).toBe(false)
    expect(isBookingPath('/club-norte')).toBe(false)
    expect(isBookingPath('/club-norte/reservartrampa')).toBe(false)
    expect(isBookingPath('/reserva/abc/exito')).toBe(false)
    expect(isBookingPath('/')).toBe(false)
    expect(isBookingPath('')).toBe(false)
  })
  it('la pantalla no tiene subrutas: tras "reservar" solo puede venir "?" o el fin', () => {
    expect(isBookingPath('/club-norte/reservar/')).toBe(false)
    expect(isBookingPath('/club/reservar/extra')).toBe(false)
    expect(isBookingPath('/club/reservar/../../admin')).toBe(false)
    expect(isBookingPath('/club/reservar#frag')).toBe(false)
  })
  it('el primer segmento es un slug: ni "?" ni "#" lo parten', () => {
    // `/x?a=/reservar?b=1` es el path `/x` con una query que casualmente contiene `/reservar`.
    expect(isBookingPath('/x?a=/reservar?b=1')).toBe(false)
    expect(isBookingPath('/mis-reservas?next=/reservar/')).toBe(false)
    expect(isBookingPath('/x#a/reservar')).toBe(false)
  })
  it('false si no es un path del sitio: nunca manda a otro origen', () => {
    expect(isBookingPath('//evil.com/club/reservar')).toBe(false)
    expect(isBookingPath('https://evil.com/club/reservar')).toBe(false)
    // El navegador lee `\` como `/`: `/\evil.com/reservar` terminaría en //evil.com/reservar.
    expect(isBookingPath('/\\evil.com/reservar')).toBe(false)
  })
})

describe('isRivalPath', () => {
  const CODE = 'ABCDEFGH23'
  it('el alfabeto es el de los códigos de partido (referidos): ni un símbolo de más ni de menos', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(isRivalPath(`/rival/p/${ch.repeat(10)}`)).toBe(REFERRAL_CODE_ALPHABET.includes(ch))
    }
  })
  it('true para el partido, con o sin query', () => {
    expect(isRivalPath(`/rival/p/${CODE}`)).toBe(true)
    expect(isRivalPath(`/rival/p/${CODE}?rival_intent=abc.def`)).toBe(true)
  })
  it('false para otros destinos de RIVAL o del sitio', () => {
    expect(isRivalPath('/rival')).toBe(false)
    expect(isRivalPath('/rival/nuevo')).toBe(false)
    expect(isRivalPath('/rival/mis-partidos')).toBe(false)
    expect(isRivalPath('/rival/p/')).toBe(false)
    expect(isRivalPath('/mis-reservas')).toBe(false)
    expect(isRivalPath('')).toBe(false)
  })
  it('el código son 10 símbolos del alfabeto: ni más, ni menos, ni minúsculas', () => {
    expect(isRivalPath('/rival/p/x')).toBe(false)
    expect(isRivalPath(`/rival/p/${CODE}A`)).toBe(false)
    expect(isRivalPath('/rival/p/ABCDEFGH2')).toBe(false)
    expect(isRivalPath('/rival/p/abcdefgh23')).toBe(false)
    expect(isRivalPath('/rival/p/ABCDEFGH10')).toBe(false) // 1 y 0 no están en el alfabeto
  })
  it('no pasan trampas de path, query ni fragmento', () => {
    expect(isRivalPath('/rival/p/x/../../admin')).toBe(false)
    expect(isRivalPath(`/rival/p/${CODE}/../../admin`)).toBe(false)
    expect(isRivalPath(`/rival/p/${CODE}/`)).toBe(false)
    expect(isRivalPath(`/rival/p/${CODE}#frag`)).toBe(false)
    expect(isRivalPath('/rival/pX')).toBe(false)
    expect(isRivalPath(`/rival/p${CODE}`)).toBe(false)
    expect(isRivalPath(`/x?a=/rival/p/${CODE}`)).toBe(false)
    expect(isRivalPath(`/x#/rival/p/${CODE}`)).toBe(false)
  })
  it('false si no es un path del sitio: nunca manda a otro origen', () => {
    expect(isRivalPath(`//evil.com/rival/p/${CODE}`)).toBe(false)
    expect(isRivalPath(`https://evil.com/rival/p/${CODE}`)).toBe(false)
    expect(isRivalPath(`/\\evil.com/rival/p/${CODE}`)).toBe(false)
    expect(isRivalPath(`\\rival\\p\\${CODE}`)).toBe(false)
  })
  describe('tablón: /rival/partido/<uuid>', () => {
    const ID = '2a2b2c2d-22e2-4f22-8a22-2b2c2d2e2f22'
    it('true con uuid en minúscula, con o sin query', () => {
      expect(isRivalPath(`/rival/partido/${ID}`)).toBe(true)
      expect(isRivalPath(`/rival/partido/${ID}?rival_intent=abc.def`)).toBe(true)
    })
    it('false con uuid en mayúsculas o mal formado', () => {
      expect(isRivalPath(`/rival/partido/${ID.toUpperCase()}`)).toBe(false)
      expect(isRivalPath('/rival/partido/22222222-2222-4222-8222-22222222222')).toBe(false)
      expect(isRivalPath('/rival/partido/22222222222242228222222222222222')).toBe(false)
      expect(isRivalPath('/rival/partido/no-es-uuid')).toBe(false)
      expect(isRivalPath('/rival/partido/')).toBe(false)
      expect(isRivalPath('/rival/partido')).toBe(false)
    })
    it('false con sufijos, otro prefijo o trampas de path', () => {
      expect(isRivalPath(`/rival/partido/${ID}/x`)).toBe(false)
      expect(isRivalPath(`/rival/partido/${ID}/`)).toBe(false)
      expect(isRivalPath(`/rival/partido/${ID}x`)).toBe(false)
      expect(isRivalPath(`/rival/partido/${ID}#frag`)).toBe(false)
      expect(isRivalPath(`/rival/partidoX/${ID}`)).toBe(false)
      expect(isRivalPath(`/rival/partido/${ID}/../../admin`)).toBe(false)
      expect(isRivalPath(`/rival/partido/../${ID}`)).toBe(false)
      expect(isRivalPath(`/rival/partido\${ID}`)).toBe(false)
      expect(isRivalPath(`/x?a=/rival/partido/${ID}`)).toBe(false)
      expect(isRivalPath(`//evil.com/rival/partido/${ID}`)).toBe(false)
    })
  })
})

describe('isRivalReturnPath', () => {
  it('suma la portada, armar y Mis partidos a los partidos de isRivalPath', () => {
    for (const next of [
      '/rival',
      '/rival/tablon',
      '/rival/tablon?complejo=abc',
      '/rival/nuevo',
      '/rival/nuevo?reserva=abc',
      '/rival/mis-partidos',
    ]) {
      expect(isRivalReturnPath(next)).toBe(true)
    }
    expect(isRivalReturnPath('/rival/p/ABCDEFGH23?rival_intent=a.b')).toBe(true)
    expect(isRivalReturnPath('/rival/partido/22222222-2222-4222-8222-222222222222')).toBe(true)
  })
  it('no deja pasar sufijos, traversal ni otros orígenes', () => {
    for (const next of [
      '/rival/nuevox',
      '/rival/nuevo/',
      '/rival/nuevo/../x',
      '/rival/../admin',
      '/rivalx',
      '/rival/baja',
      '/rival#frag',
      '/x?a=/rival',
      '//evil.com/rival',
      'https://evil.com/rival',
      '/\\evil.com/rival',
      '/mis-reservas',
      '',
    ]) {
      expect(isRivalReturnPath(next)).toBe(false)
    }
  })
})

describe('successVerifyPath', () => {
  it('arma /verify con status, next encodeado e intent', () => {
    expect(successVerifyPath('/mis-reservas', 'login')).toBe(
      '/verify?status=success&next=%2Fmis-reservas&intent=login',
    )
  })
  it('encodea query params del next', () => {
    const out = successVerifyPath('/club-norte/reservar?court=1&time=20:00', 'login')
    expect(out).toBe(
      '/verify?status=success&next=%2Fclub-norte%2Freservar%3Fcourt%3D1%26time%3D20%3A00&intent=login',
    )
  })
})
