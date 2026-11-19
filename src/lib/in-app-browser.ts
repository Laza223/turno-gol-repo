/**
 * ¿El User-Agent es el de un navegador interno de una app (Instagram, Facebook, TikTok…)?
 * Es donde cae el jugador que llega por un link de redes. Ahí Google rechaza el ingreso
 * (`disallowed_useragent`: no deja loguear en un WebView embebido), así que /ingresar y el ingreso
 * de /reservar ponen primero el email y, en lugar del botón de Google que inicia el ingreso,
 * `InAppBrowserNotice`: uno que abre la página en el navegador del teléfono (`externalBrowserUrl`).
 *
 * Es una heurística sobre el UA: las marcas de las apps conocidas y el `wv` de Android System
 * WebView, que alcanza a las demás apps de Android. Un falso negativo deja el botón de Google
 * arriba dentro de un WebView, donde termina en el error de Google: por eso la lista es generosa.
 * Un falso positivo solo esconde Google (el email sigue). No detecta a los que abren el link en el
 * navegador del sistema (WhatsApp; ahí Google anda) ni a un WKWebView de iPhone sin marca conocida.
 * Chrome, Custom Tabs, Safari y SFSafariViewController llevan el UA del navegador y no matchean.
 * Puro: se evalúa en el servidor con el header, para que el orden no cambie al hidratar.
 */
const IN_APP_UA =
  /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|LinkedInApp|\bLine\/|Snapchat|Pinterest|; wv\)/i

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return userAgent != null && IN_APP_UA.test(userAgent)
}

/**
 * La URL que, tocada desde un navegador interno, le pide al teléfono abrir `href` en el navegador
 * predeterminado. No hay API oficial: son esquemas que cada plataforma o app acepta (o deja de
 * aceptar sin avisar), así que quien la use no puede depender de que ande: el email tiene que
 * seguir a la vista.
 * - Instagram en iPhone: `instagram://extbrowser/`, solo desde un toque. `x-safari-` lo bloquea
 *   desde Instagram 417 (mar 2026).
 * - Otras apps en iPhone: `x-safari-https://`.
 * - Android: `intent://`, solo en Instagram y Facebook, donde se reporta que anda. En otro WebView,
 *   si la app no lo resuelve, navegar a un esquema desconocido reemplaza la página por una
 *   pantalla de error (`browser_fallback_url` lo resuelve Chrome, no un WebView): ahí es `null`.
 * `null` si no reconoce la plataforma o `href` no es una URL.
 */
export function externalBrowserUrl(
  userAgent: string | null | undefined,
  href: string,
): string | null {
  if (userAgent == null) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return /Instagram/.test(userAgent)
      ? `instagram://extbrowser/?url=${encodeURIComponent(href)}`
      : `x-safari-${href}`
  }
  if (/Android/.test(userAgent) && /Instagram|FBAN|FBAV|FB_IAB/.test(userAgent)) {
    const target = `${url.host}${url.pathname}${url.search}`
    return `intent://${target}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(href)};end`
  }
  return null
}
