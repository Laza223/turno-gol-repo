/**
 * E2E — Abonados CRUD (audit T6, fase F5)
 *
 * Happy path + 3 edge cases for the admin abonados UI (T1+T2):
 *   #1  Happy — create with preview: /abonados/nuevo → fill form → "Continuar"
 *              → 8 dates listed with "Libre" badges → "Confirmar y Crear Abonado" → redirect
 *              to /abonados, row visible with "Activo" badge.
 *   #2  Edge — preview with conflict: service-role pre-inserts an overlapping confirmed
 *              booking on one of the candidate dates → preview shows "Ocupado" badge for
 *              that date + "7 turnos libres" + aviso de la fecha en conflicto.
 *   #3  Edge — cancel with future date: pre-create active abonado via service-role → in UI
 *              click "Cancelar" → type "CANCELAR" → pick today+14d as cancel-from date →
 *              confirm → assert bookings >= cancel-from are gone, earlier ones remain.
 *   #4  Edge — pause + reactivate: pre-create abonado → click "Pausar" → confirm →
 *              status "Pausado" + future bookings deleted → click "Reactivar" → preview
 *              loads → confirm → status "Activo" + 8 future bookings exist.
 *
 * ISOLATION: every test uses dedicated future dates and a fresh abonado UUID. Tests are
 * `fullyParallel`. Cleanup deletes abonados + bookings in `finally` even on assertion fail.
 *
 * NOTE: Live E2E execution requires a running Next.js dev/prod server + Supabase DB
 *       + `pnpm e2e:seed`. Delegated to CI; these specs typecheck locally.
 */

import { test, expect } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { bookingInstants } from './_helpers/booking-instants'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'
// Nombre real del court sembrado (scripts/seed-e2e.ts) — el Combobox de
// cancha selecciona por label visible, no por value/UUID.
const COURT_NAME = 'Cancha E2E 1'
const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Cancha / Día semanal / Hora inicio / Hora fin son un Combobox ARIA custom
 * (patrón APG combobox+listbox, ver src/components/ui/combobox.tsx), no un
 * <select> nativo: abrir con click, clickear la opción por su label visible.
 * Mismo patrón que tests/unit/preview-abonado-slots.test.tsx.
 *
 * Se scopea el click de la opción al `#<fieldId>-listbox` (no un
 * getByRole('option') global): Radix mantiene el popover previo montado
 * durante su animación de salida, así que justo después de cerrar un
 * combobox y abrir el siguiente pueden coexistir dos listbox con la misma
 * opción visible (p. ej. "Hora inicio" y "Hora fin" comparten el mismo
 * TIME_OPTIONS) — sin scope, el locator por nombre da strict-mode violation.
 */
async function selectCombobox(page: Page, fieldId: string, optionName: string): Promise<void> {
  await page.locator(`#${fieldId}`).click()
  await page.locator(`#${fieldId}-listbox`).getByRole('option', { name: optionName, exact: true }).click()
}

/**
 * "Empieza el" / "Cancelar desde" son un DatePicker con calendario propio
 * (botón trigger + popover Radix, ver src/components/ui/date-picker.tsx), no
 * un <input type="date">: hay que navegar el calendario mes a mes hasta el
 * mes/año buscado y clickear el día. El mes inicial visible depende del
 * `value` con el que arranca el picker (vacío = mes actual, prefilled = su
 * propio mes), así que se navega comparando el header en vez de asumir un
 * punto de partida fijo.
 *
 * `trigger` es opcional porque el botón, sin fecha elegida, se identifica por
 * su placeholder "Seleccionar fecha" — pero tanto "Empieza el" (autocompletado
 * a la próxima fecha que matchea el día semanal elegido, ver AbonadoForm.tsx
 * `getNextMatchingDate`) como "Cancelar desde" (defaultCancelDate() en
 * AbonadosList.tsx) arrancan PREFILLED, así que sus botones ya muestran una
 * fecha formateada y hay que ubicarlos por id en vez de por accessible name.
 */
async function pickDate(
  page: Page,
  dateStr: string,
  trigger: Locator = page.locator('#startsOn'),
): Promise<void> {
  const [y, m, d] = dateStr.split('-').map(Number)
  const targetLabel = `${MONTH_NAMES[m - 1]} de ${y}`
  await trigger.click()
  const panel = page.getByRole('dialog', { name: 'Elegir fecha' })
  await expect(panel).toBeVisible()
  const nextMonthBtn = panel.getByRole('button', { name: 'Mes siguiente' })
  // Loop acotado (10 años) para fallar rápido si algo no matchea, en vez de colgarse.
  for (let i = 0; i < 120; i++) {
    if (await panel.getByText(targetLabel, { exact: true }).isVisible()) break
    await nextMonthBtn.click()
  }
  await panel.getByRole('button', { name: String(d), exact: true }).click()
}

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E abonados tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Pick a far-future Monday and return its YYYY-MM-DD. */
function pickFutureMonday(yearOffset = 4): string {
  const target = new Date()
  target.setUTCFullYear(target.getUTCFullYear() + yearOffset)
  target.setUTCMonth(0, 1) // Jan 1
  // Walk to first Monday (getUTCDay: Sun=0, Mon=1)
  while (target.getUTCDay() !== 1) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.toISOString().slice(0, 10)
}

async function cleanupAbonado(
  supabase: ReturnType<typeof makeServiceClient>,
  abonadoId: string,
): Promise<void> {
  // Delete bookings first (FK), then the abonado row.
  await supabase.from('bookings').delete().eq('abonado_id', abonadoId)
  await supabase.from('abonados').delete().eq('id', abonadoId)
}

async function cleanupAbonadosByContact(
  supabase: ReturnType<typeof makeServiceClient>,
  contactPhone: string,
): Promise<void> {
  const { data } = await supabase
    .from('abonados')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('contact_phone', contactPhone)
  if (!data) return
  for (const row of data) {
    await cleanupAbonado(supabase, row.id)
  }
}

async function insertAbonado(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: {
    id: string
    startsOn: string
    contactPhone: string
    dayOfWeek?: number
    timeStart?: string
    timeEnd?: string
  },
): Promise<void> {
  const { error } = await supabase.from('abonados').insert({
    id: opts.id,
    tenant_id: TENANT_ID,
    court_id: COURT_ID,
    contact_name: 'E2E Abonado',
    contact_phone: opts.contactPhone,
    day_of_week: opts.dayOfWeek ?? 1,
    time_start: opts.timeStart ?? '14:00',
    time_end: opts.timeEnd ?? '15:00',
    price_per_session: 500000,
    starts_on: opts.startsOn,
    status: 'active',
    payment_method: 'cash',
  })
  if (error) throw new Error(`insertAbonado failed: ${error.message}`)
}

async function insertConfirmedBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: { date: string; timeStart: string; timeEnd: string },
): Promise<string> {
  const id = randomUUID()
  const { error } = await supabase.from('bookings').insert({
    id,
    tenant_id: TENANT_ID,
    court_id: COURT_ID,
    created_by_staff: STAFF_USER_ID,
    date: opts.date,
    time_start: opts.timeStart,
    time_end: opts.timeEnd,
    // NOT NULL desde el refactor de instantes físicos (ver _helpers/booking-instants.ts).
    ...bookingInstants({ date: opts.date, timeStart: opts.timeStart, timeEnd: opts.timeEnd }),
    type: 'spontaneous',
    status: 'confirmed',
    price_snapshot: 500000,
    deposit_amount: 0,
    deposit_status: 'not_required',
  })
  if (error) throw new Error(`insertBooking failed: ${error.message}`)
  return id
}

test.describe('Abonados CRUD', () => {
  test('#1 happy — create with preview shows 8 OK badges then redirects @critical', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100000${Date.now() % 100000}`
    const startsOn = pickFutureMonday(4)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      await page.goto('/abonados/nuevo')
      await page.waitForSelector('form')

      await selectCombobox(page, 'courtId', COURT_NAME)
      await selectCombobox(page, 'dayOfWeek', 'Lunes')
      await selectCombobox(page, 'timeStart', '14:00')
      await selectCombobox(page, 'timeEnd', '15:00')
      await page.fill('input[name="contactName"]', 'E2E Happy Path')
      // #contactPhone = el input tel VISIBLE del PhoneInput; input[name=contactPhone]
      // es el hidden que arma el valor internacional (+54 …) y no es fillable.
      await page.fill('#contactPhone', contactPhone)
      // Precio por turno es un MoneyInput (input type="text" sin `name` propio,
      // ubicado por label) desde el fix del hallazgo de auditoría §4.4.
      await page.getByLabel('Precio por turno (pesos)').fill('5000')
      await pickDate(page, startsOn)

      await page.getByRole('button', { name: 'Continuar' }).click()

      // Phase 2: preview heading + 8 OK badges + summary
      await expect(page.getByRole('heading', { name: 'Vista previa de fechas' })).toBeVisible()
      const okBadges = page.getByText('Libre', { exact: true })
      await expect(okBadges).toHaveCount(8)
      await expect(page.getByText('8 turnos libres')).toBeVisible()

      await page.getByRole('button', { name: 'Confirmar y Crear Abonado' }).click()
      await page.waitForURL('**/abonados')

      // Row visible with Activo badge. La lista renderiza tabla (desktop) +
      // cards (mobile); .first() = la tabla, visible en este viewport desktop.
      await expect(page.getByText('E2E Happy Path').first()).toBeVisible()
    } finally {
      // El PhoneInput persiste el número internacional: "+54 <nacional>".
      await cleanupAbonadosByContact(supabase, `+54 ${contactPhone}`)
    }
  })

  test('#2 edge — preview surfaces conflicting date', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100001${Date.now() % 100000}`
    const startsOn = pickFutureMonday(5) // a different year so we don't collide with #1
    // The conflicting booking lands on the 2nd Monday (startsOn + 7d)
    const conflictDate = new Date(`${startsOn}T00:00:00Z`)
    conflictDate.setUTCDate(conflictDate.getUTCDate() + 7)
    const conflictStr = conflictDate.toISOString().slice(0, 10)
    let conflictBookingId: string | null = null

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      conflictBookingId = await insertConfirmedBooking(supabase, {
        date: conflictStr,
        timeStart: '14:00',
        timeEnd: '15:00',
      })

      await page.goto('/abonados/nuevo')
      await page.waitForSelector('form')

      await selectCombobox(page, 'courtId', COURT_NAME)
      await selectCombobox(page, 'dayOfWeek', 'Lunes')
      await selectCombobox(page, 'timeStart', '14:00')
      await selectCombobox(page, 'timeEnd', '15:00')
      await page.fill('input[name="contactName"]', 'E2E Conflict')
      await page.fill('#contactPhone', contactPhone)
      // Precio por turno es un MoneyInput (input type="text" sin `name` propio,
      // ubicado por label) desde el fix del hallazgo de auditoría §4.4.
      await page.getByLabel('Precio por turno (pesos)').fill('5000')
      await pickDate(page, startsOn)

      await page.getByRole('button', { name: 'Continuar' }).click()

      await expect(page.getByRole('heading', { name: 'Vista previa de fechas' })).toBeVisible()
      // 7 OK + 1 Conflicto + summary
      await expect(page.getByText('Libre', { exact: true })).toHaveCount(7)
      await expect(page.getByText('Ocupado', { exact: true })).toHaveCount(1)
      await expect(page.getByText('7 turnos libres')).toBeVisible()
      await expect(
        page.getByText(/Hay 1 fecha que ya está ocupada por otra reserva\./),
      ).toBeVisible()
    } finally {
      if (conflictBookingId) {
        await supabase.from('bookings').delete().eq('id', conflictBookingId)
      }
      await cleanupAbonadosByContact(supabase, `+54 ${contactPhone}`)
    }
  })

  test('#3 edge — cancel with future fromDate deletes only later bookings', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100002${Date.now() % 100000}`
    const abonadoId = randomUUID()
    const startsOn = pickFutureMonday(6)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      // Pre-create abonado + seed 4 future bookings spaced 7 days
      await insertAbonado(supabase, { id: abonadoId, startsOn, contactPhone })
      const dates: string[] = []
      const cursor = new Date(`${startsOn}T00:00:00Z`)
      for (let i = 0; i < 4; i++) {
        const dateStr = cursor.toISOString().slice(0, 10)
        dates.push(dateStr)
        await supabase.from('bookings').insert({
          tenant_id: TENANT_ID,
          court_id: COURT_ID,
          abonado_id: abonadoId,
          date: dateStr,
          time_start: '14:00',
          time_end: '15:00',
          // NOT NULL desde el refactor de instantes físicos (ver _helpers/booking-instants.ts).
          ...bookingInstants({ date: dateStr, timeStart: '14:00', timeEnd: '15:00' }),
          type: 'fixed',
          status: 'confirmed',
          price_snapshot: 500000,
          deposit_amount: 0,
          deposit_status: 'not_required',
        })
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      // cancelFrom = dates[2] → expect dates[0], dates[1] survive; dates[2], dates[3] gone
      const cancelFrom = dates[2]!

      await page.goto('/abonados')
      // exact:true: desde 777ee57 la fila también tiene "Cancelar fecha..."
      // (cancelación puntual de un día) — sin exact, el match por substring
      // agarra ese botón primero en vez de "Cancelar" (turno fijo completo).
      const cancelBtn = page.getByRole('button', { name: 'Cancelar', exact: true }).first()
      await cancelBtn.click()

      // Dialog opens; pick date + type CANCELAR.
      // Scopeado por name ("Cancelar turno fijo", el title del ConfirmDialog):
      // el popover del DatePicker anidado también es role="dialog"
      // (aria-label "Elegir fecha") y Radix lo deja montado con
      // data-state="closed" tras seleccionar el día — un getByRole('dialog')
      // sin nombre matchea los dos y rompe el toBeHidden() de más abajo.
      const dialog = page.getByRole('dialog', { name: 'Cancelar turno fijo' })
      await expect(dialog).toBeVisible()
      // "Cancelar desde" arranca prefilled (defaultCancelDate() en
      // AbonadosList.tsx), así que su trigger ya muestra una fecha formateada
      // en vez del placeholder "Seleccionar fecha" — hay que ubicarlo por id
      // (`cancel-date-${abonadoId}`, ver AbonadoDialogs.tsx).
      await pickDate(page, cancelFrom, dialog.locator(`#cancel-date-${abonadoId}`))
      await dialog.locator('input#confirm-phrase').fill('CANCELAR')
      await dialog.getByRole('button', { name: 'Cancelar turno fijo' }).click()

      await expect(dialog).toBeHidden()

      // Verify DB state
      const { data: remaining } = await supabase
        .from('bookings')
        .select('date')
        .eq('abonado_id', abonadoId)
      const dateStrs = (remaining ?? []).map((r) => r.date as string).sort()
      expect(dateStrs).toEqual([dates[0], dates[1]])
    } finally {
      await cleanupAbonado(supabase, abonadoId)
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })

  test('#4 edge — pause then reactivate restores status and regenerates slots', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const contactPhone = `1100003${Date.now() % 100000}`
    const abonadoId = randomUUID()
    const startsOn = pickFutureMonday(7)

    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    try {
      await insertAbonado(supabase, { id: abonadoId, startsOn, contactPhone })
      // Seed 3 future bookings so we can verify they're deleted on pause
      const cursor = new Date(`${startsOn}T00:00:00Z`)
      for (let i = 0; i < 3; i++) {
        await supabase.from('bookings').insert({
          tenant_id: TENANT_ID,
          court_id: COURT_ID,
          abonado_id: abonadoId,
          date: cursor.toISOString().slice(0, 10),
          time_start: '14:00',
          time_end: '15:00',
          // NOT NULL desde el refactor de instantes físicos (ver _helpers/booking-instants.ts).
          ...bookingInstants({
            date: cursor.toISOString().slice(0, 10),
            timeStart: '14:00',
            timeEnd: '15:00',
          }),
          type: 'fixed',
          status: 'confirmed',
          price_snapshot: 500000,
          deposit_amount: 0,
          deposit_status: 'not_required',
        })
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      await page.goto('/abonados')

      // Pause
      await page.getByRole('button', { name: 'Pausar' }).first().click()
      const pauseDialog = page.getByRole('dialog')
      await expect(pauseDialog).toBeVisible()
      await pauseDialog.getByRole('button', { name: 'Pausar' }).click()
      await expect(pauseDialog).toBeHidden()

      // Verify status + bookings cleared
      const { data: pausedRow } = await supabase
        .from('abonados')
        .select('status')
        .eq('id', abonadoId)
        .single()
      expect(pausedRow?.status).toBe('paused')
      const { count: pausedCnt } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('abonado_id', abonadoId)
      expect(pausedCnt ?? 0).toBe(0)

      // Reactivate
      await page.reload()
      await page.getByRole('button', { name: 'Reactivar' }).first().click()
      const reactivateDialog = page.getByRole('dialog')
      await expect(reactivateDialog).toBeVisible()
      // wait for preview to load
      await expect(reactivateDialog.getByText(/Se generarán/i)).toBeVisible({ timeout: 10000 })
      await reactivateDialog.getByRole('button', { name: 'Reactivar' }).click()
      await expect(reactivateDialog).toBeHidden()

      const { data: activeRow } = await supabase
        .from('abonados')
        .select('status')
        .eq('id', abonadoId)
        .single()
      expect(activeRow?.status).toBe('active')
      const { count: futureCnt } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('abonado_id', abonadoId)
      expect((futureCnt ?? 0) > 0).toBe(true)
    } finally {
      await cleanupAbonado(supabase, abonadoId)
      await cleanupAbonadosByContact(supabase, contactPhone)
    }
  })
})
