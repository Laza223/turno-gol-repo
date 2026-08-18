import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import sitemap from '@/app/sitemap'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

const TAG = `smap${Date.now()}`

async function seed() {
  const sql = getSql()
  // F-004 (QA prod 2026-08-17): listSitemapTenants ahora exige
  // settings.onboarding_completed=true además del status — sin esto -a/-b
  // quedarían fuera por incompletitud, no por lo que este test ejercita.
  //
  // `sql.json({...})`, NO `${'{"...": true}'}::jsonb`: interpolar un STRING
  // ya-serializado como parámetro y castearlo con `::jsonb` lo doble-codifica
  // (mismo bug de la clase "jsonb-merge-double-stringify") — quedaba guardado
  // como el STRING `"{\"onboarding_completed\": true}"` en vez del objeto, así
  // que `settings ->> 'onboarding_completed'` daba `NULL` y -a/-b quedaban
  // afuera siempre. Confirmado en vivo contra Postgres real, no solo lectura.
  const done = sql.json({ onboarding_completed: true })
  await sql`
    INSERT INTO tenants (slug, name, address, city, province, phone, email, status, settings)
    VALUES
      (${`${TAG}-a`}, ${`${TAG} Active`},   'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}a@t.local`}, 'active', ${done}),
      (${`${TAG}-b`}, ${`${TAG} Trialing`}, 'x', 'Córdoba', 'Córdoba', '1', ${`${TAG}b@t.local`}, 'trialing', ${done}),
      (${`${TAG}-c`}, ${`${TAG} Suspended`},'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}c@t.local`}, 'suspended', ${done}),
      (${`${TAG}-d`}, ${`${TAG} Deleted`},  'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}d@t.local`}, 'deleted', ${done})
  `
}

beforeAll(async () => {
  await ensureRoles()
  await seed()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('GET /sitemap.xml (Next.js sitemap.ts)', () => {
  it('includes active + trialing tenant slugs', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls.some((u) => u.endsWith(`/${TAG}-a`))).toBe(true)
    expect(urls.some((u) => u.endsWith(`/${TAG}-b`))).toBe(true)
  })

  it('excludes suspended + deleted tenants', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls.some((u) => u.endsWith(`/${TAG}-c`))).toBe(false)
    expect(urls.some((u) => u.endsWith(`/${TAG}-d`))).toBe(false)
  })

  it('contains the static routes', async () => {
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls.some((u) => u.endsWith('/'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/explorar'))).toBe(true)
    // Las rutas legales son ESPAÑOL: src/app/(public)/{privacidad,terminos}. El
    // sitemap anunciaba /privacy y /terms — dos 404 servidos a Google — hasta que
    // 5eb5eca lo corrigió. El test se quedó aserteando el bug.
    expect(urls.some((u) => u.endsWith('/privacidad'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/terminos'))).toBe(true)
  })

  it('emits absolute URLs', async () => {
    const entries = await sitemap()
    for (const e of entries) {
      expect(e.url).toMatch(/^https?:\/\//)
    }
  })

  it('emits valid priority + changeFrequency on tenant routes', async () => {
    const entries = await sitemap()
    const tenantEntry = entries.find((e) => e.url.endsWith(`/${TAG}-a`))
    expect(tenantEntry).toBeDefined()
    expect(tenantEntry!.priority).toBe(0.9)
    expect(tenantEntry!.changeFrequency).toBe('daily')
    expect(tenantEntry!.lastModified).toBeInstanceOf(Date)
  })
})
