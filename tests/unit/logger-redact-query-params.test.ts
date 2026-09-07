/**
 * H-7 de la auditoría de aislamiento del 2026-09-05
 * (`docs/audit/2026-09-05-aislamiento-rls.md`).
 *
 * Cuando una consulta de Drizzle falla, el mensaje de la excepción incluye los
 * PARÁMETROS ENLAZADOS. Verificado en la versión instalada, 0.45.2:
 *
 *   class DrizzleQueryError extends Error {
 *     constructor(query, params, cause) {
 *       super(`Failed query: ${query}\nparams: ${params}`)
 *
 * El cron que renueva las credenciales de MercadoPago pasa los dos textos
 * cifrados como parámetros de su modificación y su bloque de captura loguea
 * `err.message` crudo. El filtro previo al envío al reporte de errores compara
 * nombres de clave, nunca contenido, y la clave es `error`: el texto pasaba
 * entero.
 *
 * El arreglo va en el logger y no en los 49 lugares que escriben
 * `error: err.message`: es el único punto por el que pasan todos, y de paso
 * cubre la salida estándar además del reporte de errores.
 *
 * Los dos primeros casos estuvieron ROJOS antes del arreglo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger, setErrorSink } from '@/shared/lib/logger'
import { redactQueryParams } from '@/shared/lib/redact-query-params'

afterEach(() => {
  vi.restoreAllMocks()
  setErrorSink(null)
})

/** El mensaje exacto que arma DrizzleQueryError, con dos textos cifrados. */
const MENSAJE_DRIZZLE =
  'Failed query: update "tenants" set "mp_access_token" = $1, "mp_refresh_token" = $2 where "id" = $3\n' +
  'params: v1:9c4f2a:8a7d6e5c4b3a2f1e0d9c8b7a,v1:1b2c3d:0f9e8d7c6b5a4938271605f4,tenant-1'

function captureStderr(): { calls: string[] } {
  const calls: string[] = []
  vi.spyOn(console, 'error').mockImplementation((chunk?: unknown) => {
    calls.push(String(chunk))
  })
  return { calls }
}

describe('redactQueryParams', () => {
  it('corta los parámetros y conserva la consulta, que es lo que sirve para depurar', () => {
    const limpio = redactQueryParams(MENSAJE_DRIZZLE)
    expect(limpio).toContain('update "tenants"')
    expect(limpio).toContain('params: [REDACTED]')
    expect(limpio).not.toContain('v1:9c4f2a')
  })

  it('no toca un texto que no viene de una consulta fallida', () => {
    const suelto = 'connect ECONNREFUSED 127.0.0.1:5432'
    expect(redactQueryParams(suelto)).toBe(suelto)
  })
})

describe('logger: los parámetros de una consulta fallida nunca salen', () => {
  it('los recorta del texto que va bajo `error`', () => {
    const { calls } = captureStderr()

    logger.error('tenant token refresh failed', {
      module: 'refresh-mp-tokens',
      tenantId: 'tenant-1',
      error: MENSAJE_DRIZZLE,
    })

    const entry = JSON.parse(calls[0]!) as Record<string, unknown>
    expect(String(entry.error)).toContain('params: [REDACTED]')
    expect(calls[0]).not.toContain('v1:9c4f2a')
    expect(calls[0]).not.toContain('v1:1b2c3d')
  })

  it('los recorta también dentro de un objeto anidado', () => {
    const { calls } = captureStderr()

    logger.error('falló', { detalle: { causa: { message: MENSAJE_DRIZZLE } } })

    expect(calls[0]).not.toContain('v1:9c4f2a')
  })

  it('lo que llega al reporte de errores ya viene recortado', () => {
    // El sink recibe la MISMA entrada que se escribe a la salida estándar: si
    // el recorte pasara después, este caso seguiría verde y no probaría nada.
    captureStderr()
    const recibidas: Array<Record<string, unknown>> = []
    setErrorSink((_m, entry) => {
      recibidas.push(entry)
    })

    logger.error('tenant token refresh failed', { error: MENSAJE_DRIZZLE })

    expect(JSON.stringify(recibidas[0])).not.toContain('v1:9c4f2a')
  })

  it('un mensaje normal pasa intacto', () => {
    const { calls } = captureStderr()
    logger.error('algo falló', { error: 'connect ECONNREFUSED' })
    const entry = JSON.parse(calls[0]!) as Record<string, unknown>
    expect(entry.error).toBe('connect ECONNREFUSED')
  })
})
