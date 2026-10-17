/**
 * ¿El User-Agent es el de un navegador interno de una app (Instagram, Facebook, TikTok…)?
 * Es donde cae el jugador que llega por un link de redes. Ahí Google rechaza el ingreso
 * (`disallowed_useragent`: no deja loguear en un WebView embebido), así que /ingresar pone
 * primero el email.
 *
 * Es una heurística sobre el UA: las marcas de las apps conocidas y el `wv` de Android System
 * WebView, que alcanza a las demás apps de Android. Google va PRIMERO en el navegador común, así
 * que un falso negativo deja el botón de Google arriba dentro de un WebView, donde no anda: por
 * eso la lista es generosa. No detecta a los que abren el link en el navegador del sistema
 * (WhatsApp; ahí Google anda) ni a un WKWebView de iPhone sin marca conocida. Chrome, Custom Tabs,
 * Safari y SFSafariViewController llevan el UA del navegador y no matchean.
 * Puro: se evalúa en el servidor con el header, para que el orden no cambie al hidratar.
 */
const IN_APP_UA =
  /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|LinkedInApp|\bLine\/|Snapchat|Pinterest|; wv\)/i

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return userAgent != null && IN_APP_UA.test(userAgent)
}
