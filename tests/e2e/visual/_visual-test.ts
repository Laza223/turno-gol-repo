/**
 * Base común de los specs visuales.
 *
 * Por qué NO se usa `browser.newContext({ storageState })` como el resto de los
 * specs del repo: un contexto creado a mano NO hereda el `use` del project, así
 * que se perderían viewport, deviceScaleFactor, colorScheme, locale, timezoneId
 * y reducedMotion — exactamente las seis cosas de las que depende que un pixel
 * sea reproducible. Acá se usa el fixture `page` y se declara el storageState
 * por PATH con `test.use()`, que sí compone con el project.
 *
 * El path del storageState es el que escribe tests/e2e/global-setup.ts.
 */

import { test as base, expect, type Page } from '@playwright/test'

export const ADMIN_STORAGE_STATE = 'tests/e2e/.auth/admin.json'

export const test = base

export { expect }

/**
 * El banner de notificaciones es `fixed bottom-left z-40` y aparece por tiempo:
 * sin esto entra en la foto de cualquier pantalla logueada, y encima de forma
 * intermitente. Mismo mecanismo que qa-happy-paths/_qa/session.ts.
 *
 * Hay que llamarlo ANTES del primer goto.
 */
export async function suppressPushBanner(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    localStorage.setItem('turnogol:notif-banner-dismissed-at', String(Date.now()))
  })
}

/**
 * El chrome del dev server NO se enmascara: se oculta con CSS al momento de la
 * foto, vía `expect.toHaveScreenshot.stylePath` → `screenshot.css`. Un `mask`
 * pinta una caja magenta en vez de ocultar, y esa caja valía 1.09% de una foto
 * mobile — sola, por encima del `maxDiffPixelRatio: 0.01`. El racional completo
 * está en `tests/e2e/visual/screenshot.css`.
 *
 * Canario del contrato con Next: `screenshot.css` apunta a hooks del DOM que son
 * internos de Next (`[data-nextjs-dev-overlay]`, `nextjs-portal`). Si un bump los
 * renombra, el CSS deja de matchear en silencio y el overlay vuelve a entrar a
 * las fotos. Esta aserción lo convierte en un test rojo. Se llama una sola vez,
 * desde la foto `login` (la que ya es el canario de la suite).
 *
 * Corolario deliberado: si algún día las fotos se corren contra `next build` +
 * `next start` (sin overlay), esto se pone rojo — y ahí hay que revisar
 * `screenshot.css`, no borrar la aserción.
 */
export async function assertDevOverlayHookExists(page: Page): Promise<void> {
  await expect(
    page.locator('[data-nextjs-dev-overlay], nextjs-portal').first(),
    'El hook del overlay de dev de Next cambió de nombre: revisá los selectores de tests/e2e/visual/screenshot.css',
  ).toBeAttached()
}

/**
 * `DayTotalBadge` (barra lateral del admin, B14) pide `/api/admin/day-total` al
 * montar y pinta un esqueleto gris hasta que llega la respuesta. O sea que las
 * tres fotos de escritorio del admin tienen una carrera adentro: la regeneración
 * del 19/08 sacó `admin-canchas` y `admin-settings-reservas` con el número ya
 * resuelto ("$ 0") y `admin-grilla` con el esqueleto, en la MISMA corrida.
 * Congelar cualquiera de los dos estados deja la baseline decidida a cara o
 * ceca.
 *
 * Se espera al estado resuelto en vez de enmascarar el badge: el valor es
 * determinístico (el seed visual no mueve plata HOY, siempre "$ 0") y así el
 * componente sigue adentro del canario en lugar de quedar tapado por una caja.
 *
 * Ancla el `aria-label` que el componente ya distingue por estado
 * ("Cobrado hoy, cargando" vs "Cobrado hoy: $ 0. Ir a Caja"), no un
 * data-testid nuevo.
 */
export async function waitForDayTotal(page: Page): Promise<void> {
  await expect(page.getByLabel(/^Cobrado hoy: /)).toBeVisible({ timeout: 15_000 })
}
