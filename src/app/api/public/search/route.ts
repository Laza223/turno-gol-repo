import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { boundedText, dateStr, hhmm } from '@/shared/validation/primitives'
import { captureMessage } from '@/lib/sentry'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import { findAvailableTenantIds } from '@/modules/tenants/availability-search.service'

export const dynamic = 'force-dynamic'

const SURFACES = ['synthetic_grass', 'natural_grass', 'cement', 'tile'] as const
const FORMATS = [4, 5, 6, 7, 8, 9, 10, 11] as const
const AMENITIES = [
  'duchas',
  'estacionamiento',
  'bar',
  'parrilla',
  'vestuario',
  'wifi',
  'techado',
  'iluminacion',
] as const

// CSV → lista de valores, descartando los que no estén en el set permitido
// (una chip obsoleta/desconocida no debe romper toda la búsqueda con 400).
// allowed: como string para comparar (los formatos numéricos se comparan por texto).
// Dedupe: "5,5,5,..." repetido no debe inflar cache keys ni params SQL.
const csvAllowed = (
  raw: string | null,
  allowed: readonly (string | number)[],
): string[] | undefined => {
  if (!raw) return undefined
  const allowedSet = new Set(allowed.map(String))
  const vals = Array.from(new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((v) => v && allowedSet.has(v)),
  ))
  return vals.length ? vals : undefined
}

const querySchema = z.object({
  q: boundedText(128).optional(),
  city: boundedText(64).optional(),
  province: boundedText(64).optional(),
  online: z.enum(['0', '1']).optional(),
  surfaces: z.array(z.enum(SURFACES)).optional(),
  formats: z.array(z.coerce.number().int()).optional(),
  amenities: z.array(z.enum(AMENITIES)).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['name', 'price', 'rating', 'distance']).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  // Filtro de disponibilidad real: solo se activa cuando llegan AMBOS.
  date: dateStr.optional(),
  time: hhmm.optional(),
})

// Contrato de salida (doc15): la respuesta se valida antes de serializar para
// que un cambio accidental del shape interno no se filtre a la API pública.
const publicTenantCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  province: z.string(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  allowOnlineBooking: z.boolean(),
  fromPriceCents: z.number().int().nullable(),
  amenities: z.record(z.string(), z.boolean()),
  avgRating: z.number(),
  reviewCount: z.number().int(),
  distanceKm: z.number().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  courtSurfaces: z.array(z.string()),
  courtFormats: z.array(z.number().int()),
})

// No exportado: Next.js restringe los exports de route.ts a los handlers.
const searchResponseSchema = z.object({
  results: z.array(publicTenantCardSchema),
  total: z.number().int().nonnegative(),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    q: sp.get('q') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    online: sp.get('online') ?? undefined,
    surfaces: csvAllowed(sp.get('surfaces'), SURFACES),
    formats: csvAllowed(sp.get('formats'), FORMATS),
    amenities: csvAllowed(sp.get('amenities'), AMENITIES),
    minPrice: sp.get('minPrice') ?? undefined,
    maxPrice: sp.get('maxPrice') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    lat: sp.get('lat') ?? undefined,
    lng: sp.get('lng') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
    date: sp.get('date') ?? undefined,
    time: sp.get('time') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const p = parsed.data

  // Disponibilidad real: con fecha+hora, la búsqueda queda restringida a los
  // complejos con al menos una cancha libre a esa hora (cacheado 30s). Con uno
  // solo de los dos params el comportamiento es idéntico al histórico.
  const availabilityActive = p.date !== undefined && p.time !== undefined
  const tenantIds = availabilityActive
    ? await findAvailableTenantIds({ date: p.date!, time: p.time!, formats: p.formats })
    : undefined

  // 'distance' sin coordenadas no tiene sentido → cae a orden por nombre en el service.
  const result = await searchPublicTenants({
    q: p.q,
    city: p.city,
    province: p.province,
    onlineOnly: p.online === '1',
    surfaces: p.surfaces,
    formats: p.formats,
    amenities: p.amenities,
    minPriceCents: p.minPrice,
    maxPriceCents: p.maxPrice,
    sort: p.sort,
    lat: p.lat,
    lng: p.lng,
    limit: p.limit,
    offset: p.offset,
    ...(tenantIds !== undefined ? { tenantIds } : {}),
  })

  // Validación del contrato de salida en fail-open: un drift de shape (datos
  // sucios en jsonb, campo nuevo mal tipado) se reporta pero NUNCA tumba el
  // endpoint público — se sirve la respuesta cruda como hasta ahora.
  const validated = searchResponseSchema.safeParse(result)
  if (!validated.success) {
    captureMessage('public search: respuesta fuera de contrato', {
      level: 'warning',
      extra: { issues: validated.error.issues.slice(0, 5) },
    })
  }

  // Con el filtro activo los datos caducan con el TTL del cache (30s, mismo
  // contrato que /api/public/availability); sin él, CDN cache histórico de 60s.
  // Literales inline a propósito: public-cache-headers.test.ts los pinea.
  return NextResponse.json(validated.success ? validated.data : result, {
    headers: availabilityActive
      ? { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
      : { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
