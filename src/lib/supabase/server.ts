import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

// Async desde Next 16: `cookies()` devuelve una Promise y el acceso síncrono se
// removió. El codemod había dejado un cast a `UnsafeUnwrappedCookies`, que
// compila pero explota en runtime (llamaría .get() sobre la Promise).
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required')
  }
  return createSSRClient(url, anon, {
    cookies: {
      get(name: string): string | undefined {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions): void {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Server Components can't set cookies; ignored when called from RSC.
        }
      },
      remove(name: string, options: CookieOptions): void {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // Same as above.
        }
      },
    },
  })
}
