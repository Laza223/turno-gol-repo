/**
 * E2E auth — build Playwright storage state for a seeded Supabase user.
 *
 * Mint de sesión AGNÓSTICO al método de login: solo establece cookies para un
 * usuario ya provisionado (lee su app_metadata). Sirve igual al staff (ahora
 * email+password) y al jugador (magic link); por eso se conserva tras la
 * migración de auth. El test del FORM de login con contraseña vive aparte
 * (admin-login.spec.ts), no acá.
 *
 * Extracted from fixtures.ts so global-setup can pre-generate storage states
 * serially BEFORE any worker spawns. The app uses @supabase/ssr (PKCE), so
 * following an admin-generated magic link can't establish app cookies
 * (no PKCE verifier). Instead:
 *   1. admin.generateLink → hashed OTP token (no email sent)
 *   2. anon.verifyOtp(token_hash) → access/refresh token pair
 *   3. createServerClient(...).setSession() with a cookie jar → SSR cookies
 *
 * Why serial pre-generation matters: admin.generateLink for the SAME email
 * invalidates any prior hashed_token. With workers running fixtures in
 * parallel, worker B's generateLink would invalidate worker A's token before
 * worker A's verifyOtp — producing "Email link is invalid or has expired".
 * Pre-generating once in globalSetup eliminates the race architecturally.
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export type StorageState = {
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

export async function buildStorageState(email: string): Promise<StorageState> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY required for E2E auth')
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink failed for ${email}: ${linkErr?.message ?? 'no hashed_token'}`)
  }

  const anonClient = createClient(url, anon, { auth: { persistSession: false } })
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr || !otpData.session) {
    throw new Error(`verifyOtp failed for ${email}: ${otpErr?.message ?? 'no session'}`)
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
    throw new Error(`setSession produced no cookies for ${email}`)
  }
  return { cookies: jar, origins: [] }
}
