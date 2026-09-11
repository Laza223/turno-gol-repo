import { Badge } from 'turnogol'

/** Las palabras salen del vocabulario cerrado del panel (un término por
 *  estado en TODA la app). Hasta 2026-09-11 este preview decía "Pendiente",
 *  "Cancelada" y "Nueva", que la auditoría de coherencia eliminó — y era lo
 *  primero que leía el agente de diseño.
 *
 *  Para el estado de un turno el componente correcto es StatusBadge, que lleva
 *  ícono + texto siempre. Badge es la píldora genérica. */
export function EstadosDeReserva() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Señada</Badge>
      <Badge variant="warning">Esperando seña</Badge>
      <Badge variant="destructive">Sin cobrar</Badge>
      <Badge variant="secondary">Abonado</Badge>
      <Badge>Confirmada</Badge>
      <Badge variant="outline">Bloqueado</Badge>
    </div>
  )
}
