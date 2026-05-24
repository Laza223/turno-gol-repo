import { config } from 'dotenv'
config({ path: '.env.local' })

import { execSync } from 'node:child_process'

type Step = {
  name: string
  cmd?: () => void
  check?: () => Promise<boolean>
  fatal: boolean
}

const REQUIRED_ENV = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'PIN_COOKIE_SECRET',
  'RESEND_API_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_APP_URL',
] as const

function envCheck(): boolean {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`)
    return false
  }
  return true
}

async function statusCheck(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/status`)
    if (res.status !== 200) {
      console.error(`/api/status returned ${res.status}`)
      return false
    }
    const body = (await res.json()) as { status: string }
    return body.status === 'ok'
  } catch (e) {
    console.error(`/api/status fetch failed: ${(e as Error).message}`)
    return false
  }
}

const steps: Step[] = [
  { name: 'env vars present',          check: async () => envCheck(),                                                              fatal: true  },
  { name: 'typecheck',                 cmd:   () => execSync('pnpm typecheck',         { stdio: 'inherit' }),                       fatal: true  },
  { name: 'lint',                      cmd:   () => execSync('pnpm lint',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'unit tests',                cmd:   () => execSync('pnpm test',              { stdio: 'inherit' }),                       fatal: true  },
  { name: 'integration tests',         cmd:   () => execSync('pnpm test:integration',  { stdio: 'inherit' }),                       fatal: true  },
  { name: 'isolation tests',           cmd:   () => execSync('pnpm test:isolation',    { stdio: 'inherit' }),                       fatal: true  },
  { name: 'build',                     cmd:   () => execSync('pnpm build',             { stdio: 'inherit' }),                       fatal: true  },
  { name: 'e2e',                       cmd:   () => execSync('pnpm test:e2e:ci',       { stdio: 'inherit' }),                       fatal: true  },
  { name: 'stress (1 accepted)',       cmd:   () => execSync('pnpm stress:bookings',   { stdio: 'inherit' }),                       fatal: true  },
  { name: '/api/status healthy',       check: statusCheck,                                                                          fatal: false },
]

async function main(): Promise<void> {
  const failed: string[] = []
  for (const step of steps) {
    const t0 = Date.now()
    process.stdout.write(`▶ ${step.name}... `)
    try {
      if (step.cmd) step.cmd()
      else if (step.check) {
        const ok = await step.check()
        if (!ok) throw new Error('check returned false')
      }
      console.log(`OK (${Date.now() - t0}ms)`)
    } catch (e) {
      console.log('FAIL')
      console.error(`  ${(e as Error).message}`)
      failed.push(step.name)
      if (step.fatal) break
    }
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll launch checks passed.')
}

main()
