/**
 * LHCI puppeteerScript for /grilla authentication.
 *
 * LHCI calls this module with `(browser, page)` before each navigation.
 * We read the SSR session cookies minted by lighthouse-grilla.ts from a
 * temp file (path written to LHCI_GRILLA_COOKIES_FILE env var) and inject
 * them into the page so Next.js middleware sees a valid Supabase session.
 *
 * Format of the JSON file: Array<{ name, value, domain, path, expires,
 *   httpOnly, secure, sameSite }> — el shape de SessionCookie que produce
 *   lighthouse-grilla.ts, equivalente a StorageState['cookies'] de Playwright.
 *   No es el shape de @supabase/ssr: la librería solo emite name/value/options,
 *   los campos domain/expires los agrega el minteador.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {import('puppeteer').Page} page
 */
// @ts-check
'use strict'

const fs = require('fs')
const path = require('path')

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {import('puppeteer-core').Page} page
 */
module.exports = async function (browser, page) {
  const cookiesFile = process.env.LHCI_GRILLA_COOKIES_FILE
  if (!cookiesFile) {
    throw new Error('LHCI_GRILLA_COOKIES_FILE env var not set')
  }

  const absolutePath = path.isAbsolute(cookiesFile)
    ? cookiesFile
    : path.join(process.cwd(), cookiesFile)

  /** @type {Array<{name: string, value: string, domain: string, path: string, expires: number, httpOnly: boolean, secure: boolean, sameSite: string}>} */
  const cookies = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'))

  // puppeteer's setCookie accepts CookieParam[] — map sameSite values
  // from Playwright/SSR format to Puppeteer format (both use 'Lax'|'Strict'|'None')
  /** @type {Array<import('puppeteer-core').CookieParam>} */
  const puppeteerCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires === -1 ? undefined : c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: /** @type {'Lax'|'Strict'|'None'} */ (c.sameSite),
  }))

  // Puppeteer v23+ (bundled by LHCI 0.15) moved setCookie from Page to Browser.
  // Older versions keep it on Page. Fall back to CDP Network.setCookie if neither.
  if (typeof browser.setCookie === 'function') {
    await browser.setCookie(...puppeteerCookies)
  } else if (typeof page.setCookie === 'function') {
    await page.setCookie(...puppeteerCookies)
  } else {
    const client = await page.target().createCDPSession()
    for (const c of puppeteerCookies) {
      await client.send('Network.setCookie', {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })
    }
  }
}
