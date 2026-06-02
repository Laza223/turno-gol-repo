import Link from 'next/link'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import type { OpenMatchCard as OpenMatch } from '@/modules/open-matches/open-match.types'

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}
const GENDER_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  mixed: 'Mixto',
}

// El horario del partido se muestra en horario de Argentina, no el del servidor.
const whenFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Tarjeta de "Falta Uno" para la vitrina (tema oscuro, landing). */
export default function OpenMatchCard({ match }: { match: OpenMatch }) {
  const remaining = match.slotsRemaining
  const when = match.expiresAt ? whenFormatter.format(match.expiresAt) : null
  const level = match.restrictions.level ? LEVEL_LABELS[match.restrictions.level] : null
  const gender = match.restrictions.gender ? GENDER_LABELS[match.restrictions.gender] : null

  return (
    <Link
      href={`/${match.tenant.slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-2xl hover:shadow-emerald-500/10 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {remaining === 1 ? 'Falta 1 jugador' : `Faltan ${remaining} jugadores`}
        </span>
        {when && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{when}</span>
          </span>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold text-white transition-colors group-hover:text-emerald-300">
          {match.tenant.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {match.tenant.city}
            {match.tenant.province ? `, ${match.tenant.province}` : ''}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {level && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10">
            {level}
          </span>
        )}
        {gender && (
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10">
            {gender}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-emerald-300">
          Sumarme
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </div>
    </Link>
  )
}
