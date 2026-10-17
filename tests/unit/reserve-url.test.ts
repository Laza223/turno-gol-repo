import { describe, expect, it } from 'vitest'
import {
  buildFichaHref,
  buildReserveRequest,
  buildReservarHref,
  parseFormato,
  parsePay,
  parseReserveState,
  writeReserveParams,
} from '@/lib/booking/reserve-url'

// Hoy = viernes 2026-10-16 (ART), ventana de 6 días: se puede reservar hasta el 2026-10-22.
const CTX = { today: '2026-10-16', advanceDays: 6, formats: [5, 7] }
const parse = (query: string) => parseReserveState(new URLSearchParams(query), CTX)

describe('parseReserveState — date', () => {
  it('acepta hoy, un día de en medio y el último día de la ventana', () => {
    expect(parse('date=2026-10-16').date).toBe('2026-10-16')
    expect(parse('date=2026-10-19').date).toBe('2026-10-19')
    expect(parse('date=2026-10-22').date).toBe('2026-10-22')
  })

  it('fuera de la ventana vuelve a hoy (no al borde): ayer y un día después del último', () => {
    expect(parse('date=2026-10-15').date).toBe('2026-10-16')
    expect(parse('date=2026-10-23').date).toBe('2026-10-16')
  })

  it('una fecha que no existe, un texto o la ausencia vuelven a hoy', () => {
    for (const query of ['date=2026-02-31', 'date=2026-13-01', 'date=mañana', 'date=', '']) {
      expect(parse(query).date, query).toBe('2026-10-16')
    }
  })
})

describe('parseReserveState — formato', () => {
  it('acepta un entero de la lista de formatos del complejo', () => {
    expect(parse('formato=5').formato).toBe(5)
    expect(parse('formato=7').formato).toBe(7)
  })

  it('cualquier otra cosa es null: formato que no tiene, no entero o forma no canónica', () => {
    for (const query of [
      'formato=9',
      'formato=0',
      'formato=05',
      'formato=5.0',
      'formato=%205',
      'formato=abc',
      'formato=',
      '',
    ]) {
      expect(parse(query).formato, query).toBeNull()
    }
  })

  it('sin formatos en la lista no hay formato válido', () => {
    expect(
      parseReserveState(new URLSearchParams('formato=5'), { ...CTX, formats: [] }).formato,
    ).toBeNull()
  })
})

describe('parseReserveState — hora', () => {
  it('acepta HH:MM, incluida la madrugada de un día operativo', () => {
    for (const hora of ['21:00', '09:30', '00:00', '01:00', '23:59']) {
      expect(parse(`hora=${hora}`).hora, hora).toBe(hora)
    }
  })

  it('rechaza lo que no tiene forma de etiqueta de turno', () => {
    for (const hora of ['24:00', '9:00', '21:60', '21:00:00', '21-00', 'noche', '']) {
      expect(parse(`hora=${hora}`).hora, hora).toBeNull()
    }
  })
})

describe('writeReserveParams', () => {
  it('conserva los demás params y pisa los de la reserva', () => {
    const params = writeReserveParams('utm_source=ig&date=2026-10-16&hora=20:00', {
      date: '2026-10-18',
      formato: 7,
    })
    expect(params.get('utm_source')).toBe('ig')
    expect(params.get('date')).toBe('2026-10-18')
    expect(params.get('formato')).toBe('7')
    expect(params.get('hora')).toBe('20:00')
  })

  it('null borra el param y undefined lo deja', () => {
    const params = writeReserveParams(new URLSearchParams('date=2026-10-16&formato=5&hora=20:00'), {
      formato: null,
      hora: null,
    })
    expect(params.has('formato')).toBe(false)
    expect(params.has('hora')).toBe(false)
    expect(params.get('date')).toBe('2026-10-16')
  })

  it('no muta lo que recibe', () => {
    const current = new URLSearchParams('date=2026-10-16')
    writeReserveParams(current, { date: '2026-10-17' })
    expect(current.get('date')).toBe('2026-10-16')
  })

  it('lo que escribe, parseReserveState lo lee igual', () => {
    const state = { date: '2026-10-20', formato: 5, hora: '00:00' }
    expect(parse(writeReserveParams('', state).toString())).toEqual(state)
  })
})

describe('buildReservarHref', () => {
  const turno = { courtId: 'c-1', date: '2026-10-16', time: '21:00' }

  it('es el contrato de reservar/page.tsx: court, date, time y dur=60', () => {
    expect(buildReservarHref('complejo-fenix', turno)).toBe(
      '/complejo-fenix/reservar?court=c-1&date=2026-10-16&time=21:00&dur=60',
    )
  })

  it('suma formato y pay cuando vienen, y nada cuando no', () => {
    expect(buildReservarHref('x', { ...turno, formato: 7, pay: 'transfer' })).toBe(
      '/x/reservar?court=c-1&date=2026-10-16&time=21:00&dur=60&formato=7&pay=transfer',
    )
    expect(buildReservarHref('x', { ...turno, formato: null, pay: null })).toBe(
      buildReservarHref('x', turno),
    )
  })
})

describe('buildFichaHref — el "Volver" y el "Elegir otro turno"', () => {
  it('vuelve a la ficha con día y hora, y con el formato solo si había uno', () => {
    expect(buildFichaHref('x', { date: '2026-10-16', hora: '21:00' })).toBe(
      '/x?date=2026-10-16&hora=21%3A00',
    )
    expect(buildFichaHref('x', { date: '2026-10-16', hora: '21:00', formato: 5 })).toBe(
      '/x?date=2026-10-16&hora=21%3A00&formato=5',
    )
  })

  it('sin nada que conservar es la ficha pelada', () => {
    expect(buildFichaHref('x', {})).toBe('/x')
  })
})

describe('parseFormato / parsePay — lo que viaja en la URL', () => {
  it('formato: solo la forma canónica de uno de los formatos de la lista', () => {
    expect(parseFormato('7', [5, 7])).toBe(7)
    for (const raw of ['9', '07', '7.0', ' 7', 'siete', '', null, undefined]) {
      expect(parseFormato(raw, [5, 7]), String(raw)).toBeNull()
    }
  })

  it('pay: solo un método de los que el complejo ofrece; si no, null (cae al default)', () => {
    expect(parsePay('cash', ['cash', 'transfer'])).toBe('cash')
    expect(parsePay('transfer', ['cash', 'transfer'])).toBe('transfer')
    expect(parsePay('mercadopago', ['mercadopago'])).toBe('mercadopago')
    // Un método válido pero que este complejo no ofrece (o no con seña) no pasa.
    expect(parsePay('mercadopago', ['cash', 'transfer'])).toBeNull()
    expect(parsePay('cash', ['mercadopago'])).toBeNull()
    for (const raw of ['efectivo', 'CASH', '', null, undefined, 5]) {
      expect(parsePay(raw, ['cash', 'transfer']), String(raw)).toBeNull()
    }
  })
})

describe('buildReserveRequest', () => {
  const court = { name: 'Cancha 2', format: 5 }
  const text = (href: string) => new URL(href).searchParams.get('text')

  it('con WhatsApp: abre el chat de ese número con el pedido escrito', () => {
    const request = buildReserveRequest(
      { whatsapp: '+54 9 11 4567-8900', phone: '+54 11 1111-2222' },
      court,
      '2026-10-15',
      '21:00',
    )
    expect(request?.channel).toBe('whatsapp')
    expect(request?.href).toMatch(/^https:\/\/wa\.me\/5491145678900\?text=/)
    expect(text(request!.href)).toBe(
      'Hola, quiero reservar un turno el jueves 15 de octubre a las 21:00 (Cancha 2, Fútbol 5).',
    )
  })

  it('sin WhatsApp cargado usa el teléfono del complejo', () => {
    const request = buildReserveRequest(
      { whatsapp: null, phone: '11 4567-8900' },
      court,
      '2026-10-15',
      '21:00',
    )
    expect(request?.channel).toBe('whatsapp')
    expect(request?.href).toMatch(/^https:\/\/wa\.me\/5491145678900\?text=/)
  })

  it('si el número no sirve para WhatsApp, marca el teléfono', () => {
    expect(
      buildReserveRequest({ whatsapp: null, phone: '4567' }, court, '2026-10-15', '21:00'),
    ).toEqual({
      channel: 'tel',
      href: 'tel:4567',
    })
  })

  it('sin nada marcable no hay botón', () => {
    expect(
      buildReserveRequest({ whatsapp: null, phone: '' }, court, '2026-10-15', '21:00'),
    ).toBeNull()
  })
})
