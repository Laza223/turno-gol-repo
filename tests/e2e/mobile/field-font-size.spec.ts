/**
 * E2E mobile — piso de 16px en campos de entrada.
 *
 * iOS WebKit hace zoom automático al enfocar cualquier campo con font-size
 * computado < 16px, y ese zoom arrastra scroll horizontal. En iPhone todos los
 * navegadores son WebKit (Chrome iOS incluido), así que aplica siempre.
 *
 * Este spec mide `getComputedStyle().fontSize`, no el zoom: el WebKit de
 * Playwright NO implementa el auto-zoom-on-focus (es de UIKit/Mobile Safari,
 * no del motor de render), así que ninguna suite automatizada puede probar la
 * ausencia del síntoma. Lo que sí es verificable —y en cualquier motor— es la
 * causa. Por eso este test corre igual de bien en mobile-chrome que en
 * mobile-safari, y no obliga a meter WebKit en el gate de PR.
 *
 * El bug original vivía en `ui/input.tsx` (`text-sm` = 14px) y en ~15 constantes
 * de campo. La fase F10 lo dejó pasar porque validó mobile solo con Chromium
 * emulando Pixel 5. Ver MASTER.md §3.1.
 */

import { test, expect } from '../fixtures'
import { collectSmallFields, formatSmallFields } from './_helpers'

const PUBLIC_ROUTES = [
  '/',
  '/explorar',
  '/explorar?q=demo',
  '/e2e-complejo-demo',
  '/e2e-complejo-demo/disponibilidad',
  '/login',
  '/ingresar',
  '/register',
]

const ADMIN_ROUTES = [
  '/grilla',
  '/caja',
  '/caja/cantina',
  '/caja/productos',
  '/reservas',
  '/jugadores',
  '/abonados/nuevo',
  '/settings/horarios',
  '/settings/reservas',
]

const PLAYER_ROUTES = ['/mis-reservas', '/perfil']

test.describe('campos ≥16px — rutas públicas', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      const small = await collectSmallFields(page)
      expect(small, small.length ? formatSmallFields(route, small) : undefined).toEqual([])
    })
  }
})

test.describe('campos ≥16px — admin', () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route}`, async ({ browser, adminStorageState }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
      const page = await ctx.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })
      const small = await collectSmallFields(page)
      expect(small, small.length ? formatSmallFields(route, small) : undefined).toEqual([])
      await ctx.close()
    })
  }
})

test.describe('campos ≥16px — jugador', () => {
  for (const route of PLAYER_ROUTES) {
    test(`${route}`, async ({ browser, playerStorageState }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
      const page = await ctx.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })
      const small = await collectSmallFields(page)
      expect(small, small.length ? formatSmallFields(route, small) : undefined).toEqual([])
      await ctx.close()
    })
  }
})

/**
 * La mitad que más importa: los formularios de la app viven dentro de modales,
 * y un probe estático no ve nada de lo que está detrás de un `open`. Sin esta
 * sección el guard tendría un agujero del tamaño de todos los formularios.
 */
test.describe('campos ≥16px — con overlays abiertos', () => {
  test('/grilla — modal de nueva reserva', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/grilla', { waitUntil: 'networkidle' })

    // Un slot libre abre el modal de creación (BookingFormModal).
    await page.getByRole('button', { name: /libre/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const small = await collectSmallFields(page)
    expect(
      small,
      small.length ? formatSmallFields('/grilla + BookingFormModal', small) : undefined,
    ).toEqual([])
    await ctx.close()
  })

  test('/caja — modal de registrar movimiento', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/caja', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: /movimiento/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const small = await collectSmallFields(page)
    expect(
      small,
      small.length ? formatSmallFields('/caja + RegisterMovementModal', small) : undefined,
    ).toEqual([])
    await ctx.close()
  })
})
