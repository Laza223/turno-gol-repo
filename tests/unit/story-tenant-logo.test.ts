import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { loadTenantLogo } from '@/lib/story-image/tenant-logo'

// El logo del complejo se guarda en WebP y satori lo deja en blanco: la placa
// lo recibe pasado a PNG. La ruta es pública, así que solo baja de nuestro R2.

const BASE = 'https://img.turnogol.app'

async function webpLogo(): Promise<Uint8Array<ArrayBuffer>> {
  return Uint8Array.from(
    await sharp({ create: { width: 512, height: 512, channels: 3, background: '#123456' } })
      .webp()
      .toBuffer(),
  )
}

// Cada test usa una URL propia: el módulo guarda en memoria las que ya bajó.
let n = 0
const url = () => `${BASE}/t1/logo-${++n}-${crypto.randomUUID()}.webp`

beforeEach(() => {
  vi.stubEnv('R2_PUBLIC_BASE_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('loadTenantLogo', () => {
  it('baja el WebP y lo devuelve como PNG', async () => {
    const bytes = await webpLogo()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes)),
    )
    const uri = await loadTenantLogo(url())
    expect(uri).toMatch(/^data:image\/png;base64,/)
    const png = Buffer.from(uri!.split(',')[1]!, 'base64')
    expect((await sharp(png).metadata()).format).toBe('png')
  })

  it('no sigue redirects: el chequeo de host vale solo para la URL pedida', async () => {
    const bytes = await webpLogo()
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(bytes))
    vi.stubGlobal('fetch', fetchSpy)
    await loadTenantLogo(url())
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ redirect: 'error' })
  })

  it('no sale a buscar un host que no es el de R2', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await loadTenantLogo('https://otro.example.com/logo.webp')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('si la descarga falla devuelve null y no lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 404 })),
    )
    expect(await loadTenantLogo(url())).toBeNull()
  })

  it('si lo que baja no es una imagen devuelve null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>')),
    )
    expect(await loadTenantLogo(url())).toBeNull()
  })

  it('el mismo logo se baja una sola vez', async () => {
    const bytes = await webpLogo()
    const fetchSpy = vi.fn(async () => new Response(bytes))
    vi.stubGlobal('fetch', fetchSpy)
    const same = url()
    await loadTenantLogo(same)
    await loadTenantLogo(same)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
