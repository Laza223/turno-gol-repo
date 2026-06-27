import { Badge } from 'turnogol'

export function EstadosDeReserva() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Confirmada</Badge>
      <Badge variant="warning">Pendiente</Badge>
      <Badge variant="destructive">Cancelada</Badge>
      <Badge variant="secondary">Seña pagada</Badge>
      <Badge>Nueva</Badge>
      <Badge variant="outline">Abonado</Badge>
    </div>
  )
}
