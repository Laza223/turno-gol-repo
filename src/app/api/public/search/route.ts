import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { boundedText } from '@/shared/validation/primitives'
import { searchPublicTenants } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

const SURFACES = ['synthetic_grass', 'natural_grass', 'cement', 'indoor'] as const
const FORMATS = [5, 7, 8, 9, 11] as const
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
const csvAllowed = (
  raw: string | null,
  allowed: readonly (string | number)[],
): string[] | undefined => {
  if (!raw) return undefined
  const allowedSet = new Set(allowed.map(String))
  const vals = raw
    .split(',')
    .map((s) => s.trim())
    .filter((v) => v && allowedSet.has(v))
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
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const p = parsed.data
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
  })

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
