'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The invite server action resolves to a result object; the form only cares
// about the side effect, so its return value is dropped at the <form action>.
type InviteAction = (formData: FormData) => Promise<unknown>
type FormAction = (formData: FormData) => void | Promise<void>

/**
 * Controlled "Invitar nuevo admin" dialog. Mounts already-open and reports
 * close via `onClose`, so InviteStaffButton can mount it ONLY after a click.
 *
 * This is the key to the code-split paying off: a `dynamic(ssr:false)` component
 * that renders in the initial tree gets preloaded (and still counts toward First
 * Load JS). Gating the mount behind the open state keeps the Radix Dialog
 * primitive out of the initial Staff chunk entirely.
 *
 * `inviteAction` is the server action, kept on the server while the UI is client.
 */
export function InviteStaffDialog({
  inviteAction,
  onClose,
}: {
  inviteAction: InviteAction
  onClose: () => void
}) {
  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar nuevo admin</DialogTitle>
        </DialogHeader>
        <form action={inviteAction as unknown as FormAction} className="space-y-4">
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
            <p className="text-xs text-slate-500">
              Recibirán un email para activar su cuenta.
            </p>
          </div>
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500">
            Enviar invitación
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
