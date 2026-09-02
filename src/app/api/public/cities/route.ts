import { NextResponse } from 'next/server'
import { listPublicCities } from '@/modules/tenants/search.service'
import { captureException } from '@/lib/sentry'
import { internal } from '@/shared/api-error'

export const dynamic = 'force-dynamic'

export async function GET() {
  let cities
  try {
    cities = await listPublicCities()
  } catch (err) {
    captureException(err)
    return internal('No se pudo procesar la solicitud.')
  }
  return NextResponse.json(
    { cities },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  )
}
