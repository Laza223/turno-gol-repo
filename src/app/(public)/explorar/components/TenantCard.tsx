import Link from 'next/link'
import { MapPin, Zap } from 'lucide-react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'

export default function TenantCard({ tenant }: { tenant: PublicTenantCard }) {
  return (
    <Link
      href={`/${tenant.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
        {tenant.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-3xl font-bold text-emerald-600/40">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {tenant.allowOnlineBooking && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Zap className="h-3 w-3" aria-hidden /> Reserva online
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{tenant.name}</h3>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          {tenant.city}, {tenant.province}
        </p>
      </div>
    </Link>
  )
}
