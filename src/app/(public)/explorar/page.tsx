import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { listPublicCities, searchPublicTenants } from '@/modules/tenants/search.service'
import { buildMetadata } from '@/lib/seo/metadata'
import SearchBar from './components/SearchBar'
import TenantCard from './components/TenantCard'

export const dynamic = 'force-dynamic'
export const metadata = buildMetadata({
  title: 'Explorá complejos de fútbol',
  description: 'Encontrá canchas de fútbol y reservá online en tu ciudad.',
  path: '/explorar',
})

const PAGE_SIZE = 20

type Props = {
  searchParams: { q?: string; city?: string; province?: string; online?: string; offset?: string }
}

export default async function ExplorarPage({ searchParams }: Props) {
  const offset = Math.max(Number(searchParams.offset ?? '0') || 0, 0)
  const [{ results, total }, cities] = await Promise.all([
    searchPublicTenants({
      q: searchParams.q,
      city: searchParams.city,
      province: searchParams.province,
      onlineOnly: searchParams.online === '1',
      limit: PAGE_SIZE,
      offset,
    }),
    listPublicCities(),
  ])

  const nextOffset = offset + PAGE_SIZE
  const hasMore = nextOffset < total

  const nextParams = new URLSearchParams()
  if (searchParams.q) nextParams.set('q', searchParams.q)
  if (searchParams.city) nextParams.set('city', searchParams.city)
  if (searchParams.online === '1') nextParams.set('online', '1')
  nextParams.set('offset', String(nextOffset))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Explorá complejos</h1>
        <p className="text-sm text-slate-500">{total} complejo{total === 1 ? '' : 's'} disponible{total === 1 ? '' : 's'}.</p>
      </header>

      <SearchBar cities={cities} />

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
          <SearchX className="h-10 w-10" aria-hidden />
          <p className="text-sm">No encontramos complejos con esos filtros.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((t) => <TenantCard key={t.id} tenant={t} />)}
        </div>
      )}

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <Link href={`/explorar?${nextParams.toString()}`} className="inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
            Ver más
          </Link>
        </div>
      )}
    </div>
  )
}
