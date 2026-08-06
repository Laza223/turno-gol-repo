'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { UserPlus } from 'lucide-react'
import type { StaffActionResult } from './actions'

type InviteAction = (formData: FormData) => Promise<StaffActionResult>

// The Radix Dialog only loads once the admin actually opens the invite form.
// Mounted conditionally (not in the initial tree) so its chunk is not preloaded
// into the Staff route's First Load JS.
const InviteStaffDialog = dynamic(
  () => import('./InviteStaffDialog').then((m) => m.InviteStaffDialog),
  { ssr: false },
)

export function InviteStaffButton({
  inviteAction,
  label = 'Agregar miembro del equipo',
}: {
  inviteAction: InviteAction
  /** Override para el empty state ("Invitar al primer miembro"), evita 2 botones con el mismo nombre accesible. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-primary/90 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {open && <InviteStaffDialog inviteAction={inviteAction} onClose={() => setOpen(false)} />}
    </>
  )
}
