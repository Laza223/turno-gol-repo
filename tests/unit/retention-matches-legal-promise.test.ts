import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANCELED_BLOCKED_DELETION_DAYS,
  CHURNED_DELETION_DAYS,
} from '@/modules/billing/lifecycle.service'

/**
 * Candado de B1 — regresión "el código borra antes de lo que los términos prometen".
 *
 * `CHURNED_DELETION_DAYS` estuvo en 7 mientras `/terminos` y `/privacidad`, las
 * dos páginas publicadas, le garantizaban al titular que "los datos del
 * complejo se conservan 90 días tras la baja". El código eliminaba 83 días
 * antes de lo comprometido, sobre datos personales alcanzados por la Ley
 * 25.326 — no es un bug de UX, es incumplir un contrato publicado.
 *
 * Las dos mitades pueden desincronizarse en cualquier dirección: alguien baja
 * la constante "para liberar espacio", o alguien reescribe el texto legal a 180
 * días sin tocar el código. Este test las ata en las DOS direcciones: lee el
 * número del texto publicado y lo compara con la constante que ejecuta el
 * borrado.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

/** Extrae "N días" de la oración que habla de conservación tras la baja. */
function retentionDaysPromisedIn(source: string, sentenceNeedle: string): number {
  const at = source.indexOf(sentenceNeedle)
  expect(at, `no se encontró la frase de retención: ${sentenceNeedle}`).toBeGreaterThan(-1)
  const around = source.slice(at, at + 400)
  const m = /(\d+)\s*días/.exec(around)
  expect(m, `no hay un "N días" cerca de: ${sentenceNeedle}`).not.toBeNull()
  return Number(m![1])
}

describe('la retención del código coincide con lo que promete el texto legal', () => {
  it('/terminos — "se conservan N días tras la baja"', () => {
    const days = retentionDaysPromisedIn(
      read('src/app/(public)/terminos/page.tsx'),
      'Los datos del complejo se conservan',
    )
    expect(
      CHURNED_DELETION_DAYS,
      `/terminos promete ${days} días y el código borra a los ${CHURNED_DELETION_DAYS}`,
    ).toBe(days)
  })

  it('/privacidad — "Datos de tenants churned: N días"', () => {
    const days = retentionDaysPromisedIn(
      read('src/app/(public)/privacidad/page.tsx'),
      'Datos de tenants churned',
    )
    expect(
      CHURNED_DELETION_DAYS,
      `/privacidad promete ${days} días y el código borra a los ${CHURNED_DELETION_DAYS}`,
    ).toBe(days)
  })

  it('el plazo de la baja por cancelación deja margen sobre la retención, nunca al revés', () => {
    // El +7 es el margen para que el sweep semanal alcance a correr. Lo que no
    // puede pasar nunca es que el camino de cancelación borre ANTES que el de
    // churn: sería la misma incoherencia por otra puerta.
    expect(CANCELED_BLOCKED_DELETION_DAYS).toBeGreaterThan(CHURNED_DELETION_DAYS)
    expect(CANCELED_BLOCKED_DELETION_DAYS - CHURNED_DELETION_DAYS).toBe(7)
  })

  it('el mail de cancelación y el FAQ prometen menos de lo que el código conserva', () => {
    // `/precios` y `subscription-canceled.ts` dicen "60 días" para la baja
    // voluntaria. Es un piso: mientras el código conserve MÁS, la promesa se
    // cumple. Si alguien bajara la constante por debajo, esto va rojo.
    expect(CANCELED_BLOCKED_DELETION_DAYS).toBeGreaterThanOrEqual(60)
  })
})
