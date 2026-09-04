import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { captureMessage } from '@/lib/sentry'

// Un fallo sostenido de GoTrue haría caer TODAS las requests en el catch, así
// que se deduplica a un evento por ventana. Mismo patrón que el alerting de
// Upstash en src/shared/rate-limit/apply.ts:20-38: estado por isolate, que
// alcanza — una caída real aparece igual desde cada instancia.
const ALERT_COOLDOWN_MS = 60_000
let lastAlertAt = 0

function reportRefreshFailure(err: unknown): void {
  // El aviso NUNCA puede romper el refresco: se traga cualquier cosa que tire
  // Sentry. Pero el fallo no puede quedar mudo: un refresco que falla en
  // silencio es exactamente la clase de bug que este archivo vino a cerrar.
  try {
    const now = Date.now()
    if (now - lastAlertAt < ALERT_COOLDOWN_MS) return
    lastAlertAt = now
    captureMessage('Session refresh failed in middleware', {
      level: 'warning',
      extra: { error: err instanceof Error ? err.message : String(err) },
    })
  } catch {
    /* noop */
  }
}

/**
 * Renueva el par access/refresh token de Supabase y propaga las cookies nuevas.
 *
 * Por qué existe: `jwt_expiry` son 3600s y `enable_refresh_token_rotation` está
 * en true, así que cuando el access token vence, la primera lectura de sesión
 * dispara la rotación y GoTrue invalida el refresh token viejo en ese mismo
 * acto. Si la cookie nueva no se persiste, el navegador se queda con una
 * credencial ya muerta y la sesión no vuelve más: hay que loguearse de nuevo.
 * Los Server Components NO pueden escribir cookies (ver el catch de
 * `cookieAdapter` en ./server.ts), y son la puerta de todos los layouts, así
 * que el middleware es el único contexto que puede escribirlas para una ruta
 * de UI. Detalle: docs/decisions/2026-09-04-sesion-supabase-ssr.md
 *
 * Qué NO hace, a propósito: no lee roles, no autoriza, no redirige y nunca
 * falla hacia cerrado. Los layouts siguen siendo la única puerta. El peor caso
 * de un bug acá es volver al comportamiento previo, no dejar a nadie afuera.
 */
export async function refreshSessionCookies(
  req: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  let res = NextResponse.next({ request: { headers: requestHeaders } })

  // Interruptor de emergencia: apaga SOLO el refresco, conservando el resto del
  // middleware y el adaptador de cookies. Se activa con una variable de entorno
  // (redeploy del build existente, sin recompilar) porque el sistema de feature
  // flags del repo lee de la base y no es viable acá.
  if (process.env.SESSION_REFRESH_DISABLED === '1') return res

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return res

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // 1. Mutar el REQUEST. Sin esto, el Server Component de abajo lee la
        //    cookie vieja (ya vencida, con el refresh token invalidado por la
        //    rotación) y `extractRealAuthUser` devuelve null pese a que el
        //    refresco salió bien.
        //    Para los valores vacíos hay que BORRAR, no setear string vacío: un
        //    fragmento vacío se concatena igual al leer y reproduce el bug de
        //    credencial corrupta, movido de lugar.
        for (const { name, value } of cookiesToSet) {
          if (value === '') req.cookies.delete(name)
          else req.cookies.set(name, value)
        }
        requestHeaders.set(
          'cookie',
          req.cookies
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join('; '),
        )
        // 2. Rehacer la respuesta sobre el request ya mutado.
        res = NextResponse.next({ request: { headers: requestHeaders } })
        // 3. Set-Cookie al navegador. `options` trae maxAge:0 en los fragmentos
        //    sobrantes: acá es donde se podan los huérfanos de una sesión
        //    anterior.
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options)
        }
      },
    },
  })

  try {
    // Dispara la rotación si el access token venció. El resultado no se usa: la
    // identidad la resuelve el layout con `extractAuthUser`.
    await supabase.auth.getUser()
  } catch (err) {
    // Fail-open duro: GoTrue caído no puede tirar abajo el panel entero. La
    // request sigue con las cookies que haya y el layout decide como siempre.
    // Pero queda registrado: un refresco que falla siempre y en silencio es el
    // bug que estamos cerrando.
    reportRefreshFailure(err)
  }
  return res
}
