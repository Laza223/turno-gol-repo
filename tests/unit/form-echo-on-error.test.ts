import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regresión: los formularios de auth borraban TODO lo tipeado al fallar una
 * validación.
 *
 * Verificado en navegador real antes de escribir estos tests (prueba end-to-end
 * con un complejo, 2026-07-27):
 *
 *   - Alta del dueño, contraseñas distintas → "Las contraseñas no coinciden."
 *     y quedaban vacíos nombre, apellido, email y las dos contraseñas. Solo
 *     sobrevivía el teléfono, porque es un componente controlado.
 *   - Reserva del jugador, sin tildar el +18 → "Tenés que aceptar los términos."
 *     y quedaban vacíos nombre, apellido y email.
 *
 * Causa: `<form noValidate>` manda toda la validación al servidor, los inputs
 * son NO controlados, y el estado de error no devolvía lo tipeado.
 *
 * Estos tests fallan si alguien saca el eco: ese es el punto.
 */

const { resetPasswordForEmail, signInWithPassword, signOut } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ ok: false as const, code: 'invalid_credentials' })),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail, signOut } }),
}))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))
vi.mock('@/shared/rate-limit/apply', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    limit: 100,
    remaining: 99,
    reset: 0,
    unavailable: false,
  })),
}))
vi.mock('@/modules/auth/auth.service', () => ({
  signInWithPassword,
  signInWithExistingPlayerMagicLink: vi.fn(async () => ({ ok: false as const })),
}))

import { echoChecked, echoFields } from '@/shared/forms/echo'
import { forgotPasswordAction } from '@/app/(auth)/forgot-password/actions'
import { loginAction } from '@/app/(auth)/login/actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('echoFields: qué vuelve al formulario y qué no', () => {
  it('devuelve lo tipeado TAL CUAL, sin normalizar', () => {
    const f = new FormData()
    f.set('firstName', '  Marcelo ')
    f.set('email', 'MARCE@Complejo.COM')
    // Sin normalizar: el usuario tiene que ver exactamente lo que escribió.
    expect(echoFields(f, ['firstName', 'email'] as const)).toEqual({
      firstName: '  Marcelo ',
      email: 'MARCE@Complejo.COM',
    })
  })

  it('NUNCA devuelve contraseñas, aunque se las pidan explícitamente', () => {
    const f = new FormData()
    f.set('email', 'marce@complejo.com')
    f.set('password', 'secreta-123')
    f.set('confirmPassword', 'secreta-123')
    f.set('newPassword', 'otra-456')
    f.set('token', 'tok_abc')

    const out = echoFields(f, [
      'email',
      'password',
      'confirmPassword',
      'newPassword',
      'token',
    ] as const)

    expect(out).toEqual({ email: 'marce@complejo.com' })
    // El eco viaja al cliente dentro del estado de la Server Action: cualquier
    // secreto acá termina serializado en el payload RSC.
    expect(JSON.stringify(out)).not.toContain('secreta-123')
    expect(JSON.stringify(out)).not.toContain('otra-456')
    expect(JSON.stringify(out)).not.toContain('tok_abc')
  })

  it('omite campos ausentes y no-string (un File no se ecoa)', () => {
    const f = new FormData()
    f.set('email', 'marce@complejo.com')
    f.set('foto', new File(['x'], 'cancha.png', { type: 'image/png' }))
    expect(echoFields(f, ['email', 'foto', 'inexistente'] as const)).toEqual({
      email: 'marce@complejo.com',
    })
  })

  it('echoChecked refleja el estado de una casilla', () => {
    const tildada = new FormData()
    tildada.set('terms', 'on')
    expect(echoChecked(tildada, 'terms')).toBe(true)
    expect(echoChecked(new FormData(), 'terms')).toBe(false)
  })
})

describe('forgotPasswordAction: el email sobrevive al error', () => {
  it('email inválido → lo devuelve para no obligar a retipearlo', async () => {
    const f = new FormData()
    f.set('email', 'marce@complejo')
    const res = await forgotPasswordAction({ status: 'idle' }, f)

    expect(res.status).toBe('error')
    expect(res).toMatchObject({ email: 'marce@complejo' })
  })
})

describe('loginAction: el email sobrevive, la contraseña nunca vuelve', () => {
  it('credenciales inválidas → devuelve el email tipeado', async () => {
    const f = new FormData()
    f.set('email', 'marcelo@complejo.com')
    f.set('password', 'la-que-se-equivoco')
    const res = await loginAction({ status: 'idle' }, f)

    expect(res.status).toBe('error')
    expect(res).toMatchObject({ email: 'marcelo@complejo.com' })
    // La contraseña no puede volver al cliente por ningún camino.
    expect(JSON.stringify(res)).not.toContain('la-que-se-equivoco')
  })

  it('email con formato inválido → también lo devuelve', async () => {
    const f = new FormData()
    f.set('email', 'no-es-un-email')
    f.set('password', 'x')
    const res = await loginAction({ status: 'idle' }, f)

    expect(res.status).toBe('error')
    expect(res).toMatchObject({ email: 'no-es-un-email' })
  })
})
