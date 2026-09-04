import { existsSync } from 'node:fs'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Las claves de Supabase viven en .env.local (tests/setup.ts solo carga
// .env.test, que trae el DATABASE_URL). Mismo criterio que el harness e2e.
const envLocal = path.resolve(process.cwd(), '.env.local')
if (existsSync(envLocal)) loadEnv({ path: envLocal })

/**
 * Regresión del bug de sesión del 2026-09-04.
 *
 * La credencial de Supabase no entra en una sola cookie: viaja partida en
 * `sb-<ref>-auth-token.0`, `.1`, … Con la interfaz vieja (`get`/`set`/`remove`)
 * la librería nunca veía el estado completo, así que al guardar una sesión que
 * ocupaba MENOS fragmentos que la anterior dejaba un `.N` huérfano; al leer,
 * los concatenaba y armaba un JSON corrupto. En producción eso se veía como un
 * login que autenticaba y un navegador que volvía a un `/login` en blanco.
 *
 * Estos casos son lo que hoy NO existía: cero tests de fragmentos, cero de
 * cierre de sesión, cero de renovación.
 * Detalle: docs/decisions/2026-09-04-sesion-supabase-ssr.md
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

type Jar = Map<string, string>

/** Adaptador espejo del de producción (src/lib/supabase/server.ts), sobre un jar. */
function jarClient(jar: Jar) {
  return createServerClient(URL_!, ANON!, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          // Valor vacío = la librería está expirando un fragmento sobrante.
          if (value === '') jar.delete(name)
          else jar.set(name, value)
        }
      },
    },
  })
}

const EMAIL = `chunking-${Date.now()}@turnogol.test`
let userId: string | null = null

async function mintTokens(): Promise<{ access_token: string; refresh_token: string }> {
  const admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } })
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) throw new Error(`generateLink falló: ${linkErr?.message}`)

  const anonClient = createClient(URL_!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await anonClient.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
  if (error || !data.session) throw new Error(`verifyOtp falló: ${error?.message}`)
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
}

function authCookieNames(jar: Jar): string[] {
  return [...jar.keys()].filter((n) => n.includes('auth-token')).sort()
}

beforeAll(async () => {
  if (!URL_ || !ANON || !SERVICE) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY requeridas')
  }
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
    app_metadata: { is_player: true },
  })
  if (error) throw error
  userId = data.user?.id ?? null
}, 30_000)

afterAll(async () => {
  if (!userId || !URL_ || !SERVICE) return
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  await admin.auth.admin.deleteUser(userId)
})

describe('cookies de sesión partidas en fragmentos', () => {
  it('poda los fragmentos sobrantes de una sesión anterior', async () => {
    // EL test de regresión del bug: sembramos un `.9` huérfano y confirmamos
    // que después de guardar una sesión nueva ya no queda con valor.
    const jar: Jar = new Map()
    const tokens = await mintTokens()
    const client = jarClient(jar)
    await client.auth.setSession(tokens)

    const base = authCookieNames(jar)[0].replace(/\.\d+$/, '')
    jar.set(`${base}.9`, 'restos-de-una-sesion-anterior')

    const again = jarClient(jar)
    await again.auth.setSession(await mintTokens())

    expect(jar.get(`${base}.9`)).toBeUndefined()
  }, 45_000)

  it('un fragmento corrupto no rompe: la sesión se lee como ausente', async () => {
    // Antes, `combineChunks` concatenaba hasta el hueco y devolvía un JSON
    // roto, que es lo que dejaba al usuario trabado. Ahora degrada a "sin
    // sesión", que es recuperable con un login nuevo.
    const jar: Jar = new Map()
    const tokens = await mintTokens()
    await jarClient(jar).auth.setSession(tokens)

    const names = authCookieNames(jar)
    const base = names[0].replace(/\.\d+$/, '')
    for (const n of names) jar.delete(n)
    jar.set(`${base}.0`, 'basura-que-no-es-json')
    jar.set(`${base}.2`, 'mas-basura')

    const { data } = await jarClient(jar).auth.getUser()
    expect(data.user).toBeNull()
  }, 45_000)

  it('cerrar sesión deja el frasco sin cookies de auth', async () => {
    const jar: Jar = new Map()
    await jarClient(jar).auth.setSession(await mintTokens())
    expect(authCookieNames(jar).length).toBeGreaterThan(0)

    await jarClient(jar).auth.signOut()
    expect(authCookieNames(jar)).toEqual([])
  }, 45_000)

  it('renovar reemplaza las cookies, no las duplica', async () => {
    // Lo que mostraba la captura de DevTools del bug: dos `access_token`
    // conviviendo, de 3156 y 3215 bytes.
    const jar: Jar = new Map()
    await jarClient(jar).auth.setSession(await mintTokens())
    const before = authCookieNames(jar)

    const { error } = await jarClient(jar).auth.refreshSession()
    expect(error).toBeNull()

    const after = authCookieNames(jar)
    expect(after).toEqual(before)
    const withAccessToken = [...jar.values()].filter((v) => v.includes('access_token'))
    expect(withAccessToken.length).toBeLessThanOrEqual(1)
  }, 45_000)
})
