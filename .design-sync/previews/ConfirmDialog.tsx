import { ConfirmDialog } from 'turnogol'

export function Destructivo() {
  return (
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Cancelar reserva"
      description="Vas a cancelar el turno del sábado 20:00 en Cancha 3. Esta acción no se puede deshacer."
      confirmLabel="Sí, cancelar"
      cancelLabel="Volver"
      variant="destructive"
      onConfirm={async () => {}}
    />
  )
}
