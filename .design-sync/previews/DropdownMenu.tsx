import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Button,
} from 'turnogol'

export function Abierto() {
  return (
    <div className="flex justify-center p-6">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Opciones de la reserva</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent forceMount align="start" sideOffset={6}>
          <DropdownMenuItem>Ver detalle</DropdownMenuItem>
          <DropdownMenuItem>Editar turno</DropdownMenuItem>
          <DropdownMenuItem>Reenviar comprobante</DropdownMenuItem>
          <DropdownMenuItem className="text-red-600">Cancelar reserva</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
