import { describe, expect, it } from 'vitest'
import {
  ABONADOS_EXPORT_HEADER,
  BOOKINGS_EXPORT_HEADER,
  CLIENTS_EXPORT_HEADER,
  abonadoExportRow,
  assembleCsvFile,
  bookingExportRow,
  bookingKindLabel,
  clientExportRow,
  csvBody,
  csvLine,
  hhmmCell,
  isoDateCell,
  pesosCell,
  type AbonadoExportSource,
  type BookingExportSource,
  type ClientExportSource,
} from '@/modules/reports/data-export'

const BOOKING: BookingExportSource = {
  id: '3f2a9c1e-0000-4000-8000-000000000001',
  date: '2026-10-05',
  timeStart: '20:00:00',
  timeEnd: '21:00:00',
  courtName: 'Cancha 1',
  type: 'spontaneous',
  status: 'completed',
  depositStatus: 'paid',
  viaWhatsapp: false,
  byStaff: false,
  clientName: 'Juan Pérez',
  phone: '1123456789',
  priceSnapshot: 4_500_000,
  depositAmount: 1_350_000,
  totalPaid: 4_500_050,
}

const ABONADO: AbonadoExportSource = {
  contactName: 'Diego',
  contactPhone: '1198765432',
  dayOfWeek: 1,
  timeStart: '21:00:00',
  timeEnd: '22:00:00',
  courtName: 'Cancha 2',
  pricePerSession: 4_000_000,
  paymentMethod: 'transfer',
  status: 'paused',
  startsOn: new Date('2026-03-02'),
  endsOn: null,
}

const CLIENT: ClientExportSource = {
  kind: 'player',
  name: 'Ana Gómez',
  email: 'ana@example.com',
  phone: '1122223333',
  bookingsCount: 12,
  noshowCount: 1,
  lastBookingAt: '2026-10-01',
  fixedCount: 0,
  tags: ['group_organizer', 'gets_credit'],
}

const columns = (line: string) => line.split(';').length

describe('pesosCell', () => {
  it('pasa centavos a pesos sin separador de miles', () => {
    expect(pesosCell(1_500_000)).toBe('15000')
  })
  it('usa coma decimal solo cuando hay centavos', () => {
    expect(pesosCell(1_500_050)).toBe('15000,50')
    expect(pesosCell(5)).toBe('0,05')
  })
  it('cero es 0, no vacío', () => {
    expect(pesosCell(0)).toBe('0')
  })
  it('mantiene el signo', () => {
    expect(pesosCell(-150_000)).toBe('-1500')
  })
})

describe('hhmmCell', () => {
  it('recorta los segundos de Postgres', () => {
    expect(hhmmCell('20:00:00')).toBe('20:00')
  })
  it('el 24:00 del día operativo sale como 00:00', () => {
    expect(hhmmCell('24:00:00')).toBe('00:00')
  })
})

describe('isoDateCell', () => {
  it('una columna date (medianoche UTC) no se corre de día', () => {
    expect(isoDateCell(new Date('2026-10-05'))).toBe('2026-10-05')
  })
  it('null es vacío', () => {
    expect(isoDateCell(null)).toBe('')
  })
})

describe('csvLine', () => {
  it('separa con punto y coma', () => {
    expect(csvLine(['a', 1, null])).toBe('a;1;')
  })
  it('entrecomilla un valor con punto y coma, comillas o salto de línea', () => {
    expect(csvLine(['Pérez; Juan'])).toBe('"Pérez; Juan"')
    expect(csvLine(['el "Toto"'])).toBe('"el ""Toto"""')
    expect(csvLine(['a\nb'])).toBe('"a\nb"')
    expect(csvLine(['a\rb'])).toBe('"a\rb"')
  })
  it('la coma no necesita comillas con este separador', () => {
    expect(csvLine(['Pérez, Juan'])).toBe('Pérez, Juan')
  })
  it('neutraliza fórmulas en un nombre cargado por el jugador', () => {
    expect(csvLine(['=HYPERLINK("http://evil.example","x")'])).toBe(
      '"\'=HYPERLINK(""http://evil.example"",""x"")"',
    )
    expect(csvLine(['+cmd|calc', '@SUM(A1)'])).toBe("'+cmd|calc;'@SUM(A1)")
  })
  it('neutraliza también un tab o un CR al principio (OWASP)', () => {
    // El CR además obliga a ir entre comillas, como un salto de línea.
    expect(csvLine(['\t=1+1', '\r=1+1'])).toBe(`'\t=1+1;"'\r=1+1"`)
  })
})

describe('assembleCsvFile', () => {
  it('arranca con BOM y separa líneas con CRLF', () => {
    const file = assembleCsvFile('a;b', ['1;2', '3;4'])
    expect(file.charCodeAt(0)).toBe(0xfeff)
    expect(file.slice(1)).toBe('a;b\r\n1;2\r\n3;4')
  })
  it('un pedazo vacío no deja una línea en blanco', () => {
    expect(assembleCsvFile('a;b', ['1;2', '', '3;4']).slice(1)).toBe('a;b\r\n1;2\r\n3;4')
  })
  it('sin filas queda solo el encabezado', () => {
    expect(assembleCsvFile('a;b', ['']).slice(1)).toBe('a;b')
  })
})

describe('csvBody', () => {
  it('une las filas con CRLF y sin línea final', () => {
    expect(
      csvBody([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('a;1\r\nb;2')
  })
  it('sin filas es vacío', () => {
    expect(csvBody([])).toBe('')
  })
})

describe('bookingKindLabel', () => {
  it.each([
    [{ type: 'fixed', viaWhatsapp: false, byStaff: false }, 'Turno fijo'],
    [{ type: 'block', viaWhatsapp: false, byStaff: true }, 'Bloqueo'],
    [{ type: 'tournament', viaWhatsapp: false, byStaff: true }, 'Torneo'],
    [{ type: 'spontaneous', viaWhatsapp: true, byStaff: false }, 'WhatsApp'],
    [{ type: 'spontaneous', viaWhatsapp: false, byStaff: true }, 'Panel'],
    [{ type: 'spontaneous', viaWhatsapp: false, byStaff: false }, 'Online'],
  ] as const)('%o → %s', (b, label) => {
    expect(bookingKindLabel(b)).toBe(label)
  })
})

describe('bookingExportRow', () => {
  it('arma la fila en el orden del encabezado', () => {
    expect(bookingExportRow(BOOKING)).toEqual([
      // El código del comprobante del jugador, que encuentra el buscador de /reservas.
      '3F2A9C1E',
      '2026-10-05',
      '20:00',
      '21:00',
      'Cancha 1',
      'Online',
      'Jugada',
      'Juan Pérez',
      '1123456789',
      '45000',
      '13500',
      '45000,50',
    ])
  })
  it('tiene tantas columnas como el encabezado', () => {
    expect(columns(csvLine(bookingExportRow(BOOKING)))).toBe(columns(BOOKINGS_EXPORT_HEADER))
  })
  it('sin seña la columna queda vacía, no en 0', () => {
    expect(bookingExportRow({ ...BOOKING, depositAmount: 0 })[10]).toBe('')
  })
  it('un bloqueo sale sin cliente ni plata', () => {
    const row = bookingExportRow({ ...BOOKING, type: 'block', byStaff: true })
    expect(row[5]).toBe('Bloqueo')
    expect(row.slice(7)).toEqual(['', '', '', '', ''])
  })
  // El estado es el badge de `/reservas` (`bookingBadgeVisual`), no una tabla
  // propia: cruza estado, tipo y seña, y así el archivo dice lo mismo que el panel.
  it.each([
    [{ status: 'pending_payment', depositStatus: 'pending' }, 'Esperando seña'],
    [{ status: 'confirmed', depositStatus: 'not_required' }, 'Confirmada'],
    [{ status: 'confirmed', depositStatus: 'paid' }, 'Señada'],
    [{ status: 'confirmed', depositStatus: 'not_required', type: 'fixed' }, 'Abonado'],
    [{ status: 'no_show', depositStatus: 'captured' }, 'Ausente'],
    [{ status: 'canceled_refunded', depositStatus: 'refunded' }, 'Cancelada'],
    [{ status: 'canceled_no_refund', depositStatus: 'captured' }, 'Cancelada'],
    [{ status: 'expired', depositStatus: 'pending' }, 'Expirada'],
  ] as const)('%o → %s', (facts, label) => {
    expect(bookingExportRow({ ...BOOKING, ...facts })[6]).toBe(label)
  })
  it('una jugada sin cobrar sigue diciendo "Jugada": la plata va en Cobrado', () => {
    expect(bookingExportRow({ ...BOOKING, totalPaid: 0 })[6]).toBe('Jugada')
  })
  it('sin nombre ni teléfono quedan vacíos', () => {
    const row = bookingExportRow({ ...BOOKING, clientName: null, phone: null })
    expect(row[7]).toBe('')
    expect(row[8]).toBe('')
  })
})

describe('abonadoExportRow', () => {
  it('arma la fila con día, montos y etiquetas en castellano', () => {
    expect(abonadoExportRow(ABONADO)).toEqual([
      'Diego',
      '1198765432',
      'Lunes',
      '21:00',
      '22:00',
      'Cancha 2',
      '40000',
      'Transferencia',
      'Pausado',
      '2026-03-02',
      '',
    ])
  })
  it('el 0 es domingo, como day_of_week', () => {
    expect(abonadoExportRow({ ...ABONADO, dayOfWeek: 0 })[2]).toBe('Domingo')
    expect(abonadoExportRow({ ...ABONADO, dayOfWeek: 6 })[2]).toBe('Sábado')
  })
  it('tiene tantas columnas como el encabezado', () => {
    expect(columns(csvLine(abonadoExportRow(ABONADO)))).toBe(columns(ABONADOS_EXPORT_HEADER))
  })
  it('con fecha de fin y sin teléfono', () => {
    const row = abonadoExportRow({
      ...ABONADO,
      contactPhone: null,
      endsOn: new Date('2026-12-28'),
      status: 'canceled',
      paymentMethod: 'cash',
    })
    expect(row[1]).toBe('')
    expect(row[7]).toBe('Efectivo')
    expect(row[8]).toBe('Cancelado')
    expect(row[10]).toBe('2026-12-28')
  })
})

describe('clientExportRow', () => {
  it('arma la fila con las etiquetas por su nombre, nunca el enum', () => {
    expect(clientExportRow(CLIENT)).toEqual([
      'Ana Gómez',
      '1122223333',
      'ana@example.com',
      'Sí',
      12,
      1,
      '2026-10-01',
      0,
      'Organiza el grupo · Se le fía',
    ])
  })
  it('una persona sin cuenta sale sin email ni etiquetas', () => {
    const row = clientExportRow({
      ...CLIENT,
      kind: 'contact',
      email: null,
      lastBookingAt: null,
      tags: [],
    })
    expect(row[2]).toBe('')
    expect(row[3]).toBe('No')
    expect(row[6]).toBe('')
    expect(row[8]).toBe('')
  })
  it('tiene tantas columnas como el encabezado', () => {
    expect(columns(csvLine(clientExportRow(CLIENT)))).toBe(columns(CLIENTS_EXPORT_HEADER))
  })
})
