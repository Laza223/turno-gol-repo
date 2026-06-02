import Link from 'next/link'
import { SearchX } from 'lucide-react'
import {
  listPublicCities,
  searchPublicTenants,
  type SortOption,
} from '@/modules/tenants/search.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import SearchBar from './components/SearchBar'
import TenantCard from './components/TenantCard'
import ExplorarToolbar from './components/ExplorarToolbar'
import ExplorarFilters from './components/ExplorarFilters'
import ExplorarMapLoader from './components/ExplorarMapLoader'
import JsonLd from '@/components/seo/JsonLd'
import { buildBreadcrumbList } from '@/lib/seo/structured-data'

export const dynamic = 'force-dynamic'
export const metadata = buildMetadata({
  title: 'Explorá complejos de fútbol',
  description: 'Encontrá canchas de fútbol y reservá online en tu ciudad. Filtrá por superficie, formato, servicios y precio.',
  path: '/explorar',
})

const PAGE_SIZE = 12
const SORTS: SortOption[] = ['name', 'price', 'rating', 'distance']

type SP = Record<string, string | undefined>

function csv(v: string | undefined): string[] {
  return v ? v.split(',').filter(Boolean) : []
}
function num(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Construye una URL de /explorar preservando los filtros actuales (server-side). */
function pageUrl(sp: SP, offset: number): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== 'offset') p.set(k, v)
  }
  p.set('offset', String(offset))
  return `/explorar?${p.toString()}`
}

export default async function ExplorarPage({ searchParams }: { searchParams: SP }) {
  const offset = Math.max(num(searchParams.offset) ?? 0, 0)
  const view = searchParams.view === 'map' ? 'map' : 'list'
  const sort = SORTS.includes(searchParams.sort as SortOption)
    ? (searchParams.sort as SortOption)
    : undefined
  // En el mapa mostramos más pines de una (sin paginar).
  const limit = view === 'map' ? 50 : PAGE_SIZE

  const [{ results, total }, cities] = await Promise.all([
    searchPublicTenants({
      q: searchParams.q,
      city: searchParams.city,
      province: searchParams.province,
      onlineOnly: searchParams.online === '1',
      surfaces: csv(searchParams.surfaces),
      formats: csv(searchParams.formats).map(Number).filter((n) => Number.isFinite(n)),
      amenities: csv(searchParams.amenities),
      minPriceCents: num(searchParams.minPrice),
      maxPriceCents: num(searchParams.maxPrice),
      sort,
      lat: num(searchParams.lat),
      lng: num(searchParams.lng),
      limit,
      offset,
    }),
    listPublicCities(),
  ])

  const hasMore = view === 'list' && offset + PAGE_SIZE < total

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Inicio', url: absoluteUrl('/') },
          { name: 'Explorar', url: absoluteUrl('/explorar') },
        ])}
      />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Explorá complejos de fútbol
        </h1>
        <p className="text-sm text-slate-500">
          Encontrá tu cancha ideal: filtrá por superficie, formato, servicios y precio.
        </p>
      </header>

      <SearchBar cities={cities} />
      <ExplorarToolbar total={total} />

      <div className="lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ExplorarFilters />
          </div>
        </aside>

        <div className="min-w-0">
          {view === 'map' ? (
            <ExplorarMapLoader results={results} />
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
              <SearchX className="h-10 w-10" aria-hidden />
              <p className="text-sm">No encontramos complejos con esos filtros.</p>
              <Link href="/explorar" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
                Limpiar búsqueda
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((t) => (
                  <TenantCard key={t.id} tenant={t} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <Link
                    href={pageUrl(searchParams, offset + PAGE_SIZE)}
                    className="inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Ver más complejos
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
