import { test as base } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const ADMIN_EMAIL = 'e2e-admin@turnogol.test'
const PLAYER_EMAIL = 'e2e-player@turnogol.test'

type StorageState = {
  cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: 'Lax' | 'Strict' | 'None'
  }>
  origins: never[]
}

/**
 * Mint a real Supabase session for `email` and serialize it into the exact
 * @supabase/ssr cookie format the app's server client reads.
 *
 * The app uses @supabase/ssr (PKCE). Following an admin-generated magic link
 * can't establish app cookies (no PKCE verifier), so instead we:
 *   1. admin.generateLink → hashed OTP token (no email needed)
 *   2. anon.verifyOtp(token_hash) → a valid access/refresh token pair
 *   3. createServerClient(...).setSession() with a cookie jar → SSR cookies
 * Using the same lib to write the cookies makes the format version-proof.
 */
async function buildStorageState(email: string): Promise<StorageState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY required for E2E fixtures')
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? 'no hashed_token'}`)
  }

  const anonClient = createClient(url, anon, { auth: { persistSession: false } })
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr || !otpData.session) {
    throw new Error(`verifyOtp failed: ${otpErr?.message ?? 'no session'}`)
  }
  const { access_token, refresh_token } = otpData.session

  const jar: StorageState['cookies'] = []
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
        // no-op
      },
    },
  })
  await ssr.auth.setSession({ access_token, refresh_token })

  if (jar.length === 0) {
    throw new Error('setSession produced no cookies')
  }
  return { cookies: jar, origins: [] }
}

type WorkerFixtures = {
  adminStorageState: string
  playerStorageState: string
}

export const test = base.extend<NonNullable<unknown>, WorkerFixtures>({
  adminStorageState: [async ({}, use) => {
    await use(JSON.stringify(await buildStorageState(ADMIN_EMAIL)))
  }, { scope: 'worker' }],
  playerStorageState: [async ({}, use) => {
    await use(JSON.stringify(await buildStorageState(PLAYER_EMAIL)))
  }, { scope: 'worker' }],
})

export { expect } from '@playwright/test'
