import { Collapsible, CollapsibleTrigger, CollapsibleContent } from 'turnogol'

/** Lo informativo se pliega; lo operativo queda a la vista (decisión del dueño
 *  2026-09-10, H002/H003). El desglose de Caja arranca cerrado. */
export function Plegado() {
  return (
    <div className="w-80 rounded-lg border border-border bg-card p-3">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-foreground">
          Desglose por método
          <span aria-hidden="true" className="text-muted-foreground">+</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 text-sm text-muted-foreground">
          Efectivo $ 120.000 · Transferencia $ 64.500
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function Abierto() {
  return (
    <div className="w-80 rounded-lg border border-border bg-card p-3">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-foreground">
          Desglose por método
          <span aria-hidden="true" className="text-muted-foreground">−</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-2 text-sm text-muted-foreground">
          <p>Efectivo — $ 120.000</p>
          <p>Transferencia — $ 64.500</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
