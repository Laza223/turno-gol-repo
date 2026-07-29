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
 * Chrome del dev server. Los e2e corren contra `pnpm dev`; `devIndicators` ya
 * está apagado en next.config.ts cuando NEXT_PUBLIC_E2E=1, pero el portal sigue
 * existiendo en el DOM y puede renderizar overlays de error/HMR. Enmascararlo es
 * la red de seguridad.
 */
export function devChrome(page: Page) {
  return [page.locator('nextjs-portal'), page.locator('[data-nextjs-toast]')]
}
