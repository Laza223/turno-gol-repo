import { NextResponse } from 'next/server'
import { listPublicCities } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cities = await listPublicCities()
  return NextResponse.json(
    { cities },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  )
}
