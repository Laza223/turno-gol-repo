/**
 * E2E — "Hoy" (Fase 2 del contrato v2, docs/planning/2026-08-01-decisiones-de-fase-v2.md §3)
 *
 * Cubre lo que un test de integración no puede probar solo: que la pantalla
 * en vivo (Server Component real, sesión real) muestra el tablero de turnos +
 * los bloques de alertas y de "Mientras no estabas", que un turno sin cobrar
 * aparece en el tablero y abre el modal de cobro, y
 * que los guards de rol (el encargado ve Hoy pero no Métricas) funcionan de punta a punta — no solo a
 * nivel de función aislada (eso ya lo cubre tests/integration/home-service.test.ts
 * y tests/unit/staff-guards.test.ts / admin-sidebar.stories.tsx).
 *
 * "Turno sin cobrar" se siembra a las 05:00–06:00 en el mismo tenant/court/día
 * (HOY, no mañana) que reservas-crud.spec.ts — el único otro spec que también
 * siembra para HOY. Confirmado con grep que reservas-crud.spec.ts usa 10:00,
 * 12:00, 14:00, 16:00 y 06:00-07:00: 05:00-06:00 no choca con ninguno (la
 * revisión adversarial de Fase 2 encontró que el slot original, 06:00-07:00,
 * SÍ coincidía exacto con reservas-crud.spec.ts:358-359 — colisión real en
 * corridas locales multi-worker, no en CI porque ahí workers:1 serializa).
 */

import { formatInTimeZone } from 'date-fns-tz'
import { test, expect } from './fixtures'
import {
  makeServiceClient,
  insertBookingServiceRole,
  cleanupBookingsByIds,
} from './_helpers/booking-seed'

function todayDateIsoArt(): string {
  return formatInTimeZone(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd')
}

test.describe('Hoy (Fase 2) — pantalla del mostrador', () => {
  test('admin ve el tablero del día + "Mientras no estabas" @critical', async ({
    browser,
    adminStorageState,
  }) => {
    const context = await browser.newContext()
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      // Este assert decía "Cobrado hoy" / "Turnos de hoy" / "Deudas" y quedó
      // desactualizado en H010 (2026-09-10), cuando esas tarjetas salieron por
      // repetir lo que Caja muestra un click más allá: `e2e-tests` no corre en
      // pull requests, así que nadie lo vio ponerse rojo.
      // El `<h1>` es `sr-only` desde el rediseño del 2026-09-12 (el riel y la
      // barra superior nombran la vista), así que se aserta por texto y no por
      // visibilidad: `toBeVisible()` sobre un elemento de 1x1px no prueba nada.
      // Sin este assert nada en CI se entera si alguien lo borra — axe marca
      // `page-has-heading-one` como `moderate` y el helper de a11y sólo falla
      // con `critical`/`serious`.
      await expect(page.locator('h1')).toHaveText('Hoy')
      await expect(page.getByRole('heading', { name: 'Turnos de hoy' })).toBeVisible()
      await expect(page.getByText('Mientras no estabas')).toBeVisible()
      // "Necesita tu atención" sólo existe con alertas: vacío es una línea con
      // el copy del premio, que es el estado normal de un tenant de prueba.
      await expect(
        page
          .getByText('Nada pendiente. Sin señas rechazadas ni devoluciones por resolver.')
          .or(page.getByText('Necesita tu atención')),
      ).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('un turno sin cobrar aparece en el tablero y se cobra desde un modal, sin salir de Hoy', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const today = todayDateIsoArt()
    let bookingId: string | null = null
    const context = await browser.newContext()
    try {
      bookingId = await insertBookingServiceRole(supabase, {
        date: today,
        timeStart: '05:00:00',
        timeEnd: '06:00:00',
        status: 'completed',
        guestName: 'QA Hoy Turno Sin Cobrar',
      })

      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      // La fila es UN botón que abre el modal: no un link a /reservas/[id].
      const row = page.getByRole('button', { name: /QA Hoy Turno Sin Cobrar/ })
      await expect(row).toBeVisible({ timeout: 10_000 })
      await expect(row).toContainText('Cobrar')
      await expect(page.getByRole('link', { name: /QA Hoy Turno Sin Cobrar/ })).toHaveCount(0)

      await row.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('QA Hoy Turno Sin Cobrar')
      await expect(dialog).toContainText('Falta cobrar')
      // Las formas de cobrar, y el cobro con el monto adentro. No se cobra de verdad:
      // el cobro tocaría la caja del tenant de prueba y `e2e-tests` corre contra una
      // base compartida; el comportamiento del cobro lo fijan las stories del modal.
      await expect(dialog.getByRole('radio', { name: 'Por equipo' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: /^Cobrar \$/ })).toBeVisible()
      // Nada de navegar: sigue en Hoy.
      await expect(page).toHaveURL(/\/dashboard/)

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    } finally {
      await context.close()
      if (bookingId) await cleanupBookingsByIds(supabase, [bookingId])
    }
  })

  test('el encargado ve "Hoy", pero no "Métricas": /analiticas lo devuelve a /dashboard', async ({
    browser,
    managerStorageState,
  }) => {
    const context = await browser.newContext()
    try {
      await context.addCookies(JSON.parse(managerStorageState).cookies)
      const page = await context.newPage()
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      await expect(page).toHaveURL(/\/dashboard/)
      await expect(page.getByRole('link', { name: 'Hoy' }).first()).toBeVisible()
      // El tablero del mostrador es suyo; el checklist de arranque y el tour, del dueño.
      await expect(page.getByRole('heading', { name: 'Turnos de hoy' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Métricas' })).toHaveCount(0)

      await page.goto('/analiticas', { waitUntil: 'networkidle' })
      await expect(page).toHaveURL(/\/dashboard/)
    } finally {
      await context.close()
    }
  })
})
