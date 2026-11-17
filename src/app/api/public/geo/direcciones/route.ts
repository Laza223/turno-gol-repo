import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { captureException } from '@/lib/sentry'
import { findAddresses } from '@/modules/geo/geo.service'
import { internal } from '@/shared/api-error'
import { enforce, parseClientIp, rateLimit429 } from '@/shared/rate-limit'
import { boundedText } from '@/shared/validation/primitives'

// Buscador de direcciones: llama a Georef y, si no encuentra, a OpenStreetMap. Además del
// límite general del middleware (`publicGeo`), tiene el suyo por llamar a terceros.
// Lo que escribe el usuario nunca se loguea ni va a Sentry.

export const dynamic = 'force-dynamic'

// '' (campo vacío del formulario) = ausente.
const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' ? undefined : v), boundedText(max).trim().optional())

const querySchema = z.object({
  street: z.string().trim().min(3).max(120),
  city: optionalText(80),
  province: optionalText(40),
  localityId: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{5,12}$/)
      .optional(),
  ),
  department: optionalText(80),
})

const responseSchema = z.object({
  results: z.array(
    z.object({
      label: z.string(),
      address: z.string(),
      city: z.string(),
      province: z.string(),
      lat: z.number(),
      lng: z.number(),
      source: z.enum(['georef', 'osm']),
    }),
  ),
  degraded: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    street: sp.get('street') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    localityId: sp.get('localityId') ?? undefined,
    department: sp.get('department') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'invalid_params' }, { status: 400 })

  try {
    const outcome = await enforce('publicGeoExternal', parseClientIp(req.headers))
    if (!outcome.ok) return rateLimit429(outcome)

    const { results, degraded } = await findAddresses(parsed.data)
    const body = responseSchema.parse({ results, ...(degraded ? { degraded } : {}) })
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    captureException(err)
    return internal('No se pudo procesar la solicitud.')
  }
}
