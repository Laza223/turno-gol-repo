import { test as base, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'e2e-admin@turnogol.test'
const PLAYER_EMAIL = 'e2e-player@turnogol.test'

async function buildStorageStateFor(
  email: string,
  next: string,
): Promise<Parameters<BrowserContext['storageState']>[0] extends infer T ? T : never> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env vars required for E2E fixtures')
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.E2E_BASE_URL ?? 'http://localhost:3000'}${next}` },
  })
  if (error || !data.properties?.action_link) {
    throw new Error(`generateLink failed: ${error?.message ?? 'no action_link'}`)
  }
  // The action_link points to Supabase's verify endpoint, which sets cookies and redirects.
  // We follow it once headlessly to capture the cookies.
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(data.properties.action_link)
  await page.waitForURL((url) => !url.toString().includes('verify'))
  const state = await ctx.storageState()
  await browser.close()
  return state as unknown as Parameters<BrowserContext['storageState']>[0]
}

type WorkerFixtures = {
  adminStorageState: string
  playerStorageState: string
}

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
  adminStorageState: [async ({}, use) => {
    const state = await buildStorageStateFor(ADMIN_EMAIL, '/dashboard')
    await use(JSON.stringify(state))
  }, { scope: 'worker' }],
  playerStorageState: [async ({}, use) => {
    const state = await buildStorageStateFor(PLAYER_EMAIL, '/')
    await use(JSON.stringify(state))
  }, { scope: 'worker' }],
})

export { expect } from '@playwright/test'
