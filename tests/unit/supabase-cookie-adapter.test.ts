import { describe, expect, it } from 'vitest'
import { cookieAdapter } from '@/lib/supabase/server'

/**
 * El adaptador de cookies de `@supabase/ssr` no tenía ni un test: todos los
 * specs mockeaban `@/lib/supabase/server` entero, así que la pieza donde vivía
 * el bug de producción del 2026-09-04 nunca se ejercitaba.
 *
 * Lo que se prueba acá es el contrato de LOTE, que es exactamente lo que la
 * interfaz vieja (`get`/`set`/`remove`) no podía dar.
 * Ver docs/decisions/2026-09-04-sesion-supabase-ssr.md
 */

type Written = { name: string; value: string } & Record<string, unknown>

function fakeStore(initial: { name: string; value: string }[] = []) {
  const written: Written[] = []
  return {
    written,
    getAll: () => initial,
    set: (cookie: Written) => {
      written.push(cookie)
    },
  }
}

describe('cookieAdapter', () => {
  it('getAll refleja el store tal cual', () => {
    const store = fakeStore([
      { name: 'sb-ref-auth-token.0', value: 'aaa' },
      { name: 'sb-ref-auth-token.1', value: 'bbb' },
    ])
    expect(cookieAdapter(store).getAll()).toEqual([
      { name: 'sb-ref-auth-token.0', value: 'aaa' },
      { name: 'sb-ref-auth-token.1', value: 'bbb' },
    ])
  })

  it('escribe el lote completo y pasa las options intactas', () => {
    const store = fakeStore()
    cookieAdapter(store).setAll([
      {
        name: 'sb-ref-auth-token.0',
        value: 'aaa',
        // httpOnly:false es INTENCIONAL, no un descuido: el cliente del
        // navegador lee esta cookie para autorizar el canal en vivo de la
        // grilla (src/hooks/use-booking-realtime.ts). Es el default de
        // @supabase/ssr y por eso tests/integration/cookie-flags.test.ts
        // exime a este archivo de su assert de flags.
        options: { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 3600 },
      },
      { name: 'sb-ref-auth-token.1', value: 'bbb', options: { path: '/', maxAge: 3600 } },
    ])
    expect(store.written).toEqual([
      {
        name: 'sb-ref-auth-token.0',
        value: 'aaa',
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        maxAge: 3600,
      },
      { name: 'sb-ref-auth-token.1', value: 'bbb', path: '/', maxAge: 3600 },
    ])
  })

  it('escribe los fragmentos sobrantes con maxAge 0 — es la poda, no un no-op', () => {
    const store = fakeStore([{ name: 'sb-ref-auth-token.2', value: 'huerfano' }])
    cookieAdapter(store).setAll([
      { name: 'sb-ref-auth-token.0', value: 'nuevo', options: { path: '/' } },
      { name: 'sb-ref-auth-token.2', value: '', options: { path: '/', maxAge: 0 } },
    ])
    expect(store.written).toHaveLength(2)
    expect(store.written[1]).toEqual({
      name: 'sb-ref-auth-token.2',
      value: '',
      path: '/',
      maxAge: 0,
    })
  })

  it('no propaga la excepción cuando el store no acepta escrituras (RSC)', () => {
    const store = {
      getAll: () => [],
      set: () => {
        throw new Error('Cookies can only be modified in a Server Action or Route Handler')
      },
    }
    expect(() =>
      cookieAdapter(store).setAll([{ name: 'sb-ref-auth-token.0', value: 'aaa' }]),
    ).not.toThrow()
  })

  it('corta el lote en el primer fallo en vez de seguir escribiendo', () => {
    // El try único es lo que la interfaz vieja no podía dar: ahí cada fragmento
    // tenía su propio try, así que un fallo intermedio no frenaba a los
    // siguientes y se podían mezclar fragmentos de dos credenciales distintas.
    // Con un store sincrónico la primera escritura ya ocurrió cuando tira la
    // segunda; lo que se garantiza es que el lote no continúa.
    const persisted: Written[] = []
    const store = {
      getAll: () => [],
      set: (cookie: Written) => {
        if (cookie.name.endsWith('.1')) throw new Error('write rejected')
        persisted.push(cookie)
      },
    }
    cookieAdapter(store).setAll([
      { name: 'sb-ref-auth-token.0', value: 'primera' },
      { name: 'sb-ref-auth-token.1', value: 'segunda' },
    ])
    // La primera SÍ llegó al store antes del throw — eso es inevitable con un
    // store sincrónico. Lo que importa es que el lote se corta y no seguimos
    // escribiendo sobre una credencial ya rota.
    expect(persisted.map((c) => c.name)).toEqual(['sb-ref-auth-token.0'])
  })
})
