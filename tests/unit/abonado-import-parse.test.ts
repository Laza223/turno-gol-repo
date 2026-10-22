import { describe, expect, it } from 'vitest'
import {
  IMPORT_TEMPLATE,
  MAX_IMPORT_ROWS,
  matchCourt,
  parseDay,
  parseDelimitedText,
  parseHour,
  parsePhone,
  joinSurname,
  parsePriceCents,
  serializeTable,
  validateImportText,
} from '@/modules/abonados/abonado-import.parse'

// Importador de turnos fijos desde una planilla: la parte pura (texto → filas
// validadas). Lo que choca con la base (otro fijo, reservas) está en
// tests/integration/abonado-import.test.ts.

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
  { id: 'c10', name: 'Cancha 10' },
  { id: 'cv', name: 'Fútbol 7 Vagón' },
]
const HEADER = ['Nombre', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Hasta', 'Precio']

const tsv = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n')

function rowsOf(rows: string[][], header = HEADER) {
  const result = validateImportText(tsv([header, ...rows]), COURTS)
  if (!result.ok) throw new Error(`se esperaba una planilla válida: ${result.error}`)
  return result.rows
}

function sheetError(text: string, courts = COURTS): string {
  const result = validateImportText(text, courts)
  if (result.ok) throw new Error('se esperaba un error de planilla')
  return result.error
}

describe('parseDelimitedText', () => {
  it('lee lo que se pega desde Excel o Sheets (tabulaciones)', () => {
    const t = parseDelimitedText(
      tsv([HEADER, ['Juan', '11 2345 6789', 'Cancha 1', 'Lunes', '20', '21', '25000']]),
    )
    expect(t.delimiter).toBe('\t')
    expect(t.header).toEqual(HEADER)
    expect(t.rows).toEqual([
      { line: 2, cells: ['Juan', '11 2345 6789', 'Cancha 1', 'Lunes', '20', '21', '25000'] },
    ])
  })

  it('lee el CSV de Excel en es-AR (;) y el de Sheets (,)', () => {
    // El precio con coma decimal no confunde la detección: se decide en el encabezado.
    const semi = parseDelimitedText('Nombre;Precio\nJuan;25.000,50')
    expect(semi.delimiter).toBe(';')
    expect(semi.rows[0]!.cells).toEqual(['Juan', '25.000,50'])

    const comma = parseDelimitedText('Nombre,Precio\nJuan,"25,000.50"')
    expect(comma.delimiter).toBe(',')
    expect(comma.rows[0]!.cells).toEqual(['Juan', '25,000.50'])
  })

  it.each([
    ['una línea vacía', '\n'],
    ['una línea con espacios', '  \n'],
  ])('detecta el separador aunque arriba del encabezado haya %s', (_, lead) => {
    const tab = parseDelimitedText(`${lead}A\tB\n1\t2`)
    expect(tab.delimiter).toBe('\t')
    expect(tab.header).toEqual(['A', 'B'])
    // La numeración sigue siendo la de la planilla: la línea en blanco cuenta.
    expect(tab.rows).toEqual([{ line: 3, cells: ['1', '2'] }])

    const semi = parseDelimitedText(`${lead}A;B\n1;2`)
    expect(semi.delimiter).toBe(';')
    expect(semi.header).toEqual(['A', 'B'])
    expect(semi.rows).toEqual([{ line: 3, cells: ['1', '2'] }])
  })

  it('marca la fila donde se abre una comilla que nunca se cierra', () => {
    expect(parseDelimitedText('A\tB\n1\t"2\n3\t4').unclosedQuoteLine).toBe(2)
    expect(parseDelimitedText('A\tB\n1\t"2"').unclosedQuoteLine).toBeNull()
  })

  it('respeta las comillas: separador, salto de línea y comilla adentro de una celda', () => {
    const t = parseDelimitedText('Nombre;Equipo\n"Pérez; Juan";"Los ""Pibes""\nde Boedo"\nAna;Rayo')
    expect(t.rows).toEqual([
      { line: 2, cells: ['Pérez; Juan', 'Los "Pibes"\nde Boedo'] },
      { line: 3, cells: ['Ana', 'Rayo'] },
    ])
  })

  it('acepta CRLF y CR como fin de fila', () => {
    expect(parseDelimitedText('A\tB\r\n1\t2\r\n3\t4').rows.map((r) => r.cells)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
    expect(parseDelimitedText('A\tB\r1\t2').rows.map((r) => r.cells)).toEqual([['1', '2']])
  })

  it('saca el BOM del principio (CSV de Excel guardado como UTF-8)', () => {
    const bom = String.fromCharCode(0xfeff)
    expect(parseDelimitedText(`${bom}Nombre;Precio\nJuan;1`).header).toEqual(['Nombre', 'Precio'])
  })

  it('saltea las filas vacías sin correr la numeración de la planilla', () => {
    const t = parseDelimitedText('A\tB\n1\t2\n\t\n\n5\t6\n')
    expect(t.rows).toEqual([
      { line: 2, cells: ['1', '2'] },
      { line: 5, cells: ['5', '6'] },
    ])
  })

  it('recorta los espacios de cada celda', () => {
    expect(parseDelimitedText('A;B\n  Juan  ; 20 ').rows[0]!.cells).toEqual(['Juan', '20'])
  })

  it('un texto vacío no tiene encabezado', () => {
    expect(parseDelimitedText('   \n  ').header).toEqual([])
  })
})

describe('serializeTable', () => {
  it('vuelve a TSV lo que se parseó, comillas incluidas', () => {
    const rows = [
      ['Juan', 'Los "Pibes"'],
      ['Ana\tLía', 'Rayo'],
    ]
    const text = serializeTable(['Nombre', 'Equipo'], rows)
    const back = parseDelimitedText(text)
    expect(back.header).toEqual(['Nombre', 'Equipo'])
    expect(back.rows.map((r) => r.cells)).toEqual(rows)
  })

  it('con ; entrecomilla la celda que trae ; (la plantilla para Excel)', () => {
    expect(serializeTable(['A', 'B'], [['x;y', 'z']], ';')).toBe('A;B\n"x;y";z')
  })
})

describe('parseDay', () => {
  it.each([
    ['Lunes', 1],
    ['lun', 1],
    ['MIÉRCOLES', 3],
    ['miercoles', 3],
    ['Mié', 3],
    ['jueves', 4],
    ['Sábados', 6],
    ['domingos', 0],
    ['Dom', 0],
  ])('«%s» es el día %i', (raw, day) => {
    expect(parseDay(raw)).toEqual({ ok: true, value: day })
  })

  it('rechaza lo que no es un día', () => {
    expect(parseDay('Feriado')).toMatchObject({ ok: false })
    expect(parseDay('Lunes y martes')).toMatchObject({ ok: false })
  })

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    '«%s» no es un día (no se busca en el prototipo de un objeto)',
    (raw) => {
      expect(parseDay(raw)).toMatchObject({ ok: false })
    },
  )
})

describe('parseHour', () => {
  it.each([
    ['20', 1200],
    ['20hs', 1200],
    ['20 hs', 1200],
    ['20h', 1200],
    ['20:00', 1200],
    ['20.00', 1200],
    ['20:00:00', 1200],
    ['8 p. m.', 1200],
    ['8pm', 1200],
    ['12 a.m.', 0],
    ['0', 0],
    ['07:00', 420],
  ])('como inicio, «%s» son %i minutos', (raw, mins) => {
    expect(parseHour(raw, 'start')).toEqual({ ok: true, value: mins })
  })

  it.each([
    ['0', 1440],
    ['00:00', 1440],
    ['24', 1440],
    ['24:00', 1440],
    ['23', 1380],
  ])('como fin, «%s» son %i minutos (la medianoche es el final del día)', (raw, mins) => {
    expect(parseHour(raw, 'end')).toEqual({ ok: true, value: mins })
  })

  it('solo horas enteras, como los turnos', () => {
    const r = parseHour('20:30', 'start')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('horas enteras')
  })

  it('rechaza horas imposibles o ilegibles', () => {
    expect(parseHour('24', 'start')).toMatchObject({ ok: false })
    expect(parseHour('25', 'end')).toMatchObject({ ok: false })
    expect(parseHour('20:75', 'start')).toMatchObject({ ok: false })
    expect(parseHour('13pm', 'start')).toMatchObject({ ok: false })
    expect(parseHour('veinte', 'start')).toMatchObject({ ok: false })
  })
})

describe('parsePriceCents', () => {
  it.each([
    ['25000', 2_500_000],
    ['25.000', 2_500_000],
    ['$ 25.000', 2_500_000],
    ['$25.000,50', 2_500_050],
    ['25.000,5', 2_500_050],
    ['1.250.000', 125_000_000],
    ['25,000.50', 2_500_050],
    ['25000.5', 2_500_050],
    ['25000,50', 2_500_050],
    ['ARS 18.000', 1_800_000],
  ])('«%s» son %i centavos', (raw, cents) => {
    expect(parsePriceCents(raw)).toEqual({ ok: true, value: cents })
  })

  it('el precio tiene que ser mayor a cero', () => {
    expect(parsePriceCents('0')).toMatchObject({ ok: false })
    expect(parsePriceCents('$ 0,00')).toMatchObject({ ok: false })
  })

  it('rechaza lo que no es un monto, los negativos y lo que no entra en la columna', () => {
    expect(parsePriceCents('gratis')).toMatchObject({ ok: false })
    expect(parsePriceCents('-500')).toMatchObject({ ok: false })
    expect(parsePriceCents('25.00.0')).toMatchObject({ ok: false })
    expect(parsePriceCents('25000,505')).toMatchObject({ ok: false })
    // 99.999.999 pesos = 9.999.999.900 centavos: más que un integer de Postgres.
    expect(parsePriceCents('99999999')).toMatchObject({ ok: false })
  })
})

describe('parsePhone', () => {
  it('guarda el número como el alta manual: +54 y el número nacional', () => {
    expect(parsePhone('11 2345-6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
  })

  it('saca el 54 y el 9 de móvil como el alta manual, con + o sin él', () => {
    expect(parsePhone('+54 9 11 2345-6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
    expect(parsePhone('549 11 2345-6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
    expect(parsePhone('54 11 2345-6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
    expect(parsePhone('5491123456789')).toEqual({ ok: true, value: '+54 1123456789' })
  })

  it('deja como está el que trae otro código de país', () => {
    expect(parsePhone('+598 99 123 456')).toEqual({ ok: true, value: '+598 99 123 456' })
    // Uno que el selector de país del alta manual no tiene.
    expect(parsePhone('+81 90 1234 5678')).toEqual({ ok: true, value: '+81 90 1234 5678' })
  })

  it('el espacio duro (NBSP) de Sheets cuenta como espacio', () => {
    const nbsp = String.fromCharCode(0xa0)
    expect(parsePhone(`11${nbsp}2345-6789`)).toEqual({ ok: true, value: '+54 11 2345 6789' })
  })

  it('pide al menos 8 números y no más de 15 con el código de país (E.164)', () => {
    expect(parsePhone('4234-5678')).toEqual({ ok: true, value: '+54 4234 5678' })
    expect(parsePhone('1234-567')).toMatchObject({ ok: false })
    expect(parsePhone('011 15 2345-6789')).toEqual({ ok: true, value: '+54 011 15 2345 6789' })
    expect(parsePhone('011 15 2345-67890')).toMatchObject({ ok: false })
    expect(parsePhone(`11 ${'1'.repeat(36)}`)).toMatchObject({ ok: false })
  })

  it('puntos, paréntesis y guiones son formato: pasan a espacios', () => {
    expect(parsePhone('(011) 4444-5555')).toEqual({ ok: true, value: '+54 011 4444 5555' })
    expect(parsePhone('11.2345.6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
    expect(parsePhone('+54 (11) 2345-6789')).toEqual({ ok: true, value: '+54 11 2345 6789' })
    // El guion pegado al código de país no queda colgando («+54 -11-…»).
    expect(parsePhone('+54-11-5555-5555')).toEqual({ ok: true, value: '+54 11 5555 5555' })
    expect(parsePhone('549-11-5555-5555')).toEqual({ ok: true, value: '+54 11 5555 5555' })
    expect(parsePhone('11 - 5555 - 5555')).toEqual({ ok: true, value: '+54 11 5555 5555' })
    // Un fijo con punto no es el decimal de Excel.
    expect(parsePhone('4555.0000')).toEqual({ ok: true, value: '+54 4555 0000' })
  })

  // Lo que no es el número es texto libre sobre la persona (Ley 25.326): la
  // celda se rechaza entera, no se limpia.
  it.each([
    '11 5555-5555 (mamá)',
    'tel: 1155555555',
    'Cel 1155555555',
    '1155555555 llamar después de las 20',
    '11 5555-5555 / 11 4444-4444',
    '1155555555, 1144444444',
    '1155555555\n1144444444',
  ])('rechaza «%s»: va solo el número', (raw) => {
    expect(parsePhone(raw)).toEqual({
      ok: false,
      error: 'El teléfono va solo con números, uno por fila y sin notas (ej: 11 2345-6789)',
    })
  })

  it('dos números pegados con un espacio no entran: son demasiados dígitos', () => {
    expect(parsePhone('1155555555 1144444444')).toEqual({
      ok: false,
      error: 'El teléfono tiene demasiados números: va uno solo por fila',
    })
  })

  it.each(['5,49112E+12', '1.12346E+09', '1,12346e9', '1155555555.0', '5491155555555,00'])(
    'avisa cuando Excel convirtió el número en notación científica o en decimal («%s»)',
    (raw) => {
      const result = parsePhone(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('Excel convirtió el teléfono')
    },
  )
})

describe('matchCourt', () => {
  it('encuentra la cancha por su nombre, sin mayúsculas ni tildes', () => {
    expect(matchCourt('cancha 1', COURTS)).toEqual({ ok: true, value: COURTS[0] })
    expect(matchCourt('CANCHA 10', COURTS)).toEqual({ ok: true, value: COURTS[2] })
    expect(matchCourt('futbol 7 vagon', COURTS)).toEqual({ ok: true, value: COURTS[3] })
  })

  it('con solo un número, la cancha cuyo nombre termina en ese número', () => {
    expect(matchCourt('1', COURTS)).toEqual({ ok: true, value: COURTS[0] })
    expect(matchCourt('10', COURTS)).toEqual({ ok: true, value: COURTS[2] })
    // "7" está en el medio de "Fútbol 7 Vagón", no al final.
    expect(matchCourt('7', COURTS)).toMatchObject({ ok: false })
  })

  it('si no existe, el error lista las canchas del complejo', () => {
    const r = matchCourt('Cancha 3', COURTS)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('«Cancha 3»')
      expect(r.error).toContain('Cancha 1, Cancha 2, Cancha 10, Fútbol 7 Vagón')
    }
  })

  it('un número que dos canchas comparten no elige ninguna', () => {
    const courts = [
      { id: 'a', name: 'Techada 1' },
      { id: 'b', name: 'Descubierta 1' },
    ]
    expect(matchCourt('1', courts)).toMatchObject({ ok: false })
  })
})

describe('validateImportText', () => {
  it('entiende la plantilla tal como se descarga', () => {
    const [header, ...example] = IMPORT_TEMPLATE
    const result = validateImportText(serializeTable(header, example), [
      { id: 'c1', name: 'Cancha 1' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      line: 2,
      errors: [],
      value: {
        contactName: 'Juan Pérez',
        contactPhone: '+54 11 2345 6789',
        courtId: 'c1',
        courtName: 'Cancha 1',
        dayOfWeek: 1,
        timeStart: '20:00',
        timeEnd: '21:00',
        pricePerSession: 2_500_000,
      },
    })
  })

  it('reconoce sinónimos de las columnas en cualquier orden; sin Hasta, el turno dura una hora', () => {
    const [row] = rowsOf(
      [['jueves', '19 hs', 'Los Pibes', '1123456789', '2', '$ 30.000']],
      ['Día de la semana', 'Hora', 'Equipo', 'Celular', 'Cancha', 'Valor'],
    )
    expect(row!.errors).toEqual([])
    expect(row!.value).toMatchObject({
      contactName: 'Los Pibes',
      courtId: 'c2',
      dayOfWeek: 4,
      timeStart: '19:00',
      timeEnd: '20:00',
      pricePerSession: 3_000_000,
    })
  })

  it('entiende un rango entero en la columna Desde si no hay Hasta', () => {
    const header = ['Nombre', 'Teléfono', 'Cancha', 'Día', 'Horario', 'Precio']
    const rows = rowsOf(
      [
        ['A', '1123456789', '1', 'lunes', 'de 20 a 22', '1000'],
        ['B', '1123456789', '1', 'martes', '20-21', '1000'],
        ['C', '1123456789', '1', 'miércoles', '20:00 hasta 21:00', '1000'],
      ],
      header,
    )
    expect(rows.map((r) => [r.value?.timeStart, r.value?.timeEnd])).toEqual([
      ['20:00', '22:00'],
      ['20:00', '21:00'],
      ['20:00', '21:00'],
    ])
  })

  it('pide am/pm en las dos horas: no adivina la mitad que no lo trae', () => {
    const error = 'Indicá am/pm en las dos horas (ej: 8 pm a 9 pm)'
    const header = ['Nombre', 'Teléfono', 'Cancha', 'Día', 'Horario', 'Precio']
    const [sinPm, sinPmGuion, conPm, sinAm] = rowsOf(
      [
        ['A', '1123456789', '1', 'lunes', '8 a 9 pm', '1000'],
        ['B', '1123456789', '1', 'martes', '8-9 pm', '1000'],
        ['C', '1123456789', '1', 'miércoles', '8 pm a 9 pm', '1000'],
        ['D', '1123456789', '1', 'jueves', '9 am - 10', '1000'],
      ],
      header,
    )
    // Sin esto, «8 a 9 pm» era un fijo de 08:00 a 21:00.
    for (const row of [sinPm, sinPmGuion, sinAm]) {
      expect(row!.value).toBeNull()
      expect(row!.errors).toEqual([error])
    }
    expect(conPm!.value).toMatchObject({ timeStart: '20:00', timeEnd: '21:00' })

    // Lo mismo con Desde y Hasta en columnas separadas.
    const [separadas] = rowsOf([['E', '1123456789', '1', 'lunes', '8', '9 pm', '1000']])
    expect(separadas!.errors).toEqual([error])
  })

  it('una línea en blanco arriba del encabezado no rompe el CSV con ;', () => {
    const result = validateImportText(
      `\n${HEADER.join(';')}\nAna;1123456789;1;lunes;20;21;25000`,
      COURTS,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.rows).toMatchObject([{ line: 3, errors: [] }])
  })

  it('el turno que termina a la medianoche se guarda hasta las 24:00', () => {
    const [row] = rowsOf([['Ana', '1123456789', '1', 'viernes', '23', '00:00', '20000']])
    expect(row!.value).toMatchObject({ timeStart: '23:00', timeEnd: '24:00' })
  })

  it('un turno no puede pasar la medianoche ni terminar cuando empieza', () => {
    const [cruza, igual] = rowsOf([
      ['Ana', '1123456789', '1', 'viernes', '23', '01', '20000'],
      ['Leo', '1123456789', '1', 'sábado', '20', '20', '20000'],
    ])
    expect(cruza!.value).toBeNull()
    expect(cruza!.errors).toEqual([
      'Un turno fijo no puede pasar la medianoche: cargalo en dos filas, una hasta las 00:00 y otra desde las 00:00 del día siguiente',
    ])
    expect(igual!.value).toBeNull()
    expect(igual!.errors).toEqual(['La hora de fin tiene que ser posterior a la de inicio'])
  })

  it('si el complejo cierra pasada la medianoche, la madrugada va en el mismo día (día operativo)', () => {
    const result = validateImportText(
      tsv([HEADER, ['Ana', '1123456789', '1', 'viernes', '23', '01', '20000']]),
      COURTS,
      { closesNextDay: true },
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.rows[0]!.errors).toEqual([
      'Un turno fijo no puede pasar la medianoche: cargalo en dos filas del mismo día, una hasta las 00:00 y otra desde las 00:00 (la madrugada cuenta como la noche de ese día)',
    ])
  })

  it('ignora las columnas que no son de la plantilla (notas sobre personas no se guardan)', () => {
    const [row] = rowsOf(
      [['Juan', '1123456789', '1', 'lunes', '20', '21', '25000', 'debe 2 meses, conflictivo']],
      [...HEADER, 'Observaciones'],
    )
    expect(row!.errors).toEqual([])
    expect(Object.keys(row!.raw).sort()).toEqual(
      ['court', 'day', 'end', 'name', 'phone', 'price', 'start'].sort(),
    )
    expect(JSON.stringify(row!.value)).not.toContain('conflictivo')
  })

  it('suma la columna Apellido al nombre, sin duplicarlo si el nombre ya lo trae', () => {
    const header = ['Nombre', 'Apellidos', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Precio']
    const rows = rowsOf(
      [
        ['Juan', 'Pérez', '1123456789', '1', 'lunes', '20', '1000'],
        ['Juan Pérez', 'Pérez', '1123456789', '1', 'martes', '20', '1000'],
        ['ana maria lopez', 'López', '1123456789', '1', 'miércoles', '20', '1000'],
        ['Leo', '', '1123456789', '1', 'jueves', '20', '1000'],
        // «Pérez» no está como palabra entera en «Perezoso»: se suma.
        ['Perezoso', 'Pérez', '1123456789', '1', 'viernes', '20', '1000'],
      ],
      header,
    )
    expect(rows.map((r) => r.value?.contactName)).toEqual([
      'Juan Pérez',
      'Juan Pérez',
      'ana maria lopez',
      'Leo',
      'Perezoso Pérez',
    ])
  })

  it('el tope de 120 letras cuenta el nombre con el apellido', () => {
    const header = ['Nombre', 'Apellido', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Precio']
    const [justo, largo] = rowsOf(
      [
        ['A'.repeat(60), 'B'.repeat(59), '1123456789', '1', 'lunes', '20', '1000'],
        ['A'.repeat(60), 'B'.repeat(60), '1123456789', '1', 'martes', '20', '1000'],
      ],
      header,
    )
    expect(justo!.errors).toEqual([])
    expect(largo!.errors).toEqual(['El nombre es demasiado largo (máximo 120 letras)'])
  })

  it('un apellido sin nombre no alcanza: el nombre sigue siendo obligatorio', () => {
    const header = ['Nombre', 'Apellido', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Precio']
    const [row] = rowsOf([['', 'Pérez', '1123456789', '1', 'lunes', '20', '1000']], header)
    expect(row!.value).toBeNull()
    expect(row!.errors).toEqual(['Falta completar Nombre'])
  })

  it('joinSurname compara palabras enteras, sin mayúsculas ni tildes', () => {
    expect(joinSurname('Juan', undefined)).toBe('Juan')
    expect(joinSurname('Juan', 'Pérez')).toBe('Juan Pérez')
    expect(joinSurname('JUAN PEREZ', 'Pérez')).toBe('JUAN PEREZ')
    expect(joinSurname('Juan de la Cruz', 'de la Cruz')).toBe('Juan de la Cruz')
    expect(joinSurname('Juan Cruz', 'de la Cruz')).toBe('Juan Cruz de la Cruz')
  })

  it('devuelve las columnas ignoradas, también la que repite un campo ya tomado', () => {
    const header = [
      'Nombre',
      'Apellido',
      'Teléfono',
      'Celular',
      'Cancha',
      'Día',
      'Desde',
      'Precio',
      'Observaciones',
      '',
    ]
    const result = validateImportText(
      tsv([
        header,
        ['Juan', 'Pérez', '1123456789', '1144445555', '1', 'lunes', '20', '25000', 'x', ''],
      ]),
      COURTS,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.ignoredColumns).toEqual(['Celular', 'Observaciones'])
    expect(result.rows[0]!.value).toMatchObject({
      contactName: 'Juan Pérez',
      contactPhone: '+54 1123456789',
    })
  })

  it('la plantilla no tiene columnas ignoradas', () => {
    const result = validateImportText(
      tsv([HEADER, ['A', '1123456789', '1', 'lunes', '20', '21', '1000']]),
      COURTS,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.ignoredColumns).toEqual([])
  })

  it('rechaza el nombre con saltos de línea (una nota pegada abajo)', () => {
    const text = tsv([
      HEADER,
      ['"Juan Pérez\nno le fiar"', '1123456789', '1', 'lunes', '20', '21', '25000'],
      ['Leo', '1123456789', '1', 'miércoles', '20', '21', '25000'],
    ])
    const result = validateImportText(text, COURTS)
    if (!result.ok) throw new Error(result.error)
    const [nota, leo] = result.rows
    expect(nota!.value).toBeNull()
    expect(nota!.errors).toContain('El nombre ocupa más de una línea: va en una sola')
    expect(leo!.value).toMatchObject({ contactName: 'Leo' })
  })

  it('una comilla sin cerrar frena la planilla, aunque esté en una columna que se ignora', () => {
    // Sin esto, «"paga el 10» se tragaba la fila de Leo sin avisar.
    const text = tsv([
      [...HEADER, 'Observaciones'],
      ['Ana', '1123456789', '1', 'lunes', '20', '21', '25000', '"paga el 10'],
      ['Leo', '1123456789', '1', 'martes', '20', '21', '25000', ''],
    ])
    expect(validateImportText(text, COURTS)).toEqual({
      ok: false,
      error:
        'La fila 2 abre unas comillas (") que nunca se cierran, y se tragan las filas de abajo. Borrá esa comilla y revisá de nuevo.',
    })
  })

  it('«Contacto» no es el nombre: en muchas planillas es el teléfono', () => {
    const result = validateImportText(
      tsv([
        ['Contacto', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Precio'],
        ['1123456789', '1123456789', '1', 'lunes', '20', '1000'],
      ]),
      COURTS,
    )
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('Falta la columna «Nombre»'),
    })
  })

  it('la fila con una nota en el teléfono no se carga', () => {
    const [row] = rowsOf([['Juan', '11 5555-5555 (mamá)', '1', 'lunes', '20', '21', '25000']])
    expect(row!.value).toBeNull()
    expect(row!.errors).toEqual([
      'El teléfono va solo con números, uno por fila y sin notas (ej: 11 2345-6789)',
    ])
  })

  it('dice qué falta completar en la fila', () => {
    const [row] = rowsOf([['Juan', '', '1', 'lunes', '20', '21', '']])
    expect(row!.value).toBeNull()
    expect(row!.errors).toEqual(['Falta completar Teléfono y Precio'])
  })

  it('junta todos los errores de una fila', () => {
    const [row] = rowsOf([['Juan', '1123456789', 'Cancha 9', 'feriado', '20:30', '', 'mucho']])
    expect(row!.value).toBeNull()
    expect(row!.errors).toHaveLength(4)
    expect(row!.errors.join(' | ')).toMatch(
      /cancha «Cancha 9».*día «feriado».*horas enteras.*precio «mucho»/,
    )
  })

  it('el nombre tiene un tope de 120 letras, como el alta manual', () => {
    const [row] = rowsOf([['x'.repeat(121), '1123456789', '1', 'lunes', '20', '21', '1000']])
    expect(row!.errors).toEqual(['El nombre es demasiado largo (máximo 120 letras)'])
  })

  it('marca las filas de la planilla que se pisan entre sí', () => {
    const rows = rowsOf([
      ['A', '1123456789', '1', 'lunes', '20', '22', '1000'],
      ['B', '1123456789', 'cancha 1', 'Lunes', '21', '22', '1000'], // se pisa con A
      ['C', '1123456789', '1', 'lunes', '22', '23', '1000'], // pegada, no se pisa
      ['D', '1123456789', '2', 'lunes', '20', '21', '1000'], // otra cancha
      ['E', '1123456789', '1', 'martes', '20', '21', '1000'], // otro día
    ])
    expect(rows.map((r) => r.errors)).toEqual([
      [],
      ['Se pisa con la fila 2: misma cancha, mismo día y horario'],
      [],
      [],
      [],
    ])
    expect(rows[1]!.value).toBeNull()
  })

  it('una fila con error no le bloquea el horario a la siguiente', () => {
    const rows = rowsOf([
      ['A', '', '1', 'lunes', '20', '21', '1000'],
      ['B', '1123456789', '1', 'lunes', '20', '21', '1000'],
    ])
    expect(rows[1]!.errors).toEqual([])
  })

  describe('errores de la planilla entera', () => {
    it('vacía', () => {
      expect(sheetError('')).toContain('Pegá la planilla')
    })

    it('sin canchas en el complejo', () => {
      expect(sheetError(tsv([HEADER]), [])).toBe('Todavía no hay canchas cargadas en el complejo.')
    })

    it('le faltan columnas (Hasta es opcional)', () => {
      expect(sheetError(tsv([['Nombre', 'Teléfono', 'Cancha', 'Día', 'Desde']]))).toMatch(
        /^Falta la columna «Precio»\./,
      )
      expect(sheetError(tsv([['Nombre', 'Cancha', 'Día', 'Desde']]))).toMatch(
        /^Faltan las columnas «Teléfono» y «Precio»\./,
      )
      // Una fila de datos en lugar del encabezado: no se adivina el orden.
      expect(sheetError(tsv([['Juan', '1123456789', '1', 'lunes', '20', '21', '1000']]))).toMatch(
        /^Faltan las columnas/,
      )
    })

    it('solo el encabezado', () => {
      expect(sheetError(tsv([HEADER]))).toContain('ninguna fila')
    })

    it(`más de ${MAX_IMPORT_ROWS} filas`, () => {
      const row = ['A', '1123456789', '1', 'lunes', '20', '21', '1000']
      const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row)
      expect(sheetError(tsv([HEADER, ...rows]))).toContain(`el máximo es ${MAX_IMPORT_ROWS}`)
      expect(validateImportText(tsv([HEADER, ...rows.slice(1)]), COURTS).ok).toBe(true)
    })
  })
})
