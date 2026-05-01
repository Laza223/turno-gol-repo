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
  no_show_penalty: {
    type: 'ban_days' | 'none'
    days: number
    threshold?: number
  }
  accepts_cash: boolean
  accepts_transfer: boolean
  accepts_mercadopago: boolean
  allow_online_booking: boolean
  booking_advance_days: number
  booking_duration_minutes: number[]
  auto_complete_minutes: number
  staff_pin_hash?: string
  onboarding_step?: number
  onboarding_completed?: boolean
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
  address: string
  city: string
  province: string
  phone: string
  whatsapp: string | null
  email: string
  openingHours: OpeningHours
  closedDates: string[]
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
  >
>

export type TenantRow = {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  email: string
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'blocked' | 'canceled' | 'churned' | 'deleted'
  trialEndsAt: Date | null
  settings: TenantSettings
  openingHours: OpeningHours
  closedDates: string[] | null
  mpConnectedAt: Date | null
}
