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
  /** Horas mínimas entre "ahora" y el inicio del turno para reservar online
   *  (0–48). Ausente = 0, sin límite. Solo el jugador: el staff carga desde la
   *  Grilla sin este tope. Pedido de El Vagón (2026-10-17): le reservaban a
   *  último momento. Leer con `bookingMinAdvanceHours`, nunca directo. */
  booking_min_advance_hours?: number
  /** Horas antes del turno desde las cuales cancelar cuenta como "a último
   *  momento" (0–24). Solo reservas SIN seña. Ausente o 0 = apagado (el
   *  default). Primer nivel y no dentro de `cancellation_policy`, para que el
   *  merge superficial de esa clave no lo pise. Decisión 2026-10-21. */
  late_cancel_hours?: number
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
  /** ISO timestamp: cuándo el admin cerró el aviso de referidos de Hoy. Descarte persistente, no vuelve a mostrarse. */
  referral_banner_dismissed_at?: string
  /** D8 (Fase 2, resumen diario): opt-in explícito, default false — el push
   *  al admin con PWA es el default gratis, el email tiene costo por tenant×día. */
  daily_summary_email_opt_in?: boolean
  /** Resumen semanal por mail (los lunes, solo administradores): opt-in
   *  explícito, default false. Lo lee `daily-summary.worker.ts`. */
  weekly_summary_email_opt_in?: boolean
  /** Oculta todo precio del lado jugador (portal, APIs públicas, checkout,
   *  confirmación, mis reservas). Default false. Pedido del piloto: el dueño del
   *  predio que alquila controla cuánto cobra (2026-10-14). Leer con
   *  `arePublicPricesHidden`, nunca directo. */
  hide_public_prices?: boolean
}

export type CreateTenantInput = {
  name: string
  address: string
  city: string
  province: string
  phone: string
  email: string
  staffUserId: string
  /** Punto en el mapa. Opcional: el wizard nunca se bloquea por la ubicación
   *  (doc10 §82). Se cargan las dos o ninguna — todo el lado lector asume ese
   *  invariante (`ExplorarMap` exige ambas, el Haversine devuelve NULL si
   *  falta una). */
  latitude?: number | null
  longitude?: number | null
  /** Días de prueba gratuita. Omitido = `TRIAL_DAYS` (30), el default del
   *  self-signup — el wizard de onboarding NO lo pasa y no debe pasarlo.
   *  El alta asistida tampoco: usa los mismos 30 (decisión 2026-10-22). Hoy
   *  nadie lo pasa; otro largo es una decisión del dueño. */
  trialDays?: number
  /** UUID pre-generado por el caller (B2): permite resolver `referredByTenantId`
   *  ANTES del insert, para el chequeo real de "no autoreferirse" (además del
   *  CHECK `tenants_referred_by_not_self` de la DB). Omitido = la DB genera uno
   *  con `defaultRandom()`, como siempre. */
  id?: string
  /** Referidor del programa de referidos (B2), ya resuelto y validado por
   *  `resolveSignupReferrer`. `null`/omitido = alta sin referido. */
  referredByTenantId?: string | null
  /** Alta asistida desde el super-admin: se audita `support.tenant.created` en
   *  la MISMA transacción que la membresía y la suscripción. El self-signup no
   *  lo pasa. `metadata` nunca lleva la contraseña temporal. */
  assistedBy?: { systemAdminId: string; metadata: Record<string, unknown> }
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
  /** `null` explícito borra el punto; ausente lo deja como está. El tipo es
   *  `number` a propósito aunque la columna sea `numeric` (que drizzle habla
   *  como string): la conversión vive en `updateTenant`, y TypeScript la
   *  fuerza ahí en vez de dejar que un spread ciego escriba el tipo errado. */
  latitude: number | null
  longitude: number | null
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
    | 'booking_min_advance_hours'
    | 'late_cancel_hours'
    | 'auto_complete_minutes'
    | 'daily_summary_email_opt_in'
    | 'hide_public_prices'
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
  /** Cuándo TurnoGol comprobó que el permiso de MP del complejo ya no sirve
   *  (migr. 100). `null` = conectado o nunca conectado. Ver
   *  `payments/mp-connection.service.ts`. */
  mpDisconnectedAt: Date | null
  /** Punto en el mapa, ya convertido a número (la columna es `numeric` y
   *  drizzle la devuelve como string). `null` = todavía sin cargar. */
  latitude: number | null
  longitude: number | null
}
