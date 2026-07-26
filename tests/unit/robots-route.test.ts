import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'

describe('robots()', () => {
  const r = robots()

  it('has a single rule for userAgent *', () => {
    expect(Array.isArray(r.rules)).toBe(true)
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    expect(rules).toHaveLength(1)
    expect(rules[0]!.userAgent).toBe('*')
  })

  it('allows public routes', () => {
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    const allow = rules[0]!.allow as string[]
    expect(allow).toContain('/')
    expect(allow).toContain('/explorar')
  })

  it('disallows private + sensitive routes', () => {
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules]
    const disallow = rules[0]!.disallow as string[]
    expect(disallow).toContain('/api/')
    expect(disallow).toContain('/super-admin/')
    expect(disallow).toContain('/monitoring')

    // `(admin)` y `(player)` son route GROUPS: no aparecen en la URL, así que
    // `/admin/` y `/player/` no bloqueaban absolutamente nada y las rutas
    // reales quedaban sin declarar. Ahora se listan una por una.
    for (const route of ['/dashboard', '/grilla', '/caja', '/reservas', '/settings']) {
      expect(disallow, `falta la ruta admin ${route}`).toContain(route)
    }
    for (const route of ['/mis-reservas', '/perfil', '/configuracion']) {
      expect(disallow, `falta la ruta de jugador ${route}`).toContain(route)
    }
    expect(disallow).not.toContain('/admin/')
    expect(disallow).not.toContain('/player/')
  })

  it('references a sitemap URL', () => {
    expect(r.sitemap).toBeDefined()
    expect(String(r.sitemap)).toContain('/sitemap.xml')
  })
})
