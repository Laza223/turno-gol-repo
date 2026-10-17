import { describe, expect, it } from 'vitest'
import { isBookingPath, parseIntent, parseVia, successVerifyPath } from '@/lib/auth-success'

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
