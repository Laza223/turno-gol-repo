import { Coachmark, Button } from 'turnogol'

/** El tutorial es jugar (§7): el sistema enseña en contexto, con un globo que
 *  apunta al control real, y nunca con un manual.
 *
 *  OJO con el nombre de la prop: `targetId` NO es el `id` del elemento — el
 *  componente busca `[data-tour-id="…"]`. Un target marcado con `id` no lo
 *  encuentra y el globo no se dibuja, sin error ni aviso. */
export function PrimeraVez() {
  return (
    <div className="relative flex min-h-56 items-start justify-center p-10">
      <Button data-tour-id="coachmark-demo" variant="outline">
        Tocá un lugar libre
      </Button>
      <Coachmark
        targetId="coachmark-demo"
        text="Tocá cualquier lugar libre de la grilla para cargar una reserva."
        stepLabel="1 de 3"
        onDismiss={() => {}}
        onSkip={() => {}}
      />
    </div>
  )
}
