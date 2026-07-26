import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import manifest from '@/app/manifest'

// Los iconos pasaron de route handlers que los generaban con ImageResponse en
// cada request (`/icon-192`) a PNGs estáticos servidos desde `public/`
// (`/icon-192.png`). Son bytes servidos directo, sin render por request.
describe('PWA manifest icons', () => {
  const m = manifest()

  it('includes icon 192x192 with purpose any', () => {
    const icon192 = m.icons?.find((i) => i.sizes === '192x192' && i.purpose === 'any')
    expect(icon192).toBeDefined()
    expect(icon192?.src).toBe('/icon-192.png')
  })

  it('includes icon 512x512 with purpose any', () => {
    const icon512 = m.icons?.find((i) => i.sizes === '512x512' && i.purpose === 'any')
    expect(icon512).toBeDefined()
    expect(icon512?.src).toBe('/icon-512.png')
  })

  it('includes icon 512x512 with purpose maskable', () => {
    const maskable = m.icons?.find((i) => i.sizes === '512x512' && i.purpose === 'maskable')
    expect(maskable).toBeDefined()
    expect(maskable?.src).toBe('/icon-512-maskable.png')
  })

  it('todos los iconos del manifest existen como archivo', () => {
    // Un manifest que referencia un icono inexistente instala la app sin ícono,
    // y el fallo es silencioso: no rompe el build ni ninguna página.
    //
    // Dos orígenes válidos, ambos servidos en la raíz: `public/<archivo>` y las
    // file conventions de Next (`src/app/icon.png` se sirve como `/icon.png`).
    for (const icon of m.icons ?? []) {
      expect(icon.src, `${icon.src} debería ser una ruta estática`).toMatch(/^\/[\w-]+\.png$/)
      const file = icon.src.replace(/^\//, '')
      const found =
        existsSync(path.join(process.cwd(), 'public', file)) ||
        existsSync(path.join(process.cwd(), 'src', 'app', file))
      expect(found, `no existe ni public/${file} ni src/app/${file}`).toBe(true)
    }
  })

  it('preserves 32x32 and 180x180 icons (regression guard)', () => {
    expect(m.icons?.find((i) => i.sizes === '32x32')).toBeDefined()
    expect(m.icons?.find((i) => i.sizes === '180x180')).toBeDefined()
  })

  it('declares categories including sports', () => {
    expect(m.categories).toContain('sports')
    expect(m.categories).toContain('business')
    expect(m.categories).toContain('productivity')
  })

  it('declares orientation portrait', () => {
    expect(m.orientation).toBe('portrait')
  })

  it('preserves display standalone (PWA install required by F9 push iOS 16.4+)', () => {
    expect(m.display).toBe('standalone')
  })
})
