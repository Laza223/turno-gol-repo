import { test as base, type Browser } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const AUTH_DIR = path.resolve('./tests/e2e/.auth')

function loadStorageState(slug: string): string {
  const file = path.join(AUTH_DIR, `${slug}.json`)
  try {
    return readFileSync(file, 'utf-8')
  } catch (err) {
    throw new Error(
      `Storage state ${file} not found — global-setup may not have run. ` +
        `Cause: ${(err as Error).message}`,
    )
  }
}

type WorkerFixtures = {
  adminStorageState: string
  playerStorageState: string
  freshAdminStorageState: string
  secondAdminStorageState: string
  managerStorageState: string
}

/** Corre en la página (init script): no puede usar nada de este módulo. */
function pinRailCollapsed() {
  const css =
    'aside[class~="group/rail"]{width:72px!important;box-shadow:none!important}' +
    'aside[class~="group/rail"] [class*="group-hover/rail:max-w"]{max-width:0!important;opacity:0!important}'
  const inject = () => {
    if (document.getElementById('e2e-rail-pinned')) return
    const style = document.createElement('style')
    style.id = 'e2e-rail-pinned'
    style.textContent = css
    const parent = document.head ?? document.documentElement
    if (!parent) return
    parent.appendChild(style)
  }
  inject()
  document.addEventListener('DOMContentLoaded', inject)
}

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
  /**
   * El rail del panel (`admin-sidebar`) se despliega con hover a 224 px, encima del
   * contenido. En el CI (Chromium headless en Linux, sin cursor real) el rail se abre
   * solo al cargar la página, antes de hidratar, aunque el cursor de Playwright esté
   * del otro lado: queda tapando lo que haya entre x=72 y x=224 y el click no llega
   * ("Cobrar seña" en `/reservas/[id]`). Estacionar el cursor no alcanzó, así que
   * en los e2e el rail queda fijo en 72 px — ningún spec prueba el despliegue, que
   * vive en las stories de `admin-sidebar`. Aplica también a los contextos que arma
   * cada spec con `browser.newContext()`.
   */
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser)
      const pinned = new Proxy(browser, {
        get(target, prop) {
          if (prop === 'newContext') {
            return async (...args: Parameters<Browser['newContext']>) => {
              const context = await newContext(...args)
              await context.addInitScript(pinRailCollapsed)
              return context
            }
          }
          const value: unknown = Reflect.get(target, prop, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      await use(pinned)
    },
    { scope: 'worker' },
  ],
  adminStorageState: [
    async ({}, use) => {
      await use(loadStorageState('admin'))
    },
    { scope: 'worker' },
  ],
  playerStorageState: [
    async ({}, use) => {
      await use(loadStorageState('player'))
    },
    { scope: 'worker' },
  ],
  freshAdminStorageState: [
    async ({}, use) => {
      await use(loadStorageState('admin-fresh'))
    },
    { scope: 'worker' },
  ],
  secondAdminStorageState: [
    async ({}, use) => {
      await use(loadStorageState('admin-2'))
    },
    { scope: 'worker' },
  ],
  managerStorageState: [
    async ({}, use) => {
      await use(loadStorageState('manager'))
    },
    { scope: 'worker' },
  ],
})

export { expect } from '@playwright/test'
