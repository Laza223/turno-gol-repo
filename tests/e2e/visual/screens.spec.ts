/**
 * Regresión visual — 6 pantallas de escritorio (1440×900).
 *
 * Esto NO es un test de comportamiento: es un canario de layout. Ataja la clase
 * de regresión que hoy no cubre nada más — un cambio en globals.css, en un token
 * de Tailwind o en una fuente que rompe una pantalla que no abriste en semanas.
 * Cualquier cosa que se pueda afirmar con un assert de texto va en un spec
 * funcional, no acá.
 *
 * Las baselines se generan SOLO en Linux/CI (workflow visual-baseline.yml).
 * Ver docs/testing/VISUAL_REGRESSION.md.
 */

import {
  test,
  expect,
  assertDevOverlayHookExists,
  suppressPushBanner,
  waitForDayTotal,
  ADMIN_STORAGE_STATE,
} from './_visual-test'
import { FROZEN_NOW, VISUAL_DATE, VISUAL_TENANT_SLUG, seedVisualData } from './_seed'

test.describe('visual — público', () => {
  test('login @visual', async ({ page }) => {
    await suppressPushBanner(page)
    await page.goto('/login')
    // El canario perfecto: cero datos, cero fechas, cero auth. Si se rompe un
    // token de diseño, una fuente de next/font o el CSS base, esta foto lo grita
    // y no hay otra explicación posible.
    await expect(page.getByRole('button').first()).toBeVisible()
    // Único llamado de la suite: verifica que los selectores de screenshot.css
    // sigan matcheando el overlay de dev de Next. Ver _visual-test.ts.
    await assertDevOverlayHookExists(page)
    await expect(page).toHaveScreenshot('login.png')
  })

  test('landing @visual', async ({ page }) => {
    await suppressPushBanner(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    // viewport-only (el default de toHaveScreenshot): la landing es larguísima y
    // un cambio abajo de todo no debería romper la foto del hero.
    await expect(page).toHaveScreenshot('landing.png', {
      // El campo FECHA arranca prellenado con HOY (ART), así que caduca solo:
      // la baseline de julio traía "29/07/2026" y en agosto decía otra cosa.
      //
      // El intento anterior fue `page.clock.setFixedTime(FROZEN_NOW)`, y ese
      // remedio era peor: congela el reloj del BROWSER y no el del servidor, o
      // sea que garantizaba un "Hydration failed … text didn't match" en cada
      // corrida y fotografiaba un árbol REGENERADO en el cliente. Peor todavía,
      // ese error tapaba en el log cualquier mismatch de verdad. Se enmascara el
      // control y listo: la foto deja de depender del día sin mentirle a React.
      mask: [page.locator('#hero-date')],
    })
  })

  test('ficha pública del complejo @visual', async ({ page }) => {
    await suppressPushBanner(page)
    await page.goto(`/${VISUAL_TENANT_SLUG}`)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page).toHaveScreenshot('perfil-publico.png', {
      mask: [
        // La grilla de disponibilidad se clampea a [hoy, hoy + anticipación] en
        // el cliente Y en el servidor: es "ahora"-relativa por diseño y no hay
        // fecha fija que la estabilice. Se enmascara ese bloque; el resto de la
        // ficha (hero, canchas, precios, info) sí es determinista y es lo que
        // esta foto vigila.
        //
        // Anclado al aria-label que el componente YA tiene, no a un data-testid
        // nuevo: no obliga a tocar el componente, y se rompe ruidosamente si
        // alguien le saca la accesibilidad a ese bloque.
        page.getByRole('region', { name: 'Grilla de disponibilidad' }),
      ],
    })
  })
})

test.describe('visual — admin', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test.beforeAll(async () => {
    await seedVisualData()
  })

  test('grilla del día @visual', async ({ page }) => {
    await suppressPushBanner(page)
    // Congela el reloj del BROWSER: afecta useArtNow y ExpiryCountdown, que sí
    // leen Date.now() en el cliente. NO afecta lo que renderiza el servidor —
    // para eso está VISUAL_DATE en la URL.
    await page.clock.setFixedTime(FROZEN_NOW)

    // Fecha pinneada ⇒ artNow.date !== date ⇒ useNowLine devuelve null ⇒ la
    // línea roja de "ahora", el elemento más móvil de la pantalla, no se dibuja.
    await page.goto(`/grilla?date=${VISUAL_DATE}`)
    await expect(page.getByText('Martina Sosa')).toBeVisible()
    await expect(page.getByText('Equipo Los Pinos')).toBeVisible()
    await waitForDayTotal(page)

    await expect(page).toHaveScreenshot('admin-grilla.png')
  })

  test('canchas @visual', async ({ page }) => {
    await suppressPushBanner(page)
    // '/canchas' es un redirect permanente a '/settings/canchas' (ver su
    // page.tsx) — navegar directo a la URL canónica, igual que
    // canchas-crud.spec.ts. Ir por el redirect hace que este sea el PRIMER
    // hit a cualquier ruta de /settings/* en el proceso de `pnpm dev` de CI,
    // y el hop server-side a una ruta que Turbopack todavía no compiló 404ea
    // de forma determinística (y deja /settings/* roto para el resto de la
    // corrida — ver 'settings de reservas @visual' más abajo, mismo síntoma).
    await page.goto('/settings/canchas')
    await expect(page.getByText('Cancha E2E 1')).toBeVisible()
    await waitForDayTotal(page)
    // Shell de lista del admin: si se rompe, se rompen también /staff,
    // /jugadores y /abonados.
    await expect(page).toHaveScreenshot('admin-canchas.png')
  })

  test('settings de reservas @visual', async ({ page }) => {
    await suppressPushBanner(page)
    await page.goto('/settings/reservas')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await waitForDayTotal(page)
    // Formulario denso (switches, inputs numéricos, help text, botón sticky):
    // representa a todos los formularios del producto.
    await expect(page).toHaveScreenshot('admin-settings-reservas.png')
  })
})
