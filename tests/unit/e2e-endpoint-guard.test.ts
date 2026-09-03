/**
 * `/api/e2e/create-booking` crea reservas REALES salteando sesión, bans,
 * softbans y seña, con el `playerId` saliendo de un header sin verificar. Existe
 * solo para `pnpm stress:bookings`. Este archivo es lo único que verifica que
 * esté cerrado.
 *
 * B10 — el portón dejó de ser `NEXT_PUBLIC_E2E === '1'` (que se INLINEA en
 * build, así que decide el valor de compilación y no el de runtime) y pasó a ser
 * un secreto server-only que además hay que presentar en un header.
 */
import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const SECRETO = 'secreto-de-stress-test-largo'

afterEach(() => {
  vi.unstubAllEnvs()
})

function pedir(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/e2e/create-booking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({}),
  })
}

/**
 * El route se carga UNA vez y en un hook: adentro del primer `it` sus ~2 s de
 * carga corrían contra el `testTimeout` de 10 s, y con la suite completa
 * compitiendo por CPU eso se pasa y el archivo queda rojo sin que nada haya
 * cambiado. Acá se paga contra el `hookTimeout` de 30 s. Los `stubEnv` de cada
 * caso siguen valiendo: el guard lee el entorno en cada request, no al importar.
 */
let POST: (typeof import('@/app/api/e2e/create-booking/route'))['POST']

beforeAll(async () => {
  ;({ POST } = await import('@/app/api/e2e/create-booking/route'))
})

function postear(headers: Record<string, string> = {}): Promise<Response> {
  return POST(pedir(headers))
}

describe('/api/e2e/create-booking guards', () => {
  it('404 sin E2E_ENDPOINT_SECRET configurado', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_ENDPOINT_SECRET', '')

    expect((await postear({ 'x-e2e-secret': SECRETO })).status).toBe(404)
  })

  it('404 en producción aunque el secreto esté configurado y sea correcto', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('E2E_ENDPOINT_SECRET', SECRETO)

    expect((await postear({ 'x-e2e-secret': SECRETO })).status).toBe(404)
  })

  it('404 con el secreto configurado pero sin presentarlo', async () => {
    // El caso que cierra la brecha vieja: antes, con el portón abierto, conocer
    // la URL alcanzaba para reservar en nombre de cualquier jugador.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_ENDPOINT_SECRET', SECRETO)

    expect((await postear()).status).toBe(404)
  })

  it('404 con un secreto equivocado', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_ENDPOINT_SECRET', SECRETO)

    expect((await postear({ 'x-e2e-secret': 'no-es' })).status).toBe(404)
  })

  it('404 con un secreto demasiado corto para ser un secreto', async () => {
    // Sin mínimo, un `E2E_ENDPOINT_SECRET=1` de copy-paste abriría la ruta con
    // un valor adivinable al primer intento.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_ENDPOINT_SECRET', 'corto')

    expect((await postear({ 'x-e2e-secret': 'corto' })).status).toBe(404)
  })

  it('control positivo: con el secreto correcto YA NO rebota en el portón', async () => {
    // Sin este caso, los 5 de arriba pasarían igual con un `return notFound()`
    // incondicional — o sea, con el endpoint roto para stress-test.
    // Pasa el guard y muere en la validación del body ({}), que es 400.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('E2E_ENDPOINT_SECRET', SECRETO)

    const res = await postear({ 'x-e2e-secret': SECRETO, 'x-e2e-player-id': 'p1' })

    expect(res.status).toBe(400)
  })
})
