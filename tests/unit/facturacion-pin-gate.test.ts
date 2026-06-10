import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El page de facturacion es un Server Component async (DB). Guard estructural (#9):
// los datos sensibles (getSubscriptionState / mpConnected) solo deben fetchearse y
// renderizarse cuando hay sesion PIN valida server-side, nunca antes en el payload
// RSC. La parte de comportamiento (refresh tras verificar) la cubre pin-gate.test.
const src = readFileSync(
  join(process.cwd(), 'src/app/(admin)/settings/facturacion/page.tsx'),
  'utf8',
)

describe('facturacion/page — gating server-side del PIN (#9)', () => {
  it('verifica la sesion PIN en el servidor antes de fetchear', () => {
    expect(src).toContain('checkPinSessionAction')
    expect(src).toContain('const authorized = !hasPin || (await checkPinSessionAction())')
  })

  it('difiere el fetch y el render de datos sensibles detras de authorized', () => {
    expect(src).toMatch(/if \(authorized\)\s*\{/)
    expect(src).toContain('{authorized ? (')
  })
})
