import { describe, expect, it } from 'vitest'

// ENS-13: la validación final de createAbonadoAction (abonados/actions.ts,
// que reusa este schema de módulo) usaba `hhmm` (00:00-23:59) para timeEnd,
// así que un abonado que termina exactamente a medianoche ('24:00') se
// rechazaba con "Datos inválidos.", pese a que nuevo/actions.ts (la capa
// previa) ya lo dejaba pasar. Este test cubre la capa final, que es la que
// de verdad bloqueaba el flujo. Vive en `abonado.schema.ts` (no en
// actions.ts, que es 'use server' — Next.js exige que TODO export de un
// archivo 'use server' sea una función async, ver el comentario en ese
// schema).

import { createAbonadoSchema } from '@/modules/abonados/abonado.schema'

// Fecha de inicio SIEMPRE futura y relativa al reloj: una fecha fija (antes
// '2026-06-15') queda en el pasado con el correr del tiempo y choca contra el
// guard de "un turno fijo no puede arrancar antes de hoy" (🟡 QA 2026-08-13).
// Mismo patrón de fixture que ya rotó en race-admin-vs-online.test.ts.
const FUTURE_START = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)

const VALID_UUID = '11111111-1111-1111-1111-111111111111'

const base = {
  courtId: VALID_UUID,
  contactName: 'Juan',
  contactPhone: '1122334455',
  dayOfWeek: 1,
  timeStart: '23:00',
  pricePerSession: 10000,
  startsOn: FUTURE_START,
  paymentMethod: 'cash' as const,
}

describe('createAbonadoSchema — timeEnd acepta 24:00 (ENS-13)', () => {
  it('acepta timeEnd "24:00" (turno hasta medianoche)', () => {
    const result = createAbonadoSchema.safeParse({ ...base, timeEnd: '24:00' })
    expect(result.success).toBe(true)
  })

  it('rechaza timeEnd "25:00" (hora inválida)', () => {
    const result = createAbonadoSchema.safeParse({ ...base, timeEnd: '25:00' })
    expect(result.success).toBe(false)
  })

  it('sigue aceptando un timeEnd normal dentro del día (23:59)', () => {
    const result = createAbonadoSchema.safeParse({ ...base, timeStart: '10:00', timeEnd: '23:59' })
    expect(result.success).toBe(true)
  })

  it('timeStart NO acepta "24:00" (solo válido como fin)', () => {
    const result = createAbonadoSchema.safeParse({ ...base, timeStart: '24:00', timeEnd: '24:30' })
    expect(result.success).toBe(false)
  })
})
