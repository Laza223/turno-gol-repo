import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guard de regresion (#11): el beforeSend del client config debe scrubear PII
 * igual que el server. El callback es inline dentro de un dynamic import, no
 * exportable sin refactor, asi que verificamos paridad estructural sobre el
 * source. El comportamiento de scrubObject/scrubQueryString ya esta cubierto
 * por tests/unit/sentry-pii-scrub.test.ts.
 */
const src = readFileSync(
  fileURLToPath(new URL('../../sentry.client.config.ts', import.meta.url)),
  'utf8',
)

describe('sentry.client.config — paridad de scrub de PII (#11)', () => {
  it('importa los helpers de scrub compartidos', () => {
    expect(src).toMatch(/from ['"]@\/lib\/sentry-pii-scrub['"]/)
    expect(src).toContain('scrubObject')
    expect(src).toContain('scrubQueryString')
  })

  it('scrubea extra, contexts, request y user dentro de beforeSend', () => {
    expect(src).toContain('event.extra = scrubObject(event.extra)')
    expect(src).toContain('event.contexts = scrubObject(event.contexts)')
    expect(src).toContain('scrubQueryString(event.request.query_string)')
    expect(src).toContain('delete event.request.data')
    expect(src).toContain('delete h.authorization')
    expect(src).toMatch(/event\.user = \{ id: event\.user\.id \}/)
  })
})
