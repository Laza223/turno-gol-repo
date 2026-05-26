# Lighthouse CI — Fase F03 (T6): Authenticated /grilla

Date: 2026-05-26
Branch: audit/frontend-f03
LHCI version: 0.15.1 / Lighthouse 12.x
Config: lighthouserc.grilla.json (formFactor=mobile, throttlingMethod=simulate, numberOfRuns=1)
Auth: Supabase SSR cookies minted via scripts/lighthouse-grilla.ts → injected by scripts/lhci-grilla-puppeteer.js

## Measurement Status: PENDING

The tooling is fully implemented and type-checks cleanly. The actual Lighthouse
run could NOT be executed in this sandbox environment for the following reasons:

1. **No running Next.js server** — `pnpm start` requires a production build
   (`pnpm build`) which takes several minutes and a live network environment.
2. **No reachable Supabase instance** — `pnpm e2e:seed` requires
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` pointing to a
   running Supabase project. The sandbox has no outbound Supabase connectivity.
3. **Chrome availability uncertain in sandbox** — F0 confirmed Chrome works
   on the local Windows machine; this applies here too, but the full chain
   (build → seed → start → lighthouse) requires an interactive local run.

No score is fabricated. PENDING = tooling is wired, measurement is owed.

## Exact Command Sequence to Run Locally

```powershell
# Terminal 1: build + serve
pnpm build
pnpm e2e:seed
pnpm start

# Terminal 2 (while Terminal 1 is serving on :3000):
pnpm lighthouse:grilla
```

Or as a one-liner (PowerShell, sequential):

```powershell
pnpm build; if ($?) { pnpm e2e:seed }; if ($?) { Start-Process powershell -ArgumentList '-NoExit', '-Command', 'pnpm start' }; Start-Sleep -Seconds 5; pnpm lighthouse:grilla
```

## Expected Output Location

LHR HTML + JSON files will appear in `docs/audit/reports/fase-f03-raw/lhci/`
(gitignored as bulky artifacts). Update the table below once the run completes.

## Performance Scores (to be filled after real run)

| Route | Performance | LCP | TBT | CLS | Passes ≥90? |
|-------|-------------|-----|-----|-----|-------------|
| `/grilla` | PENDING | PENDING | PENDING | PENDING | PENDING |

## Auth Mechanism

- `puppeteerScript`: `scripts/lhci-grilla-puppeteer.js`
  - Chosen over `extraHeaders` because LHCI's `extraHeaders` sends a single
    `Cookie` header but Supabase SSR splits the session across multiple
    chunked cookies (`sb-*-auth-token.0`, `.1`, etc.). Puppeteer's
    `page.setCookie(...)` sets each cookie individually as the browser would,
    guaranteeing correct chunk ordering and domain/path scoping.
  - The puppeter script reads the cookie jar from a temp JSON file whose path
    is passed via `LHCI_GRILLA_COOKIES_FILE` env var (set by the TS script
    at runtime; never hardcoded).

## Windows EPERM Note (inherited from F0)

`chrome-launcher` on Windows with Chrome 148 sometimes throws `EPERM` when
cleaning up Chrome's temp profile directory after a run. The LHR data IS
saved before cleanup. `lighthouse-grilla.ts` catches the non-zero exit code,
logs a warning, and proceeds to `lhci assert` — scores are still valid.

## Done-Criteria Reference

F3 done-criteria #4: Lighthouse Performance ≥ 90 (mobile) for `/grilla`.
Criteria met = PENDING until real run is executed locally or in CI (Linux).
