import { describe, expect, it } from 'vitest'
import { isInAppBrowser } from '@/lib/in-app-browser'

// User-Agents (recortados) con el formato de cada app, de lo que el jugador abre desde un link de
// redes. No todos son capturas de un dispositivo: varios están armados con el formato conocido.
const IN_APP = {
  'Instagram en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.0.18.109 (iPhone14,5; iOS 17_5; es_AR)',
  'Instagram en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 340.0.0.30.109 Android (34/14; es_AR)',
  'Facebook en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/470.0.0.40.108;FBDV/iPhone14,5]',
  'Facebook en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.108;]',
  'Messenger en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/MessengerForiOS;FBAV/460.0.0.0.0]',
  'TikTok en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 trill_340200 AppName/musical_ly app_version/34.2.0 BytedanceWebview/d8a21c6',
  'TikTok en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.2.0 JsSdk/2.0 WKWebView/1 BytedanceWebview/d8a21c6',
  // Sin marca de app: lo único que lo delata es el `wv` de Android System WebView.
  'WebView genérico de Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36',
  'LinkedIn en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.2145',
  'LinkedIn en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 LinkedInApp',
  'LINE en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0',
  'LINE en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.9.0/IAB',
  'Snapchat en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.89.0.40 (like Safari/8618.2.12.0.6, panda)',
  'Snapchat en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Snapchat/12.89.0.40',
  'Pinterest en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]',
  'Pinterest en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 [Pinterest/Android]',
}

// Los que SÍ dejan entrar con Google: el UA es el del navegador (Custom Tabs y SFSafariViewController
// no se distinguen de Chrome y Safari, y está bien: Google los acepta). WhatsApp abre el link de un
// chat en el navegador del teléfono, así que el UA que llega es el de ese navegador, sin marca de
// WhatsApp. Su navegador interno solo abre los botones de plantillas de empresas grandes (y en
// iPhone hay uno en desarrollo, todavía sin UA conocido): no es el camino del link del complejo.
const BROWSER = {
  'WhatsApp en iPhone (el link del chat abre Safari)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'WhatsApp en Android (el link del chat abre Chrome o Custom Tabs)':
    'Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Chrome en Android':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Chrome Custom Tabs en Android (una app abre el link en Chrome)':
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
  'Safari en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'SFSafariViewController en iPhone (una app abre el link en Safari)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Chrome en iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  'Samsung Internet':
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  'Chrome de escritorio':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Firefox de escritorio':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('isInAppBrowser', () => {
  it.each(Object.entries(IN_APP))('%s es un navegador interno', (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(true)
  })

  it.each(Object.entries(BROWSER))('%s no lo es', (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(false)
  })

  it('Line/ es el token de LINE, no cualquier palabra que lo termine', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Baseline/1.0'
    expect(isInAppBrowser(ua)).toBe(false)
  })

  it.each([null, undefined, ''])('sin User-Agent (%j) no lo trata como interno', (ua) => {
    expect(isInAppBrowser(ua)).toBe(false)
  })
})
