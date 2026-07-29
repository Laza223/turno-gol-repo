import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { bookingInstants } from './_helpers/booking-instants'
import { SEED_ADMIN_URL, deleteFreshAdminTenants } from './_helpers/fresh-tenant-cleanup'


// Seeding constants
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'
const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'
const PLAYER_ID = '00000000-0000-4000-8000-000000000020'
// Mismo id que scripts/seed-e2e.ts (E2E.freshStaffUserId). Se necesita en el afterAll para
// borrar los tenants que este spec le crea al fresh admin al fotografiar el wizard.
const FRESH_STAFF_USER_ID = '00000000-0000-4000-8000-000000000005'
const DEPOSIT_COURT_ID = '00000000-0000-4000-8000-000000000031'

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

function getTestDate(daysOffset = 2): string {
  const d = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

test.describe('UX Audit Screenshot Capturer', () => {
  let supabase: ReturnType<typeof makeServiceClient>
  let testBookingId: string
  let testAbonadoId: string
  /**
   * Ids de las reservas que YA existían antes de este spec. Todo lo que aparezca después
   * lo creó él y hay que borrarlo.
   *
   * No alcanza con borrar `testBookingId`: este spec también recorre el FLUJO PÚBLICO DE
   * RESERVA completo para fotografiarlo (formulario -> checkout MP -> éxito), y eso deja
   * una reserva REAL del jugador compartido en el tenant de seña. Los jugadores son
   * cross-tenant, así que esa reserva aparece en `/mis-reservas` junto a las de los otros
   * specs — y `player-bookings.spec.ts` hace `.getByRole('button', {name:'Cancelar'})
   * .first()`, o sea que terminaba cancelando la reserva de ESTE spec y después fallaba al
   * verificar la suya, que seguía `confirmed`.
   *
   * El snapshot es a prueba de futuro: si mañana el spot de fotos toca otro flujo que crea
   * reservas, la limpieza lo cubre sin que nadie se acuerde de agregarlo.
   */
  let preexistingBookingIds: Set<string>

  test.beforeAll(async () => {
    supabase = makeServiceClient()
    testBookingId = randomUUID()
    testAbonadoId = randomUUID()

    // Dejá al fresh admin sin onboarding ANTES de empezar, no solo después.
    //
    // Este spec matchea DOS projects (chromium por descarte, mobile-chrome por su
    // testMatch), asi que corre dos veces por suite. El afterAll que restaura al fresh
    // admin no alcanza: no corre entre una pasada y la otra, asi que la segunda arrancaba
    // con el tenant que dejó la primera, el wizard la mandaba derecho al paso 2 y el
    // `expect(heading /tu complejo/i)` del paso 1 se caía por timeout.
    //
    // Limpiar tambien de entrada hace al spec idempotente: no depende del orden de los
    // projects ni de que la corrida anterior haya terminado bien.
    const bootSql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
    try {
      await deleteFreshAdminTenants(bootSql, FRESH_STAFF_USER_ID)
    } finally {
      await bootSql.end()
    }

    const { data: before } = await supabase.from('bookings').select('id')
    preexistingBookingIds = new Set((before ?? []).map((b) => b.id as string))

    // 1. Seed a future booking for the loaded admin views
    const date = getTestDate(1)
    await supabase.from('bookings').insert({
      id: testBookingId,
      tenant_id: TENANT_ID,
      court_id: COURT_ID,
      created_by_staff: STAFF_USER_ID,
      player_id: PLAYER_ID,
      date,
      time_start: '10:00:00',
      time_end: '11:00:00',
      // NOT NULL desde el refactor de instantes físicos (ver _helpers/booking-instants.ts).
      ...bookingInstants({ date, timeStart: '10:00', timeEnd: '11:00' }),
      type: 'spontaneous',
      status: 'confirmed',
      price_snapshot: 10000,
      deposit_amount: 0,
      deposit_status: 'not_required',
      guest_name: 'E2E Audit Guest',
      guest_phone: '+5491100000000',
    })

    // 2. Seed an abonado with balance for the loaded abonados view
    await supabase.from('abonados').insert({
      id: testAbonadoId,
      tenant_id: TENANT_ID,
      court_id: COURT_ID,
      player_id: PLAYER_ID,
      contact_name: 'E2E Audit Player',
      contact_phone: '+5491100000000',
      day_of_week: 1, // Mon
      time_start: '14:00:00',
      time_end: '15:00:00',
      price_per_session: 12000,
      starts_on: getTestDate(1),
      status: 'active',
      payment_method: 'cash',
    })
  })

  test.afterAll(async () => {
    // Cleanup seeded records
    await supabase.from('abonados').delete().eq('id', testAbonadoId)

    // Y devolvé el fresh admin como estaba.
    //
    // Este spec maneja el wizard de onboarding hasta el final para fotografiarlo (crea
    // "Complejo UX Audit"), y con eso le CONSUME al fresh admin lo único que lo hace útil:
    // no tener onboarding completo. A partir de acá `/onboarding` le redirige a
    // `/dashboard`, y `onboarding.spec.ts` (que depende de esa fixture) falla — más
    // player-bookings y player-delete-account, que caen por el mismo arrastre.
    //
    // Medido: este spec, SOLO, dejaba 5 tests ajenos en rojo. Sacándolo de la corrida, esos
    // 5 pasaban. Borrar los registros propios no alcanza: hay que deshacer la mutación que
    // le hizo a una fixture COMPARTIDA.
    const sql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
    try {
      // Borrá TODA reserva que no existiera antes de este spec (ver `preexistingBookingIds`):
      // la sembrada a mano MÁS las que dejó el recorrido del flujo público de reserva.
      const { data: after } = await supabase.from('bookings').select('id')
      const created = (after ?? [])
        .map((b) => b.id as string)
        .filter((id) => !preexistingBookingIds.has(id))

      if (created.length > 0) {
        // payments.booking_id -> bookings.id: hay que anularlo antes o el DELETE viola
        // payments_booking_id_fkey (mismo orden que usa el seed).
        //
        // `IN ${sql(ids)}`, no `= ANY(sql.array(ids)::uuid[])`: el cast explícito sobre
        // sql.array() en postgres.js arma un literal malformado
        // (`malformed array literal: "uuid1,uuid2"`).
        await sql`UPDATE payments SET booking_id = NULL WHERE booking_id IN ${sql(created)}`
        await sql`DELETE FROM bookings WHERE id IN ${sql(created)}`
      }

      await deleteFreshAdminTenants(sql, FRESH_STAFF_USER_ID)
    } finally {
      await sql.end()
    }
  })

  test('UX Audit UI screenshots capture', async ({
    browser,
    adminStorageState,
    playerStorageState,
    freshAdminStorageState,
  }, testInfo) => {
    test.setTimeout(300000)

    const isMobile = !!process.env.E2E_MOBILE || testInfo.project.name.includes('mobile')
    const vpName = isMobile ? 'mobile' : 'desktop'
    const width = isMobile ? 393 : 1440
    const height = isMobile ? 851 : 900
    const date = getTestDate(2)

    const screenDir = (category: string) =>
      path.resolve(`./docs/audit/screenshots/${vpName}/${category}`)

    const takeShot = async (page: Page, category: string, name: string) => {
      const dir = screenDir(category)
      await fs.mkdir(dir, { recursive: true })
      // Wait for page to settle (animations, layout shifts, images)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
    }

    // Initialize contexts with specific viewport and state
    const anonCtx = await browser.newContext({
      viewport: { width, height },
      isMobile,
    })
    const playerCtx = await browser.newContext({
      storageState: JSON.parse(playerStorageState),
      viewport: { width, height },
      isMobile,
    })
    const adminCtx = await browser.newContext({
      storageState: JSON.parse(adminStorageState),
      viewport: { width, height },
      isMobile,
    })
    const freshAdminCtx = await browser.newContext({
      storageState: JSON.parse(freshAdminStorageState),
      viewport: { width, height },
      isMobile,
    })

    // ───────────────────────────────────────────────────────────────────────
    // 1. PUBLIC VIEWS (UNAUTHENTICATED & PLAYER)
    // ───────────────────────────────────────────────────────────────────────
    const anonPage = await anonCtx.newPage()
    const playerPage = await playerCtx.newPage()

    // Landing (/)
    await anonPage.goto('/')
    await takeShot(anonPage, 'public', 'landing')

    // Explorar (/explorar) - results
    await anonPage.goto('/explorar')
    await expect(anonPage.getByText('E2E Complejo Demo').first()).toBeVisible()
    await takeShot(anonPage, 'public', 'explorar_con_resultados')

    // Explorar (/explorar) - empty search
    const searchInput = anonPage.getByPlaceholder(/buscar|ciudad|complejo/i).first()
    await searchInput.fill('complejo_inexistente_de_prueba')
    await searchInput.press('Enter')
    await takeShot(anonPage, 'public', 'explorar_vacio')

    // Complex Page (/[slug])
    await anonPage.goto('/e2e-complejo-demo')
    await expect(anonPage.getByText('E2E Complejo Demo').first()).toBeVisible()
    await takeShot(anonPage, 'public', 'pagina_complejo')

    // Weekly Availability (/[slug]/disponibilidad)
    await anonPage.goto('/e2e-complejo-demo/disponibilidad')
    await takeShot(anonPage, 'public', 'disponibilidad_semanal')

    // Booking flow - no deposit selection
    const demoTime = isMobile ? '19:00' : '15:00'
    await playerPage.goto(`/e2e-complejo-demo/reservar?court=${COURT_ID}&date=${date}&time=${demoTime}&dur=60`)
    await expect(playerPage.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()
    await takeShot(playerPage, 'public', 'reserva_formulario_sin_sena')

    // Booking flow - deposit selection
    const senaTime = isMobile ? '17:00' : '16:00'
    await playerPage.goto(`/e2e-complejo-sena/reservar?court=${DEPOSIT_COURT_ID}&date=${date}&time=${senaTime}&dur=60`)
    await expect(playerPage.getByRole('heading', { name: /confirmá tu reserva/i })).toBeVisible()
    await takeShot(playerPage, 'public', 'reserva_formulario_con_sena')

    // Click to go to MercadoPago checkout mock
    await playerPage.getByRole('button', { name: /pagar seña/i }).click()
    await expect(playerPage).toHaveURL(/\/mock-mp\/checkout/, { timeout: 15000 })
    await takeShot(playerPage, 'public', 'reserva_checkout_mp')

    // Pay (approved)
    const bookingId = /booking=([0-9a-f-]{36})/i.exec(playerPage.url())?.[1]
    await playerPage.getByRole('button', { name: 'Pagar (aprobado)' }).click()
    await expect(playerPage).toHaveURL(new RegExp(`/reserva/${bookingId}/exito`), { timeout: 15000 })
    await takeShot(playerPage, 'public', 'reserva_exito')

    // Go to error route for the confirmed booking (since booking is no longer pending, it acts as expired)
    await playerPage.goto(`/reserva/${bookingId}/error`)
    await expect(playerPage.getByRole('heading', { name: /el pago no se procesó|reservar de nuevo/i })).toBeVisible()
    await takeShot(playerPage, 'public', 'reserva_expirada')

    // ───────────────────────────────────────────────────────────────────────
    // 2. AUTH / ONBOARDING
    // ───────────────────────────────────────────────────────────────────────
    const authPage = anonPage // reuse anonPage

    // Login (staff)
    await authPage.goto('/login')
    await expect(authPage.getByLabel(/email/i)).toBeVisible()
    await takeShot(authPage, 'auth_onboarding', 'login_staff_inicial')

    // Login (player)
    await authPage.goto('/ingresar')
    await expect(authPage.getByLabel(/email/i)).toBeVisible()
    await takeShot(authPage, 'auth_onboarding', 'login_jugador_inicial')

    // Login (player - Check email)
    await authPage.getByLabel(/email/i).fill('e2e-player@turnogol.test')
    await authPage.locator('form button[type="submit"]').click()
    await expect(authPage.getByText(/revisá tu email/i)).toBeVisible({ timeout: 10000 })
    await takeShot(authPage, 'auth_onboarding', 'login_jugador_revisa_email')

    // 4-Step Onboarding Wizard (using fresh admin context)
    const freshAdminPage = await freshAdminCtx.newPage()
    freshAdminPage.on('console', msg => {
      console.log(`[FreshAdmin Browser Console] ${msg.type()}: ${msg.text()}`)
    })
    freshAdminPage.on('pageerror', err => {
      console.log(`[FreshAdmin Unhandled Error] ${err.message}`)
    })

    await freshAdminPage.goto('/onboarding')

    // Step 1: complex identity
    await expect(freshAdminPage.getByRole('heading', { name: /tu complejo/i })).toBeVisible({ timeout: 20000 })
    await takeShot(freshAdminPage, 'auth_onboarding', 'onboarding_paso_1')
    await freshAdminPage.locator('#identity-name').fill('Complejo UX Audit')
    await freshAdminPage.locator('#identity-address').fill('Calle Audit 555')
    await freshAdminPage.locator('#identity-city').fill('Luján')
    await freshAdminPage.locator('#identity-province').selectOption({ label: 'Buenos Aires' })
    await freshAdminPage.locator('#identity-phone').fill('+5491166666666')
    await freshAdminPage.locator('#identity-email').fill('ux-audit-tenant@turnogol.test')
    await freshAdminPage.getByRole('button', { name: /continuar/i }).click()

    // Step 2: horarios (general + excepciones; defaults saneados → Continuar directo)
    // `filter({ visible: true })`, no `.first()`: WizardShell pinta el label del paso DOS
    // veces — en el <aside> (hidden, lg:flex) y en el <header> (lg:hidden). En DOM order el
    // primero es el del aside, que en viewport mobile está oculto, asi que `.first()` daba
    // "resolved to <p>...</p>" pero hidden. Este spec corre en chromium Y en mobile-chrome.
    await expect(
      freshAdminPage.getByText(/paso 2 de 4/i).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15000 })
    await takeShot(freshAdminPage, 'auth_onboarding', 'onboarding_paso_2')
    await freshAdminPage.getByRole('button', { name: /continuar/i }).click()

    // Step 3: canchas inline (nombre precargado; solo falta el precio)
    await expect(
      freshAdminPage.getByText(/paso 3 de 4/i).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15000 })
    await freshAdminPage.getByPlaceholder(/20\.000/).fill('20.000')
    await takeShot(freshAdminPage, 'auth_onboarding', 'onboarding_paso_3')
    await freshAdminPage.getByRole('button', { name: /continuar/i }).click()

    // Step 4: señas (cards de decisión)
    try {
      await expect(
        freshAdminPage.getByText(/paso 4 de 4/i).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 15000 })
    } catch (err) {
      console.log("=== STEP 4 VISIBILITY FAILURE DETAILS ===")
      console.log("Current URL:", freshAdminPage.url())
      console.log("HTML Body Content:")
      console.log(await freshAdminPage.locator('body').innerHTML())
      throw err
    }
    await takeShot(freshAdminPage, 'auth_onboarding', 'onboarding_paso_4')
    await freshAdminPage.getByText(/sin seña por ahora/i).click()
    await freshAdminPage.getByRole('button', { name: /terminar y ver mi complejo/i }).click()

    // Cierre peak-end del wizard → panel
    await expect(freshAdminPage).toHaveURL(/\/onboarding\/listo/, { timeout: 20000 })
    await takeShot(freshAdminPage, 'auth_onboarding', 'onboarding_listo')
    await freshAdminPage.getByRole('link', { name: /ir a mi panel/i }).click()
    await expect(freshAdminPage).toHaveURL(/\/dashboard/, { timeout: 20000 })

    // El primer /dashboard post-wizard dispara el tour de coachmarks (Fase 1
    // UX): se lo descarta antes de capturar, o el globo tapa el estado vacío.
    await freshAdminPage.getByRole('button', { name: /omitir recorrido/i }).click({ timeout: 15000 })
    await expect(freshAdminPage.getByText(/abrí la grilla desde acá/i)).toBeHidden()

    await takeShot(freshAdminPage, 'special_states', 'dashboard_vacio')

    // Capture all other empty states using this brand new tenant
    await freshAdminPage.goto('/grilla')
    await takeShot(freshAdminPage, 'special_states', 'grilla_vacio')

    await freshAdminPage.goto('/reservas')
    await takeShot(freshAdminPage, 'special_states', 'reservas_vacio')

    await freshAdminPage.goto('/caja')
    await takeShot(freshAdminPage, 'special_states', 'caja_vacio')

    await freshAdminPage.goto('/settings/canchas')
    await takeShot(freshAdminPage, 'special_states', 'canchas_vacio')

    await freshAdminPage.goto('/abonados')
    await takeShot(freshAdminPage, 'special_states', 'abonados_vacio')

    await freshAdminPage.goto('/analiticas')
    await takeShot(freshAdminPage, 'special_states', 'reportes_vacio')

    // ───────────────────────────────────────────────────────────────────────
    // 3. ADMIN VIEWS (AUTHENTICATED)
    // ───────────────────────────────────────────────────────────────────────
    const adminPage = await adminCtx.newPage()

    // Dashboard
    await adminPage.goto('/dashboard')
    await expect(adminPage.getByRole('heading', { name: 'Inicio' })).toBeVisible()
    await takeShot(adminPage, 'admin', 'dashboard')

    // Grilla
    await adminPage.goto('/grilla')
    await takeShot(adminPage, 'admin', 'grilla')

    // Grilla creation modal - Click on an interactive cell
    const slotButton = adminPage.locator('button[role="button"]:has-text(":")').first()
    if (await slotButton.count() > 0) {
      await slotButton.click()
      await expect(adminPage.getByRole('dialog')).toBeVisible()
      await takeShot(adminPage, 'admin', 'reservas_creacion_modal')
      await adminPage.keyboard.press('Escape')
    }

    // Reservas list
    await adminPage.goto('/reservas')
    await takeShot(adminPage, 'admin', 'reservas_listado')

    // Reservas detail & cancel modal
    await adminPage.goto(`/reservas/${testBookingId}`)
    await expect(adminPage.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible()
    await takeShot(adminPage, 'admin', 'reservas_detalle')

    await adminPage.getByRole('button', { name: 'Cancelar' }).click()
    await expect(adminPage.getByRole('dialog')).toBeVisible()
    await takeShot(adminPage, 'admin', 'reservas_cancelacion_modal')
    await adminPage.keyboard.press('Escape')

    // Caja list
    await adminPage.goto('/caja')
    await takeShot(adminPage, 'admin', 'caja')

    // Caja Registrar Movimiento modal
    await adminPage.getByRole('button', { name: /agregar movimiento/i }).click()
    await expect(adminPage.getByRole('dialog')).toBeVisible()
    await takeShot(adminPage, 'admin', 'caja_registrar_movimiento_modal')
    await adminPage.keyboard.press('Escape')

    // Canchas list
    await adminPage.goto('/settings/canchas')
    await takeShot(adminPage, 'admin', 'canchas_listado')

    // Canchas Nueva Cancha form/modal
    await adminPage.getByRole('button', { name: /nueva cancha/i }).click()
    await expect(adminPage.getByRole('heading', { name: /nueva cancha/i })).toBeVisible()
    await takeShot(adminPage, 'admin', 'canchas_formulario_modal')
    await adminPage.getByRole('button', { name: /cancelar/i }).click()

    // Abonados list
    await adminPage.goto('/abonados')
    await takeShot(adminPage, 'admin', 'abonados_listado')

    // Abonados detail (on player profile detail page)
    await adminPage.goto(`/jugadores/${PLAYER_ID}`)
    await expect(adminPage.getByText('E2E Player')).toBeVisible()
    await takeShot(adminPage, 'admin', 'abonados_detalle')

    // Settings Layout
    await adminPage.goto('/settings')
    await takeShot(adminPage, 'admin', 'settings_general')

    // Settings Horarios
    await adminPage.goto('/settings/horarios')
    await takeShot(adminPage, 'admin', 'settings_horarios')

    // Settings Políticas (Reservas)
    await adminPage.goto('/settings/reservas')
    await takeShot(adminPage, 'admin', 'settings_politicas_pin')

    // Staff list
    await adminPage.goto('/settings/equipo')
    await takeShot(adminPage, 'admin', 'staff_listado')

    // Staff Invitation modal
    const inviteStaffBtn = adminPage.getByRole('button', { name: /agregar miembro/i }).first()
    if (await inviteStaffBtn.count() > 0) {
      await inviteStaffBtn.click()
      await expect(adminPage.getByRole('dialog')).toBeVisible()
      await takeShot(adminPage, 'admin', 'staff_invitacion_modal')
      await adminPage.keyboard.press('Escape')
    }

    // Reports page (with data)
    await adminPage.goto('/analiticas')
    await takeShot(adminPage, 'admin', 'reportes')

    // ───────────────────────────────────────────────────────────────────────
    // 4. PLAYER VIEWS
    // ───────────────────────────────────────────────────────────────────────
    const pPage = playerPage // reuse playerPage

    // Mis Reservas
    await pPage.goto('/mis-reservas')
    await takeShot(pPage, 'player', 'mis_reservas')

    // Perfil
    await pPage.goto('/perfil')
    await takeShot(pPage, 'player', 'perfil')

    // Configuración
    await pPage.goto('/configuracion')
    await takeShot(pPage, 'player', 'configuracion')

    // Eliminar Cuenta confirmation modal
    await pPage.goto('/eliminar-cuenta')
    await pPage.getByRole('button', { name: /eliminar mi cuenta/i }).click()
    await expect(pPage.getByRole('dialog')).toBeVisible()
    await takeShot(pPage, 'player', 'eliminar_cuenta_confirmacion')
    await pPage.keyboard.press('Escape')

    // ───────────────────────────────────────────────────────────────────────
    // 5. SPECIAL STATES (LOADING & ERROR)
    // ───────────────────────────────────────────────────────────────────────
    const loadingPage = await adminCtx.newPage()

    // Define route helpers to throttle RSC payloads (so the loading skeleton is visible)
    await loadingPage.route('**/grilla*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000))
      await route.continue()
    })
    await loadingPage.route('**/caja*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000))
      await route.continue()
    })
    await loadingPage.route('**/dashboard*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000))
      await route.continue()
    })

    // Grilla Loading
    await loadingPage.goto('/grilla', { waitUntil: 'commit' })
    await takeShot(loadingPage, 'special_states', 'grilla_loading')

    // Caja Loading
    await loadingPage.goto('/caja', { waitUntil: 'commit' })
    await takeShot(loadingPage, 'special_states', 'caja_loading')

    // Dashboard Loading
    await loadingPage.goto('/dashboard', { waitUntil: 'commit' })
    await takeShot(loadingPage, 'special_states', 'dashboard_loading')

    // Error State: Temporary rename bookings table to trigger layout error boundary
    //
    // Renombrar la tabla es un DDL de OWNER. `DATABASE_URL` es el rol `turnogol_app`,
    // restringido a propósito (migr. 037-039): tiene DML pero NO es dueño de las
    // tablas, así que acá moría con `PostgresError: must be owner of table bookings`
    // — o sea, el sistema de permisos funcionando. Va el DSN de superusuario, que es
    // el canal ya establecido del repo para setup de tests (mismo que usa
    // scripts/seed-e2e.ts; CI y Supabase local comparten estas credenciales).
    const sql = postgres(SEED_ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} })
    let renamed = false
    try {
      await sql`ALTER TABLE bookings RENAME TO bookings_temp`
      renamed = true

      const errorPage = await adminCtx.newPage()
      errorPage.on('console', msg => {
        console.log(`[ErrorPage Browser Console] ${msg.type()}: ${msg.text()}`)
      })
      errorPage.on('pageerror', err => {
        console.log(`[ErrorPage Unhandled Error] ${err.message}`)
      })

      // Go directly to /grilla (this will hit the DB error server-side and render error.tsx!)
      await errorPage.goto('/grilla')

      // Wait for the error component to catch and render
      await expect(errorPage.getByRole('button', { name: /intentar/i }).first()).toBeVisible({ timeout: 15000 })
      await takeShot(errorPage, 'special_states', 'grilla_error')
    } finally {
      // Si el rename-back falla, la tabla `bookings` queda como `bookings_temp` y la
      // base local queda ROTA para todo lo que corra después — que es exactamente el
      // efecto dominó que se vio acá: este spec caía y arrastraba a otros 6.
      // El `.catch(() => {})` que había antes se tragaba justo ese error, dejando al
      // dev con la base rota y sin un solo mensaje. Que grite.
      // El guard `renamed` existe porque si el ALTER de arriba nunca corrió, no hay
      // nada que revertir (y el rename-back fallaría con "no existe bookings_temp").
      if (renamed) await sql`ALTER TABLE bookings_temp RENAME TO bookings`
      await sql.end()
    }

    // Close all contexts
    await anonCtx.close()
    await playerCtx.close()
    await adminCtx.close()
    await freshAdminCtx.close()
  })
})
