import { describe, expect, it } from 'vitest'
import { generateSlots } from '@/modules/bookings/booking.service'
import type { CourtPricingData } from '@/modules/courts/court.types'

// Cutoff a las 18:00: tarifa mañana (mon-thu 08:00-18:00) y tarifa noche
// (mon-thu 18:00-23:00). Viernes deliberadamente SIN regla para ejercitar el
// camino price=null. 23:00-00:00 tampoco tiene regla (la noche corta a las 23).
const PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      price: 800000,
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      price: 1200000,
    },
  ],
}

describe('generateSlots', () => {
  it('no genera slots cuando el día está cerrado', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: true,
      occupied: [],
      durationMins: 60,
    })
    expect(slots).toHaveLength(0)
  })

  it('genera 15 slots de 60 min entre 08:00 y 23:00 con bordes exactos', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    expect(slots).toHaveLength(15)
    expect(slots[0]).toMatchObject({ timeStart: '08:00', timeEnd: '09:00' })
    // El último slot debe TERMINAR en el cierre, no pasarse.
    expect(slots[slots.length - 1]).toMatchObject({
      timeStart: '22:00',
      timeEnd: '23:00',
    })
  })

  it('los slots de 120 min avanzan de a 120 y terminan donde corresponde', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '12:00',
      closedDay: false,
      occupied: [],
      durationMins: 120,
    })
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({
      timeStart: '08:00',
      timeEnd: '10:00',
      price: 800000,
    })
    expect(slots[1]).toMatchObject({ timeStart: '10:00', timeEnd: '12:00' })
  })

  it('asigna el precio correcto según la regla horaria y la duración', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    expect(slots.find((s) => s.timeStart === '09:00')?.price).toBe(800000)
    expect(slots.find((s) => s.timeStart === '19:00')?.price).toBe(1200000)
    // Slot exactamente en el cutoff (18:00) cae en la regla de la noche.
    expect(slots.find((s) => s.timeStart === '18:00')?.price).toBe(1200000)
  })

  it('genera los slots igual pero con price=null cuando ningún rule matchea el día', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'fri', // sin regla en PRICING (solo mon-thu)
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    // FIX (antes 🔴): el viejo test solo hacía slots.every(price===null), que es
    // verdad VACUA si generateSlots devolviera []. Anclamos también la cantidad:
    // un viernes abierto sigue produciendo grilla, solo que sin precio.
    expect(slots).toHaveLength(15)
    expect(slots.every((s) => s.price === null)).toBe(true)
  })

  describe('ocupación / detección de overlap', () => {
    it('marca como ocupados exactamente los slots que pisa una reserva alineada', () => {
      // Reserva 14:00-16:00 ocupa 14:00-15:00 y 15:00-16:00.
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '08:00',
        closeHhmm: '23:00',
        closedDay: false,
        occupied: [{ timeStartMins: 14 * 60, timeEndMins: 16 * 60 }],
        durationMins: 60,
      })
      const unavailable = slots.filter((s) => !s.available).map((s) => s.timeStart)
      expect(unavailable).toEqual(['14:00', '15:00'])
      // Y los vecinos inmediatos siguen disponibles (no hay derrame).
      expect(slots.find((s) => s.timeStart === '13:00')?.available).toBe(true)
      expect(slots.find((s) => s.timeStart === '16:00')?.available).toBe(true)
    })

    it('una reserva NO alineada bloquea todos los slots que toca parcialmente', () => {
      // Reserva 14:30-15:30 pisa la cola de 14:00-15:00 y la cabeza de 15:00-16:00.
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '08:00',
        closeHhmm: '23:00',
        closedDay: false,
        occupied: [{ timeStartMins: 14 * 60 + 30, timeEndMins: 15 * 60 + 30 }],
        durationMins: 60,
      })
      const unavailable = slots.filter((s) => !s.available).map((s) => s.timeStart)
      expect(unavailable).toEqual(['14:00', '15:00'])
    })

    it('una reserva adyacente (que solo toca el borde) NO bloquea el slot vecino', () => {
      // Reserva 15:00-16:00. El slot 14:00-15:00 termina justo donde empieza la
      // reserva: borde compartido, sin solapamiento real → debe quedar libre.
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '08:00',
        closeHhmm: '23:00',
        closedDay: false,
        occupied: [{ timeStartMins: 15 * 60, timeEndMins: 16 * 60 }],
        durationMins: 60,
      })
      expect(slots.find((s) => s.timeStart === '14:00')?.available).toBe(true)
      expect(slots.find((s) => s.timeStart === '15:00')?.available).toBe(false)
      expect(slots.find((s) => s.timeStart === '16:00')?.available).toBe(true)
    })
  })

  describe('bordes de horario', () => {
    it('cierre a medianoche (00:00) genera el último slot terminando en 00:00', () => {
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '22:00',
        closeHhmm: '00:00', // wrap: closeMins 0 → 24*60
        closedDay: false,
        occupied: [],
        durationMins: 60,
      })
      expect(slots.map((s) => s.timeStart)).toEqual(['22:00', '23:00'])
      expect(slots[slots.length - 1]?.timeEnd).toBe('00:00')
    })

    it('descarta el tramo final que no completa una duración entera', () => {
      // Ventana 08:00-11:30 con slots de 60 min: solo entran 08, 09 y 10
      // (10:00-11:00). El tramo 11:00-11:30 es parcial y se descarta.
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '08:00',
        closeHhmm: '11:30',
        closedDay: false,
        occupied: [],
        durationMins: 60,
      })
      expect(slots.map((s) => s.timeStart)).toEqual(['08:00', '09:00', '10:00'])
      expect(slots[slots.length - 1]?.timeEnd).toBe('11:00')
    })
  })

  describe('precio cruzando el cutoff', () => {
    it('un slot de 120 min se cobra según la regla de SU HORA DE INICIO', () => {
      // Slot 17:00-19:00 arranca en la franja mañana (corta 18:00) pero termina
      // en la franja noche. El precio se decide por la hora de inicio → tarifa
      // mañana (800000), no la noche (1200000). Test de anclaje de esa decisión.
      const slots = generateSlots({
        pricing: PRICING,
        dayKey: 'mon',
        openHhmm: '17:00',
        closeHhmm: '19:00',
        closedDay: false,
        occupied: [],
        durationMins: 120,
      })
      expect(slots).toHaveLength(1)
      expect(slots[0]).toMatchObject({
        timeStart: '17:00',
        timeEnd: '19:00',
        price: 800000,
      })
    })
  })
})
