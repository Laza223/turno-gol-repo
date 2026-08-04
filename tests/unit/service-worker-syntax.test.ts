import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

/**
 * Guard de la clase "sed corrompió public/sw.js".
 *
 * `public/sw.js` no pasa por `pnpm lint` (solo cubre `src/`) ni se ejecuta de
 * verdad en e2e (`tests/e2e/push.spec.ts` inyecta mensajes por BroadcastChannel
 * en vez de cargar el Service Worker real). Un reemplazo de texto mal hecho
 * (commit adb1729) dejó un fragmento corrupto pegado al inicio del archivo y
 * nada lo detectó: el Service Worker de push notifications quedó roto en
 * producción porque el navegador nunca pudo parsearlo para registrarlo.
 *
 * `new vm.Script` compila sin ejecutar — alcanza para tirar SyntaxError si el
 * archivo no es JS válido, sin necesitar mocks de `self`/`addEventListener`.
 */
describe('public/sw.js es JS válido', () => {
  it('parsea sin SyntaxError', () => {
    const swPath = path.resolve(__dirname, '..', '..', 'public', 'sw.js')
    const source = readFileSync(swPath, 'utf8')

    expect(() => new vm.Script(source, { filename: swPath })).not.toThrow()
  })
})
