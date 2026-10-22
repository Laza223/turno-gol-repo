import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, withTenantContext, type DbTx } from '@/shared/db/client'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { adminSql } from '../helpers/admin-db'
import {
  asApp,
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertBooking } from '../helpers/factories'
import { createAbonado } from '@/modules/abonados/abonado.service'
import { generateSlotDates } from '@/modules/abonados/slot-generator'
import { importAbonados, previewAbonadoImport } from '@/modules/abonados/abonado-import.service'
import { listTenantClients } from '@/app/(admin)/jugadores/queries'
import type { ImportOutcome } from '@/modules/abonados/abonado-import.types'

// Importar turnos fijos desde una planilla: el alta en lote contra la base.
// La parte pura (parser, validación de celdas) está en
// tests/unit/abonado-import-parse.test.ts.

const HEADER = ['Nombre', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Hasta', 'Precio']
const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const tsv = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n')

// "Empiezan el" a una semana: siempre a futuro, sin fecha fija que se venza.
const STARTS_FROM = addDays(artTodayStr(), 7)

/** El primer `dayOfWeek` desde STARTS_FROM y las 8 fechas que genera el alta. */
function weeksOf(dayOfWeek: number): string[] {
  return generateSlotDates({
    dayOfWeek,
    startsOn: STARTS_FROM,
    endsOn: null,
    fromDate: STARTS_FROM,
    count: 8,
    closedDates: [],
  })
}

type Fixture = { tenantId: string; staffId: string; court1: string; court2: string }

async function setup(): Promise<Fixture> {
  const sql = adminSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const pricing = sql.json({
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '08:00',
        to: '23:00',
        price: 800000,
      },
    ],
  })
  const courts = await sql<{ id: string; name: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES
      (${tenant.id}, 'Cancha 1', 10, ${pricing}, 'online'),
      (${tenant.id}, 'Cancha 2', 10, ${pricing}, 'online')
    RETURNING id, name
  `
  const byName = (name: string) => courts.find((c) => c.name === name)!.id
  return {
    tenantId: tenant.id,
    staffId: staff.id,
    court1: byName('Cancha 1'),
    court2: byName('Cancha 2'),
  }
}

/** Como la action: una transacción con el contexto del tenant por cada llamada. */
function runImport(f: Fixture, text: string, startsFrom = STARTS_FROM) {
  return importAbonados(f.tenantId, f.staffId, text, startsFrom, (fn) =>
    withTenantContext(f.tenantId, fn),
  )
}

/** Lo que ve la app (rol `turnogol_app`, RLS) de los fijos del complejo. */
function abonadosAsApp(tenantId: string) {
  return asApp(
    tenantId,
    (tx) => tx<
      {
        id: string
        contact_name: string
        contact_phone: string
        player_id: string | null
        court_id: string
        day_of_week: number
        time_start: string
        time_end: string
        price_per_session: number
        starts_on: string
        status: string
        bookings: number
      }[]
    >`
    SELECT a.id, a.contact_name, a.contact_phone, a.player_id, a.court_id, a.day_of_week,
      a.time_start::text, a.time_end::text, a.price_per_session, a.starts_on::text,
      a.status::text,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.abonado_id = a.id) AS bookings
    FROM abonados a
    ORDER BY a.contact_name
  `,
  )
}

beforeAll(async () => {
  const sql = adminSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('importar turnos fijos desde una planilla', () => {
  it('la fila que queda afuera se nombra con el apellido', async () => {
    const f = await setup()
    const text = tsv([
      ['Nombre', 'Apellido', 'Teléfono', 'Cancha', 'Día', 'Desde', 'Hasta', 'Precio'],
      ['Juan', 'Pérez', '', 'Cancha 1', 'Martes', '20', '21', '1000'],
    ])

    const outcome = await runImport(f, text)

    expect(outcome.ok && outcome.skipped).toEqual([
      { line: 2, contactName: 'Juan Pérez', reason: 'Falta completar Teléfono' },
    ])
  })

  it('carga las filas buenas con sus turnos, por el mismo camino que el alta manual', async () => {
    const f = await setup()
    const text = tsv([
      HEADER,
      ['Grupo Lunes', '11 2345-6789', 'Cancha 1', 'Lunes', '20', '21', '25.000'],
      ['Los Pibes', '1198765432', 'cancha 2', 'miércoles', '19:00', '', '$ 30.000'],
      ['Sin Teléfono', '', 'Cancha 1', 'Martes', '20', '21', '1000'],
    ])

    const outcome = await runImport(f, text)

    expect(outcome).toEqual({
      ok: true,
      created: [
        { line: 2, contactName: 'Grupo Lunes', slotsGenerated: 8 },
        { line: 3, contactName: 'Los Pibes', slotsGenerated: 8 },
      ],
      skipped: [{ line: 4, contactName: 'Sin Teléfono', reason: 'Falta completar Teléfono' }],
      // La fila que quedó afuera vuelve a la caja con su encabezado.
      pendingText: tsv([HEADER, ['Sin Teléfono', '', 'Cancha 1', 'Martes', '20', '21', '1000']]),
    })

    const rows = await abonadosAsApp(f.tenantId)
    expect(rows).toEqual([
      {
        id: expect.any(String),
        contact_name: 'Grupo Lunes',
        contact_phone: '+54 11 2345 6789',
        player_id: null,
        court_id: f.court1,
        day_of_week: 1,
        time_start: '20:00:00',
        time_end: '21:00:00',
        price_per_session: 2_500_000,
        starts_on: weeksOf(1)[0],
        status: 'active',
        bookings: 8,
      },
      {
        id: expect.any(String),
        contact_name: 'Los Pibes',
        contact_phone: '+54 1198765432',
        player_id: null,
        court_id: f.court2,
        day_of_week: 3,
        time_start: '19:00:00',
        time_end: '20:00:00',
        price_per_session: 3_000_000,
        starts_on: weeksOf(3)[0],
        status: 'active',
        bookings: 8,
      },
    ])

    // Los turnos son los del alta manual: las 8 semanas, con el precio del fijo.
    const lunes = await asApp(
      f.tenantId,
      (tx) => tx<{ date: string; price_snapshot: number }[]>`
      SELECT b.date::text, b.price_snapshot FROM bookings b
      JOIN abonados a ON a.id = b.abonado_id
      WHERE a.contact_name = 'Grupo Lunes'
      ORDER BY b.date
    `,
    )
    expect(lunes.map((b) => b.date)).toEqual(weeksOf(1))
    expect(new Set(lunes.map((b) => b.price_snapshot))).toEqual(new Set([2_500_000]))

    // Los contactos sin cuenta aparecen solos en Personas (/jugadores).
    const clients = await withTenantContext(f.tenantId, (tx) =>
      listTenantClients(f.tenantId, {}, tx),
    )
    expect(clients.rows.map((c) => [c.kind, c.name]).sort()).toEqual([
      ['contact', 'Grupo Lunes'],
      ['contact', 'Los Pibes'],
    ])
  })

  it('la vista previa avisa lo que choca con la base y no escribe nada', async () => {
    const f = await setup()
    const sql = adminSql()
    // Fijos cargados a mano: en las dos canchas, los lunes de 20 a 21.
    for (const courtId of [f.court1, f.court2]) {
      await withTenantContext(f.tenantId, (tx) =>
        createAbonado(
          f.tenantId,
          f.staffId,
          {
            courtId,
            contactName: 'Ya Cargado',
            contactPhone: '+54 1100000000',
            dayOfWeek: 1,
            timeStart: '20:00',
            timeEnd: '21:00',
            pricePerSession: 1_000_000,
            startsOn: weeksOf(1)[0]!,
            paymentMethod: 'cash',
          },
          tx,
        ),
      )
    }
    // Una reserva suelta un martes, y TODOS los jueves de 18 a 19 tomados.
    const martes = weeksOf(2)
    await insertBooking(sql, {
      tenantId: f.tenantId,
      courtId: f.court1,
      date: martes[1]!,
      timeStart: '20:00',
      timeEnd: '21:00',
    })
    for (const date of weeksOf(4)) {
      await insertBooking(sql, {
        tenantId: f.tenantId,
        courtId: f.court2,
        date,
        timeStart: '18:00',
        timeEnd: '19:00',
      })
    }

    const text = tsv([
      HEADER,
      ['Mismo Horario', '1111111111', 'Cancha 1', 'Lunes', '20', '21', '1000'],
      ['Se Pisa Una Hora', '1111111111', 'Cancha 2', 'Lunes', '19', '21', '1000'],
      ['Martes', '1122222222', 'Cancha 1', 'Martes', '20', '21', '1000'],
      ['Jueves', '1133333333', 'Cancha 2', 'Jueves', '18', '19', '1000'],
    ])
    const preview = await withTenantContext(f.tenantId, (tx) =>
      previewAbonadoImport(f.tenantId, text, STARTS_FROM, tx),
    )

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(
      preview.rows.map((r) => ({
        line: r.line,
        errors: r.errors,
        slotCount: r.slotCount,
        skippedDates: r.skippedDates,
      })),
    ).toEqual([
      {
        line: 2,
        errors: ['Ya hay un turno fijo activo en ese horario'],
        slotCount: 0,
        skippedDates: [],
      },
      // No es el mismo horario exacto, pero todos sus lunes chocan con el fijo.
      {
        line: 3,
        errors: ['Todas las fechas de este horario ya están reservadas'],
        slotCount: 0,
        skippedDates: [],
      },
      { line: 4, errors: [], slotCount: 7, skippedDates: [martes[1]] },
      {
        line: 5,
        errors: ['Todas las fechas de este horario ya están reservadas'],
        slotCount: 0,
        skippedDates: [],
      },
    ])
    // El valor entendido viaja aunque la fila no se pueda cargar, para mostrarla.
    expect(preview.rows[0]!.value).toMatchObject({ courtName: 'Cancha 1', dayOfWeek: 1 })

    // Revisar no escribe: siguen estando solo los dos fijos de antes.
    expect(await abonadosAsApp(f.tenantId)).toHaveLength(2)

    // Al confirmar se carga solo el martes, salteando la fecha ocupada.
    const outcome = await runImport(f, text)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.created).toEqual([{ line: 4, contactName: 'Martes', slotsGenerated: 7 }])
    expect(outcome.skipped.map((s) => s.line)).toEqual([2, 3, 5])
    const martesRow = (await abonadosAsApp(f.tenantId)).find((r) => r.contact_name === 'Martes')
    expect(martesRow).toMatchObject({ bookings: 7, starts_on: martes[0] })
  })

  it('importar dos veces la misma planilla no duplica: la segunda vez todo queda afuera', async () => {
    const f = await setup()
    const text = tsv([
      HEADER,
      ['Ana', '1144444444', 'Cancha 1', 'Viernes', '21', '22', '20000'],
      ['Beto', '1155555555', 'Cancha 2', 'Viernes', '21', '22', '20000'],
    ])

    const first = await runImport(f, text)
    expect(first.ok && first.created).toHaveLength(2)

    const second = await runImport(f, text)
    expect(second).toMatchObject({
      ok: true,
      created: [],
      skipped: [
        { line: 2, reason: 'Ya hay un turno fijo activo en ese horario' },
        { line: 3, reason: 'Ya hay un turno fijo activo en ese horario' },
      ],
      pendingText: text,
    })
    const rows = await abonadosAsApp(f.tenantId)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.bookings)).toEqual([8, 8])
  })

  it('una planilla que no se entiende no carga nada', async () => {
    const f = await setup()
    const outcome = await runImport(
      f,
      tsv([
        ['Nombre', 'Cancha'],
        ['Ana', 'Cancha 1'],
      ]),
    )
    expect(outcome).toEqual({
      ok: false,
      error:
        'Faltan las columnas «Teléfono», «Día», «Desde» y «Precio». La primera fila tiene que tener los nombres de las columnas, como en la plantilla.',
    })
    expect(await abonadosAsApp(f.tenantId)).toHaveLength(0)
  })

  it('en un complejo que cierra pasada la medianoche, la madrugada es del día operativo', async () => {
    const f = await setup()
    const sql = adminSql()
    await sql`
      UPDATE tenants SET closes_next_day = true,
        opening_hours = ${sql.json({
          mon: { open: '18:00', close: '02:00' },
          tue: { open: '18:00', close: '02:00' },
          wed: { open: '18:00', close: '02:00' },
          thu: { open: '18:00', close: '02:00' },
          fri: { open: '18:00', close: '02:00' },
          sat: { open: '18:00', close: '02:00' },
          sun: { open: '18:00', close: '02:00' },
        })}
      WHERE id = ${f.tenantId}
    `
    const text = tsv([
      HEADER,
      ['Trasnoche', '1166666666', 'Cancha 1', 'Lunes', '00:00', '01:00', '20000'],
      ['Temprano', '1177777777', 'Cancha 1', 'Lunes', '19', '20', '20000'],
    ])

    const preview = await withTenantContext(f.tenantId, (tx) =>
      previewAbonadoImport(f.tenantId, text, STARTS_FROM, tx),
    )
    expect(preview.ok && preview.rows.map((r) => [r.line, r.physicallyNextDay])).toEqual([
      [2, true],
      [3, false],
    ])

    const outcome = await runImport(f, text)
    expect(outcome.ok && outcome.created.map((c) => c.slotsGenerated)).toEqual([8, 8])

    // `date` es el lunes operativo; el instante físico es el martes de madrugada.
    const firstMonday = weeksOf(1)[0]!
    const [booking] = await asApp(
      f.tenantId,
      (tx) => tx<{ date: string; time_start: string; starts_at_art: string }[]>`
      SELECT b.date::text, b.time_start::text,
        to_char(b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS starts_at_art
      FROM bookings b JOIN abonados a ON a.id = b.abonado_id
      WHERE a.contact_name = 'Trasnoche'
      ORDER BY b.date
      LIMIT 1
    `,
    )
    expect(booking).toEqual({
      date: firstMonday,
      time_start: '00:00:00',
      starts_at_art: `${addDays(firstMonday, 1)} 00:00`,
    })
  })

  it('cada fila suelta su cancha al terminar: el lote no la retiene hasta el final', async () => {
    const f = await setup()
    const text = tsv([
      HEADER,
      ['Ana', '1144444444', 'Cancha 1', 'Lunes', '20', '21', '20000'],
      ['Beto', '1155555555', 'Cancha 2', 'Martes', '20', '21', '20000'],
    ])
    // Lo que intentaría una reserva online de la Cancha 1 mientras se carga la
    // fila de Beto: con el lote en una sola transacción, la Cancha 1 seguía
    // tomada por la fila de Ana y esto fallaba con 55P03.
    let calls = 0
    const outcome = await importAbonados(f.tenantId, f.staffId, text, STARTS_FROM, async (fn) => {
      calls++
      if (calls === 3) {
        await adminSql().begin(
          (other) => other`SELECT id FROM courts WHERE id = ${f.court1} FOR UPDATE NOWAIT`,
        )
      }
      return withTenantContext(f.tenantId, fn)
    })

    // Una transacción para la vista previa y una por fila.
    expect(calls).toBe(3)
    expect(outcome.ok && outcome.created.map((c) => c.contactName)).toEqual(['Ana', 'Beto'])
  })

  it('una cancha tomada por otra operación deja afuera solo su fila y el resto se carga', async () => {
    const f = await setup()
    const text = tsv([
      HEADER,
      ['Ana', '1144444444', 'Cancha 1', 'Lunes', '20', '21', '20000'],
      ['Beto', '1155555555', 'Cancha 2', 'Martes', '20', '21', '20000'],
    ])
    // El DSN del test es superusuario, sin el `lock_timeout` de 3 s del rol
    // `turnogol_app` (migr. 055): acá se fija corto para no esperar.
    const withShortLockTimeout = <T>(fn: (tx: DbTx) => Promise<T>) =>
      withTenantContext(f.tenantId, async (tx) => {
        await tx.execute(drizzleSql`SET LOCAL lock_timeout = '200ms'`)
        return fn(tx)
      })

    // Otra transacción tiene la Cancha 1 tomada, como una reserva en curso.
    let outcome: ImportOutcome | undefined
    await adminSql().begin(async (other) => {
      await other`SELECT id FROM courts WHERE id = ${f.court1} FOR UPDATE`
      outcome = await importAbonados(f.tenantId, f.staffId, text, STARTS_FROM, withShortLockTimeout)
    })

    expect(outcome).toMatchObject({
      ok: true,
      created: [{ line: 3, contactName: 'Beto', slotsGenerated: 8 }],
      skipped: [
        {
          line: 2,
          contactName: 'Ana',
          reason: 'Había otra reserva cargándose en esa cancha: revisá de nuevo en unos segundos',
        },
      ],
      pendingText: tsv([HEADER, ['Ana', '1144444444', 'Cancha 1', 'Lunes', '20', '21', '20000']]),
    })
    const rows = await abonadosAsApp(f.tenantId)
    expect(rows.map((r) => [r.contact_name, r.bookings])).toEqual([['Beto', 8]])
  })

  it('un fijo de hoy a una hora que ya pasó arranca la semana siguiente, y muestra su primer turno real', async () => {
    const f = await setup()
    const sql = adminSql()
    const today = artTodayStr()
    const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay()
    // El de las 00:00 de hoy ya empezó siempre. El otro cae mañana, que está
    // cerrado: su primer turno real es el de la semana siguiente.
    const tomorrow = addDays(today, 1)
    await sql`
      UPDATE tenants SET closed_dates = ${sql.array([tomorrow])}::date[]
      WHERE id = ${f.tenantId}
    `
    const text = tsv([
      HEADER,
      ['Ya Pasó', '1144444444', 'Cancha 1', DAY_LABELS[todayDow]!, '00:00', '01:00', '20000'],
      ['Feriado', '1155555555', 'Cancha 2', DAY_LABELS[(todayDow + 1) % 7]!, '20', '21', '20000'],
    ])

    const preview = await withTenantContext(f.tenantId, (tx) =>
      previewAbonadoImport(f.tenantId, text, today, tx),
    )
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(
      preview.rows.map((r) => ({
        line: r.line,
        errors: r.errors,
        startsOn: r.startsOn,
        firstDate: r.firstDate,
        startsNextWeek: r.startsNextWeek,
        slotCount: r.slotCount,
      })),
    ).toEqual([
      {
        line: 2,
        errors: [],
        startsOn: addDays(today, 7),
        firstDate: addDays(today, 7),
        startsNextWeek: true,
        slotCount: 8,
      },
      {
        line: 3,
        errors: [],
        startsOn: tomorrow,
        firstDate: addDays(tomorrow, 7),
        startsNextWeek: false,
        // La fecha cerrada no resta un turno: el fijo se estira una semana.
        slotCount: 8,
      },
    ])

    const outcome = await runImport(f, text, today)
    expect(outcome.ok && outcome.created.map((c) => c.slotsGenerated)).toEqual([8, 8])
    // Ningún turno confirmado en el pasado: el primero del fijo es dentro de una semana.
    const [first] = await asApp(
      f.tenantId,
      (tx) => tx<{ starts_on: string; first: string }[]>`
      SELECT a.starts_on::text, MIN(b.date)::text AS first
      FROM abonados a JOIN bookings b ON b.abonado_id = a.id
      WHERE a.contact_name = 'Ya Pasó'
      GROUP BY a.starts_on
    `,
    )
    expect(first).toEqual({ starts_on: addDays(today, 7), first: addDays(today, 7) })
  })
})
