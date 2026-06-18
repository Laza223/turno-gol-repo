import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildStorageState } from './_helpers/auth-state'

const AUTH_DIR = path.resolve('./tests/e2e/.auth')

// Slug → seeded email. Slugs match the fixture names in fixtures.ts.
const STORAGE_STATES = {
  admin: 'e2e-admin@turnogol.test',
  player: 'e2e-player@turnogol.test',
  'admin-fresh': 'e2e-admin-fresh@turnogol.test',
  'admin-2': 'e2e-admin-2@turnogol.test',
} as const

async function waitForHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Health check timeout: ${url}`)
}

export default async function globalSetup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
  console.log('[e2e] running seed-e2e...')
  execSync('pnpm e2e:seed', { stdio: 'inherit' })
  console.log(`[e2e] waiting for ${base}/api/status...`)
  await waitForHealth(`${base}/api/status`, 120_000)

  console.log('[e2e] pre-generating storage states (serial)...')
  await fs.mkdir(AUTH_DIR, { recursive: true })
  // Serial: admin.generateLink for the same email invalidates prior tokens,
  // so parallel calls would race. globalSetup runs once before any worker.
  // (El staff ya usa email+password, pero el mint de storage state sigue por
  // generateLink — agnóstico al login —, así que la serialización se mantiene.)
  for (const [slug, email] of Object.entries(STORAGE_STATES)) {
    const state = await buildStorageState(email)
    await fs.writeFile(path.join(AUTH_DIR, `${slug}.json`), JSON.stringify(state), 'utf-8')
    console.log(`[e2e] wrote ${slug}.json`)
  }
  console.log('[e2e] ready')
}
