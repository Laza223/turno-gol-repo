import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Phone } from 'lucide-react'
import type { PublicTenant } from '@/modules/tenants/public.service'

type Props = { tenant: PublicTenant }

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function TenantHeader({ tenant }: Props) {
  return (
    <div className="space-y-4">
      {tenant.coverUrl && (
        <div className="relative h-48 sm:h-56 rounded-xl overflow-hidden bg-slate-100">
          <Image src={tenant.coverUrl} alt={`Foto de ${tenant.name}`} fill sizes="(max-width: 1024px) 100vw, 1024px" priority className="object-cover" />
        </div>
      )}

      <div className="flex items-start gap-4">
        {tenant.logoUrl && (
          <Image src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} width={56} height={56} sizes="56px" className="h-14 w-14 rounded-lg object-cover border border-slate-200 shadow-sm flex-shrink-0" />
        )}
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">{tenant.name}</h1>
          {tenant.description && (
            <p className="text-sm text-muted-foreground">{tenant.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden />
          {tenant.address}, {tenant.city}
        </span>
        <a
          href={`tel:${tenant.phone}`}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors duration-150"
        >
          <Phone className="h-4 w-4 flex-shrink-0" aria-hidden />
          {tenant.phone}
        </a>
        <Link
          href={`/${tenant.slug}/disponibilidad`}
          className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
        >
          <CalendarDays className="h-4 w-4 flex-shrink-0" aria-hidden />
          Ver semana completa
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Horarios</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4">
          {DAY_ORDER.map((day) => {
            const hours = tenant.openingHours[day as keyof typeof tenant.openingHours]
            if (!hours) return null
            return (
              <div key={day}>
                <div className="text-xs font-medium text-slate-600">{DAY_LABELS[day]}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {hours.closed ? 'Cerrado' : `${hours.open} – ${hours.close}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
