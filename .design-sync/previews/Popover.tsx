import { Popover, PopoverTrigger, PopoverContent, Button } from 'turnogol'

/** Popover genérico: un disparador y contenido anclado, sin más contrato que ese. */
export function Ejemplo() {
  return (
    <div className="flex justify-center p-6">
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">Abrir</Button>
        </PopoverTrigger>
        <PopoverContent forceMount align="center" sideOffset={8} className="w-64">
          <p className="text-sm text-foreground">Contenido anclado al disparador.</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
