import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, Button } from 'turnogol'

export function Abierto() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar reserva</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-slate-600">
          Cancha 3 — Fútbol 5, sábado 20:00 a 21:00. Seña a pagar ahora: <strong>$8.000</strong>.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button>Confirmar y pagar seña</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
