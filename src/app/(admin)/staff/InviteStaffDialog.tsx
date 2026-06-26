'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import {
  DEFAULT_INVITE_ROLE,
  STAFF_ROLES,
  STAFF_ROLE_DESCRIPTIONS,
  STAFF_ROLE_LABELS,
} from '@/modules/staff/roles'
import type { StaffActionResult } from './actions'

// inviteStaffAction tiene firma (formData) => Promise<StaffActionResult>.
type InviteAction = (formData: FormData) => Promise<StaffActionResult>

// useFormState arranca en null (sin resultado todavía) y pasa a un StaffActionResult
// después del primer submit.
type FormState = StaffActionResult | null
const INITIAL_STATE: FormState = null

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full bg-emerald-600 hover:bg-emerald-500"
    >
      {pending ? 'Enviando…' : 'Enviar invitación'}
    </Button>
  )
}

/**
 * Controlled "Invitar miembro del equipo" dialog. Mounts already-open and reports
 * close via `onClose`, so InviteStaffButton can mount it ONLY after a click.
 *
 * This is the key to the code-split paying off: a `dynamic(ssr:false)` component
 * that renders in the initial tree gets preloaded (and still counts toward First
 * Load JS). Gating the mount behind the open state keeps the Radix Dialog
 * primitive out of the initial Staff chunk entirely.
 *
 * `inviteAction` is the server action, kept on the server while the UI is client.
 * Se cablea con useFormState para mostrar errores, estado de carga y, en éxito,
 * un toast + cierre del modal (la action ya hace revalidatePath('/staff')).
 */
export function InviteStaffDialog({
  inviteAction,
  onClose,
}: {
  inviteAction: InviteAction
  onClose: () => void
}) {
  const [state, formAction] = useFormState<FormState, FormData>(
    (_prev, formData) => inviteAction(formData),
    INITIAL_STATE,
  )

  // En éxito: avisamos con toast y cerramos. El ref evita re-disparar el cierre
  // si el efecto corre de nuevo antes de desmontar.
  const handledRef = useRef(false)
  useEffect(() => {
    if (state?.success && !handledRef.current) {
      handledRef.current = true
      toast({
        title: 'Invitación enviada',
        description: 'Recibirán un email para activar su cuenta.',
      })
      onClose()
    }
  }, [state, onClose])

  const errorMessage = state && !state.success ? state.error : null

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar miembro del equipo</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nombre</Label>
              <Input id="firstName" name="firstName" required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apellido</Label>
              <Input id="lastName" name="lastName" required className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              Recibirán un email para activar su cuenta.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">Rol</legend>
            {STAFF_ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-500/10"
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  defaultChecked={role === DEFAULT_INVITE_ROLE}
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">
                    {STAFF_ROLE_LABELS[role]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {STAFF_ROLE_DESCRIPTIONS[role]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-md bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30"
            >
              {errorMessage}
            </p>
          )}

          <SubmitButton />
        </form>
      </DialogContent>
    </Dialog>
  )
}
