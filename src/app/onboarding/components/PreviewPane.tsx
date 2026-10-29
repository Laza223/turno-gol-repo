'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

type Props = {
  /** Título del Sheet de vista previa en mobile ("Tu complejo", "Tu semana"...). */
  title: string
  children: React.ReactNode
}

/**
 * Dónde vive el preview del paso, no qué muestra (eso lo decide cada tarjeta:
 * `PublicCardPreview`, `WeekPreview`, `CourtsPreview`). Split panel §E.1 del plan
 * de refactor de onboarding.
 *
 * Desktop: columna fija a la derecha, siempre visible — es la mitad de la
 * pantalla que hoy no muestra nada del producto.
 *
 * Mobile: botón "Ver vista previa" a todo el ancho, después del form, que abre
 * el preview en un Sheet inferior. En una pantalla chica el form necesita toda
 * la atención; el preview es un vistazo opcional. `children` se renderiza dos
 * veces (aside desktop / Sheet mobile, este último solo montado al abrir),
 * así que un lector de pantalla nunca anuncia el mismo contenido dos veces.
 */
export function PreviewPane({ title, children }: Props) {
  return (
    <>
      {/* aria-label: WizardShell ya tiene un <aside> (el rail de marca) — axe
          (landmark-unique) exige nombres distintos entre dos landmarks del
          mismo tipo implícito. */}
      <aside
        aria-label={title}
        className="hidden lg:sticky lg:top-8 lg:block lg:w-80 lg:shrink-0 lg:self-start"
      >
        {children}
      </aside>

      {/* Mobile: una fila normal después del form (nada sticky: una barra
          pegada al pie tapaba el CTA y el campo enfocado con el teclado). Abre
          el preview en un Sheet inferior. Sin verde: el único verde es el CTA. */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="h-11 w-full gap-2">
              <Sparkles className="h-4 w-4" aria-hidden />
              Ver vista previa
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            overlayClassName="lg:hidden"
            className="max-h-[85dvh] overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <SheetHeader className="pb-3 pr-8">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
