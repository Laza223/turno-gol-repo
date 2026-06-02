import { isValidDsn, isDroppableDomainError } from '@/lib/sentry-event-filter'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * F12 audit 2026-05-29: remove Replay to reduce shared bundle (~40KB).
 * Errors still capture with stack+breadcrumbs+tracesSampleRate; we lose
 * session video replay. Reactivate if support needs visual debugging.
 *
 * Exported as a pure function so unit tests can assert filtering logic
 * without triggering Sentry.init side-effects.
 */
export function filterReplay<T extends { name: string }>(integrations: T[]): T[] {
  return integrations.filter((i) => i.name !== 'Replay' && i.name !== 'ReplayIntegration')
}

/**
 * F12 perf 2026-05-31: lazy-load the Sentry browser SDK.
 *
 * `@sentry/nextjs` (~50KB+ gzipped) was previously imported at the top of this
 * module, so webpack bundled it into the shared First Load JS that blocks every
 * page's initial paint. Switching to a dynamic `import()` splits the SDK into
 * its own async chunk that downloads after hydration, off the LCP critical path
 * (LCP < 2.5s budget — grilla was at 3.8s).
 *
 * Trade-off: errors thrown in the very first tick — before the chunk resolves —
 * are not captured. Accepted: the SDK loads within ~1 frame of interactivity and
 * `beforeSend` already drops all non-production events anyway.
 *
 * `requestIdleCallback` (when available) defers the fetch until the browser is
 * idle so it never competes with hydration; otherwise we kick it off async.
 */
function initSentry(): void {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      integrations: filterReplay,
      ignoreErrors: [
        'AbortError',
        'Network request failed',
        'Failed to fetch',
        'Load failed',
        'NavigationDuplicated',
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
      ],
      beforeSend(event, hint) {
        if (isDroppableDomainError(hint)) return null
        if (process.env.NODE_ENV !== 'production') return null
        return event
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'ui.click') return null
        return breadcrumb
      },
    })
  })
}

if (isValidDsn(dsn)) {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof ric === 'function') {
    ric(initSentry)
  } else {
    initSentry()
  }
}
