import { SITE_NAME, SITE_URL, absoluteUrl, DEFAULT_OG_IMAGE } from './metadata'
import type { PublicTenant } from '@/modules/tenants/public.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// Schema.org `dayOfWeek` uses English day names.
const DAY_MAP: Record<keyof OpeningHours, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

type JsonLdValue = string | number | boolean | null | JsonLdNode | JsonLdValue[]
interface JsonLdNode {
  [key: string]: JsonLdValue | undefined
}

export type StructuredData = JsonLdNode | JsonLdNode[]

function buildOpeningHoursSpec(hours: OpeningHours): JsonLdNode[] {
  return (Object.keys(DAY_MAP) as Array<keyof OpeningHours>)
    .filter((dayKey) => !hours[dayKey]?.closed)
    .map((dayKey) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_MAP[dayKey],
      opens: hours[dayKey].open,
      closes: hours[dayKey].close === '00:00' ? '23:59' : hours[dayKey].close,
    }))
}

export function buildLocalBusiness(tenant: PublicTenant): JsonLdNode {
  const url = absoluteUrl(`/${tenant.slug}`)
  const image = tenant.coverUrl ?? absoluteUrl(DEFAULT_OG_IMAGE)

  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': url,
    name: tenant.name,
    url,
    image,
    telephone: tenant.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: tenant.address,
      addressLocality: tenant.city,
      addressRegion: tenant.province,
      addressCountry: 'AR',
    },
    openingHoursSpecification: buildOpeningHoursSpec(tenant.openingHours),
  }
  if (tenant.description) node.description = tenant.description
  return node
}

export type BreadcrumbItem = { name: string; url: string }

export function buildBreadcrumbList(items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function buildWebSite(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/explorar?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function buildOrganization(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/icon'),
  }
}

export function renderStructuredData(data: StructuredData): string {
  return JSON.stringify(data)
}
