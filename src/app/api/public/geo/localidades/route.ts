import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { captureException } from '@/lib/sentry'
import { findLocalities } from '@/modules/geo/geo.service'
import { internal } from '@/shared/api-error'

// Buscador de localidades. El rate limit lo pone el middleware (`publicGeo`).
// Lo que escribe el usuario nunca se loguea ni va a Sentry.

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(8).default(8),
})

const localitySchema = z.object({
  city: z.string(),
  province: z.string(),
  department: z.string().optional(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  source: z.enum(['dataset', 'osm', 'manual']),
})

const responseSchema = z.object({
  results: z.array(localitySchema),
  degraded: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    q: sp.get('q') ?? undefined,
    limit: sp.get('limit') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'invalid_params' }, { status: 400 })

  try {
    const { results, degraded } = await findLocalities(parsed.data.q)
    const body = responseSchema.parse({
      results: results.slice(0, parsed.data.limit),
      ...(degraded ? { degraded } : {}),
    })
    // Público y sin datos de nadie: el CDN lo cachea. Una respuesta degradada (falló OpenStreetMap)
    // NO se cachea: dejaría esa búsqueda sin resultados por un día. Literales inline:
    // public-cache-headers.test.ts los pinea.
    if (degraded) {
      return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch (err) {
    captureException(err)
    return internal('No se pudo procesar la solicitud.')
  }
}
