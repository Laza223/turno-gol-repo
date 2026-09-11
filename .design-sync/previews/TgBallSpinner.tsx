import { TgBallSpinner } from 'turnogol'

export function Tamanos() {
  return (
    <div className="flex items-end gap-6">
      <TgBallSpinner size="xs" />
      <TgBallSpinner size="sm" />
      <TgBallSpinner size="md" />
      <TgBallSpinner size="lg" text="Cargando turnos…" />
    </div>
  )
}
