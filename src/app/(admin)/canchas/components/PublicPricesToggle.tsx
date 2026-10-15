'use client'

import { useState, useTransition } from 'react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/hooks/use-toast'
import type { ActionResult } from '@/shared/types/action-result'

type SetPublicPricesVisibilityAction = (visible: boolean) => Promise<ActionResult>

const pillClass = (active: boolean) =>
  `h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${
    active
      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs shadow-emerald-500/10'
      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
  }`

/**
 * "Mostrar precios en tu página": con No, el jugador ve canchas y horarios pero
 * ningún monto (`settings.hide_public_prices`). Se guarda al tocar, sin botón
 * de guardar: es una sola decisión de sí o no.
 */
export function PublicPricesToggle({
  initialVisible,
  action,
}: {
  initialVisible: boolean
  action: SetPublicPricesVisibilityAction
}) {
  const [visible, setVisible] = useState(initialVisible)
  const [isPending, startTransition] = useTransition()

  function change(next: boolean) {
    if (next === visible) return
    setVisible(next)
    startTransition(async () => {
      const res = await action(next)
      if (!res.success) {
        setVisible(!next)
        toast({ title: 'No se pudo guardar', description: res.error, variant: 'destructive' })
        return
      }
      toast({
        title: next ? 'Tus precios se ven en tu página' : 'Tus precios ya no se ven en tu página',
        variant: 'success',
      })
    })
  }

  return (
    <section
      aria-labelledby="precios-publicos"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <div>
        <h2 id="precios-publicos" className="text-base font-semibold text-foreground">
          Mostrar precios en tu página
        </h2>
        <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
          Si elegís No, los jugadores ven tus canchas y horarios libres, pero ningún precio: ni en
          tu página, ni en el buscador, ni al reservar. La seña se cobra igual.
        </p>
      </div>
      <SegmentedControl
        className="flex gap-2"
        aria-label="Mostrar precios en tu página"
        value={visible ? 'yes' : 'no'}
        onValueChange={(v) => change(v === 'yes')}
        itemClassName={pillClass}
        disabled={isPending}
        options={[
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
        ]}
      />
    </section>
  )
}
