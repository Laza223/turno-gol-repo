# Lighthouse CI Baseline — Fase F00 (T5)

Date: 2026-05-25  
Branch: audit/frontend-f00  
LHCI version: 0.15.1 / Lighthouse 12.6.1  
Config: lighthouserc.json (formFactor=mobile, throttlingMethod=simulate, numberOfRuns=1)  
Chrome: 148.0.x (headless), installed at C:\Program Files\Google\Chrome\Application\chrome.exe  

## Performance Scores (mobile simulation)

| Route | Performance | FCP | LCP | TBT | CLS | Passes ≥90? |
|-------|-------------|-----|-----|-----|-----|-------------|
| `/` (home) | 94–95 | 1.2 s | 2.9–3.0 s | 40–60 ms | 0.01 | YES |
| `/login` | 96 | 1.2 s | 2.7 s | 60 ms | 0 | YES |
| `/register` | 94 | 1.2 s | 3.0 s | 100 ms | 0.017 | YES |
| `/privacy` | 96 | 1.2 s | 2.7 s | 80 ms | 0.003 | YES |
| `/terms` | 94 | 1.2 s | 2.8 s | 70 ms | 0.076 | YES |

**All 5 static public routes PASS the ≥ 90 mobile Performance threshold.**

## Notes

- `/` measured twice (from two separate lhci collect runs during initial setup); both runs score 94–95.
- LHR HTML+JSON files are gitignored (bulky). The LHR timestamps map to:
  - lhr-1779753692562 → http://localhost:3000/ (run 1, score 94)
  - lhr-1779753817024 → http://localhost:3000/ (run 2, score 95)
  - lhr-1779753849086 → http://localhost:3000/login (score 96)
  - lhr-1779753933159 → http://localhost:3000/privacy (score 96)
  - lhr-1779754026699 → http://localhost:3000/register (score 94)
  - lhr-1779754056849 → http://localhost:3000/terms (score 94)

## Windows EPERM Workaround

On Windows with Chrome 148, `chrome-launcher@1.2.1` sometimes throws `EPERM` when cleaning up Chrome's
temp profile directory after a run. The LHR data IS saved before the cleanup step, so scores are captured
despite the error. Workaround: run each URL separately via `lhci collect --additive` instead of
`lhci autorun` with all URLs together. `lhci autorun` works once `chrome-launcher` is updated or on
Linux/macOS CI. To run the full baseline on CI (Linux), `pnpm lighthouse` should work without this issue.

## Baseline Assessment

F0 done-criterion "Lighthouse Performance ≥ 90 mobile" is MET for all static public routes.
The F12 Performance phase can flip the assert from `warn` to `error` to make it blocking.
