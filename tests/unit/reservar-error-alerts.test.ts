import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El page de checkout es un Server Component async (getTenantBySlug + lookups de
// cancha/precio), no renderizable sin DB. Guard estructural (#22): cada codigo de
// ?error= debe tener su bloque role="alert" para que el jugador entienda por que
// no se proceso la reserva.
const src = readFileSync(
  join(process.cwd(), 'src/app/(public)/[slug]/reservar/page.tsx'),
  'utf8',
)

describe('reservar/page — alertas de error de checkout (#22)', () => {
  it.each(['slot_taken', 'banned', 'rate_limited', 'unavailable'])(
    'renderiza un alert para searchParams.error === %s',
    (code) => {
      expect(src).toContain(`searchParams.error === '${code}'`)
    },
  )
})
