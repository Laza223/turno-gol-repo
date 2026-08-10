# Runner self-hosted para CI (evaluado, no implementado)

Documento de la Fase 4 del esfuerzo "CI: destrabar Stories y bajar la factura
de minutos" (2026-08-10). Decisión del dueño: evaluar la idea y dejarla
documentada, sin ejecutarla todavía.

## Por qué

El repo es privado — los minutos de GitHub Actions se facturan (GitHub Pro:
3.000/mes). Los runners `ubuntu-latest` estándar tienen **2 cores / 7 GB**, y
ese límite es la causa raíz del cuelgue de `Stories (BLOCKING)` (ver el
comentario en `ci.yml`, job `stories-shards`): con 2 cores, Vitest en modo
browser calcula `max(numCpus - 1, 1) = 1` sesión de Chromium, así que las
~259 stories corren TODAS en una sola página que vive la corrida entera. Si
esa página se queda sin memoria, no hay watchdog y el job cuelga en silencio
hasta el timeout.

Un runner propio con más cores resuelve la causa raíz, no el síntoma: con 8
cores, esa misma fórmula da 7 sesiones en paralelo — la suite completa (sin
shardear) bajaría de ~5m30s a bien menos de un minuto, y el "acantilado de
memoria" que tira abajo a Chromium deja de existir porque cada sesión tiene
memoria de sobra.

## Costo/beneficio

| | GitHub-hosted (hoy) | Self-hosted |
|---|---|---|
| Minutos | Facturados, pool de 3.000/mes (Pro) | Ilimitados, costo $0 |
| Cores | 2 | 8-16 (según la máquina) |
| Stories (sharded en 3) | ~2m30 por shard | probablemente <1 min sin shardear |
| Disponibilidad | Siempre | Solo si la máquina está prendida |
| Seguridad | N/A (repo privado, corre en infra de GitHub) | Repo privado sin forks → no aplica la advertencia de GitHub sobre self-hosted runners en repos públicos (un fork malicioso podría ejecutar código arbitrario en la máquina; acá no hay forks posibles) |

**Contras honestos:**
- La máquina de Lazar tiene que estar prendida cuando corre CI (o quedar un job en cola hasta que lo esté).
- Compite por CPU/RAM con el trabajo normal de desarrollo en esa misma máquina.
- Mantenimiento propio: actualizar Docker Desktop, el runner, limpiar espacio en disco (imágenes de Supabase/Playwright se acumulan).

## Cuándo vale la pena reconsiderarlo

- Si el pool de 3.000 min/mes empieza a quedarse corto (con las optimizaciones de
  este mismo esfuerzo, la factura por push bajó de ~33 a ~23 min — a ese ritmo
  son ~130 pushes/mes antes de tocar el techo).
- Si `Stories` vuelve a acercarse al timeout de 8 min por shard a medida que se
  suman más archivos de stories.
- Si se necesita un job nightly con la suite completa de e2e (hoy solo corre
  `@critical`, justamente por la limitación de 2 cores — ver `ci.yml`).

## Setup (cuando se decida implementarlo)

1. **Requisitos en la máquina de Lazar (Windows)**: WSL2 habilitado + Docker
   Desktop (ya lo usa `supabase start` en local, así que la imagen ya está
   resuelta) + Node 22 + pnpm.
2. **Registrar el runner**: `Settings → Actions → Runners → New self-hosted
   runner` en `github.com/Laza223/turno-gol-repo`. Sigue el script que da GitHub
   (`config.cmd` con el token de registro), corrido dentro de WSL2 para que el
   entorno sea Linux (los workflows actuales asumen `ubuntu-latest`: `apt-get`,
   rutas `/tmp`, etc. — un runner Windows nativo rompería todos los `run:` con
   `apt-get`).
3. **Label dedicado**: registrar con `--labels self-hosted,turnogol-local` (no
   pisar el label genérico `self-hosted` por si en el futuro se suma OTRO
   runner con otro perfil).
4. **Mover jobs de a uno**, empezando por `stories-shards` (el más beneficiado,
   y el que menos rompe si algo sale mal — tiene el agregador `stories` como
   colchón): cambiar `runs-on: ubuntu-latest` → `runs-on: [self-hosted,
   turnogol-local]` en ese job. Confirmar que el `PATH`/toolchain del runner
   local resuelve `pnpm`/`node`/`playwright` igual que el runner de GitHub
   antes de tocar los demás jobs.
5. **Fallback**: si el runner local no está disponible (máquina apagada), el
   job queda en cola — GitHub NO cae automáticamente a un runner hosted. Si eso
   es un problema, usar un label compuesto con fallback manual (dos jobs
   duplicados con distinto `runs-on`, activados por un `workflow_dispatch`
   input) — evaluar solo si hace falta, agrega complejidad real.
6. Correr el mismo run 2 veces seguidas antes de confiar (mismo criterio de
   verificación que el resto de este esfuerzo: reruns del MISMO commit son el
   experimento decisivo).

## Descartado explícitamente

**Hacer el repo público** (Actions gratis + runners de 4 cores en el plan
gratuito): TurnoGol es un SaaS comercial pre-lanzamiento — el código, los
precios internos, las claves de configuración y la lógica de negocio no van a
un repo público. No se reconsidera esta opción salvo decisión explícita y
separada del dueño sobre abrir el código.
