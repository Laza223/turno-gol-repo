import { execSync } from 'node:child_process'

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
  console.log('[e2e] ready')
}
