import { Bell, ChevronDown, ExternalLink, Mail } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PerfilImagesForm } from './PerfilImagesForm'
import { AccountEmailForm } from './AccountEmailForm'
import { TenantProfileForm } from './TenantProfileForm'
import { AvisosForm } from './AvisosForm'
import {
  setTenantImageAction,
  removeTenantImageAction,
  updateUserEmailAction,
  updateTenantProfileAction,
  updateAvisosSettingsAction,
} from './actions'
import { SettingsTabs } from '../SettingsTabs'

const TRIGGER_CLASS =
  'group flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-6 py-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0'

export default async function PerfilPage() {
  const { user, tenant } = await requireAdminStaff()
  const s = tenant.settings

  return (
    <div className="space-y-6">
      {/* MASTER §6.8: la vista no abre encabezado propio — ver reservas/page.tsx. */}
      <SettingsTabs active="/settings/perfil" />

      {/* Maqueta de la cabecera pública (cover + logo + nombre + dirección) +
          las dos filas de subida: antes había que abrir "Ver mi perfil
          público" en otra pestaña a ciegas para comprobar cómo quedaba una
          imagen recién subida. */}
      <div className="card-premium rounded-lg p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Perfil público</h2>
          {/* H067: sin este link no había forma de verificar cómo quedaron
              el logo y la portada en el perfil público real. */}
          <a
            href={`/${tenant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver mi perfil público
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
        <PerfilImagesForm
          tenantName={tenant.name}
          tenantAddress={tenant.address}
          tenantCity={tenant.city}
          logoUrl={tenant.logoUrl}
          coverUrl={tenant.coverUrl}
          setImageAction={setTenantImageAction}
          removeImageAction={removeTenantImageAction}
        />
      </div>

      {/* Fusiona Contacto + Ubicación en un solo form con un solo "Guardar
          cambios" — antes eran dos cards con dos botones. */}
      <TenantProfileForm
        currentPhone={tenant.phone}
        currentEmail={tenant.email}
        currentWhatsapp={tenant.whatsapp}
        currentAddress={tenant.address}
        currentCity={tenant.city}
        currentProvince={tenant.province}
        currentLatitude={tenant.latitude}
        currentLongitude={tenant.longitude}
        action={updateTenantProfileAction}
      />

      {/* H161: Avisos era su propia pestaña top-level para esta única
          preferencia — se plegó como una fila más, colapsada por defecto, con
          el estado actual visible sin abrirla. */}
      <div className="card-premium overflow-hidden rounded-lg">
        <Collapsible>
          <CollapsibleTrigger className={TRIGGER_CLASS}>
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Resumen diario por email
            </span>
            <span className="flex items-center gap-3">
              <span className="text-sm font-normal text-muted-foreground">
                {s.daily_summary_email_opt_in ? 'Activado' : 'Desactivado'}
              </span>
              <ChevronDown
                className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-6 pb-6">
            <AvisosForm s={s} action={updateAvisosSettingsAction} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="card-premium overflow-hidden rounded-lg">
        <Collapsible>
          <CollapsibleTrigger className={TRIGGER_CLASS}>
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Correo con el que entrás
            </span>
            <span className="flex items-center gap-3">
              <span className="truncate text-sm font-normal text-muted-foreground">
                {user.email}
              </span>
              <ChevronDown
                className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-6 pb-6">
            <AccountEmailForm currentEmail={user.email} updateEmailAction={updateUserEmailAction} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
