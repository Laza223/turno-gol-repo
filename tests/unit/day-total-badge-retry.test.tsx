// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { formatArs } from '@/lib/format'

/**
 * El "Hoy: $X" de la barra lateral cuando el pedido NO sale bien.
 *
 * El agujero que cierran estos tests: el único reintento era el ciclo de 60
 * segundos, así que una sola respuesta perdida al abrir el panel dejaba la
 * barra en "cargando" un minuto entero — y justo al abrir es cuando no hay
 * ningún número viejo en pantalla que disimule. Es la misma clase que ya se
 * había arreglado del lado del jugador en `PaymentStatusWatcher` (#63); este
 * componente había quedado afuera.
 *
 * El otro lado del mismo problema es un pedido que no falla sino que se cuelga:
 * ahí no hay nada que reintentar porque nunca termina. Por eso va con corte por
 * tiempo, que es lo que verifica el último bloque.
 */

vi.mock('@/shared/utils/async', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/utils/async')>()
  // Espía que delega en el real: interesa CON QUÉ se lo llama, no reemplazar lo
  // que hace.
  return { ...actual, fetchWithTimeout: vi.fn(actual.fetchWithTimeout) }
})

const { fetchWithTimeout } = await import('@/shared/utils/async')
const { DayTotalBadge } = await import('@/components/layout/day-total-badge')

const spy = vi.mocked(fetchWithTimeout)

const total = (cents: number) =>
  new Response(JSON.stringify({ data: { date: '2026-08-26', collectedCents: cents } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const fail = (status: number) => new Response(JSON.stringify({ error: 'boom' }), { status })

/**
 * El monto sale por el `aria-label` y no por `getByText`: `formatArs` mete un
 * espacio duro (U+00A0) y testing-library normaliza el texto que saca del DOM
 * pero NO el matcher, así que un `getByText` con el string exacto falla
 * diciendo que el componente no renderizó, cuando renderizó perfecto.
 */
const label = () => screen.getByRole('link').getAttribute('aria-label')

/** Avanza el reloj virtual dejando que corran las promesas del medio. */
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

let calls: number

beforeEach(() => {
  vi.useFakeTimers()
  calls = 0
  spy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mount(respond: (call: number) => Response | Promise<Response>) {
  global.fetch = vi.fn(async () => {
    calls += 1
    return respond(calls)
  }) as never
  render(<DayTotalBadge />)
}

describe('DayTotalBadge — un pedido que falla se reintenta solo', () => {
  it('un 500 al abrir el panel no deja la barra en "cargando" un minuto', async () => {
    mount((n) => (n === 1 ? fail(500) : total(1_250_000)))

    await tick(0)
    // Antes del arreglo esto era el estado final durante 60 segundos.
    expect(label()).toBe('Cobrado hoy, cargando')

    await tick(1_000)
    expect(calls).toBe(2)
    expect(label()).toBe(`Cobrado hoy: ${formatArs(1_250_000)}. Ir a Caja`)
  })

  it('un pedido que no llega (red caída, corte por tiempo) también se reintenta', async () => {
    mount((n) => {
      if (n === 1) return Promise.reject(new Error('Failed to fetch'))
      return total(400_000)
    })

    await tick(0)
    expect(label()).toBe('Cobrado hoy, cargando')

    await tick(1_000)
    expect(label()).toBe(`Cobrado hoy: ${formatArs(400_000)}. Ir a Caja`)
  })

  it('escala la espera y se rinde tras el backoff, sin martillar al backend', async () => {
    mount(() => fail(503))

    // 1 pedido + 4 reintentos (1s, 3s, 8s, 20s) = 5 en los primeros 32 segundos.
    await tick(32_000)
    expect(calls).toBe(5)

    // Y a partir de ahí manda el ciclo normal, no una cadena infinita.
    await tick(20_000)
    expect(calls).toBe(5)
    expect(label()).toBe('Cobrado hoy, cargando')
  })

  it('una sesión vencida (401) NO se reintenta: insistir no la renueva', async () => {
    mount(() => fail(401))

    await tick(30_000)
    expect(calls).toBe(1)
  })

  it('un 429 tampoco: el rate-limit ya está lleno e insistir lo empeora', async () => {
    // Su ventana es de 60 s, o sea exactamente el ciclo normal del componente.
    mount(() => fail(429))

    await tick(30_000)
    expect(calls).toBe(1)
  })

  it('un cuerpo con otra forma no se reintenta: devolvería el mismo cuerpo', async () => {
    mount(
      () =>
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )

    await tick(30_000)
    expect(calls).toBe(1)
    expect(label()).toBe('Cobrado hoy, cargando')
  })

  it('un pedido que anda hace UNA sola consulta', async () => {
    // Control positivo: sin esto, un backoff mal cableado que reintenta siempre
    // pasaría todos los tests de arriba.
    mount(() => total(0))

    await tick(30_000)
    expect(calls).toBe(1)
    // $0 es un dato, no un error: el día sin movimientos muestra el cero.
    expect(label()).toBe(`Cobrado hoy: ${formatArs(0)}. Ir a Caja`)
  })
})

describe('DayTotalBadge — el pedido va con corte por tiempo', () => {
  it('nunca queda esperando una respuesta que no llega', async () => {
    // Un `fetch` pelado no falla cuando el servidor no contesta: se queda
    // colgado, y del lado del componente eso es indistinguible de "todavía no
    // llegó". Es la causa raíz que documenta `shared/utils/async.ts`.
    mount(() => total(1))

    await tick(0)
    expect(spy).toHaveBeenCalledWith('/api/admin/day-total', { cache: 'no-store' }, 8_000)
  })
})
