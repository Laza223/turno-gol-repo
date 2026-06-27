import { Button } from 'turnogol'

export function Variantes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Reservar turno</Button>
      <Button variant="secondary">Ver disponibilidad</Button>
      <Button variant="outline">Editar</Button>
      <Button variant="ghost">Cancelar</Button>
      <Button variant="destructive">Eliminar</Button>
      <Button variant="link">Más info</Button>
    </div>
  )
}

export function Tamaños() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Chico</Button>
      <Button size="default">Normal</Button>
      <Button size="lg">Grande</Button>
      <Button size="icon" aria-label="Agregar">+</Button>
    </div>
  )
}

export function Deshabilitado() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Reservar turno</Button>
      <Button variant="outline" disabled>
        Editar
      </Button>
    </div>
  )
}
