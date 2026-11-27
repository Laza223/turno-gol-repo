import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md §4.7): qué puede
// hacer un complejo en `trial_expired` lo decide quién pide `allowExpired`. Es opt-in a
// propósito: una función nueva nace cerrada. Esta lista cerrada obliga a que abrir una más sea
// una decisión visible en el diff. Solo se operan las reservas que YA existen (dar por jugado,
// ausente, cobrar, cancelar, devolver, confirmar seña) y se registra el push del admin.
const ALLOWED = new Set([
  'src/app/(admin)/reservas/actions.ts',
  'src/app/(admin)/caja/cantina/actions.ts',
  'src/app/(admin)/caja/deudas/actions.ts',
  'src/app/(admin)/caja/devoluciones/actions.ts',
  'src/app/(admin)/notificaciones/actions.ts',
  'src/app/api/admin/push/subscribe/route.ts',
  'src/app/api/admin/push/unsubscribe/route.ts',
  // Definición del mecanismo, no usos.
  'src/modules/staff/guards.ts',
  'src/server/middleware/with-tenant.ts',
])

// Las únicas acciones de reservas.actions.ts que lo piden: operar lo que ya existe.
const RESERVAS_ACTIONS_WITH_ALLOW_EXPIRED = [
  'confirmDepositPaymentAction',
  'completeBookingAction',
  'markNoShowAction',
  'revertNoShowAction',
  'cancelBookingAction',
  'addBookingChargeAction',
  'releaseBlockAction',
  'completeAndChargeBookingAction',
]

const ROOT = process.cwd()

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe('allowExpired: lista cerrada de lo que abre el plan no activo', () => {
  const found = walk(join(ROOT, 'src'), [])
    .filter((f) => readFileSync(f, 'utf8').match(/allowExpired\s*\??:/))
    .map((f) => relative(ROOT, f).split(sep).join('/'))

  it('ningún archivo nuevo pide allowExpired sin pasar por esta lista', () => {
    expect(found.filter((f) => !ALLOWED.has(f))).toEqual([])
  })

  it('la lista no tiene entradas muertas', () => {
    expect([...ALLOWED].filter((f) => !found.includes(f))).toEqual([])
  })

  it('en reservas/actions.ts solo operar una reserva existente lo pide (no crear, editar ni mover)', () => {
    const src = readFileSync(join(ROOT, 'src/app/(admin)/reservas/actions.ts'), 'utf8')
    const withOptIn = [...src.matchAll(/export async function (\w+)[\s\S]*?\n}\n/g)]
      .filter((m) => m[0].match(/allowExpired\s*\??:/))
      .map((m) => m[1])
    expect(withOptIn.sort()).toEqual([...RESERVAS_ACTIONS_WITH_ALLOW_EXPIRED].sort())
  })

  it('en cantina/actions.ts solo lo piden los consumos anotados a un turno (no vender)', () => {
    const src = readFileSync(join(ROOT, 'src/app/(admin)/caja/cantina/actions.ts'), 'utf8')
    const withOptIn = [...src.matchAll(/export async function (\w+)[\s\S]*?\n}\n/g)]
      .filter((m) => m[0].match(/allowExpired\s*\??:/))
      .map((m) => m[1])
    expect(withOptIn.sort()).toEqual(
      ['cancelTabAction', 'listBookingConsumosAction', 'settleTabAction'].sort(),
    )
  })

  it('ninguna acción de configuración, canchas, equipo, productos ni de bot lo pide', () => {
    for (const f of found) {
      expect(f).not.toMatch(/settings|canchas|productos|equipo|whatsapp|mp\//)
    }
  })
})
