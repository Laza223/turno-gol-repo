import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lo mínimo que este adaptador necesita del cookie store de Next. Tenerlo
 * estructural (y no `ReadonlyRequestCookies`) es lo que permite testear
 * `cookieAdapter` sin montar `next/headers`.
 */
type CookieStore = {
  getAll(): { name: string; value: string }[]
  set(cookie: { name: string; value: string } & Record<string, unknown>): void
}

type CookieToSet = {
  name: string
  value: string
  options?: Record<string, unknown>
}

/**
 * Adaptador de cookies para `@supabase/ssr`, en su interfaz de LOTE
 * (`getAll`/`setAll`).
 *
 * Por qué en lote y no cookie por cookie: la sesión no entra en una sola
 * cookie, viaja partida en `sb-<ref>-auth-token.0`, `.1`, … Con la interfaz
 * vieja (`get`/`set`/`remove`) la librería nunca veía el estado completo, así
 * que al guardar una sesión que ocupaba MENOS fragmentos que la anterior
 * dejaba un `.N` huérfano; al leer, los concatenaba y armaba un JSON corrupto.
 * Ese es el bug de producción del 2026-09-04: el login autenticaba y el
 * navegador rebotaba a un `/login` en blanco.
 * Detalle: docs/decisions/2026-09-04-sesion-supabase-ssr.md
 *
 * Con `setAll`, el lote incluye los fragmentos sobrantes con `maxAge: 0` —
 * la librería los deduce comparando contra lo que devolvió `getAll` — y así
 * quedan podados en la misma respuesta.
 *
 * Exportado para `tests/unit/supabase-cookie-adapter.test.ts`: es la pieza que
 * hasta ahora ningún test tocaba (todos mockeaban el módulo entero).
 */
export function cookieAdapter(store: CookieStore) {
  return {
    getAll(): { name: string; value: string }[] {
      return store.getAll()
    },
    setAll(cookiesToSet: CookieToSet[]): void {
      // El try envuelve el LOTE ENTERO, no cada cookie. Si la primera
      // escritura tira, no se escribe ninguna y la sesión anterior queda
      // intacta; la interfaz vieja (un try por cookie) permitía escribir el
      // `.0` y fallar en el `.1`, dejando media credencial que parsea como
      // cookie válida pero no como token.
      try {
        for (const { name, value, options } of cookiesToSet) {
          store.set({ name, value, ...options })
        }
      } catch {
        // Los Server Components no pueden escribir cookies. Cuando esto pasa
        // el token renovado se pierde, y con `enable_refresh_token_rotation`
        // el viejo ya quedó invalidado del lado de GoTrue: la sesión muere.
        // Por eso EXISTE el refresco en middleware (src/lib/supabase/middleware.ts),
        // el único contexto que puede escribir cookies para una ruta de UI.
        // En Server Actions y Route Handlers este catch nunca se dispara.
      }
    },
  }
}

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
  return createSSRClient(url, anon, { cookies: cookieAdapter(cookieStore) })
}
