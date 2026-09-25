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

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
  /**
   * El rail del panel (`admin-sidebar`) se despliega con hover a 224 px, encima del
   * contenido. El cursor de Playwright arranca en (0,0), arriba del rail, y Chromium
   * lo vuelve a apoyar ahí después de cada scroll: el rail se abría solo y tapaba lo
   * que hubiera entre x=72 y x=224 ("Cobrar seña" en `/reservas/[id]`). Cada página
   * nueva arranca con el cursor en el borde derecho, lejos del rail — también las de
   * los contextos que arma cada spec con `browser.newContext()`.
   */
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser)
      const parked = new Proxy(browser, {
        get(target, prop) {
          if (prop === 'newContext') {
            return async (...args: Parameters<Browser['newContext']>) => {
              const context = await newContext(...args)
              context.on('page', (page) => {
                const size = page.viewportSize() ?? { width: 1280, height: 720 }
                void page.mouse.move(size.width - 1, Math.round(size.height / 2)).catch(() => {})
              })
              return context
            }
          }
          const value: unknown = Reflect.get(target, prop, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      await use(parked)
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
