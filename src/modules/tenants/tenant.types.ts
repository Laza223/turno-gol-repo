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

/** Producto pre-cargado de cantina para ventas rápidas en /caja. Precio en centavos ARS. */
export type CanteenProduct = {
  id: string
  name: string
  price: number
  /**
   * Stock disponible (unidades). Ausente/undefined = sin control de stock: la
   * venta no descuenta ni se bloquea (comportamiento por defecto). Un número
   * activa el control: la venta descuenta y se bloquea al llegar a 0.
   */
  stock?: number
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
  public_link_shared?: boolean
  canteen_products?: CanteenProduct[]
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
  email: string
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'blocked' | 'canceled' | 'churned' | 'deleted'
  trialEndsAt: Date | null
  settings: TenantSettings
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
  mpConnectedAt: Date | null
}
