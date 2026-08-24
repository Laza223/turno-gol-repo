export type OpeningHoursDay = {
  open: string
  close: string
  closed?: boolean
}

export type OpeningHours = {
  mon: OpeningHoursDay
  tue: OpeningHoursDay
  wed: OpeningHoursDay
  thu: OpeningHoursDay
  fri: OpeningHoursDay
  sat: OpeningHoursDay
  sun: OpeningHoursDay
}

export type TenantSettings = {
  requires_deposit: boolean
  deposit_percentage: number
  cancellation_policy: {
    hours_before: number
    penalty_type: 'deposit' | 'full'
    penalty_amount: number | null
  }
  // No-show = softban por reincidencia (2da ausencia en 90 días → 14 días
  // sin reserva online, vía tenant_player_bans). Sin deuda de dinero y sin
  // configuración por complejo (revert de "no-show = deuda", 2026-07-11).
  accepts_cash: boolean
  accepts_transfer: boolean
  accepts_mercadopago: boolean
  allow_online_booking: boolean
  booking_advance_days: number
  auto_complete_minutes: number
  onboarding_step?: number
  onboarding_completed?: boolean
  /** ISO timestamp: cuándo se cerró el wizard (Fase 7 del plan de refactor —
   *  base para `daysSinceOnboarding` de `activation.first_online_booking`). */
  onboarding_completed_at?: string
  /** ISO timestamp: cuándo se mandó el recordatorio de onboarding a medio
   *  terminar (Fase 7, worker de abandono). Marca de idempotencia — un solo
   *  mail por tenant, nunca. */
  onboarding_abandoned_notified_at?: string
  public_link_shared?: boolean
  // canteen_products (JSONB) ELIMINADO: la cantina vive en la tabla
  // canteen_products desde la migr. 048; la key se borró en la 051.
  /** ISO timestamp: cuándo el admin vio/cerró el tour de coachmarks del dashboard (una sola vez). */
  admin_tour_seen_at?: string
  /** ISO timestamp: cuándo el admin descartó manualmente la checklist de onboarding. */
  checklist_dismissed_at?: string
  /** D8 (Fase 2, resumen diario): opt-in explícito, default false — el push
   *  al admin con PWA es el default gratis, el email tiene costo por tenant×día. */
  daily_summary_email_opt_in?: boolean
}

export type CreateTenantInput = {
  name: string
  address: string
  city: string
  province: string
  phone: string
  email: string
  staffUserId: string
}

export type UpdateTenantInput = Partial<{
  name: string
  description: string
  logoUrl: string | null
  coverUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  whatsapp: string | null
  email: string
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
}>

export type UpdateTenantSettingsInput = Partial<
  Pick<
    TenantSettings,
    | 'requires_deposit'
    | 'deposit_percentage'
    | 'cancellation_policy'
    | 'accepts_cash'
    | 'accepts_transfer'
    | 'accepts_mercadopago'
    | 'allow_online_booking'
    | 'booking_advance_days'
    | 'auto_complete_minutes'
    | 'daily_summary_email_opt_in'
  >
>

export type TenantRow = {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  /** Opcional: si está vacío, el contacto cae al `phone`. Ver `resolveTenantContact`. */
  whatsapp: string | null
  email: string
  status:
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'suspended'
    | 'blocked'
    | 'canceled'
    | 'churned'
    | 'deleted'
  trialEndsAt: Date | null
  settings: TenantSettings
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
  mpConnectedAt: Date | null
  /** Apodo de la cuenta de MP conectada. Sirve para mostrar CUÁL quedó. */
  mpNickname: string | null
}
