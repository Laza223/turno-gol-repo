// Browser stub for `@sentry/nextjs` — error reporting is a no-op in previews.
// Covers the names the DS components touch (`import * as Sentry`).
export const captureException = (): undefined => undefined
export const captureMessage = (): undefined => undefined
export const addBreadcrumb = (): undefined => undefined
export const setTag = (): undefined => undefined
export const setContext = (): undefined => undefined
export const setUser = (): undefined => undefined
export const withScope = (cb: (scope: unknown) => void): void =>
  cb({ setTag() {}, setContext() {}, setLevel() {}, setUser() {} })
