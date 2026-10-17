import { describe, expect, it } from 'vitest'
import {
  buildGroupShareHref,
  buildGroupShareText,
  type GroupShareData,
} from '@/lib/booking/group-share'

const data: GroupShareData = {
  tenantName: 'Complejo Fénix',
  courtName: 'Cancha 2',
  courtFormat: 7,
  date: '2026-03-14',
  timeStart: '18:00:00',
  timeEnd: '19:00:00',
  address: 'Av. Rivadavia 4820',
  city: 'Ciudad Autónoma de Buenos Aires',
  complexUrl: 'https://turnogol.test/complejo-fenix',
}

describe('buildGroupShareText', () => {
  it('lleva día, hora, cancha, formato, dirección y el link del complejo', () => {
    const text = buildGroupShareText(data)
    expect(text).toContain('sábado 14 de marzo')
    expect(text).toContain('de 18:00 a 19:00')
    expect(text).toContain('Cancha 2 · Fútbol 7')
    expect(text).toContain('Complejo Fénix · Av. Rivadavia 4820, Ciudad Autónoma de Buenos Aires')
    expect(text.split('\n').at(-1)).toBe('https://turnogol.test/complejo-fenix')
  })

  it('no lleva ningún monto: el mensaje es el mismo con los precios ocultos o no', () => {
    const text = buildGroupShareText(data)
    expect(text).not.toMatch(/\$/)
    expect(text).not.toMatch(/seña|precio|pagu|pagá/i)
  })

  it('sin dirección dice solo el complejo, sin puntos sueltos', () => {
    const text = buildGroupShareText({ ...data, address: ' ', city: '' })
    expect(text).toContain('\nComplejo Fénix\n')
    expect(text).not.toContain('·  ')
  })

  it('un turno que termina a medianoche conserva el "24:00" de la reserva', () => {
    expect(buildGroupShareText({ ...data, timeStart: '23:00', timeEnd: '24:00' })).toContain(
      'de 23:00 a 24:00',
    )
  })
})

describe('buildGroupShareHref', () => {
  it('es un wa.me sin número con el texto codificado', () => {
    const text = buildGroupShareText(data)
    const href = buildGroupShareHref(text)
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(text)
  })
})
