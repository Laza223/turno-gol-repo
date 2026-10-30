import Link from 'next/link'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { AUTH_TITLE, PORTAL_BUTTON, PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import {
  isRivalReturnPath,
  parseIntent,
  parseVia,
  type PlayerVia,
  type SuccessIntent,
} from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { SiteHeaderShell } from '@/components/site/SiteHeaderShell'
import SuccessRedirect from '@/app/(auth)/verify/SuccessRedirect'
import type { StartGoogleLoginFromIngresar } from '@/app/(auth)/ingresar/IngresarForm'

type ErrorCopy = {
  title: string
  message: string
  /** Botón principal del jugador. Con `google` es el submit del OAuth; si no, un link a /ingresar. */
  cta: string
  /**
   * De quién es el error. Sin esto el código es COMPARTIDO: `expired`, `invalid` y
   * `exchange_failed` los emiten también los links de staff (alta, invitación,
   * recovery, email_change), que no traen `via`. Ahí la marca decide: con `via` es un
   * jugador; sin ella no sabemos quién es y va primero el panel, como siempre.
   */
  audience?: 'player' | 'staff'
  google?: true
  /** No es una falla sino una decisión del jugador: ícono neutro en vez del rojo de los errores. */
  neutral?: true
}

/** Botón principal cuando el error es del staff: el reintento es el login del panel. */
const STAFF_CTA = 'Iniciar sesión'

/** Con Google no hubo enlace ni email: no se puede pedir "uno nuevo". */
const GOOGLE_FAILED: ErrorCopy = {
  title: 'No pudimos iniciar tu sesión',
  message: 'El ingreso con Google no se completó. Probá de nuevo o entrá con tu email.',
  cta: 'Volver a intentar',
  audience: 'player',
}

/**
 * Qué pasó + qué hacer, por código. Los emite `redirectVerifyError` en
 * api/auth/callback/route.ts; uno desconocido cae en `invalid`. Las claves `*_google`
 * no son códigos del callback: son el mismo código llegando con `via=google`.
 */
const ERROR_COPY: Record<string, ErrorCopy> = {
  expired: {
    title: 'Este enlace venció',
    message: 'Los enlaces de acceso sirven una sola vez y por un rato. Pedí uno nuevo para entrar.',
    cta: 'Pedir un enlace nuevo',
  },
  invalid: {
    title: 'No pudimos leer el enlace',
    message: 'Puede que se haya cortado al copiarlo. Pedí uno nuevo y abrilo desde tu email.',
    cta: 'Pedir un enlace nuevo',
  },
  exchange_failed: {
    title: 'No pudimos iniciar tu sesión',
    message: 'El enlace ya no sirve o hubo un problema de nuestro lado. Probá de nuevo.',
    cta: 'Volver a intentar',
  },
  exchange_failed_google: GOOGLE_FAILED,
  invalid_google: GOOGLE_FAILED,
  provision_failed: {
    title: 'No pudimos terminar de crear tu acceso',
    message: 'Fue un problema de nuestro lado, no tuyo. Probá de nuevo en unos minutos.',
    cta: 'Volver a intentar',
    audience: 'player',
  },
  oauth_cancelled: {
    title: 'Cancelaste el ingreso con Google',
    message: 'No pasó nada, no se hizo ningún cambio. Probá de nuevo o entrá con tu email.',
    cta: 'Volver a intentar',
    audience: 'player',
    neutral: true,
  },
  oauth_failed: {
    title: 'Google no pudo completar el ingreso',
    message: 'Probá de nuevo en un rato o entrá con tu email.',
    cta: 'Volver a intentar',
    audience: 'player',
  },
  // El email/cuenta ya es de un complejo o del super admin: las cuentas de jugador
  // y de complejo están separadas a propósito (decisión 2026-08-19), no se mergean
  // (ver provisionPlayerAndRedirect en api/auth/callback/route.ts). El texto pide una
  // cuenta que NO sea la del complejo: si su email del complejo es también su Gmail,
  // "entrá con tu Google" lo devolvería al mismo rechazo.
  account_conflict: {
    title: 'Este email ya lo usa un complejo',
    message:
      'Para reservar como jugador, entrá con otro email o con una cuenta de Google que no sea la del complejo.',
    cta: 'Usar otro email',
    audience: 'player',
  },
  account_conflict_google: {
    title: 'Esta cuenta de Google ya la usa un complejo',
    message:
      'Para reservar como jugador, entrá con otra cuenta de Google o con un email que no sea el del complejo.',
    cta: 'Usar otra cuenta de Google',
    audience: 'player',
    google: true,
  },
  orphaned_session: {
    title: 'Tu sesión expiró',
    message: 'Volvé a iniciar sesión para seguir.',
    cta: STAFF_CTA,
    audience: 'staff',
  },
}

const SUCCESS_COPY: Record<SuccessIntent, { title: string; subtitle: string; cta: string }> = {
  login: {
    title: '¡Listo!',
    subtitle: 'Iniciaste sesión correctamente.',
    cta: 'Ir a mis reservas',
  },
  signup: {
    title: '¡Bienvenido a TurnoGol!',
    subtitle: 'Tu cuenta quedó activada.',
    cta: 'Ir al panel',
  },
}

/** Quien volvía a RIVAL (p. ej. abrió el enlace en otro dispositivo) no vino por sus reservas. */
const RIVAL_SUCCESS_COPY = {
  title: '¡Listo!',
  subtitle: 'Ya estás adentro.',
  cta: 'Volver a RIVAL',
}

function successCopy(intent: SuccessIntent, safeNext: string) {
  return intent === 'login' && isRivalReturnPath(safeNext)
    ? RIVAL_SUCCESS_COPY
    : SUCCESS_COPY[intent]
}

const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

// Solo lo usan los estados del staff (marco oscuro de siempre); el jugador usa PORTAL_BUTTON.
const ctaClass =
  'mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/35 motion-reduce:hover:translate-y-0'

export type VerifySearchParams = {
  error?: string
  status?: string
  next?: string
  intent?: string
  via?: string
}

/** Qué texto corresponde a un código de error y a quién le toca (jugador o staff). */
function resolveError(code: string, via: PlayerVia | null) {
  const googleKey = `${code}_google`
  const key = via === 'google' && Object.hasOwn(ERROR_COPY, googleKey) ? googleKey : code
  // hasOwn: un `?error=constructor` no puede heredar una entrada de Object.prototype.
  const copy = ERROR_COPY[Object.hasOwn(ERROR_COPY, key) ? key : 'invalid']
  // Código compartido sin `via`: no sabemos si es un jugador o un link de staff.
  const toStaff = (copy.audience ?? (via ? 'player' : 'staff')) === 'staff'
  return { copy, toStaff }
}

/**
 * En Next 16 `searchParams` es una Promise, así que la page tiene que ser async.
 * Un componente async NO se puede montar en el cliente ("Only Server Components
 * can be async at the moment"), lo que dejaba la story de esta página sin poder
 * renderizarla. La page queda como un cascarón (page.tsx) que resuelve la Promise
 * y delega en este componente sincrónico, que es el que la story monta.
 *
 * La Server Action de Google entra por PROP y se importa en page.tsx, no acá: la
 * story monta este archivo, y un módulo 'use server' importado como valor arrastra
 * postgres al bundle del browser de Storybook.
 */
export function VerifyView({
  searchParams,
  googleAction,
}: {
  searchParams: VerifySearchParams
  googleAction: StartGoogleLoginFromIngresar
}) {
  const isSuccess = searchParams.status === 'success'
  const errCode = searchParams.error
  const intent = parseIntent(searchParams.intent)
  const error = !isSuccess && errCode ? resolveError(errCode, parseVia(searchParams.via)) : null

  // De quién es el estado. El jugador vive en el marco de La Previa (PortalAuthFrame); el staff, y la pantalla sin
  // parámetros (que no sabe de quién es), siguen con el marco oscuro de siempre.
  if (isSuccess ? intent !== 'signup' : error && !error.toStaff) {
    return (
      <PortalAuthFrame>
        {error ? (
          <PlayerError copy={error.copy} next={searchParams.next} googleAction={googleAction} />
        ) : (
          <PlayerSuccess next={searchParams.next} intent={intent} />
        )}
      </PortalAuthFrame>
    )
  }

  return (
    <div
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 pb-12 pt-28"
      style={{ background: '#020617' }}
    >
      <SiteHeaderShell />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-12%] h-[520px] w-[520px] rounded-full blur-md"
        style={{
          background: 'radial-gradient(closest-side, rgba(16,185,129,.2), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-16%] left-[-10%] h-[440px] w-[440px] rounded-full"
        style={{
          background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="rounded-2xl p-8 text-center" style={cardStyle}>
          {isSuccess ? (
            <SuccessState next={searchParams.next} intent={intent} />
          ) : error ? (
            <ErrorState copy={error.copy} />
          ) : (
            <LoadingState />
          )}
        </div>
      </div>
    </div>
  )
}

function SuccessState({ next, intent }: { next: string | undefined; intent: SuccessIntent }) {
  const safeNext = sanitizeNext(next)
  const copy = successCopy(intent, safeNext)
  return (
    <>
      <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 motion-reduce:hidden"
        />
        <span
          className="relative flex h-16 w-16 items-center justify-center rounded-full text-emerald-300"
          style={{
            background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))',
            border: '1px solid rgba(16,185,129,.4)',
            boxShadow: '0 0 50px rgba(16,185,129,.45)',
          }}
        >
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
      </div>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        {copy.title}
      </h1>
      <p className="mt-3 text-sm text-slate-400">{copy.subtitle}</p>
      <Link href={safeNext} className={ctaClass}>
        {copy.cta}
      </Link>
      {/* slate-400, no slate-500: sobre esta card (siempre oscura) slate-500 da 3.91:1,
          abajo del 4.5 de AA. Es el mismo bug que tenía SuccessRedirect, tres líneas más
          abajo — y el subtítulo de arriba ya usaba el valor correcto. */}
      <p className="mt-4 text-xs text-slate-400">
        ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste para seguir.
      </p>
      <SuccessRedirect next={safeNext} />
    </>
  )
}

function LoadingState() {
  return (
    <>
      <TgBallSpinner size="lg" className="mb-5" />
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        Verificando tu enlace…
      </h1>
      <p className="mt-3 text-sm text-slate-400">
        Esto tarda un instante. No cierres esta pestaña.
      </p>
    </>
  )
}

/** Estado de error del staff (marco oscuro): el reintento es el login del panel. */
function ErrorState({ copy }: { copy: ErrorCopy }) {
  return (
    <>
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 ring-8 ring-red-500/10">
        <AlertCircle className="h-7 w-7 text-red-300" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        {copy.title}
      </h1>
      {/* role="alert" para que el lector de pantalla anuncie el motivo del fallo,
          igual que el error de /login. Faltaba solo acá (🟡 QA 2026-08-13). */}
      <p role="alert" className="mt-3 text-sm text-slate-400">
        {copy.message}
      </p>
      <Link href="/login" className={ctaClass}>
        {STAFF_CTA}
      </Link>
      {/* La otra puerta: el error de un panel ofrece al jugador (el de un jugador, el panel).
          Subrayado siempre (contra el texto vecino el color solo da 1,7:1) y con el área
          táctil llevada a 44 px por padding que el margen negativo saca del layout. */}
      <p className="mt-4 text-xs text-slate-400">
        ¿Sos jugador?{' '}
        <Link
          href="/ingresar"
          className="-my-3.5 inline-block py-3.5 font-medium text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
        >
          Ingresá acá
        </Link>
      </p>
    </>
  )
}

// ─── Jugador: el marco de La Previa (PortalAuthFrame): fondo oscuro, resplandores y card de vidrio ───

/** Ícono de estado (color + ícono + texto) sobre el título, centrado en su badge, como en La Previa. */
const playerIconClass = 'size-7'

function PlayerSuccess({ next, intent }: { next: string | undefined; intent: SuccessIntent }) {
  const safeNext = sanitizeNext(next)
  const copy = successCopy(intent, safeNext)
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 motion-reduce:hidden"
        />
        <span
          className="relative flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))',
            border: '1px solid rgba(16,185,129,.4)',
            boxShadow: '0 0 50px rgba(16,185,129,.45)',
          }}
        >
          <CheckCircle2 className="size-7 text-emerald-300" aria-hidden />
        </span>
      </div>
      <h1 className={AUTH_TITLE}>{copy.title}</h1>
      <p className="mt-2 text-base text-muted-foreground">{copy.subtitle}</p>
      <Link href={safeNext} className={cn(buttonVariants(), PORTAL_BUTTON, 'mt-8')}>
        {copy.cta}
      </Link>
      <p className="mt-6 text-sm text-muted-foreground">
        ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste para seguir.
      </p>
      <SuccessRedirect
        next={safeNext}
        className="mt-2 text-sm tabular-nums text-muted-foreground"
      />
    </div>
  )
}

function PlayerError({
  copy,
  next,
  googleAction,
}: {
  copy: ErrorCopy
  next: string | undefined
  googleAction: StartGoogleLoginFromIngresar
}) {
  const safeNext = sanitizeNext(next)
  // El destino original sobrevive al reintento solo si el callback lo mandó.
  const ingresarHref = next ? `/ingresar?next=${encodeURIComponent(safeNext)}` : '/ingresar'
  return (
    <div className="text-center">
      <div
        className={cn(
          'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ring-8',
          copy.neutral ? 'bg-white/5 ring-white/5' : 'bg-red-500/15 ring-red-500/10',
        )}
      >
        {copy.neutral ? (
          <Info className={cn(playerIconClass, TONE_TEXT.neutral)} aria-hidden />
        ) : (
          <AlertCircle className={cn(playerIconClass, TONE_TEXT.destructive)} aria-hidden />
        )}
      </div>
      <h1 className={AUTH_TITLE}>{copy.title}</h1>
      {/* role="alert" para que el lector de pantalla anuncie el motivo del fallo. */}
      <p role="alert" className="mt-2 text-base text-muted-foreground">
        {copy.message}
      </p>
      <div className="mt-8 space-y-3">
        {copy.google ? (
          <>
            {/* Reusa la action de Google de /ingresar; `select_account` abre el selector de
                cuentas para poder elegir otra distinta de la del complejo. */}
            <form action={googleAction}>
              <input type="hidden" name="next" value={safeNext} />
              <input type="hidden" name="select_account" value="1" />
              <SubmitButton className={PORTAL_BUTTON} pendingLabel="Abriendo Google…">
                {copy.cta}
              </SubmitButton>
            </form>
            <Link
              href={ingresarHref}
              className={cn(buttonVariants({ variant: 'outline' }), PORTAL_BUTTON)}
            >
              Entrar con mi email
            </Link>
          </>
        ) : (
          <Link href={ingresarHref} className={cn(buttonVariants(), PORTAL_BUTTON)}>
            {copy.cta}
          </Link>
        )}
      </div>
      {/* La otra puerta: el error de un jugador ofrece el panel. Subrayado siempre y con el
          área táctil llevada a 44 px por padding que el margen negativo saca del layout. */}
      <p className="mt-6 text-sm text-muted-foreground">
        ¿Sos del complejo?{' '}
        <Link
          href="/login"
          className="-my-3.5 inline-block py-3.5 font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Entrá al panel
        </Link>
      </p>
    </div>
  )
}
