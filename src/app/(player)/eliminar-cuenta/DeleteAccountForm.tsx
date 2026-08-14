'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { DeleteAccountResult } from './actions'

/** Firma de la Server Action que ejecuta la baja. */
export type RequestDeleteAccountAction = () => Promise<DeleteAccountResult>

/**
 * La action llega por PROP, no por import: './actions' es `'use server'` y
 * arrastra drizzle/postgres + `node:async_hooks` (vía request-context), lo
 * que rompe cualquier bundle de browser (Storybook) si se importa como
 * valor. El type import de `DeleteAccountResult` sí es seguro: se borra en
 * compilación.
 */
export function DeleteAccountForm({
  confirmEmail,
  action,
}: {
  confirmEmail: string
  action: RequestDeleteAccountAction
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-md shadow-red-600/25 transition-[background-color,scale] hover:bg-red-700 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Eliminar mi cuenta
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Eliminar tu cuenta TurnoGol?"
        description={
          <>
            Esta acción <strong>no se puede deshacer</strong>. Tu perfil se anonimiza y perdés
            acceso a tus reservas pasadas. Si querés conservar una copia, cancelá ahora y descargá
            tus datos desde <span className="font-semibold">Mi cuenta</span>.
          </>
        }
        confirmationPhrase={confirmEmail}
        confirmLabel="Eliminar mi cuenta"
        cancelLabel="No, volver"
        variant="destructive"
        onConfirm={async () => {
          const result = await action()
          if (!result.success) {
            return { success: false, error: result.error }
          }
          router.push('/ingresar?deleted=1')
          return { success: true }
        }}
      />
    </>
  )
}
