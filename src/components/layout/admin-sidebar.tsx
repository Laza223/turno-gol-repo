'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  LayoutDashboard,
  CalendarDays,
  Clock,
  Contact,
  Banknote,
  LandPlot,
  ChartLine,
  Lock,
  LogOut,
  Settings,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/lib/status-tone'
import { WhatsappIcon } from '@/components/icons/WhatsappIcon'
import { SUPPORT_WHATSAPP_URL, TRIAL_ENDING_WARNING_DAYS } from '@/shared/constants'
import type { StaffRole } from '@/modules/staff/roles'
import { NO_SETUP_ALERTS, type SetupAlerts } from './setup-alerts'
import { SetupAlertDot } from './setup-alert-dot'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
  /** Email del staff logueado: rotula la cuenta en el riel y en el cajón mobile. */
  userEmail: string
  onSignOut: () => void
  /** Feature flag 'tournaments' resuelto server-side para este complejo. */
  tournamentsEnabled?: boolean
  /** Rol del staff logueado, leído de la DB server-side. Sin valor (p. ej. stories/tests
   *  sin threadear el prop) se trata como no-admin, igual criterio que `tournamentsEnabled`. */
  staffRole?: StaffRole
  /** Cuántas cosas por completar tiene cada zona: prende el punto rojo del ítem. */
  setupAlerts?: SetupAlerts
  /** Días de prueba gratis que le quedan al complejo, o null si no está en prueba. */
  trialDaysLeft?: number | null
}

export interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Solo se muestra si la feature está prendida para el complejo. */
  requiresTournaments?: boolean
  /** Solo se muestra al rol admin (el manager no puede completar estas pantallas). */
  requiresAdmin?: boolean
  /** Qué aviso de `SetupAlerts` prende el punto rojo de este espacio. */
  alertKey?: keyof SetupAlerts
  /** Ancla para DashboardTour/useCoachmarkTour (`[data-tour-id]`). */
  tourId?: string
  /**
   * Qué pathnames encienden este espacio. Necesario desde Fase 4: un espacio ya
   * no es una ruta sino un conjunto de ellas (Grilla incluye `/reservas`,
   * Clientes incluye `/abonados`), así que el prefijo del href no alcanza.
   */
  match?: (pathname: string) => boolean
}

/**
 * Los 6 espacios del staff (visión v2 §3.2), ordenados por frecuencia real de
 * uso — no por el schema. Configuración vive aparte, al pie: está fuera del
 * flujo diario.
 *
 * Fase 4 fusionó a nivel de navegación: "Agenda" (ex-"Reservas") es la
 * pestaña Lista de Grilla y "Turnos fijos" es una pestaña de Clientes. Las
 * URLs no cambiaron — ninguna ruta se movió, sólo dejaron de ser ítems de
 * primer nivel.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Hoy' },
  {
    href: '/grilla',
    icon: CalendarDays,
    label: 'Grilla',
    tourId: 'tour-grilla',
    match: (p) => p === '/grilla' || p === '/reservas' || p.startsWith('/reservas/'),
  },
  // Directo a Cuentas: `/caja` solo redirige desde que Vender se fue a Hoy
  // (mismo criterio que CONFIG_ITEM, un render de servidor menos).
  {
    href: '/caja/cuentas',
    icon: Banknote,
    label: 'Caja',
    match: (p) => p === '/caja' || p.startsWith('/caja/'),
  },
  {
    href: '/jugadores',
    icon: Contact,
    label: 'Clientes',
    match: (p) => p.startsWith('/jugadores') || p.startsWith('/abonados'),
  },
  // Canchas salió de Configuración el 2026-09-10, a pedido del dueño: define el
  // inventario y los precios, que es de lo que vive el complejo, y estaba
  // enterrada a dos niveles. Sigue siendo solo del dueño.
  { href: '/canchas', icon: LandPlot, label: 'Canchas', requiresAdmin: true, alertKey: 'courts' },
  { href: '/torneos', icon: Trophy, label: 'Torneos', requiresTournaments: true },
  // Solo del dueño (2026-09-19): las métricas del negocio son sensibles y el
  // Encargado opera el día a día, no lo mira.
  { href: '/analiticas', icon: ChartLine, label: 'Métricas', requiresAdmin: true },
]

/**
 * Fuera del flujo diario: se separa del resto empujándolo al pie del riel.
 *
 * Apunta a `/settings/reservas` y no a `/settings`: esa última es un stub cuyo
 * único cuerpo es `redirect('/settings/reservas')`, así que entrar por ahí
 * costaba un render de servidor entero —con su cadena de auth completa— para
 * después mandar al navegador a hacer una segunda navegación. El destino final
 * es el mismo. `/settings` sigue existiendo para links y favoritos viejos.
 */
export const CONFIG_ITEM: NavItem = {
  href: '/settings/reservas',
  icon: Settings,
  label: 'Configuración',
  requiresAdmin: true,
  alertKey: 'profile',
  match: (p) => p === '/settings' || p.startsWith('/settings/'),
}

/**
 * En el riel el rótulo dice "Ajustes" y no "Configuración": a 60 px de ancho la
 * palabra larga no entra en una línea, y partirla en dos rompe la altura de fila
 * del resto. El cajón mobile, que tiene ancho, sigue diciendo la palabra
 * completa — es el mismo espacio y el vocabulario de la auditoría lo nombra así.
 */
const CONFIG_RAIL_LABEL = 'Ajustes'

/** Un espacio está activo si su `match` lo dice; si no, por igualdad o prefijo del href. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

/** El espacio lleva punto rojo si la zona que le corresponde tiene algo por completar. */
export function navItemHasAlert(item: NavItem, alerts: SetupAlerts): boolean {
  return item.alertKey != null && alerts[item.alertKey] > 0
}

export function visibleNavItems(opts: {
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!item.requiresTournaments || opts.tournamentsEnabled) &&
      (!item.requiresAdmin || opts.staffRole === 'admin'),
  )
}

/**
 * Fila del riel, ícono arriba y rótulo abajo (60×52): así se ve SIEMPRE en
 * touch (`pointer-fine` no matchea), porque el mostrador atiende desde una
 * tablet, donde no hay hover y un ícono solo es una adivinanza.
 *
 * Con mouse (`pointer-fine`, ver `RAIL_ITEM_HOVERABLE`) el riel es solo
 * íconos y pasa a fila: el rótulo se revela a la derecha del ícono cuando el
 * riel se despliega (hover o foco adentro de `<aside>`, `group/rail` más
 * abajo). El ícono no se mueve entre los dos estados: la fila usa
 * `justify-start` con un padding-left fijo tanto cerrado como abierto.
 */
const RAIL_ITEM =
  'flex w-[60px] min-h-[52px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-[10px] px-1 text-[10px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
/**
 * Se suma a `RAIL_ITEM` solo en los espacios ícono+rótulo (navegación, Ayuda,
 * Configuración): "Prueba" son dos líneas de texto sin ícono y queda afuera a
 * propósito, no tiene un glifo que fijar en su lugar.
 */
const RAIL_ITEM_HOVERABLE =
  'pointer-fine:w-full pointer-fine:min-h-[44px] pointer-fine:flex-row pointer-fine:items-center pointer-fine:justify-start pointer-fine:gap-3 pointer-fine:pl-[26px] pointer-fine:pr-4 pointer-fine:py-0'
/**
 * Rótulo de un espacio del riel: siempre visible en touch. Con mouse arranca
 * en 0 de ancho y opacidad, y se desliza hacia la derecha (`translate-x`)
 * cuando el `<aside>` (`group/rail`) recibe hover o foco de teclado adentro.
 * El delay de apertura (120 ms) vive en esas reglas, así que solo se aplica
 * al abrir — cerrar es inmediato.
 */
const RAIL_LABEL = cn(
  'max-w-full truncate',
  'pointer-fine:max-w-0 pointer-fine:translate-x-1 pointer-fine:overflow-hidden pointer-fine:whitespace-nowrap pointer-fine:text-sm pointer-fine:font-medium pointer-fine:tracking-normal pointer-fine:opacity-0',
  'pointer-fine:transition-[max-width,opacity,transform] pointer-fine:duration-200 pointer-fine:ease-out pointer-fine:delay-0',
  'pointer-fine:group-hover/rail:max-w-[140px] pointer-fine:group-hover/rail:translate-x-0 pointer-fine:group-hover/rail:opacity-100 pointer-fine:group-hover/rail:delay-[120ms]',
  'pointer-fine:group-has-[:focus-visible]/rail:max-w-[140px] pointer-fine:group-has-[:focus-visible]/rail:translate-x-0 pointer-fine:group-has-[:focus-visible]/rail:opacity-100 pointer-fine:group-has-[:focus-visible]/rail:delay-[120ms]',
  'motion-reduce:transition-none motion-reduce:delay-0',
)
/** Texto que un lector de pantalla oye en lugar del color del punto. */
const ALERT_LABEL = '— hay algo por completar'
const NAV_ACTIVE = 'bg-primary/10 text-emerald-800 dark:text-emerald-300'
const NAV_IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

/** Esquina superior derecha del ícono; el aro lo separa del glifo y del fondo del riel. */
const RAIL_DOT = 'absolute -right-1 -top-0.5 ring-2 ring-card'

function navIconClass(active: boolean) {
  return cn('h-5 w-5 shrink-0', active && 'text-emerald-700 dark:text-emerald-400')
}

/**
 * Ayuda — el único acceso a soporte desde adentro del panel.
 *
 * Hasta ahora el WhatsApp de TurnoGol sólo aparecía en el banner de cuenta
 * suspendida (`status-banner.tsx`): un complejo que está trabajando y se traba
 * no tenía de dónde preguntar. Va arriba de Configuración, en el pie del riel,
 * porque tampoco es del flujo diario.
 *
 * Lo ve también el encargado: es un link, no un permiso, y el que está en el
 * mostrador a las 11 de la noche es justamente el que necesita preguntar.
 *
 * El ícono es el de WhatsApp a propósito: el rótulo dice "Ayuda" pero esto se
 * va de la aplicación, y el glifo lo avisa antes del toque.
 */
function SupportLink({
  className,
  labelClassName,
  onNavigate,
}: {
  className: string
  /** El riel apila ícono y rótulo; el cajón los pone en fila. El rótulo se
   *  estira sólo en el segundo — con `flex-1` en el riel crecería a lo alto. */
  labelClassName: string
  onNavigate?: () => void
}) {
  return (
    <a
      href={SUPPORT_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className={cn(className, NAV_IDLE)}
    >
      <WhatsappIcon className="h-5 w-5 shrink-0" />
      <span className={labelClassName}>Ayuda</span>
    </a>
  )
}

/**
 * El período de prueba, en el pie del riel arriba de Ayuda (2026-09-24, pedido del
 * dueño). Antes era una banda verde a lo ancho de TODAS las pantallas durante toda
 * la prueba: ~45 px de cada vista para un dato que cambia una vez por día. Acá se
 * ve siempre sin robarle lugar a nada. Pasa a ámbar desde el primer aviso por mail
 * (`TRIAL_ENDING_WARNING_DAYS`), así el riel y el mail dicen lo mismo el mismo día.
 *
 * Al dueño lo lleva a Facturación ("Elegir plan"); al encargado no le ofrece un
 * link que lo rebota (Configuración es del dueño): se lo muestra y nada más.
 */
const TRIAL_URGENT_DAYS = Math.max(...TRIAL_ENDING_WARNING_DAYS)
const BILLING_HREF = '/settings/facturacion'

function trialDaysLabel(days: number) {
  return `${days} ${days === 1 ? 'día' : 'días'}`
}

function TrialRailItem({ daysLeft, canChoosePlan }: { daysLeft: number; canChoosePlan: boolean }) {
  const urgent = daysLeft <= TRIAL_URGENT_DAYS
  const className = cn(
    RAIL_ITEM,
    'mb-1 gap-0.5 text-center ring-1 ring-inset',
    urgent ? 'bg-warning/10 ring-warning/40' : 'ring-border',
    canChoosePlan && 'hover:bg-accent',
  )
  // El nombre accesible CONTIENE el texto visible ("Prueba 73 días"), con el resto
  // de la frase en sr-only: quien maneja por voz lo activa diciendo lo que ve.
  const content = (
    <>
      <span className="text-muted-foreground">
        <span className="sr-only">Período de </span>Prueba
      </span>
      <span
        className={cn(
          'text-xs font-bold tabular-nums',
          urgent ? TONE_TEXT.warning : 'text-foreground',
        )}
      >
        {trialDaysLabel(daysLeft)}
      </span>
    </>
  )
  if (!canChoosePlan) return <div className={className}>{content}</div>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={BILLING_HREF} className={className}>
          {content}
          <span className="sr-only">. Elegir plan</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">Elegir plan</TooltipContent>
    </Tooltip>
  )
}

function TrialDrawerRow({
  daysLeft,
  canChoosePlan,
  className,
  onNavigate,
}: {
  daysLeft: number
  canChoosePlan: boolean
  className: string
  onNavigate: () => void
}) {
  const urgent = daysLeft <= TRIAL_URGENT_DAYS
  // Dos renglones: en los 240 px del cajón "Período de prueba · 73 días" más
  // "Elegir plan" no entran en uno, y el que se cortaba era justo el número.
  const content = (
    <>
      <Clock className={cn('h-5 w-5 shrink-0', urgent && TONE_TEXT.warning)} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">Período de prueba</span>
        <span className="text-xs">
          <span
            className={cn(
              'font-semibold tabular-nums',
              urgent ? TONE_TEXT.warning : 'text-foreground',
            )}
          >
            {trialDaysLabel(daysLeft)}
          </span>
          {canChoosePlan && (
            <>
              {' · '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                Elegir plan
              </span>
            </>
          )}
        </span>
      </span>
    </>
  )
  if (!canChoosePlan) return <div className={cn(className, 'text-muted-foreground')}>{content}</div>
  return (
    <Link href={BILLING_HREF} onClick={onNavigate} className={cn(className, NAV_IDLE)}>
      {content}
    </Link>
  )
}

/** Inicial de la cuenta a partir del email, que es lo único que el shell tiene. */
function accountInitial(email: string) {
  return (email.trim()[0] ?? '?').toUpperCase()
}

function AccountMenu({
  userEmail,
  onSignOut,
  className,
}: {
  userEmail: string
  onSignOut: () => void
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta: ${userEmail}`}
          className={cn(
            // 44px (MASTER §10): el mostrador atiende desde una tablet, que
            // entra en el mismo ancho donde vive el riel.
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {accountInitial(userEmail)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="right" sideOffset={8} className="w-64 p-2">
        {/* Sin modificador de opacidad sobre `--muted-foreground`: está calibrado
            a 4.93:1 (globals.css) y cualquier `/N` lo deja bajo AA. */}
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground break-all">{userEmail}</p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Salir</span>
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Riel de 72 px (escritorio y tablet). Reemplaza a la barra de 240: el nombre del
 * complejo pasó a la barra superior y el total del día se eliminó (ese número es
 * de Caja), así que de la barra vieja sólo quedaba la lista de espacios — y esa
 * entra en 72.
 */
function SidebarRail({
  pathname,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
  setupAlerts,
  trialDaysLeft,
}: {
  pathname: string
  userEmail: string
  onSignOut: () => void
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
  setupAlerts: SetupAlerts
  trialDaysLeft: number | null
}) {
  const navItems = visibleNavItems({ tournamentsEnabled, staffRole })
  const canConfigure = staffRole === 'admin'
  const ConfigIcon = CONFIG_ITEM.icon
  const configActive = isNavItemActive(CONFIG_ITEM, pathname)
  const configAlert = navItemHasAlert(CONFIG_ITEM, setupAlerts)

  return (
    <aside
      className={cn(
        'hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[72px] flex-col items-center gap-1 border-r border-border bg-card py-3',
        // `group/rail`: con mouse, el riel se despliega en overlay (no empuja el
        // contenido — `admin-layout-shell.tsx` deja el `lg:pl-[72px]` fijo) al
        // pasar el mouse o tener foco DE TECLADO adentro. No `focus-within`: el
        // clic deja el foco en el link y el riel quedaba abierto hasta clickear
        // afuera. `delay-[120ms]` solo al abrir: abre con un respiro, cierra de una.
        'group/rail pointer-fine:transition-[width,box-shadow] pointer-fine:duration-200 pointer-fine:ease-out pointer-fine:delay-0',
        'pointer-fine:hover:w-56 pointer-fine:hover:shadow-xl pointer-fine:hover:delay-[120ms]',
        'pointer-fine:has-[:focus-visible]:w-56 pointer-fine:has-[:focus-visible]:shadow-xl pointer-fine:has-[:focus-visible]:delay-[120ms]',
        'motion-reduce:transition-none motion-reduce:delay-0',
      )}
    >
      <Link
        href="/dashboard"
        aria-label="TurnoGol"
        className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* accentClassName = textClassName: la G por defecto es emerald, y este
            badge YA es `bg-primary` (emerald) — con el default la G se funde
            contra su propio fondo (invisible en claro, borrosa en oscuro). */}
        <Logo
          variant="icon"
          className="text-[15px]"
          textClassName="text-primary-foreground"
          accentClassName="text-primary-foreground"
        />
      </Link>

      <nav
        aria-label="Navegación del panel"
        className="flex w-full flex-col items-center gap-1 overflow-y-auto"
      >
        {navItems.map((item) => {
          const { href, icon: Icon, label, tourId } = item
          const isActive = isNavItemActive(item, pathname)
          return (
            <Link
              key={href}
              href={href}
              data-tour-id={tourId}
              aria-current={isActive ? 'page' : undefined}
              className={cn(RAIL_ITEM, RAIL_ITEM_HOVERABLE, isActive ? NAV_ACTIVE : NAV_IDLE)}
            >
              <span className="relative flex shrink-0">
                <Icon className={navIconClass(isActive)} />
                {navItemHasAlert(item, setupAlerts) && <SetupAlertDot className={RAIL_DOT} />}
              </span>
              <span className={RAIL_LABEL}>{label}</span>
              {navItemHasAlert(item, setupAlerts) && <span className="sr-only">{ALERT_LABEL}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {trialDaysLeft !== null && (
        <TrialRailItem daysLeft={trialDaysLeft} canChoosePlan={canConfigure} />
      )}

      <SupportLink className={cn(RAIL_ITEM, RAIL_ITEM_HOVERABLE)} labelClassName={RAIL_LABEL} />

      {canConfigure ? (
        <Link
          href={CONFIG_ITEM.href}
          aria-label={configAlert ? `${CONFIG_ITEM.label} ${ALERT_LABEL}` : CONFIG_ITEM.label}
          aria-current={configActive ? 'page' : undefined}
          className={cn(RAIL_ITEM, RAIL_ITEM_HOVERABLE, configActive ? NAV_ACTIVE : NAV_IDLE)}
        >
          <span className="relative flex shrink-0">
            <ConfigIcon className={navIconClass(configActive)} />
            {configAlert && <SetupAlertDot className={RAIL_DOT} />}
          </span>
          <span className={RAIL_LABEL}>{CONFIG_RAIL_LABEL}</span>
        </Link>
      ) : (
        // MASTER §6.8: al manager el ítem se le BLOQUEA, no se le esconde — el
        // encargado entiende el sistema completo y sabe a quién pedirle. El
        // candado comunica sin hover (touch); el tooltip agrega el porqué, que en
        // el riel no tiene otro lugar donde caber.
        // Es un `button` y no un `span`: el trigger del tooltip tiene que ser
        // focusable, y `disabled` mataría el focus junto con el tooltip.
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled="true"
              aria-label={`${CONFIG_ITEM.label}: solo el dueño`}
              onClick={(e) => e.preventDefault()}
              className={cn(
                RAIL_ITEM,
                RAIL_ITEM_HOVERABLE,
                'cursor-not-allowed text-muted-foreground/60',
              )}
            >
              <span className="relative shrink-0">
                <ConfigIcon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                <Lock
                  className="absolute -right-1.5 -bottom-1 h-3 w-3 text-muted-foreground/70"
                  aria-hidden
                />
              </span>
              <span className={RAIL_LABEL}>{CONFIG_RAIL_LABEL}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Solo el dueño</TooltipContent>
        </Tooltip>
      )}

      <AccountMenu userEmail={userEmail} onSignOut={onSignOut} className="mt-2" />
    </aside>
  )
}

/**
 * Cajón mobile detrás de "Más" de la barra inferior: acá sí hay ancho, así que
 * los espacios van en lista con el rótulo al lado del ícono y Configuración con
 * su nombre completo.
 */
function SidebarDrawerContent({
  tenantName,
  pathname,
  onClose,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
  setupAlerts,
  trialDaysLeft,
}: {
  tenantName: string
  pathname: string
  onClose: () => void
  userEmail: string
  onSignOut: () => void
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
  setupAlerts: SetupAlerts
  trialDaysLeft: number | null
}) {
  const navItems = visibleNavItems({ tournamentsEnabled, staffRole })
  const canConfigure = staffRole === 'admin'
  const ConfigIcon = CONFIG_ITEM.icon
  const configActive = isNavItemActive(CONFIG_ITEM, pathname)

  const rowClass =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Complejo
          </p>
          <p className="mt-1 truncate text-sm font-semibold leading-tight tracking-tight text-foreground">
            {tenantName}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav
        aria-label="Navegación del panel"
        className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4"
      >
        {navItems.map((item) => {
          const { href, icon: Icon, label } = item
          const isActive = isNavItemActive(item, pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onClose}
              className={cn(rowClass, isActive ? NAV_ACTIVE : NAV_IDLE)}
            >
              <Icon className={navIconClass(isActive)} />
              <span className="flex-1 truncate">{label}</span>
              {navItemHasAlert(item, setupAlerts) && <SetupAlertDot label={ALERT_LABEL} />}
            </Link>
          )
        })}

        {trialDaysLeft !== null && (
          <TrialDrawerRow
            daysLeft={trialDaysLeft}
            canChoosePlan={canConfigure}
            className={rowClass}
            onNavigate={onClose}
          />
        )}

        <SupportLink className={rowClass} labelClassName="flex-1 truncate" onNavigate={onClose} />

        {canConfigure ? (
          <Link
            href={CONFIG_ITEM.href}
            aria-current={configActive ? 'page' : undefined}
            onClick={onClose}
            className={cn(rowClass, configActive ? NAV_ACTIVE : NAV_IDLE)}
          >
            <ConfigIcon className={navIconClass(configActive)} />
            <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
            {navItemHasAlert(CONFIG_ITEM, setupAlerts) && <SetupAlertDot label={ALERT_LABEL} />}
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className={cn(rowClass, 'cursor-not-allowed text-muted-foreground/60')}
          >
            <ConfigIcon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
            <span className="sr-only">Solo el dueño</span>
          </div>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <p className="px-3 pb-2 text-xs font-medium text-muted-foreground break-all">{userEmail}</p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Salir</span>
        </Button>
      </div>
    </div>
  )
}

export function AdminSidebar({
  tenantName,
  mobileOpen,
  onClose,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
  setupAlerts = NO_SETUP_ALERTS,
  trialDaysLeft = null,
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      <SidebarRail
        pathname={pathname}
        userEmail={userEmail}
        onSignOut={onSignOut}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole}
        setupAlerts={setupAlerts}
        trialDaysLeft={trialDaysLeft}
      />

      {/* Cajón mobile — Sheet Radix (focus-trap + scroll-lock + Esc; MASTER §6.8).
          lg:hidden en panel y overlay: si queda abierto al pasar a desktop, no tapa nada. */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="left"
          hideClose
          overlayClassName="lg:hidden"
          className="w-60 max-w-[85vw] backdrop-blur-xl shadow-xl shadow-black/10 dark:bg-card/90 dark:shadow-black/40 lg:hidden"
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarDrawerContent
            tenantName={tenantName}
            pathname={pathname}
            onClose={onClose}
            userEmail={userEmail}
            onSignOut={onSignOut}
            tournamentsEnabled={tournamentsEnabled}
            staffRole={staffRole}
            setupAlerts={setupAlerts}
            trialDaysLeft={trialDaysLeft}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
