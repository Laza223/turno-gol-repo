'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import type { ActionResult } from '@/shared/types/action-result'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { DisconnectMpResult } from './actions'

type Props = {
  /** Nick de la cuenta vinculada, para que el dueño vea cuál está por soltar. */
  nickname: string | null
  /** true si hoy el complejo cobra seña: desconectar la apaga. */
  requiresDeposit: boolean
  /** `disconnectMercadoPagoAction`, por prop para que la story no arrastre el servidor. */
  disconnectAction: () => Promise<DisconnectMpResult>
}

/**
 * Contracara de "Conectar MercadoPago", dentro de "MercadoPago para cobrar la
 * seña" (Ajustes → Reservas y seña).
 *
 * Hasta el 2026-09-25 vivía plegado dentro de "Dar de baja", en Facturación, y
 * nadie lo buscaba ahí. Al mudarse al lado de la cuenta que desconecta sigue
 * plegado a propósito: la regla del dueño es que quede más claro, nunca más
 * fácil de tocar sin querer. Son los mismos pasos que antes —abrir, tocar,
 * confirmar— y las consecuencias se leen antes del botón, no solo en el
 * diálogo.
 */
export function DisconnectMpSection({ nickname, requiresDeposit, disconnectAction }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Las consecuencias van enumeradas y concretas, no metidas en la prosa: apagar
  // la seña es un efecto que el dueño NO pidió. Reconectar no la vuelve a
  // prender (api/mp/callback: la reconexión no toca `requires_deposit`).
  const consequences = [
    'Las reservas por internet dejan de cobrar seña.',
    ...(requiresDeposit
      ? ['La seña se apaga. Si después reconectás, la tenés que volver a prender acá.']
      : []),
    'Las reservas ya cobradas y la plata que MercadoPago te tiene que liquidar no se tocan.',
  ]

  async function onConfirm(): Promise<ActionResult> {
    const res = await disconnectAction()
    if (!res.success) return { success: false, error: res.error }
    toast({
      title: 'MercadoPago desconectado',
      description: 'Podés conectar la cuenta que quieras cuando quieras.',
      variant: 'success',
    })
    router.refresh()
    return { success: true }
  }

  return (
    <Collapsible className="mt-4 border-t border-border pt-3">
      <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-9">
        Desconectar MercadoPago
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <ul className="max-w-2xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center rounded-lg border border-red-200 bg-card px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 md:h-10 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          Desconectar
        </button>
      </CollapsibleContent>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Desconectar MercadoPago?"
        description={`Vas a dejar de cobrar con ${nickname ?? 'la cuenta vinculada'}.`}
        consequences={consequences}
        variant="destructive"
        confirmLabel="Desconectar"
        cancelLabel="Volver"
        onConfirm={onConfirm}
      />
    </Collapsible>
  )
}
