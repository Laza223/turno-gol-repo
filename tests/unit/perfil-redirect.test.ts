import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

import PerfilPage from '@/app/(player)/perfil/page'

async function destino(tab?: string): Promise<string> {
  try {
    await PerfilPage({ searchParams: Promise.resolve(tab === undefined ? {} : { tab }) })
  } catch (err) {
    return (err as Error).message.replace('REDIRECT:', '')
  }
  throw new Error('no redirigió')
}

describe('/perfil redirige a la Cuenta', () => {
  it.each([
    ['datos', '/configuracion#tus-datos'],
    ['favoritos', '/configuracion#favoritos'],
    ['actividad', '/configuracion#actividad'],
    ['notificaciones', '/configuracion'],
    [undefined, '/configuracion'],
    ['cualquier-cosa', '/configuracion'],
  ])('?tab=%s -> %s', async (tab, esperado) => {
    expect(await destino(tab)).toBe(esperado)
  })

  it('no usa los nombres de Object.prototype como pestaña', async () => {
    expect(await destino('constructor')).toBe('/configuracion')
    expect(await destino('toString')).toBe('/configuracion')
  })
})
