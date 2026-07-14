# 🧠 Superprompts de Auditoría — TurnoGol (Edición 10/10)

> **Fecha:** 9 de Julio de 2026
> **Objetivo:** 3 prompts especializados para auditar TurnoGol antes de producción real con usuarios pagando.

---

## Primero: Tus herramientas y cuándo usarlas

### 📊 Effort Levels de Claude Code

| Nivel | Comando | Cuándo usarlo | Costo relativo |
|-------|---------|---------------|----------------|
| **Low** | `/effort low` | Tareas simples: renames, preguntas rápidas | ⭐ |
| **Medium** | `/effort medium` | Default. Dev normal del día a día | ⭐⭐ |
| **High** | `/effort high` | Refactoring complejo, bugs difíciles | ⭐⭐⭐ |
| **Max** | `/effort max` | Debugging extremo, razonamiento multi-archivo | ⭐⭐⭐⭐ |
| **Ultracode** | `/effort ultracode` | Orquesta subagentes automáticamente para tareas masivas | ⭐⭐⭐⭐⭐ |

> [!TIP]
> También podés agregar la palabra **`ultrathink`** en cualquier mensaje para forzar razonamiento máximo en ESE turno específico sin cambiar el effort de la sesión.

**La configuración de effort es por sesión.** Se resetea cuando hacés `/clear` o abrís sesión nueva.

---

### 🦸 Superpowers — ¿Te sirve para esto?

**No para la auditoría. Sí para después.**

Superpowers es un framework de desarrollo disciplinado (spec-first, TDD, subagentes). Sus 14 skills están diseñadas para **construir código**, no para auditar. Si le tirás un prompt de auditoría con Superpowers activo, el skill de "planning" va a intentar hacer un spec y pedirte aprobación antes de leer un solo archivo — eso te agrega fricciones innecesarias.

**Mi recomendación:**
- **Para las auditorías:** Desactivá momentáneamente Superpowers (o ignoralo, las skills no se activan si el prompt no matchea sus triggers).
- **Para arreglar los hallazgos después:** Ahí sí, Superpowers brilla. Usá su flujo de spec → plan → implement → verify para corregir cada bug que salga de la auditoría.

---

### 🦴 Caveman — ¿Vale la pena?

**Sí, pero solo para el Prompt 1 (auditoría de código).** Ahorra entre 30-75% de tokens en la salida.

La auditoría de código va a generar un reporte enorme. Si Caveman comprime las explicaciones, ahorrás tokens pero **perdés claridad** en las explicaciones que necesitás entender como dev junior en infra.

**Mi recomendación:**
- **Prompt 1 (código fuente):** Usá Caveman. El output es técnico y vos ya entendés código.
- **Prompt 2 (seguridad/infra):** **NO uses Caveman.** Necesitás explicaciones claras de cosas que no dominás (RLS, roles, pooler).
- **Prompt 3 (consultoría arquitectónica):** **NO uses Caveman.** Acá querés explicaciones detalladas para tomar decisiones.

---

### 🔥 El workflow `fable5-backend-audit.js` que ya tenés

> [!IMPORTANT]
> Descubrí que ya tenés un workflow de auditoría backend en [fable5-backend-audit.js](file:///c:/Users/Lazar/Documents/github/TurnoGol/.claude/workflows/fable5-backend-audit.js) que es **significativamente más sofisticado** que tu superprompt original. Lanza 12 subagentes en paralelo, cada uno especializado en una dimensión (arquitectura, estado, concurrencia, performance, errores), y después verifica adversarialmente cada hallazgo con otro agente.
>
> **Este workflow cubre la auditoría de código (mi Prompt 1) de una forma muy superior.** Lo que le falta es la auditoría de seguridad/infra (Prompt 2) y la consultoría arquitectónica (Prompt 3).

**Plan óptimo:**
1. ~~Prompt 1~~ → Usá el workflow `fable5-backend-audit.js` que ya tenés (es mejor que cualquier prompt plano)
2. **Prompt 2** → Auditoría de seguridad e infraestructura (nuevo, abajo)
3. **Prompt 3** → Consultoría arquitectónica para producción (nuevo, abajo)

---

## ⚡ Ejecución Paso a Paso

### Paso 0: El workflow que ya tenés (Auditoría de Código)

> **Modelo:** Opus 4.8  
> **Effort:** `/effort ultracode` (necesita orquestar 12 subagentes)  
> **Caveman:** No aplica (el workflow controla su propio output)  
> **Superpowers:** No interfiere (el workflow tiene su propio CTX)

En Claude Code, en una sesión limpia:

```
/effort ultracode
```

Después ejecutá el workflow:

```
Ejecutá el workflow fable5-backend-audit.js. Dame el reporte completo al final.
```

> [!NOTE]
> Este workflow ya excluye seguridad (RLS, IDOR, secretos) de su scope. Eso lo cubre el Prompt 2.

---

### Prompt 1: Auditoría de Seguridad e Infraestructura

> **Modelo:** Opus 4.8  
> **Effort:** `/effort max` (razonamiento profundo, no necesita subagentes)  
> **Caveman:** ❌ NO — necesitás explicaciones claras de infra  
> **Superpowers:** No se activa (no matchea triggers de dev)

**Antes de pegar el prompt**, abrí una sesión nueva de Claude Code y configurá:

```
/effort max
```

Después pegá:

---

```
ultrathink

Sos un auditor de seguridad e infraestructura senior. Revisás TurnoGol, un SaaS multi-tenant argentino que maneja dinero real (MercadoPago) y datos personales de jugadores/administradores de canchas de fútbol.

## Quién soy
Soy el único dev. Sé TypeScript/Next.js pero NO tengo experiencia en infraestructura de producción (Supabase, Vercel, PostgreSQL roles, RLS, DNS, seguridad de APIs). Todo lo armé a prueba y error con ayuda de IA.

## Estado actual de la infra (ya hecho)
- Roles PostgreSQL: turnogol_app (sin superuser, con grants específicos) y turnogol_worker (BYPASSRLS para jobs)
- RLS: FORCE ROW LEVEL SECURITY en todas las tablas con datos de tenant
- Migraciones 037-039 aplicadas (grants para app, worker, pgboss)
- auth.service.ts y tenant.service.ts corregidos para funcionar con rol restringido
- .env.production NO está commiteado (está en .gitignore, verificado)

## Tu trabajo — SOLO LECTURA, NO TOQUES NADA

### A. Supabase (usá el MCP de Supabase)
1. Verificá que los roles turnogol_app y turnogol_worker existan en producción con los permisos correctos
2. Listá TODAS las tablas y verificá que las que tienen tenant_id tengan FORCE ROW LEVEL SECURITY activo
3. Revisá cada política RLS: ¿filtra correctamente por tenant_id? ¿Hay alguna que use USING(true) o sea demasiado permisiva?
4. ¿Hay datos de test/seed/basura en la base de datos de producción?
5. Revisá la configuración de Auth: providers habilitados, redirect URLs, JWT expiry, rate limits de Supabase Auth
6. ¿La anon key y la service_role key están siendo usadas correctamente? Verificá en el código que SUPABASE_SERVICE_ROLE_KEY nunca se filtre al browser (revisá src/lib/supabase/admin.ts — ya tiene un guard typeof window, ¿es suficiente?)

### B. Vercel (usá el MCP de Vercel)
1. Listá TODAS las variables de entorno de producción. Identificá:
   - Variables vacías o con placeholder "xxx"
   - Variables que deberían estar marcadas como "Sensitive" y no lo están
   - Variables que faltan (comparar contra src/shared/env.ts que tiene la validación Zod)
2. ¿WORKER_DATABASE_URL está configurado? (Lo necesita getWorkerSql() en el web app)
3. Revisá el dominio, la branch de producción, y los build settings
4. Mirá los últimos 5 deployments: ¿hay errores o warnings importantes en los logs?

### C. Código fuente — solo la capa de seguridad
1. src/lib/supabase/admin.ts — ¿El guard typeof window es suficiente para prevenir que el service_role key llegue al browser? ¿Hay algún import path que podría hacer tree-shaking incorrectamente?
2. src/lib/supabase/client.ts y server.ts — ¿usan la anon key correctamente?
3. ¿Hay API routes (src/app/api/) sin autenticación que deberían tenerla? Listá cada route handler y si está protegido o no.
4. El webhook de MercadoPago (src/app/api/webhooks/mercadopago/) — ¿valida la firma HMAC correctamente? ¿Qué pasa si llega un webhook falso?
5. ¿Hay secretos hardcodeados en algún archivo del source code? (buscar patrones: API keys, passwords, tokens que no vengan de process.env)

## Formato de salida
Para cada hallazgo usá:
- 🔴 CRÍTICO: "te pueden robar plata" o "cualquiera puede ver datos de otros tenants"
- 🟡 IMPORTANTE: importante pero no urgente
- 🟢 MEJORA: mejoras opcionales

Para cada hallazgo, explicame POR QUÉ es un problema como si yo fuera un dev junior. No uses jerga sin explicar.

Al final, dame:
1. Score de 1-10: ¿qué tan lista está la infra para producción?
2. Lista de bloqueantes (cosas que DEBO arreglar antes de tener usuarios pagando)
3. Lista de mejoras (cosas que puedo hacer después del lanzamiento)
```

---

### Prompt 2: Consultoría Arquitectónica para Producción

> **Modelo:** Opus 4.8  
> **Effort:** `/effort high` (conversacional, no necesita max)  
> **Caveman:** ❌ NO — querés explicaciones detalladas  
> **Superpowers:** No se activa

Abrí otra sesión limpia:

```
/effort high
```

Pegá:

---

```
ultrathink

Sos mi consultor senior DevOps/SRE de confianza. Yo soy un dev TypeScript/Next.js sin experiencia en infra de producción. Necesito que me ayudes a tomar decisiones arquitectónicas informadas para TurnoGol (SaaS multi-tenant, canchas de fútbol, Argentina, MercadoPago).

Para cada pregunta: (A) explicame la situación actual, (B) las opciones con pros/cons, (C) tu recomendación y por qué.

## Preguntas

### 1. Connection Pooler
Mi DATABASE_URL apunta a `pooler.supabase.com:6543` (transaction mode). 
- ¿Es correcto para una app Next.js en Vercel (serverless)?
- ¿Los workers de Railway (long-running) deberían usar el pooler o la conexión directa (:5432)?
- ¿SET LOCAL funciona correctamente con transaction pooler? (lo usamos para app.current_tenant_id)

### 2. ENCRYPTION_KEY
En producción tengo un ENCRYPTION_KEY de 32 caracteres hex (= 16 bytes = 128 bits). En local tengo uno de 64 hex chars (= 32 bytes = 256 bits).
- ¿Qué algoritmo de encriptación usa mi app? (buscá en el código cómo se usa ENCRYPTION_KEY)
- ¿128 bits son suficientes o necesito 256?
- Si necesito cambiar, ¿cómo migro los datos ya encriptados?

### 3. Worker BYPASSRLS
turnogol_worker tiene BYPASSRLS para poder procesar jobs cross-tenant (expirar reservas de todos los tenants, enviar notificaciones, etc.).
- ¿Es la forma correcta o hay una alternativa más segura?
- Si un job tiene un bug, ¿BYPASSRLS amplifica el daño?
- ¿Debería usar SET LOCAL incluso en el worker como defensa en profundidad?

### 4. Sentry
Tengo sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts. 
- ¿Mi setup cubre todos los casos? (Server Components, Server Actions, Route Handlers, Middleware, Client Components, Workers)
- ¿Los workers de Railway tienen Sentry configurado o están ciegos?
- ¿Hay algo que debería configurar (source maps, release tracking, performance monitoring) que me esté faltando?

### 5. Rate Limiting
Tengo Upstash Redis para rate limiting.
- ¿Qué endpoints DEBEN tener rate limiting obligatorio antes de producción?
- ¿Mi middleware actual aplica rate limiting correctamente?
- ¿Los webhooks de MercadoPago deberían tener rate limiting o eso puede causar que MP deje de reintentar?

### 6. Backup y Recovery
- ¿Supabase hace backups automáticos? ¿Con qué frecuencia?
- ¿Qué pasa si un bug corrompe datos de un tenant? ¿Puedo restaurar solo ese tenant sin afectar a los demás?
- ¿Necesito implementar algo adicional (point-in-time recovery, WAL archiving)?

### 7. Monitoreo de Costos
- ¿Cómo monitoreo que no me exploten los costos de Supabase/Vercel/Railway si la app escala?
- ¿Hay alertas que debería configurar?

No me des respuestas genéricas. Leé mi código real (supabase config, sentry configs, middleware, rate-limit setup) y respondé basándote en lo que encontrés.
```

---

## Resumen: ¿Qué correr, en qué orden?

| Orden | Qué | Modelo | Effort | Caveman | Tiempo estimado |
|-------|-----|--------|--------|---------|-----------------|
| **1** | `fable5-backend-audit.js` (workflow) | Opus 4.8 | ultracode | N/A | 30-60 min |
| **2** | Prompt 1: Seguridad e Infra (con MCPs) | Opus 4.8 | max | ❌ | 20-40 min |
| **3** | Prompt 2: Consultoría Arquitectónica | Opus 4.8 | high | ❌ | 15-25 min |

> [!IMPORTANT]
> **Cada prompt va en una sesión limpia** (hacé `/clear` o abrí nueva terminal con `claude`). Esto es crítico porque:
> 1. El contexto de una auditoría contamina la siguiente
> 2. El effort level se resetea con `/clear`
> 3. Cada prompt está diseñado para consumir el máximo contexto posible sin competir con los otros

---

## ¿Y Fable 5?

**No lo necesitás para esto.** Opus 4.8 es el modelo correcto por 3 razones:
1. **Sin riesgo de safety filters** — tu prompt menciona explotar vulnerabilidades, robar plata, bypass de RLS. Fable 5 podría cortar.
2. **Mitad de precio** — $5/$25 vs $10/$50 por millón de tokens.
3. **El workflow fable5-backend-audit.js ya compensa** — al orquestar 12 subagentes en paralelo con verificación adversarial, conseguís profundidad equivalente a Fable 5 pero con la estabilidad de Opus 4.8.

**¿Cuándo SÍ usarías Fable 5?** Para construir features complejas desde cero donde el razonamiento de 10 pasos de profundidad marca diferencia (un nuevo sistema de billing, refactorizar toda la capa de auth). No para auditorías donde el modelo necesita leer mucho y reportar, no inventar soluciones complejas.
