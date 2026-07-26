import { describe, expect, it } from 'vitest'
import { expandRangeToHourSlots } from '@/modules/tournaments/slot-expansion'
import { TournamentSlotRangeError } from '@/modules/tournaments/tournament.errors'

// Apertura típica de un complejo. Define qué cuenta como "madrugada".
const OPEN_8AM = 8 * 60

describe('expandRangeToHourSlots — complejo que cierra el mismo día', () => {
  it('reparte una franja de tarde en horas enteras', () => {
    const slots = expandRangeToHourSlots({
      timeStart: '14:00',
      timeEnd: '18:00',
      openMins: OPEN_8AM,
      closesNextDay: false,
    })

    expect(slots).toHaveLength(4)
    expect(slots.map((s) => s.timeStart)).toEqual(['14:00', '15:00', '16:00', '17:00'])
    expect(slots.map((s) => s.timeEnd)).toEqual(['15:00', '16:00', '17:00', '18:00'])
    expect(slots.every((s) => !s.physicallyNextDay)).toBe(true)
  })

  it('una sola hora da un solo slot', () => {
    const slots = expandRangeToHourSlots({
      timeStart: '20:00',
      timeEnd: '21:00',
      openMins: OPEN_8AM,
      closesNextDay: false,
    })
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ timeStart: '20:00', timeEnd: '21:00' })
  })

  it("el slot que termina a medianoche cierra en '24:00', no en '00:00'", () => {
    // '00:00' violaría chk_time_valid (time_end > time_start); '24:00' es un
    // TIME válido de Postgres y es > '23:00'.
    const slots = expandRangeToHourSlots({
      timeStart: '22:00',
      timeEnd: '24:00',
      openMins: OPEN_8AM,
      closesNextDay: false,
    })
    expect(slots).toHaveLength(2)
    expect(slots[1]).toMatchObject({ timeStart: '23:00', timeEnd: '24:00' })
  })

  it("acepta '00:00' como fin y lo trata como medianoche, no como arranque del día", () => {
    const slots = expandRangeToHourSlots({
      timeStart: '22:00',
      timeEnd: '00:00',
      openMins: OPEN_8AM,
      closesNextDay: false,
    })
    expect(slots).toHaveLength(2)
    expect(slots[1]!.timeEnd).toBe('24:00')
  })
})

describe('expandRangeToHourSlots — complejo que cierra después de medianoche', () => {
  it('una franja que cruza medianoche sigue en el mismo día operativo', () => {
    const slots = expandRangeToHourSlots({
      timeStart: '22:00',
      timeEnd: '02:00',
      openMins: OPEN_8AM,
      closesNextDay: true,
    })

    expect(slots.map((s) => s.timeStart)).toEqual(['22:00', '23:00', '00:00', '01:00'])
    expect(slots.map((s) => s.timeEnd)).toEqual(['23:00', '24:00', '01:00', '02:00'])
    // Las dos primeras suceden hoy; las de madrugada, el día calendario siguiente.
    expect(slots.map((s) => s.physicallyNextDay)).toEqual([false, false, true, true])
  })

  it('una franja íntegramente de madrugada pertenece a la noche anterior', () => {
    const slots = expandRangeToHourSlots({
      timeStart: '00:00',
      timeEnd: '02:00',
      openMins: OPEN_8AM,
      closesNextDay: true,
    })

    expect(slots).toHaveLength(2)
    expect(slots.map((s) => s.timeStart)).toEqual(['00:00', '01:00'])
    expect(slots.every((s) => s.physicallyNextDay)).toBe(true)
  })

  it('el eje de minutos queda monotónico cruzando medianoche', () => {
    // Es lo que mantiene la grilla ordenada: las horas de madrugada van DESPUÉS
    // de las 23:00, no antes de las 00:00.
    const slots = expandRangeToHourSlots({
      timeStart: '22:00',
      timeEnd: '02:00',
      openMins: OPEN_8AM,
      closesNextDay: true,
    })
    const mins = slots.map((s) => s.startMins)
    expect(mins).toEqual([...mins].sort((a, b) => a - b))
    expect(mins).toEqual([1320, 1380, 1440, 1500])
  })

  it('sin el flag, una franja que cruza medianoche es inválida', () => {
    expect(() =>
      expandRangeToHourSlots({
        timeStart: '22:00',
        timeEnd: '02:00',
        openMins: OPEN_8AM,
        closesNextDay: false,
      }),
    ).toThrow(TournamentSlotRangeError)
  })
})

describe('expandRangeToHourSlots — rangos inválidos', () => {
  it('rechaza el fin anterior al inicio', () => {
    expect(() =>
      expandRangeToHourSlots({
        timeStart: '18:00',
        timeEnd: '14:00',
        openMins: OPEN_8AM,
        closesNextDay: false,
      }),
    ).toThrow(TournamentSlotRangeError)
  })

  it('rechaza el rango vacío', () => {
    expect(() =>
      expandRangeToHourSlots({
        timeStart: '14:00',
        timeEnd: '14:00',
        openMins: OPEN_8AM,
        closesNextDay: false,
      }),
    ).toThrow(TournamentSlotRangeError)
  })

  it('rechaza una franja que no es múltiplo de la hora', () => {
    // El turno es de 60 minutos fijos: media hora suelta rompería la grilla
    // (computeCells calcula rowSpan = duración / 60).
    expect(() =>
      expandRangeToHourSlots({
        timeStart: '14:00',
        timeEnd: '16:30',
        openMins: OPEN_8AM,
        closesNextDay: false,
      }),
    ).toThrow(TournamentSlotRangeError)
  })

  it('rechaza el rango invertido dentro de la madrugada de un complejo nocturno', () => {
    // 02:00→01:00 con apertura 03:00: las dos puntas son madrugada, así que se
    // corren juntas al día siguiente y el fin sigue quedando antes del inicio.
    // (El tope de 24 horas de expandRangeToHourSlots es defensivo: con ambas
    // puntas dentro de 0–1440 el rango normalizado nunca lo supera.)
    expect(() =>
      expandRangeToHourSlots({
        timeStart: '02:00',
        timeEnd: '01:00',
        openMins: 3 * 60,
        closesNextDay: true,
      }),
    ).toThrow(TournamentSlotRangeError)
  })
})
