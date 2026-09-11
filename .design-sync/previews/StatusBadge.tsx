import { StatusBadge } from 'turnogol'

/** Los íconos van inline y no desde lucide: el bundle solo expone lo que el
 *  barrel reexporta, y los previews no importan nada más que 'turnogol'. */
function icon(d: string) {
  return function Icon({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d.split('|').map((seg, i) => (<path key={i} d={seg} />))}
      </svg>
    )
  }
}

const Reloj = icon('M12 3a9 9 0 100 18 9 9 0 000-18|M12 7v5l3 2')
const Mano = icon('M4 13h4l2 5 4-11 2 5h4')
const Tilde = icon('M20 6L9 17l-5-5')
const Doble = icon('M2 12l5 5L17 7|M13 17l4 0')
const Cruz = icon('M18 6L6 18|M6 6l12 12')
const Repetir = icon('M17 2l4 4-4 4|M3 11V9a4 4 0 014-4h14|M7 22l-4-4 4-4|M21 13v2a4 4 0 01-4 4H3')
const Copa = icon('M8 3h8v5a4 4 0 01-8 0V3z|M10 15h4|M9 21h6')
const Prohibido = icon('M12 3a9 9 0 100 18 9 9 0 000-18|M5.6 5.6l12.8 12.8')

/** Los NUEVE estados del turno, con las palabras exactas del panel. Esta es la
 *  lista cerrada: no se inventa un décimo ni se renombra ninguno. */
export function EstadosDelTurno() {
  return (
    <div className="flex max-w-xl flex-wrap items-center gap-2">
      <StatusBadge visual={{ icon: Reloj, label: 'Esperando seña', tone: 'warning' }} />
      <StatusBadge visual={{ icon: Mano, label: 'Confirmada', tone: 'info' }} />
      <StatusBadge visual={{ icon: Tilde, label: 'Señada', tone: 'success' }} />
      <StatusBadge visual={{ icon: Doble, label: 'Jugada', tone: 'success' }} />
      <StatusBadge visual={{ icon: Doble, label: 'Sin cobrar', tone: 'destructive' }} />
      <StatusBadge visual={{ icon: Cruz, label: 'Ausente', tone: 'destructive' }} />
      <StatusBadge visual={{ icon: Repetir, label: 'Abonado', tone: 'info' }} />
      <StatusBadge visual={{ icon: Copa, label: 'Torneo', tone: 'warning' }} />
      <StatusBadge visual={{ icon: Prohibido, label: 'Bloqueado', tone: 'neutral' }} />
    </div>
  )
}
