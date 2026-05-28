import { test, expect } from '@playwright/test'

test.describe('SEO infrastructure', () => {
  test('GET /sitemap.xml returns XML and includes seeded tenant', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<urlset')
    expect(body).toContain('/e2e-complejo-demo')
  })

  test('GET /robots.txt returns 200 with Sitemap directive', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/Sitemap:\s+https?:\/\/.*\/sitemap\.xml/)
    expect(body).toMatch(/Disallow:\s+\/api\//)
    expect(body).toMatch(/Disallow:\s+\/admin\//)
  })

  test('GET /manifest.json (manifest.webmanifest) is served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect([200, 304]).toContain(res.status())
    const body = await res.json()
    expect(body.name).toBe('TurnoGol')
    expect(body.theme_color).toBe('#059669')
  })

  test('/e2e-complejo-demo has JSON-LD LocalBusiness + BreadcrumbList', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(scripts.length).toBeGreaterThan(0)
    // Parse all and flatten — each <script> may contain a single node or an array.
    const nodes: Array<{ '@type': string }> = []
    for (const s of scripts) {
      const parsed = JSON.parse(s) as { '@type': string } | Array<{ '@type': string }>
      if (Array.isArray(parsed)) nodes.push(...parsed)
      else nodes.push(parsed)
    }
    const types = nodes.map((n) => n['@type'])
    expect(types).toContain('SportsActivityLocation')
    expect(types).toContain('BreadcrumbList')
  })

  test('/e2e-complejo-demo emits OG meta + canonical', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', /.+/)
    const ogImage = page.locator('meta[property="og:image"]')
    await expect(ogImage).toHaveAttribute('content', /.+/)
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveAttribute('href', /\/e2e-complejo-demo$/)
  })

  test('/ has Organization + WebSite SearchAction JSON-LD', async ({ page }) => {
    await page.goto('/')
    const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
    const nodes: Array<Record<string, unknown>> = []
    for (const s of scripts) {
      const parsed = JSON.parse(s) as Record<string, unknown> | Array<Record<string, unknown>>
      if (Array.isArray(parsed)) nodes.push(...parsed)
      else nodes.push(parsed)
    }
    const types = nodes.map((n) => n['@type'])
    expect(types).toContain('Organization')
    expect(types).toContain('WebSite')
  })
})
