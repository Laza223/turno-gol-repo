---
paths:
  - "package.json"
  - "pnpm-lock.yaml"
  - "pnpm-workspace.yaml"
---

# Dependencias y advisories

- **`pnpm update <paquete>` no se limita a los paquetes que nombrás**: refresca todo lo que el rango de `package.json` permita, y en un repo con versiones pineadas exactas eso rompe pares que estaban alineados a mano. Para un parche de seguridad, el camino que NO arrastra nada es: editar sólo las restricciones que hay que mover (la versión y/o el pin de `overrides` en `pnpm-workspace.yaml`, mismo patrón `"paquete@<vulnerable": "^parcheada"` que ya usa el repo) y correr `pnpm install`, que respeta el lockfile para todo lo demás. Si ya corriste el update, `git checkout package.json pnpm-lock.yaml` y empezá de nuevo por ese lado. (pasó: 2026-09-09, subiendo Next por dos RCE críticos sin autenticar — el update se llevó puesto `@axe-core/playwright`, que arrastró un `playwright-core` distinto del que el repo pinea exacto; quedaron dos juegos de tipos de `Page` y typecheck en rojo por un archivo que nadie había tocado. Verificalo con `pnpm why playwright-core`: tiene que haber UNA sola versión.)
- **Un bump de framework se verifica con `pnpm build`, no con la suite.** Los tests corren contra el código fuente y no ven el pipeline de build; un cambio de Next puede dejar la suite entera en verde y romper recién al compilar. El juez de cuatro comandos tampoco lo cubre.
- **`pnpm build` reescribe `next-env.d.ts`** apuntando a `./.next/types/...`, mientras que la versión versionada apunta a `./.next/dev/types/...` (la que deja `pnpm dev`). Es churn que va y viene según qué corriste último: `git checkout next-env.d.ts` antes de commitear, no lo incluyas en el diff.
- **El job `pnpm-audit` no es un check obligatorio**, así que puede estar rojo por advisories publicados después del último verde de main sin que nadie se entere. Los obligatorios salen de `gh api repos/Laza223/turno-gol-repo/branches/main/protection --jq '.required_status_checks.contexts'`. Un rojo ahí que la rama no causó (`git diff --name-only main...HEAD -- package.json pnpm-lock.yaml` vacío) igual hay que mirarlo: puede ser ejecución remota de código sobre producción, que es seguridad y se arregla siempre.
