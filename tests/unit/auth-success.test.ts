import { describe, expect, it } from 'vitest'
import { parseIntent, playerSuccessIntent, successVerifyPath } from '@/lib/auth-success'

describe('parseIntent', () => {
  it('acepta los 3 intents válidos', () => {
    expect(parseIntent('booking')).toBe('booking')
    expect(parseIntent('login')).toBe('login')
    expect(parseIntent('signup')).toBe('signup')
  })
  it('cae a login ante valor desconocido, vacío o null', () => {
    expect(parseIntent('hacker')).toBe('login')
    expect(parseIntent('')).toBe('login')
    expect(parseIntent(null)).toBe('login')
    expect(parseIntent(undefined)).toBe('login')
  })
})

describe('playerSuccessIntent', () => {
  it('booking cuando next es una ruta de reserva (jugador nuevo, default)', () => {
    expect(playerSuccessIntent('/club-norte/reservar')).toBe('booking')
    expect(playerSuccessIntent('/club-norte/reservar?court=1&date=2026-06-25&time=20:00')).toBe(
      'booking',
    )
  })
  it('login para cualquier otro destino', () => {
    expect(playerSuccessIntent('/mis-reservas')).toBe('login')
    expect(playerSuccessIntent('/club-norte')).toBe('login')
    expect(playerSuccessIntent('/club-norte/reservartrampa')).toBe('login')
  })
  it('booking_returning cuando el jugador YA existía (re-acceso, no alta)', () => {
    // Regresión QA: un re-login con next de reserva mostraba "¡Cuenta
    // confirmada!" (copy de alta) para una cuenta que ya existía.
    expect(playerSuccessIntent('/club-norte/reservar', false)).toBe('booking_returning')
  })
  it('login (no booking_returning) para un jugador existente sin ruta de reserva', () => {
    expect(playerSuccessIntent('/mis-reservas', false)).toBe('login')
  })
})

describe('successVerifyPath', () => {
  it('arma /verify con status, next encodeado e intent', () => {
    expect(successVerifyPath('/mis-reservas', 'login')).toBe(
      '/verify?status=success&next=%2Fmis-reservas&intent=login',
    )
  })
  it('encodea query params del next', () => {
    const out = successVerifyPath('/club-norte/reservar?court=1&time=20:00', 'booking')
    expect(out).toBe(
      '/verify?status=success&next=%2Fclub-norte%2Freservar%3Fcourt%3D1%26time%3D20%3A00&intent=booking',
    )
  })
})
