import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { UserPlus, Mail, MoreHorizontal } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import { PinGate } from '@/components/pin-gate'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { inviteStaffAction, deactivateStaffAction, resendInviteAction } from './actions'

type FormAction = (formData: FormData) => Promise<void>

interface StaffMember {
  memberId: string
  staffUserId: string
  firstName: string
  lastName: string
  email: string
  isActive: boolean
  createdAt: Date
}

async function getStaffMembers(tenantId: string): Promise<StaffMember[]> {
  return withTenantContext(tenantId, async (tx) => {
    return tx
      .select({
        memberId: tenantStaffMembers.id,
        staffUserId: staffUsers.id,
        firstName: staffUsers.firstName,
        lastName: staffUsers.lastName,
        email: staffUsers.email,
        isActive: tenantStaffMembers.isActive,
        createdAt: tenantStaffMembers.createdAt,
      })
      .from(tenantStaffMembers)
      .innerJoin(staffUsers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(eq(tenantStaffMembers.tenantId, tenantId))
      .orderBy(tenantStaffMembers.createdAt)
  })
}

export default async function StaffPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const members = await getStaffMembers(tenant.id)
  const activeCount = members.filter((m) => m.isActive).length

  return (
    <PinGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Equipo</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeCount} admin{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
            </p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-500">
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Agregar admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invitar nuevo admin</DialogTitle>
              </DialogHeader>
              <form action={inviteStaffAction as unknown as FormAction} className="space-y-4">
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
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Estado
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.memberId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {m.firstName} {m.lastName}
                    {m.staffUserId === user.staffUserId && (
                      <span className="ml-2 text-xs text-slate-400">(vos)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{m.email}</td>
                  <td className="px-6 py-4">
                    {m.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.staffUserId !== user.staffUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Opciones">
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.isActive ? (
                            <form action={deactivateStaffAction.bind(null, m.memberId) as unknown as FormAction}>
                              <DropdownMenuItem asChild>
                                <button
                                  type="submit"
                                  className="w-full cursor-pointer text-left text-red-600"
                                >
                                  Desactivar
                                </button>
                              </DropdownMenuItem>
                            </form>
                          ) : (
                            <form action={resendInviteAction.bind(null, m.email) as unknown as FormAction}>
                              <DropdownMenuItem asChild>
                                <button type="submit" className="w-full cursor-pointer text-left">
                                  Reenviar invitación
                                </button>
                              </DropdownMenuItem>
                            </form>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {members.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Mail className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">No hay miembros de equipo aún.</p>
            </div>
          )}
        </div>
      </div>
    </PinGate>
  )
}
