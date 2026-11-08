import { describe, expect, it } from 'vitest'
import { updateAbonadoSchema } from '@/modules/abonados/abonado.schema'

const COURT = '11111111-1111-1111-1111-111111111111'

describe('updateAbonadoSchema', () => {
  it('acepta un cambio de precio solo', () => {
    expect(updateAbonadoSchema.safeParse({ pricePerSession: 2_500_000 }).success).toBe(true)
  })

  it('rechaza un pedido sin ningún cambio', () => {
    const r = updateAbonadoSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.message).toBe('No cambiaste nada.')
  })

  it('rechaza precio cero o negativo: el fijo siempre vale más que cero', () => {
    expect(updateAbonadoSchema.safeParse({ pricePerSession: 0 }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ pricePerSession: -100 }).success).toBe(false)
  })

  it('rechaza un nombre o un teléfono en blanco', () => {
    expect(updateAbonadoSchema.safeParse({ contactName: '   ' }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ contactPhone: '' }).success).toBe(false)
  })

  it('no acepta cambiar la cuenta de jugador', () => {
    const r = updateAbonadoSchema.safeParse({ pricePerSession: 100, playerId: COURT })
    expect(r.success).toBe(true)
    if (r.success) expect('playerId' in r.data).toBe(false)
  })

  it('el horario va completo: desde y hasta juntos', () => {
    expect(updateAbonadoSchema.safeParse({ timeStart: '20:00' }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ timeEnd: '21:00' }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ timeStart: '20:00', timeEnd: '21:00' }).success).toBe(
      true,
    )
  })

  it('el fin tiene que ser posterior al inicio, y puede ser medianoche', () => {
    expect(updateAbonadoSchema.safeParse({ timeStart: '22:00', timeEnd: '21:00' }).success).toBe(
      false,
    )
    expect(updateAbonadoSchema.safeParse({ timeStart: '23:00', timeEnd: '24:00' }).success).toBe(
      true,
    )
  })

  it('valida el día de la semana y la cancha', () => {
    expect(updateAbonadoSchema.safeParse({ dayOfWeek: 7 }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ dayOfWeek: 0 }).success).toBe(true)
    expect(updateAbonadoSchema.safeParse({ courtId: 'no-es-uuid' }).success).toBe(false)
    expect(updateAbonadoSchema.safeParse({ courtId: COURT }).success).toBe(true)
  })
})
