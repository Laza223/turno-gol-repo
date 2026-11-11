import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md): qué puede
// hacer un complejo en el plan gratis lo decide quién pide `allowFree`. Es
// opt-in a propósito: una función nueva nace cerrada para el gratis. Esta lista
// cerrada obliga a que abrir una más sea una decisión visible en el diff (y no
// un copy-paste de otro guard). Si agregás un archivo, confirmá que la función
// está en "Qué incluye cada plan" del decision doc.
const ALLOWED = new Set([
  'src/app/(admin)/analiticas/page.tsx',
  'src/app/(admin)/canchas/actions.ts',
  'src/app/(admin)/canchas/page.tsx',
  'src/app/(admin)/dashboard/actions.ts',
  'src/app/(admin)/dashboard/page.tsx',
  'src/app/(admin)/grilla/actions.ts',
  'src/app/(admin)/grilla/page.tsx',
  'src/app/(admin)/notificaciones/actions.ts',
  'src/app/(admin)/notificaciones/page.tsx',
  'src/app/(admin)/reservas/(list)/page.tsx',
  'src/app/(admin)/reservas/[id]/page.tsx',
  'src/app/(admin)/reservas/actions.ts',
  'src/app/(admin)/settings/datos/actions.ts',
  'src/app/(admin)/settings/datos/page.tsx',
  'src/app/(admin)/settings/equipo/actions.ts',
  'src/app/(admin)/settings/facturacion/actions.ts',
  'src/app/(admin)/settings/facturacion/page.tsx',
  'src/app/(admin)/settings/horarios/actions.ts',
  'src/app/(admin)/settings/horarios/page.tsx',
  'src/app/(admin)/settings/invitar/actions.ts',
  'src/app/(admin)/settings/invitar/page.tsx',
  'src/app/(admin)/settings/layout.tsx',
  'src/app/(admin)/settings/page.tsx',
  'src/app/(admin)/settings/perfil/actions.ts',
  'src/app/(admin)/settings/perfil/page.tsx',
  'src/app/(admin)/settings/reservas/actions.ts',
  'src/app/(admin)/settings/reservas/page.tsx',
  'src/app/api/admin/push/subscribe/route.ts',
  'src/app/api/admin/push/test/route.ts',
  'src/app/api/admin/push/unsubscribe/route.ts',
  'src/app/api/billing/invoices/route.ts',
  'src/app/api/billing/subscription/route.ts',
  'src/app/api/bookings/route.ts',
  // Definición del mecanismo, no usos.
  'src/modules/staff/guards.ts',
  'src/modules/tenants/tenant.lifecycle.ts',
  'src/server/middleware/with-tenant.ts',
])

const ROOT = process.cwd()

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe('allowFree: lista cerrada de lo que abre el plan gratis', () => {
  const found = walk(join(ROOT, 'src'), [])
    .filter((f) => readFileSync(f, 'utf8').includes('allowFree'))
    .map((f) => relative(ROOT, f).split(sep).join('/'))

  it('ningún archivo nuevo pide allowFree sin pasar por esta lista', () => {
    expect(found.filter((f) => !ALLOWED.has(f))).toEqual([])
  })

  it('la lista no tiene entradas muertas', () => {
    expect([...ALLOWED].filter((f) => !found.includes(f))).toEqual([])
  })
})
