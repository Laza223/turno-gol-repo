import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { captureException } from '@/lib/sentry'
import { searchPublicTenants } from '@/modules/tenants/search.service'

// Localidad sugerida por la geolocalización por IP de Vercel, sin sacar la home de
// la ISR: la home la pide desde el cliente, y solo si no hay una zona guardada.
// El rate limit ya lo pone el middleware para /api/public/:path*.
// 50 km = mismo umbral que DEFAULT_MAX_DISTANCE_KM de src/hooks/use-nearest-city.ts.
// Las coordenadas nunca se devuelven ni se loguean.

export const dynamic = 'force-dynamic'

const MAX_DISTANCE_KM = 50

const geoSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
})

// Contrato de salida: se valida antes de serializar.
const zonaResponseSchema = z.object({
  zona: z.object({ city: z.string(), province: z.string() }).nullable(),
})

type ZonaResponse = z.infer<typeof zonaResponseSchema>

// La respuesta depende de la IP del visitante: nunca cacheable.
function respond(body: ZonaResponse) {
  return NextResponse.json(zonaResponseSchema.parse(body), {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

// Number('') === 0: un header vacío no puede pasar por coordenada válida.
function headerNumber(raw: string | null): number {
  return raw === null || raw.trim() === '' ? NaN : Number(raw)
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-vercel-ip-country') !== 'AR') return respond({ zona: null })

  const geo = geoSchema.safeParse({
    lat: headerNumber(req.headers.get('x-vercel-ip-latitude')),
    lng: headerNumber(req.headers.get('x-vercel-ip-longitude')),
  })
  if (!geo.success) return respond({ zona: null })

  try {
    const { results } = await searchPublicTenants({
      lat: geo.data.lat,
      lng: geo.data.lng,
      sort: 'distance',
      limit: 1,
      offset: 0,
    })
    const nearest = results[0]
    if (nearest && nearest.distanceKm != null && nearest.distanceKm <= MAX_DISTANCE_KM) {
      return respond({ zona: { city: nearest.city, province: nearest.province } })
    }
  } catch (err) {
    // Falla abierta: la home sigue sin ventana de zona.
    captureException(err)
  }
  return respond({ zona: null })
}
