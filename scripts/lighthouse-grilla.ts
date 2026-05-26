/**
 * lighthouse-grilla.ts
 *
 * Bootstrap for running Lighthouse (mobile) against the authenticated /grilla
 * route. Implements F3 done-criteria #4: Performance ≥ 90 for the main admin
 * view (requires a logged-in admin + seeded DB + prod build + running server).
 *
 * Usage:
 *   pnpm lighthouse:grilla
 *
 * Prerequisites (must be done BEFORE this script runs):
 *   1. pnpm build          — Next.js production build
 *   2. pnpm e2e:seed       — seeds E2E tenant + admin user in Supabase
 *   3. pnpm start          — serve on :3000 (in another terminal / background)
 *
 * How authentication works:
 *   1. Mints a real Supabase SSR session for e2e-admin@turnogol.test using the
 *      same technique as tests/e2e/fixtures.ts: admin.generateLink → verifyOtp
 *      → createServerClient.setSession() → cookie jar.
 *   2. Writes the cookie jar to a temp JSON file.
 *   3. Sets LHCI_GRILLA_COOKIES_FILE so scripts/lhci-grilla-puppeteer.js can
 *      inject the cookies into the Puppeteer page before each LHCI navigation.
 *   4. Shells out: lhci collect --config=lighthouserc.grilla.json
 *                  lhci assert  --config=lighthouserc.grilla.json
 *
 * Windows EPERM note (inherited from F0):
 *   chrome-launcher may throw EPERM on temp-dir cleanup on Windows. The LHR
 *   data IS saved before cleanup. The error is cosmetic; scores are valid.
 */

import { config } from 'dotenv'
// Standalone scripts don't get Next.js .env.local loading.
config({ path: '.env.local' })

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const ADMIN_EMAIL = 'e2e-admin@turnogol.test'

// ---------------------------------------------------------------------------
// Cookie type — mirrors the shape createServerClient produces (same as
// StorageState['cookies'] in tests/e2e/fixtures.ts, but inlined here so this
// script has no import dependency on Playwright).
// ---------------------------------------------------------------------------
type SessionCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

/**
 * Mint a real @supabase/ssr session for `email`.
 * Reuses the exact technique from tests/e2e/fixtures.ts:
 *   admin.generateLink → verifyOtp → createServerClient.setSession → cookie jar
 */
async function mintAdminCookies(email: string): Promise<SessionCookie[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon || !serviceKey) {
    throw new Error(
      'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  // Step 1: generate a magic-link token (no email sent — just the hash)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? 'no hashed_token'}`)
  }

  // Step 2: exchange the token hash for a real session
  const anonClient = createClient(url, anon, { auth: { persistSession: false } })
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr || !otpData.session) {
    throw new Error(`verifyOtp failed: ${otpErr?.message ?? 'no session'}`)
  }
  const { access_token, refresh_token } = otpData.session

  // Step 3: setSession through a @supabase/ssr client to produce SSR cookies
  // in exactly the format the app's middleware expects.
  const jar: SessionCookie[] = []
  const ssr = createServerClient(url, anon, {
    cookies: {
      get(): string | undefined {
        return undefined
      },
      set(name: string, value: string, _options: CookieOptions): void {
        jar.push({
          name,
          value,
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        })
      },
      remove(): void {
        // no-op for minting purposes
      },
    },
  })
  await ssr.auth.setSession({ access_token, refresh_token })

  if (jar.length === 0) {
    throw new Error('setSession produced no cookies — session may not have been established')
  }

  return jar
}

/**
 * Run an lhci sub-command, forwarding stdio.
 * Returns the exit code (0 = success).
 */
function lhci(subcommand: string, configPath: string, env: NodeJS.ProcessEnv): number {
  const cmd = `pnpm lhci ${subcommand} --config=${configPath}`
  console.log(`\n> ${cmd}\n`)
  try {
    execSync(cmd, { stdio: 'inherit', env })
    return 0
  } catch (err) {
    // execSync throws on non-zero exit; extract the code if available
    const code = (err as NodeJS.ErrnoException & { status?: number }).status ?? 1
    return code
  }
}

async function main(): Promise<void> {
  console.log('=== TurnoGol Lighthouse F03: authenticated /grilla ===\n')

  // -------------------------------------------------------------------------
  // 1. Mint admin session cookies
  // -------------------------------------------------------------------------
  console.log(`Minting admin session for ${ADMIN_EMAIL}…`)
  const cookies = await mintAdminCookies(ADMIN_EMAIL)
  console.log(`  ${cookies.length} SSR cookie(s) obtained: ${cookies.map((c) => c.name).join(', ')}`)

  // -------------------------------------------------------------------------
  // 2. Write cookies to a temp file for the puppeteerScript to read
  // -------------------------------------------------------------------------
  const tmpDir = tmpdir()
  mkdirSync(tmpDir, { recursive: true })
  const cookiesFile = join(tmpDir, `lhci-grilla-cookies-${Date.now()}.json`)
  writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2), 'utf-8')
  console.log(`  Cookie jar written to: ${cookiesFile}`)

  // -------------------------------------------------------------------------
  // 3. Run LHCI collect + assert
  //    Pass the cookie file path via env var so the puppeteerScript can pick it up.
  // -------------------------------------------------------------------------
  const lhciEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LHCI_GRILLA_COOKIES_FILE: cookiesFile,
  }

  const configPath = './lighthouserc.grilla.json'

  let collectCode: number
  let assertCode: number

  try {
    collectCode = lhci('collect', configPath, lhciEnv)

    // Windows EPERM note: chrome-launcher may throw EPERM on Chrome temp-dir
    // cleanup. The LHR IS saved before cleanup. A non-zero collect exit from
    // EPERM alone is cosmetic — assert will still have data to check.
    if (collectCode !== 0) {
      console.warn(`\n[WARN] lhci collect exited with code ${collectCode}.`)
      console.warn('On Windows with Chrome 148 this may be a cosmetic EPERM from chrome-launcher.')
      console.warn('Proceeding to assert — LHR data should still be present.\n')
    }

    assertCode = lhci('assert', configPath, lhciEnv)
  } finally {
    // -----------------------------------------------------------------------
    // 4. Clean up temp cookie file (contains session tokens — don't leave it)
    // -----------------------------------------------------------------------
    try {
      rmSync(cookiesFile)
      console.log(`\nCleaned up temp cookie file.`)
    } catch {
      console.warn(`[WARN] Could not remove temp cookie file: ${cookiesFile}`)
    }
  }

  // -------------------------------------------------------------------------
  // 5. Exit with meaningful code
  // -------------------------------------------------------------------------
  if (assertCode !== 0) {
    console.error(`\nlhci assert failed (exit ${assertCode}) — Performance score may be below 0.90`)
    process.exit(assertCode)
  }

  console.log('\nlhci assert passed — /grilla Performance ≥ 0.90')
}

main().catch((err: unknown) => {
  console.error('lighthouse-grilla fatal error:', err)
  process.exit(1)
})
