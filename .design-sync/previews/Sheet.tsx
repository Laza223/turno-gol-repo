import { Sheet, SheetContent, SheetHeader, SheetTitle, Button, StatusBadge } from 'turnogol'

function Tilde({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

/** El panel del turno de la Grilla: quién, cuándo, los tres números de plata y
 *  las acciones, sin salir de la grilla. Cobrar tiene que estar a un toque. */
export function PanelDelTurno() {
  return (
    <Sheet open>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Cancha 1 · 20:00 a 21:00</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Tomás García</span>
            <StatusBadge visual={{ icon: Tilde, label: 'Señada', tone: 'success' }} />
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Precio del turno</dt>
              <dd className="font-medium tabular-nums text-foreground">$ 40.000</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Cobrado</dt>
              <dd className="font-medium tabular-nums text-foreground">$ 12.000</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pendiente</dt>
              <dd className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">$ 28.000</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button>Cobrar $ 28.000</Button>
            <Button variant="outline">Cargar cantina</Button>
            <Button variant="ghost">Marcar ausente</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
