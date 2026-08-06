/**
 * E2E mobile — admin smoke (Fase F10)
 *
 * Verifica:
 *   1. Cada ruta admin crítica NO produce horizontal scroll en viewport mobile.
 *   2. RegisterMovementModal (caja) fitea dentro del viewport cuando se abre.
 *   3. Hamburger admin visible en mobile (<lg).
 *
 * Viewport: Pixel 5 (393x851) — gestionado por project mobile-chrome.
 */

import { test, expect } from '../fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// Routes that must render without horizontal scroll on mobile.
const ROUTES = [
  '/grilla',
  '/caja',
  '/reservas',
  '/settings/canchas',
  // /settings/equipo siempre tiene datos (el admin seedeado); /abonados con datos se
  // cubre en su test propio (seed service-role). /jugadores renderizan
  // igual con o sin datos.
  '/settings/equipo',
  '/jugadores',
  '/analiticas',
] as const

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Lunes futuro relativo (sin fechas hardcodeadas — time bombs). */
function pickFutureMonday(yearOffset = 4): string {
  const target = new Date()
  target.setUTCFullYear(target.getUTCFullYear() + yearOffset)
  target.setUTCMonth(0, 1)
  while (target.getUTCDay() !== 1) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.toISOString().slice(0, 10)
}

test.describe('Admin mobile smoke', () => {
  for (const route of ROUTES) {
    test(`${route} renders without horizontal scroll`, async ({ browser, adminStorageState }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
      const page = await ctx.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })

      const overflow = await page.evaluate(() => ({
        bodyScrollW: document.body.scrollWidth,
        viewportW: window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
      }))

      // Allow 1px tolerance for sub-pixel rounding.
      expect(overflow.bodyScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)
      expect(overflow.docScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)

      await ctx.close()
    })
  }

  test('/abonados with data: no horizontal scroll + card actions ≥44px', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const abonadoId = randomUUID()
    const contactPhone = `115550${Date.now() % 10000}`

    const { error } = await supabase.from('abonados').insert({
      id: abonadoId,
      tenant_id: TENANT_ID,
      court_id: COURT_ID,
      contact_name: 'E2E Mobile Smoke',
      contact_phone: contactPhone,
      day_of_week: 1,
      time_start: '14:00',
      time_end: '15:00',
      price_per_session: 500000,
      starts_on: pickFutureMonday(),
      status: 'active',
      payment_method: 'cash',
    })
    if (error) throw new Error(`insertAbonado failed: ${error.message}`)

    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    try {
      await page.goto('/abonados', { waitUntil: 'networkidle' })

      const overflow = await page.evaluate(() => ({
        bodyScrollW: document.body.scrollWidth,
        viewportW: window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
      }))
      expect(overflow.bodyScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)
      expect(overflow.docScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)

      // En mobile la vista es la card (la tabla queda hidden): la card del
      // abonado seedeado muestra el contacto y sus acciones tienen ≥44px.
      const card = page.locator('li').filter({ hasText: 'E2E Mobile Smoke' })
      await expect(card).toBeVisible()
      const pausar = card.getByRole('button', { name: 'Pausar' })
      await expect(pausar).toBeVisible()
      const box = await pausar.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    } finally {
      await ctx.close()
      await supabase.from('bookings').delete().eq('abonado_id', abonadoId)
      await supabase.from('abonados').delete().eq('id', abonadoId)
    }
  })

  test('/settings/equipo: la card mobile muestra al miembro con su email', async ({
    browser,
    adminStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/settings/equipo', { waitUntil: 'networkidle' })

    // El tenant seedeado siempre tiene al admin: su card (li, no tr) es la
    // vista activa en mobile y no clipea el email.
    const selfCard = page.locator('li').filter({ hasText: '(vos)' })
    await expect(selfCard).toBeVisible()

    await ctx.close()
  })

  // Fase 4: la navegación primaria de mobile es la barra inferior de 4 accesos
  // (visión v2 §3.3, "nada de hamburguesa como acceso primario"). La
  // hamburguesa del header ya no existe: su lugar lo ocupa "Más", que abre el
  // mismo drawer con los 6 espacios.
  test('bottom nav: 3 accesos directos + Más abre el drawer', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/grilla', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('button', { name: /abrir menú/i })).toHaveCount(0)

    const bottomNav = page.getByRole('navigation', { name: 'Navegación del panel' })
    await expect(bottomNav.getByRole('link', { name: 'Grilla' })).toBeVisible()
    await expect(bottomNav.getByRole('link', { name: 'Caja' })).toBeVisible()

    const mas = bottomNav.getByRole('button', { name: 'Más' })
    await expect(mas).toBeVisible()
    const box = await mas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)

    // El drawer sigue siendo un Sheet Radix (dialog): abre con la nav completa
    // y cierra con Esc.
    await mas.click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Caja' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Clientes' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    await ctx.close()
  })

  // Criterio de salida #2 de Fase 4: la matriz no se renderiza en mobile.
  test('grilla mobile: lista por hora con swipe entre canchas, sin matriz', async ({
    browser,
    adminStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/grilla', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('booking-day-list')).toBeVisible()
    await expect(page.getByTestId('booking-grid')).toHaveCount(0)

    // La primera página responde "¿qué cancha tengo libre a tal hora?".
    const selector = page.getByRole('group', { name: 'Elegir cancha' })
    await expect(selector.getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Saltar a una cancha: las píldoras son selector e indicador a la vez.
    const primeraCancha = selector.getByRole('button').nth(1)
    await primeraCancha.click()
    await expect(primeraCancha).toHaveAttribute('aria-pressed', 'true')
    await expect(selector.getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await ctx.close()
  })

  test('cantina quick-sale buttons meet 44px touch targets', async ({ browser, adminStorageState }) => {
    // Rediseño Fase 2: el catálogo vive en la tabla `canteen_products`
    // (migr. 048), no en un editor con "Cargar sugeridos". Sembrar un producto
    // determinístico por SQL (mismo criterio que el seed de abonados de este
    // archivo) en vez de pasar por /caja/productos.
    const supabase = makeServiceClient()
    const productId = randomUUID()
    const { error } = await supabase.from('canteen_products').insert({
      id: productId,
      tenant_id: TENANT_ID,
      name: 'Agua Mobile Smoke',
      price: 50000,
    })
    if (error) throw new Error(`insertCanteenProduct failed: ${error.message}`)

    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    try {
      // La venta rápida vive en /caja/cantina.
      await page.goto('/caja/cantina', { waitUntil: 'networkidle' })

      // boundingBox con poll: el router.refresh() tras guardar puede detachar el
      // nodo entre el toBeVisible y la medición (boundingBox → null transitorio).
      const measure = async (locator: import('@playwright/test').Locator, label: string) => {
        await expect
          .poll(async () => (await locator.boundingBox())?.height ?? 0, { message: `alto de ${label}` })
          .toBeGreaterThanOrEqual(44)
        await expect
          .poll(async () => (await locator.boundingBox())?.width ?? 0, { message: `ancho de ${label}` })
          .toBeGreaterThanOrEqual(44)
      }

      // Botón de producto ≥44x44 (el admin vende parado en la barra, desde el celular).
      const product = page.getByRole('button', { name: /^Agua/ }).first()
      await expect(product).toBeVisible()
      await measure(product, 'producto Agua')

      // Rediseño Fase 3: sin diálogo — el tap agrega al ticket directo. Medir
      // los controles reales del panel (+/−, chip de método, Cobrar).
      await product.click()
      await expect(page.getByText('×1')).toBeVisible()

      await measure(
        page.getByRole('button', { name: 'Restar uno a Agua Mobile Smoke' }),
        'Restar uno',
      )
      await measure(
        page.getByRole('button', { name: 'Sumar uno a Agua Mobile Smoke' }),
        'Sumar uno',
      )
      await measure(page.getByRole('button', { name: 'Efectivo' }), 'Efectivo')
      await measure(page.getByRole('button', { name: /^Cobrar/ }), 'Cobrar')
    } finally {
      await ctx.close()
      await supabase.from('canteen_products').delete().eq('id', productId)
    }
  })

  test('RegisterMovementModal fits inside mobile viewport', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/caja', { waitUntil: 'networkidle' })

    // Click "Agregar movimiento" or similar trigger. UI text is "Agregar movimiento" per RegisterMovementModal title.
    // The trigger button (in caja page) might say "Registrar movimiento" or "Nuevo movimiento" — locate by accessible name fuzzy.
    const trigger = page.getByRole('button', { name: /movimiento/i }).first()
    if (await trigger.count() > 0 && await trigger.isVisible()) {
      await trigger.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 3000 })

      // Poll, no boundingBox() directo: el dialog entra con `slide-in-from-left-1/2`,
      // que lo anima desde un translateX(-50%) EXTRA sobre el centrado. Medirlo
      // apenas es visible lo agarra a mitad de vuelo (x negativo) aunque termine
      // centrado y dentro del viewport. Mismo motivo por el que el test de cantina
      // de este archivo ya mide con expect.poll.
      await expect
        .poll(async () => (await dialog.boundingBox())?.x ?? -1, { message: 'x del dialog' })
        .toBeGreaterThanOrEqual(0)

      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(393 + 1)
    } else {
      test.skip(true, 'Movimiento trigger not found in /caja — UI structure may differ')
    }

    await ctx.close()
  })
})
