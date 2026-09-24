import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import {
  SETTINGS_ADMIN_ONLY_NOTICE,
  SETTINGS_ADMIN_ONLY_NOTICE_TITLE,
  SETTINGS_ADMIN_ONLY_NOTICE_DESCRIPTION,
} from '@/modules/staff/roles'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import type { GridBooking } from '@/components/booking/BookingGrid'
import { GrillaView } from './GrillaView'
import { GrillaTabs } from './GrillaTabs'
import { SettingsAccessNotice } from '@/app/(admin)/settings/SettingsAccessNotice'
import {
  createBookingAction,
  checkSlotAvailabilityAction,
  searchBookingPlayersAction,
  addBookingChargeAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  revertNoShowAction,
  listRescheduleSlotsAction,
  rescheduleBookingAction,
  cancelBookingAction,
  releaseBlockAction,
  editBookingAction,
} from '@/app/(admin)/reservas/actions'
import { getBookingEditDetailAction } from '@/app/(admin)/reservas/edit-detail-actions'
import { createAbonadoAction } from '@/app/(admin)/abonados/actions'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'
import { listCanteenForBookingAction, sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import { listDayGridBookings } from '@/app/(admin)/reservas/queries'
import { artTodayStr } from '@/shared/dates/art'

export default async function GrillaPage(props: {
  searchParams: Promise<{ date?: string; notice?: string }>
}) {
  const searchParams = await props.searchParams
  // `/onboarding` y no `/login` en el rechazo: es el destino que esta página ya
  // tenía para "sin complejo resuelto" y se preserva tal cual.
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/onboarding')
  const { tenant } = auth

  const todayArt = artTodayStr()
  const dateStr = safeDateParam(searchParams.date, todayArt)

  // H163: `?notice=` viene del rebote de settings/layout.tsx cuando un
  // manager entra a Configuración. Único código soportado por ahora — si
  // aparece otro motivo de rebote con aviso, se suma acá.
  const showAdminOnlyNotice = searchParams.notice === SETTINGS_ADMIN_ONLY_NOTICE

  const { courts, dayBookings } = await withTenantContext(tenant.id, async (tx) => {
    const [courtList, bookingRows] = await Promise.all([
      listCourts(tenant.id, tx),
      listDayGridBookings(tenant.id, dateStr, tx),
    ])
    return { courts: courtList, dayBookings: bookingRows }
  })

  // El loader compartido con Hoy trae también los instantes físicos del turno:
  // desde el paso 3 (docs/decisions/2026-09-24-navegacion-panel.md) la Grilla
  // los necesita para abrir el mismo modal de cobro de Hoy, con el mismo
  // mapeo a milisegundos que dashboard/page.tsx.
  const initialBookings: GridBooking[] = dayBookings.map(({ startsAt, endsAt, ...booking }) => ({
    ...booking,
    startsAtMs: startsAt.getTime(),
    endsAtMs: endsAt.getTime(),
  }))

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 h-full">
      <SettingsAccessNotice
        title={showAdminOnlyNotice ? SETTINGS_ADMIN_ONLY_NOTICE_TITLE : undefined}
        description={showAdminOnlyNotice ? SETTINGS_ADMIN_ONLY_NOTICE_DESCRIPTION : undefined}
      />
      <GrillaTabs active="/grilla" />
      <GrillaView
        key={dateStr}
        courts={courts}
        initialBookings={initialBookings}
        date={dateStr}
        tenantId={tenant.id}
        openingHours={tenant.openingHours}
        closedDates={tenant.closedDates ?? []}
        closesNextDay={tenant.closesNextDay}
        cancellationPolicyHours={tenant.settings.cancellation_policy.hours_before}
        action={createBookingAction}
        createAbonadoAction={createAbonadoAction}
        checkAvailabilityAction={checkSlotAvailabilityAction}
        searchPlayersAction={searchBookingPlayersAction}
        slotPanelActions={{
          chargeDebtAction,
          completeAndChargeBookingAction,
          addBookingChargeAction,
          confirmDepositPaymentAction,
          markNoShowAction,
          revertNoShowAction,
          listRescheduleSlotsAction,
          rescheduleBookingAction,
          cancelBookingAction,
          releaseBlockAction,
          editBookingAction,
          getBookingEditDetailAction,
        }}
        canteen={{
          listCatalogAction: listCanteenForBookingAction,
          // sellTicketAction toma `unknown` y valida con Zod: el bookingId
          // extra que le agrega el diálogo entra por el mismo schema.
          sellTicketAction,
        }}
      />
    </div>
  )
}
