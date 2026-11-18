import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { captureException } from '@/lib/sentry'
import { locate } from '@/modules/geo/geo.service'
import { internal } from '@/shared/api-error'
import { enforce, parseClientIp, rateLimit429 } from '@/shared/rate-limit'

// "Usar mi ubicación". Las coordenadas son del usuario: nunca se loguean ni van a Sentry.
// Salen a Georef y, solo si el dataset no trae la localidad, a OpenStreetMap (el cliente del
// jugador las manda redondeadas). Además del límite general del middleware (`publicGeo`),
// tiene el suyo por llamar a terceros.

export const dynamic = 'force-dynamic'

const coordinate = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(min).max(max))

const querySchema = z.object({
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
  precision: z.enum(['locality', 'address']).default('locality'),
})

const responseSchema = z.object({
  result: z
    .object({
      city: z.string(),
      province: z.string(),
      department: z.string().optional(),
      address: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
    })
    .nullable(),
  degraded: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    lat: sp.get('lat') ?? undefined,
    lng: sp.get('lng') ?? undefined,
    precision: sp.get('precision') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'invalid_params' }, { status: 400 })

  try {
    const outcome = await enforce('publicGeoExternal', parseClientIp(req.headers))
    if (!outcome.ok) return rateLimit429(outcome)

    const { result, degraded } = await locate(
      parsed.data.lat,
      parsed.data.lng,
      parsed.data.precision,
    )
    const body = responseSchema.parse({ result, ...(degraded ? { degraded } : {}) })
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    captureException(err)
    return internal('No se pudo procesar la solicitud.')
  }
}
