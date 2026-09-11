import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Button } from 'turnogol'

/** Ningún ícono queda mudo (§7.4): si un control es solo un ícono, lleva
 *  tooltip con su nombre. */
export function SobreUnIcono() {
  return (
    <div className="flex justify-center p-8">
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Cambiar densidad">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent forceMount side="bottom" sideOffset={6}>
            Cambiar densidad de la grilla
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
