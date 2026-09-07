/**
 * H-8 de la auditoría de aislamiento del 2026-09-05
 * (`docs/audit/2026-09-05-aislamiento-rls.md`).
 *
 * El filtro previo al envío tocaba tres campos del evento: los extras, los
 * contextos y el usuario. Las migas de navegación —que incluyen lo que se
 * escribió por consola— y el propio objeto de excepción quedaban sin pasar por
 * el tapado. Combinado con H-7, el mismo texto con credenciales cifradas podía
 * viajar por más de un campo del mismo evento.
 *
 * Además, el tapado comparaba SÓLO nombres de clave, nunca contenido: un
 * mensaje de consulta fallida bajo una clave inocente (`error`, `message`,
 * `value`) pasaba entero. Ahora toda cadena que atraviesa el filtro pierde sus
 * parámetros.
 *
 * Todos los casos de este archivo estuvieron ROJOS antes del arreglo.
 */
import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubObject } from '@/lib/sentry-pii-scrub'

const MENSAJE_DRIZZLE =
  'Failed query: update "tenants" set "mp_access_token" = $1 where "id" = $2\n' +
  'params: v1:9c4f2a:8a7d6e5c4b3a2f1e,tenant-1'

describe('scrubObject: también mira el contenido, no sólo los nombres de clave', () => {
  it('recorta los parámetros de una consulta fallida bajo una clave inocente', () => {
    const salida = scrubObject({ error: MENSAJE_DRIZZLE }) as { error: string }
    expect(salida.error).toContain('params: [REDACTED]')
    expect(salida.error).not.toContain('v1:9c4f2a')
  })

  it('sigue tapando por nombre de clave lo que ya tapaba', () => {
    const salida = scrubObject({ email: 'alguien@ejemplo.com' }) as { email: string }
    expect(salida.email).toBe('[REDACTED]')
  })
})

describe('scrubEvent', () => {
  it('tapa las migas de navegación', () => {
    const evento = {
      breadcrumbs: [
        { category: 'console', message: MENSAJE_DRIZZLE },
        { category: 'http', data: { email: 'alguien@ejemplo.com' } },
      ],
    }
    scrubEvent(evento)

    expect(JSON.stringify(evento)).not.toContain('v1:9c4f2a')
    expect(JSON.stringify(evento)).not.toContain('alguien@ejemplo.com')
  })

  it('tapa el objeto de excepción', () => {
    const evento = {
      exception: { values: [{ type: 'DrizzleQueryError', value: MENSAJE_DRIZZLE }] },
    }
    scrubEvent(evento)

    expect(JSON.stringify(evento)).not.toContain('v1:9c4f2a')
    // El tipo de la excepción se conserva: es lo que agrupa en el reporte.
    expect(JSON.stringify(evento)).toContain('DrizzleQueryError')
  })

  it('conserva lo que ya hacía: extras, contextos, usuario, cabeceras y consulta de la URL', () => {
    const evento = {
      request: {
        data: { password: 'secreto' },
        headers: { cookie: 'a=1', Authorization: 'Bearer x', 'user-agent': 'curl' },
        query_string: 'foo=1&token=abc',
      },
      extra: { email: 'alguien@ejemplo.com' },
      contexts: { mp: { mp_access_token: 'APP_USR-1' } },
      user: { id: 'u1', email: 'alguien@ejemplo.com', ip_address: '1.2.3.4' },
    }
    scrubEvent(evento)

    expect(evento.request.data).toBeUndefined()
    expect(evento.request.headers.cookie).toBeUndefined()
    expect(evento.request.headers.Authorization).toBeUndefined()
    expect(evento.request.headers['user-agent']).toBe('curl')
    expect(evento.request.query_string).toBe('foo=1&token=[REDACTED]')
    expect(evento.extra.email).toBe('[REDACTED]')
    expect(evento.contexts.mp.mp_access_token).toBe('[REDACTED]')
    expect(evento.user).toEqual({ id: 'u1' })
  })

  it('un evento vacío no explota', () => {
    const evento = {}
    expect(() => scrubEvent(evento)).not.toThrow()
  })
})
