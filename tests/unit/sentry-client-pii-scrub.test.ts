import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guard de regresión (#11, H-8 de la auditoría del 2026-09-05 y AUD-14): los
 * CUATRO entrypoints que inicializan el reporte de errores —navegador, web,
 * workers y edge— tienen que tapar los datos personales igual.
 *
 * Antes cada uno tenía su propia copia inline del tapado, y las tres se fueron
 * separando: ninguna tocaba las migas de navegación ni la excepción. Ahora hay
 * una sola función (`scrubEvent`) y esto verifica que nadie vuelva a forkearla.
 * El callback vive dentro de un import dinámico y no es exportable sin
 * refactor, así que la paridad se verifica sobre el texto fuente. El
 * comportamiento de `scrubEvent` está cubierto por
 * `tests/unit/sentry-scrub-event.test.ts`.
 */
const ENTRYPOINTS = [
  '../../instrumentation-client.ts',
  '../../sentry.edge.config.ts',
  '../../src/shared/observability/sentry-web-init.ts',
  '../../src/shared/observability/sentry-worker.ts',
] as const

function leer(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
}

describe('paridad del tapado de datos personales entre los tres entrypoints', () => {
  it.each(ENTRYPOINTS)('%s usa el tapado compartido dentro de beforeSend', (rel) => {
    const src = leer(rel)
    expect(src).toMatch(/from ['"]@\/lib\/sentry-pii-scrub['"]/)
    expect(src).toContain('scrubEvent(event)')
  })

  it.each(ENTRYPOINTS)('%s no vuelve a tapar por su cuenta', (rel) => {
    const src = leer(rel)
    // Las tres copias inline arrancaban con estas líneas. Que reaparezcan es la
    // señal de que alguien forkeó el tapado otra vez.
    expect(src).not.toContain('event.extra = scrubObject(event.extra)')
    expect(src).not.toContain('delete event.request.data')
    expect(src).not.toMatch(/event\.user = \{ id: event\.user\.id \}/)
  })
})
