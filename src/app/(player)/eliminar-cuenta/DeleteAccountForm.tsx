'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
      {/* El único color de alarma de la pantalla. Plano (sin sombra ni levante) y del ancho de su texto. */}
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="h-auto min-h-11 px-5 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-offset-background md:h-auto"
      >
        Eliminar mi cuenta
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Eliminar tu cuenta TurnoGol?"
        description={
          <>
            Esta acción <strong>no se puede deshacer</strong>. Borramos tu nombre, email y teléfono;
            las reservas que hiciste quedan en los complejos, sin tus datos. Si querés una copia,
            cancelá y descargala antes.
          </>
        }
        confirmationPhrase={confirmEmail}
        phraseMatch="email"
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
