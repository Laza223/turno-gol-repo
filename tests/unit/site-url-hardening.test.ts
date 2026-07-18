import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// SITE_URL se resuelve al importar el módulo (const de nivel de módulo), así que
// cada caso setea la env y re-importa con vi.resetModules().
const KEYS = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL'] as const
const saved: Record<string, string | undefined> = {}

async function loadSiteUrl(env: Partial<Record<(typeof KEYS)[number], string>>): Promise<string> {
  vi.resetModules()
  for (const k of KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  const mod = await import('@/lib/seo/metadata')
  return mod.SITE_URL
}

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.resetModules()
})

describe('SITE_URL hardening', () => {
  // Regresión del bug que dejó producción sin deployar ~2 semanas: la env de
  // Vercel traía un salto de línea al final y `new URL(SITE_URL)` reventaba el
  // build al prerenderizar /sitemap.xml.
  it('saca un salto de línea final (el bug que rompía el build de prod)', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_APP_URL: 'https://turnogol.app\n' })
    expect(url).toBe('https://turnogol.app')
    expect(url).not.toContain('\n')
    expect(() => new URL(url)).not.toThrow()
  })

  it('recorta espacios alrededor', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_APP_URL: '  https://turnogol.app  ' })
    expect(url).toBe('https://turnogol.app')
  })

  it('antepone https:// cuando falta el scheme', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_APP_URL: 'turnogol.app' })
    expect(url).toBe('https://turnogol.app')
  })

  it('descarta la barra final', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_APP_URL: 'https://turnogol.app/' })
    expect(url).toBe('https://turnogol.app')
  })

  it('prefiere APP_URL sobre SITE_URL', async () => {
    const url = await loadSiteUrl({
      NEXT_PUBLIC_APP_URL: 'https://a.app',
      NEXT_PUBLIC_SITE_URL: 'https://b.app',
    })
    expect(url).toBe('https://a.app')
  })

  it('cae a SITE_URL cuando APP_URL no está', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://b.app' })
    expect(url).toBe('https://b.app')
  })

  it('cae a localhost cuando ninguna está seteada', async () => {
    const url = await loadSiteUrl({})
    expect(url).toBe('http://localhost:3000')
  })

  it('nunca hace throw en new URL(SITE_URL), ni con basura', async () => {
    const url = await loadSiteUrl({ NEXT_PUBLIC_APP_URL: '\n\n   \n' })
    expect(() => new URL(url)).not.toThrow()
    expect(url).toBe('http://localhost:3000')
  })
})
