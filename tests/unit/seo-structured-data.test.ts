import { describe, expect, it } from 'vitest'
import {
  buildLocalBusiness,
  buildBreadcrumbList,
  buildWebSite,
  buildOrganization,
} from '@/lib/seo/structured-data'
import type { PublicTenant } from '@/modules/tenants/public.service'

const FIXTURE_TENANT: PublicTenant = {
  id: 'tid',
  slug: 'complejo-x',
  name: 'Complejo X',
  description: 'Mejor complejo',
  logoUrl: null,
  coverUrl: 'https://cdn.example/cover.jpg',
  address: 'Av. 123',
  city: 'Luján',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  whatsapp: null,
  openingHours: {
    mon: { open: '08:00', close: '23:00' },
    tue: { open: '08:00', close: '23:00' },
    wed: { open: '08:00', close: '23:00' },
    thu: { open: '08:00', close: '23:00' },
    fri: { open: '08:00', close: '00:00' },  // midnight → must map to 23:59
    sat: { open: '08:00', close: '00:00' },
    sun: { open: '08:00', close: '23:00', closed: true },  // closed → filtered
  },
  closedDates: [],
  status: 'active',
  timezone: 'America/Argentina/Buenos_Aires',
  allowOnlineBooking: true,
  requiresDeposit: false,
  depositPercentage: 30,
  bookingDurationMinutes: [60],
  bookingAdvanceDays: 6,
}

describe('buildLocalBusiness', () => {
  it('emits SportsActivityLocation with required fields', () => {
    const node = buildLocalBusiness(FIXTURE_TENANT)
    expect(node['@context']).toBe('https://schema.org')
    expect(node['@type']).toBe('SportsActivityLocation')
    expect(node.name).toBe('Complejo X')
    expect(node.telephone).toBe('+5491100000000')
    expect(node.image).toBe('https://cdn.example/cover.jpg')
  })

  it('emits PostalAddress with addressCountry=AR', () => {
    const node = buildLocalBusiness(FIXTURE_TENANT)
    const addr = node.address as Record<string, unknown>
    expect(addr['@type']).toBe('PostalAddress')
    expect(addr.streetAddress).toBe('Av. 123')
    expect(addr.addressLocality).toBe('Luján')
    expect(addr.addressRegion).toBe('Buenos Aires')
    expect(addr.addressCountry).toBe('AR')
  })

  it('emits openingHoursSpecification array, filters closed days, maps 00:00 close to 23:59', () => {
    const node = buildLocalBusiness(FIXTURE_TENANT)
    const hours = node.openingHoursSpecification as Array<Record<string, unknown>>
    expect(hours).toBeInstanceOf(Array)
    // Sunday is closed → should not appear
    const days = hours.map((h) => h.dayOfWeek)
    expect(days).not.toContain('Sunday')
    expect(days).toContain('Monday')
    expect(days).toContain('Friday')
    // Friday closes at 00:00 → must be mapped to 23:59
    const fri = hours.find((h) => h.dayOfWeek === 'Friday')
    expect(fri).toBeDefined()
    expect(fri!.closes).toBe('23:59')
  })

  it('omits description when null', () => {
    const node = buildLocalBusiness({ ...FIXTURE_TENANT, description: null })
    expect(node.description).toBeUndefined()
  })
})

describe('buildBreadcrumbList', () => {
  it('emits ListItems with sequential positions starting at 1', () => {
    const node = buildBreadcrumbList([
      { name: 'Inicio', url: 'https://x/' },
      { name: 'Explorar', url: 'https://x/explorar' },
      { name: 'Complejo', url: 'https://x/complejo' },
    ])
    expect(node['@type']).toBe('BreadcrumbList')
    const items = node.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(3)
    expect(items[0]!.position).toBe(1)
    expect(items[1]!.position).toBe(2)
    expect(items[2]!.position).toBe(3)
    expect(items[0]!.name).toBe('Inicio')
  })
})

describe('buildWebSite', () => {
  it('emits SearchAction with urlTemplate and query-input', () => {
    const node = buildWebSite()
    expect(node['@type']).toBe('WebSite')
    const action = node.potentialAction as Record<string, unknown>
    expect(action['@type']).toBe('SearchAction')
    expect(action['query-input']).toBe('required name=search_term_string')
    const target = action.target as Record<string, unknown>
    expect(target.urlTemplate).toContain('{search_term_string}')
  })
})

describe('buildOrganization', () => {
  it('emits Organization with name + url + logo', () => {
    const node = buildOrganization()
    expect(node['@type']).toBe('Organization')
    expect(node.name).toBe('TurnoGol')
    expect(node.url).toBeDefined()
    expect(node.logo).toBeDefined()
  })
})
