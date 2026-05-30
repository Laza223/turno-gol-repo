import { test as base } from '@playwright/test'
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
}

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
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
})

export { expect } from '@playwright/test'
