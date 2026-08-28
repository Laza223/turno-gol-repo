# Bitácora

Una línea por cierre de sesión, escrita sola por el hook de cierre.
Solo historia — lo que se hizo, que no caduca. Lo vigente vive en `.claude/ESTADO.md`;
lo que está abierto se consulta en los PRs y el CI, no se escribe acá.

- **2026-08-27 21:28** `main` — dos decision docs commiteados y pusheados al PR, cerrando el porqué de lo de hoy
- **2026-08-27 21:35** `main` — 175 hallazgos de drift, 158 auto-corregidos y verificados en fresco, 65 gaps documentados, 3 contradicciones entre docs, 2 decisiones huérfanas. Reporte completo: [docs/audit/DOC_DRIFT_2026-08-27.md](docs/audit/DOC_DRIFT_2026-08-27.md)
- **2026-08-27 21:55** `main` — CI verde sobre un main que incluye el cambio de TLS; producción validando la cadena en los dos runtimes y migración 080 aplicada, todo ya confirmado antes
- **2026-08-28 01:23** `main` — 27/29 REQUIERE INPUT resueltos y aplicados; reporte actualizado en [docs/audit/DOC_DRIFT_2026-08-27.md](docs/audit/DOC_DRIFT_2026-08-27.md); `pnpm typecheck` limpio
- **2026-08-28 02:37** `main` — combiné 3 de las sesiones sueltas en 1 solo PR (trial vencido + historial pagos SaaS + ledger deuda técnica), typecheck limpio, pusheado
- **2026-08-28 05:37** `chore/combinar-3-sesiones-2026-08-27` — verifiqué contra la infra real que esos cuatro son los únicos pendientes: apex sigue en A, DMARC sigue en `p=none`, el MCP de Supabase solo ve la org de producción. Todo el resto está cerrado o es riesgo aceptado con el motivo escrito
- **2026-08-28 07:25** `claude/gstack-a204da` — gstack 1.69.0.0 → 1.71.0.0 (setup exit 0, 55 skills recargadas); config: `auto_upgrade=true`, `telemetry=off`, `proactive=true`; sección "## Skill routing" agregada a CLAUDE.md y commiteada (`9e89c2e3`)
- **2026-08-28 14:31** `claude/gstack-a204da` — F-01 confirmado en 7 de 7 campos de plata (6 formularios), con persistencia verificada en `courts.pricing`; F-03 retirado como falso positivo propio con la evidencia de por qué; informe, baseline y screenshot nuevo actualizados
