'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { requestDeleteAccountAction } from './actions'

export function DeleteAccountForm({ confirmEmail }: { confirmEmail: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 w-full bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold active:scale-[0.98] transition-colors"
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
          const result = await requestDeleteAccountAction()
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
