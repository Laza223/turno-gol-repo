import { CircleAlert, ExternalLink } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { getProfileGaps } from '@/modules/tenants/setup-gaps'
import { PerfilImagesForm } from './PerfilImagesForm'
import { TenantProfileForm } from './TenantProfileForm'
import {
  setTenantImageAction,
  removeTenantImageAction,
  updateTenantProfileAction,
  geocodeAddressAction,
} from './actions'
import { SettingsHeader } from '../SettingsHeader'

/**
 * Ajustes → Página pública: solo lo que ve el jugador. El resumen diario y el
 * email para entrar vivían acá, al lado de lo público; desde el 2026-09-25
 * están en "Vos y tu equipo" (`/settings/equipo`), en "Tu usuario".
 */
export default async function PerfilPage() {
  const { tenant } = await requireAdminStaff()
  const gaps = getProfileGaps(tenant)

  return (
    <div className="space-y-6">
      <SettingsHeader title="Página pública" />

      {/* Lo que el punto del riel y de la portada anuncian: qué falta y qué se pierde.
          Se va solo cuando se completa — no hay nada que descartar. */}
      {gaps.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">A tu página pública le falta algo</p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs">
              {gaps.map((g) => (
                <li key={g.key}>
                  <span className="font-semibold">{g.label}:</span> {g.impact}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Las dos cards de datos del complejo van lado a lado en escritorio; las
          filas plegables de abajo siguen a ancho completo. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        {/* Maqueta de la cabecera pública (cover + logo + nombre + dirección) +
          las dos filas de subida: antes había que abrir "Ver mi perfil
          público" en otra pestaña a ciegas para comprobar cómo quedaba una
          imagen recién subida. */}
        <div className="card-premium rounded-lg p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Fotos</h2>
            {/* H067: sin este link no había forma de verificar cómo quedaron
              el logo y la portada en el perfil público real. */}
            <a
              href={`/${tenant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver mi página
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
          geocodeAction={geocodeAddressAction}
        />
      </div>
    </div>
  )
}
