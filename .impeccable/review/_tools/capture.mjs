import { chromium } from 'playwright'
import fs from 'node:fs'

// Captura de la home REAL con datos de demo: ubicación en Luján y las dos rutas
// públicas que usa el hero mockeadas (nombres y horarios sintéticos; fotos de public/).
const out = process.argv[2] ?? '.impeccable/review'
const shots = JSON.parse(process.argv[3] ?? '[]')
const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const card = (o) => ({
  address: 'Demo 123', logoUrl: null, allowOnlineBooking: true, fromPricePerPlayerCents: null,
  amenities: {}, avgRating: 0, reviewCount: 0, latitude: -34.57, longitude: -59.1,
  courtSurfaces: ['synthetic_grass'], province: 'Buenos Aires', fromPriceCents: null, ...o,
})
const results = [
  card({ id: 'a1', slug: 'complejo-san-martin', name: 'Complejo San Martín', city: 'Luján', coverUrl: '/bg-hero-2.png', fromPriceCents: 6000000, distanceKm: 4.2, courtFormats: [5, 7] }),
  card({ id: 'a2', slug: 'la-cortada-f5', name: 'La Cortada F5', city: 'Luján', coverUrl: '/hero-bg.png', fromPriceCents: 5500000, distanceKm: 7.8, courtFormats: [5] }),
  card({ id: 'a3', slug: 'club-estacion', name: 'Club Estación', city: 'General Rodríguez', coverUrl: '/bg-owner.png', fromPriceCents: 7000000, distanceKm: 11, courtFormats: [7] }),
]
const day = (free) => ({ date: today, courts: [{ id: 'c1', name: 'Cancha 1', surfaceType: 'synthetic_grass', isCovered: false, hasLighting: true,
  slots: ['18:00','19:00','20:00','21:00','22:00','23:00'].map((time) => ({ time, duration: 60, status: free.includes(time) ? 'free' : 'occupied', price: 6000000 })) }] })
const avail = { 'complejo-san-martin': day(['19:00','20:00','22:00','23:00']), 'la-cortada-f5': day(['21:00']), 'club-estacion': day(['21:00','22:00']) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, colorScheme: 'dark', deviceScaleFactor: 1, reducedMotion: 'reduce',
  geolocation: { latitude: -34.5703, longitude: -59.105 }, permissions: ['geolocation'] })
await ctx.route('**/api/public/search**', (r) => r.fulfill({ json: { results, total: results.length } }))
await ctx.route('**/api/public/availability?**', (r) => {
  const slug = new URL(r.request().url()).searchParams.get('slug')
  return r.fulfill({ json: avail[slug] ?? day([]) })
})
const page = await ctx.newPage()
page.setDefaultTimeout(420000)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 420000 })
await page.getByRole('link', { name: 'Reservar hoy a las 19:00' }).waitFor()
await page.waitForTimeout(1500)
for (const [name, w, h, scheme, full] of shots) {
  await page.setViewportSize({ width: w, height: h })
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !!full })
}
const m = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  return { h1: r(document.querySelector('h1')), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }
})
fs.writeFileSync(`${out}/_capture.json`, JSON.stringify({ errors, m }, null, 2))
await browser.close()
console.log('ok', JSON.stringify({ errors: errors.slice(0, 5), m }))
