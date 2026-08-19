'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionResult } from '@/shared/types/action-result'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { disconnectMercadoPagoAction } from './actions'

type Props = {
  /** Nick de la cuenta vinculada, para que el dueño vea cuál está por soltar. */
  nickname: string | null
  /** true si hoy el complejo cobra seña: desconectar la apaga. */
  requiresDeposit: boolean
}

/**
 * Contracara de "Conectar MercadoPago". Se renderiza solo cuando ya hay cuenta
 * vinculada, en el mismo lugar donde estaría el botón de conectar.
 */
export function DisconnectMpSection({ nickname, requiresDeposit }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Las consecuencias van enumeradas y concretas, no metidas en la prosa de la
  // descripción: apagar la seña es un efecto que el dueño NO pidió y tiene que
  // poder verlo antes de confirmar.
  const consequences = [
    'Las reservas online dejan de cobrar por MercadoPago.',
    ...(requiresDeposit
      ? ['La seña se desactiva: las reservas pasan a ser sin seña hasta que vuelvas a conectar.']
      : []),
    'Las reservas ya cobradas y la plata que MercadoPago te tiene que liquidar no se tocan.',
  ]

  async function onConfirm(): Promise<ActionResult> {
    const res = await disconnectMercadoPagoAction()
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-11 md:h-10 items-center rounded-lg border border-red-200 bg-card px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        Desconectar MercadoPago
      </button>

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
    </>
  )
}
