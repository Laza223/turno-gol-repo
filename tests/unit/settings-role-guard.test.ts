import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guard estructural (roles 026): toda la sección /settings y la Vista Equipo
// son solo-admin. El comportamiento del guard (redirect por rol leído de la DB)
// lo cubre tests/integration/staff-guards.test.ts; acá se asegura el CABLEADO:
// que el layout de settings exista y que ambos usen requireAdminStaff.

describe('settings — acceso solo admin (roles 026)', () => {
  it('settings/layout.tsx existe y aplica requireAdminStaff', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(admin)/settings/layout.tsx'), 'utf8')
    expect(src).toContain('requireAdminStaff')
    expect(src).toMatch(/await requireAdminStaff\(\)/)
  })

  it('settings/equipo/page.tsx (Vista Equipo) aplica requireAdminStaff', () => {
    // /staff se reubicó a /settings/equipo (redirect permanente en staff/page.tsx);
    // el guard real ahora vive acá.
    const src = readFileSync(
      join(process.cwd(), 'src/app/(admin)/settings/equipo/page.tsx'),
      'utf8',
    )
    expect(src).toContain('requireAdminStaff')
  })

  it('staff/page.tsx redirige a /settings/equipo (no duplica el guard)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(admin)/staff/page.tsx'), 'utf8')
    expect(src).toContain("redirect('/settings/equipo')")
  })
})
