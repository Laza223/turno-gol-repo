import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { getBillingPayerEmail } from '@/modules/billing/billing.service'
import { listStaffRoster } from '@/modules/staff/staff.service'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { TOURNAMENTS_FLAG } from '@/modules/tournaments/tournament.flags'
import { StaffRosterView } from '@/app/(admin)/settings/equipo/StaffRosterView'
import { InviteStaffButton } from '@/app/(admin)/settings/equipo/InviteStaffButton'
import {
  deactivateStaffAction,
  inviteStaffAction,
  resendInviteAction,
  updateStaffRoleAction,
} from '@/app/(admin)/settings/equipo/actions'
import { AccountEmailForm } from '../perfil/AccountEmailForm'
import { AvisosForm } from '../perfil/AvisosForm'
import { updateAvisosSettingsAction, updateUserEmailAction } from '../perfil/actions'
import { SettingsHeader } from '../SettingsHeader'

/**
 * Ajustes → Vos y tu equipo: quién entra al panel y qué le llega. "Tu usuario"
 * (email para entrar y resumen diario) vivía en Perfil, al lado de lo que ve
 * el jugador; se mudó acá el 2026-09-25. Los forms y sus actions siguen en
 * `perfil/` — solo cambió dónde se muestran.
 */
export default async function SettingsEquipoPage() {
  const { user, tenant } = await requireAdminStaff()
  const staffUserId: string = user.staffUserId

  const [members, tournamentsEnabled] = await Promise.all([
    listStaffRoster(tenant.id),
    isFeatureEnabled(TOURNAMENTS_FLAG, tenant.id),
  ])
  // Sin email de pago propio (migr. 078) la cuota se cobra al email del dueño
  // (`getBillingPayerEmail` → `ownerEmail`). Se avisa solo cuando ese es el de
  // quien está mirando: otro admin no es a quien se le cobra. Es solo un aviso:
  // si la lectura de la suscripción falla, Equipo se muestra igual, sin él.
  let cuotaGoesToThisEmail = false
  try {
    const payer = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    cuotaGoesToThisEmail = payer.override == null && payer.ownerEmail === user.email
  } catch {
    cuotaGoesToThisEmail = false
  }

  return (
    <div className="space-y-6">
      {/* El botón de invitar cuelga de la barra superior, al lado del nombre de
          la página (MASTER §6.8). En el teléfono no entra ahí (tapaba el nombre
          y el botón de tema), así que baja al principio del contenido. */}
      <SettingsHeader
        title="Vos y tu equipo"
        actions={
          <div className="max-sm:hidden">
            <InviteStaffButton inviteAction={inviteStaffAction} />
          </div>
        }
      />
      <div className="sm:hidden">
        <InviteStaffButton inviteAction={inviteStaffAction} />
      </div>
      <StaffRosterView
        members={members}
        staffUserId={staffUserId}
        tournamentsEnabled={tournamentsEnabled}
        inviteAction={inviteStaffAction}
        deactivateAction={deactivateStaffAction}
        resendInviteAction={resendInviteAction}
        updateRoleAction={updateStaffRoleAction}
      />

      {/* `scroll-mt-24`: la portada linkea acá (`#tu-usuario`) y la barra es sticky. */}
      <section
        id="tu-usuario"
        aria-labelledby="tu-usuario-titulo"
        className="card-premium scroll-mt-24 rounded-lg p-6"
      >
        <header>
          <h2 id="tu-usuario-titulo" className="text-base font-semibold text-foreground">
            Tu usuario
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Esto no lo ve el jugador.</p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-10 xl:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Email para entrar</h3>
              {cuotaGoesToThisEmail && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Como no cargaste otra cuenta para pagar, la cuota se cobra a este email.
                </p>
              )}
            </div>
            <AccountEmailForm currentEmail={user.email} updateEmailAction={updateUserEmailAction} />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Resumen diario</h3>
            <AvisosForm s={tenant.settings} action={updateAvisosSettingsAction} />
          </div>
        </div>
      </section>
    </div>
  )
}
