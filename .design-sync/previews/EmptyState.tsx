import { EmptyState, Button } from 'turnogol'

const Pelota = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5l3.5 2.6-1.35 4.15h-4.3L8.5 10.1z" />
    <path d="M12 3v4.5M21 12l-5.5-1.9M3 12l5.5-1.9M5.8 19l3.5-3.25M18.2 19l-3.5-3.25" />
  </svg>
)

export function SinReservas() {
  return (
    <div className="w-96">
      <EmptyState
        illustration={Pelota}
        title="No tenés reservas todavía"
        description="Cuando reserves un turno vas a verlo acá, con la cancha, el horario y el estado de la seña."
        action={<Button>Reservar una cancha</Button>}
      />
    </div>
  )
}
