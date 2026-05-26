# Lighthouse CI — Fase F03 (T6): Authenticated /grilla

Date: 2026-05-26
Branch: audit/frontend-f03
LHCI version: 0.15.1 / Lighthouse 12.x
Config: lighthouserc.grilla.json (formFactor=mobile, throttlingMethod=simulate, numberOfRuns=1)
Auth: Supabase SSR cookies minted via scripts/lighthouse-grilla.ts → injected by scripts/lhci-grilla-puppeteer.js
Environment: local Windows, Chrome 148, prod build (`pnpm build`) + `pnpm start` on :3000 + `pnpm e2e:seed`.

## Measurement Status: MEASURED (real run executed)

The full chain was run locally: `pnpm build` → `pnpm e2e:seed` → `pnpm start` → `pnpm lighthouse:grilla`.
3 consecutive runs were taken (the throttle is `simulate`, so there is small run-to-run variance).

## Performance Scores (real measurement)

| Route | Performance | FCP | LCP | TBT | CLS | SI | Passes ≥90? |
|-------|-------------|-----|-----|-----|-----|-----|-------------|
| `/grilla` | **0.89 / 0.87 / 0.89** (≈88) | 1.2 s | **3.8 s** | 90 ms | 0 | 1.3 s | ❌ (1–2 pts short) |

**Verdict: 88–89, just below the ≥90 done-criteria.** FCP, TBT, CLS, SI are all in the green; the single driver is **LCP 3.8 s** (good = < 2.5 s).

## Root-cause of the gap (LCP 3.8 s)

Two compounding factors, both pointing OUT of F3 scope:

1. **Shared bundle weight (→ F12).** Top Lighthouse opportunities:
   - *Reduce unused JavaScript* ≈ 900 ms
   - *Eliminate render-blocking resources* ≈ 485 ms
   These trace to the 150 KB shared baseline (Sentry SDK heavy, per F0). Under the
   mobile 4× CPU throttle, hydration is delayed → the largest element paints late.
   **F0 already deferred the 150 KB shared-baseline reduction to F12 (Performance).**
   F12 done-criteria is explicitly LCP < 2.5 s.

2. **LCP element is the OFFLINE banner (test artifact + minor UX note).** Lighthouse
   reports the LCP element as the amber offline banner
   (`<div class="rounded-md border border-amber-200 bg-amber-50 …">`). In the
   Lighthouse run the Supabase Realtime WebSocket does not establish (headless Chrome
   + injected cookies, no live socket), so the hook transitions to `OFFLINE` and renders
   the full-width amber banner post-hydration — which then becomes the largest, latest
   paint. In production, when Realtime connects, no banner shows and the LCP element
   would differ (the SSR table, painted earlier). So the measured 88–89 is a
   conservative floor; the production score is likely equal-or-better, but is NOT
   asserted here without a production-environment measurement.

## Disposition

- **NOT gamed to pass.** No cherry-picking of the best run; the variance (87–89) is
  reported as-is. The script (`lighthouse-grilla.ts`) reads the real score from the
  LHR and exits non-zero when < 0.90 (the LHCI assertion itself uses `warn`, mirroring
  F0, so its exit code is never trusted as a pass signal).
- **Gap owner: F12 (Performance / Core Web Vitals).** The structural fix (shrink the
  150 KB shared bundle / Sentry, improve LCP) is squarely F12 work and was already in
  the backlog from F0. F3 delivered the FIRST authenticated measurement of `/grilla`
  (the whole point of F0→F3 deferral) and a reusable, honest measurement harness.
- **Optional UX follow-up (low priority):** the offline banner being the LCP element
  hints it could reserve space / be lighter, but changing it purely to game Lighthouse
  is not warranted; the connected (production) path doesn't render it.

## Re-running locally

```powershell
# Terminal 1: build + seed + serve
pnpm build
pnpm e2e:seed
pnpm start            # serves :3000

# Terminal 2 (while :3000 is serving):
pnpm lighthouse:grilla
```

The script mints an admin Supabase session, injects the SSR cookies via the
puppeteerScript, runs `lhci collect` + `lhci assert` against `/grilla`, prints the
real measured Performance score, and exits non-zero if < 0.90.

## Auth Mechanism

- `puppeteerScript`: `scripts/lhci-grilla-puppeteer.js`
  - Chosen over `extraHeaders` because Supabase SSR may split the session across
    chunked cookies; setting cookies via the browser API replicates real browser
    storage with correct domain/path/sameSite scoping.
  - **API note:** Puppeteer v23+ (bundled by LHCI 0.15) moved `setCookie` from
    `Page` to `Browser`. The script uses `browser.setCookie(...)` with a fallback
    to `page.setCookie(...)` and, last resort, CDP `Network.setCookie`. (The initial
    implementation used only `page.setCookie`, which threw
    `TypeError: page.setCookie is not a function` and silently produced 0 runs —
    fixed in F3 verify.)
  - The puppeteerScript reads the cookie jar from a temp JSON file whose path is
    passed via `LHCI_GRILLA_COOKIES_FILE` (set at runtime, never hardcoded; the temp
    file with session tokens is deleted after the run).

## Done-Criteria Reference

F3 done-criteria #4: Lighthouse Performance ≥ 90 (mobile) for `/grilla`.
**Status: 88–89 measured — NOT met by 1–2 points. Gap is structural (LCP via the
150 KB shared bundle) and is owned by F12.** Recorded honestly; not deferred silently.
