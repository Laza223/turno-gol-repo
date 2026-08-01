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
  if (tenant.latitude != null && tenant.longitude != null) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: tenant.latitude,
      longitude: tenant.longitude,
    }
  }
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

// Characters that JSON.stringify does not escape but that are unsafe to emit verbatim
// inside a `<script type="application/ld+json">` element. Mapped by codepoint (rather
// than literal regex characters) so the escaping table itself can't silently drift.
//   - `<` (U+003C): without this, a value containing a literal `</script>` (e.g.
//     free-text tenant name/address controlled by any self-service tenant signup)
//     would prematurely close the script tag, letting the browser parse the rest as
//     real HTML/JS — this is the XSS vector.
//   - `>` and `/` (U+003E, U+002F): also escaped so no substring of the JSON can form
//     `<`, `>` or a closing tag when concatenated with surrounding markup.
//   - U+2028/U+2029 (LINE SEPARATOR / PARAGRAPH SEPARATOR): valid inside JSON strings
//     but illegal, unescaped line terminators in JS source, which can break parsing.
const SCRIPT_TAG_ESCAPES: Record<number, string> = {
  0x3c: '\\u003c', // <
  0x3e: '\\u003e', // >
  0x2f: '\\u002f', // /
  0x2028: '\\u2028',
  0x2029: '\\u2029',
}

function escapeForScriptTag(json: string): string {
  let result = ''
  for (const char of json) {
    const replacement = SCRIPT_TAG_ESCAPES[char.codePointAt(0)!]
    result += replacement ?? char
  }
  return result
}

export function renderStructuredData(data: StructuredData): string {
  return escapeForScriptTag(JSON.stringify(data))
}
