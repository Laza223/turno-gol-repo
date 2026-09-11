import { Popover, PopoverTrigger, PopoverContent, Input, Label, Button } from 'turnogol'

/** El alta rápida de la Grilla: tocás un lugar libre y reservás ahí mismo.
 *  Tres campos como máximo, y el teléfono es opcional — nunca frena. */
export function AltaRapida() {
  return (
    <div className="flex justify-center p-6">
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">Cancha 2 · 21:00</Button>
        </PopoverTrigger>
        <PopoverContent forceMount align="center" sideOffset={8} className="w-72 space-y-3">
          <p className="text-sm font-semibold text-foreground">Reservar 21:00 en Cancha 2</p>
          <div className="space-y-1.5">
            <Label htmlFor="pv-nombre">Nombre</Label>
            <Input id="pv-nombre" placeholder="Tomás García" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pv-tel">Teléfono (opcional)</Label>
            <Input id="pv-tel" placeholder="11 5555-5555" />
          </div>
          <p className="text-sm text-muted-foreground">Precio de la franja: $ 40.000</p>
          <Button className="w-full">Reservar turno</Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
