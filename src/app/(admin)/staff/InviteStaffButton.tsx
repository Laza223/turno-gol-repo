'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StaffActionResult } from './actions'

type InviteAction = (formData: FormData) => Promise<StaffActionResult>

// The Radix Dialog only loads once the admin actually opens the invite form.
// Mounted conditionally (not in the initial tree) so its chunk is not preloaded
// into the Staff route's First Load JS.
const InviteStaffDialog = dynamic(
  () => import('./InviteStaffDialog').then((m) => m.InviteStaffDialog),
  { ssr: false },
)

export function InviteStaffButton({ inviteAction }: { inviteAction: InviteAction }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
        Agregar admin
      </Button>
      {open && <InviteStaffDialog inviteAction={inviteAction} onClose={() => setOpen(false)} />}
    </>
  )
}
