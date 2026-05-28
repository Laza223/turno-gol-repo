import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import sitemap from '@/app/sitemap'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

const TAG = `smap${Date.now()}`

async function seed() {
  const sql = getSql()
  await sql`
    INSERT INTO tenants (slug, name, address, city, province, phone, email, status)
    VALUES
      (${`${TAG}-a`}, ${`${TAG} Active`},   'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}a@t.local`}, 'active'),
      (${`${TAG}-b`}, ${`${TAG} Trialing`}, 'x', 'Córdoba', 'Córdoba', '1', ${`${TAG}b@t.local`}, 'trialing'),
      (${`${TAG}-c`}, ${`${TAG} Suspended`},'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}c@t.local`}, 'suspended'),
      (${`${TAG}-d`}, ${`${TAG} Deleted`},  'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}d@t.local`}, 'deleted')
  `
}

beforeAll(async () => { await ensureRoles(); await seed() })
afterAll(async () => { await cleanupAll(); await closeSql() })

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
    expect(urls.some((u) => u.endsWith('/privacy'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/terms'))).toBe(true)
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
