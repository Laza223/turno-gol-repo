'use client'

import { useReportWebVitals } from 'next/web-vitals'
import * as Sentry from '@sentry/nextjs'

/**
 * Reports Core Web Vitals (LCP, CLS, INP, FCP, TTFB) to Sentry in production.
 * Sample rate 25% to keep quota controlled; metric.rating already classifies
 * good / needs-improvement / poor per web.dev thresholds.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== 'production') return
    if (Math.random() > 0.25) return
    Sentry.captureMessage(`web-vital:${metric.name}`, {
      level: 'info',
      tags: { metric: metric.name, rating: metric.rating },
      extra: {
        value: metric.value,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      },
    })
  })
  return null
}
