# Prompt para Claude Code — Auditoría completa del codebase

Copiá todo lo que está debajo de la línea y pegalo en `claude`:

---

```
Necesito una auditoría completa y minuciosa de todo el codebase de TurnoGol. Vas a ir capa por capa, en orden. Al final de cada capa generás un reporte con lo que encontraste antes de pasar a la siguiente.

## Reglas generales

1. **Fix por obviedad**: si el error es objetivo (typo, import muerto, nombre de variable incorrecto, código que referencia algo que no existe), corregilo directamente sin preguntarme. Avisame qué hiciste en el reporte.
2. **Consulta obligatoria**: si el hallazgo implica una decisión de negocio, un cambio de comportamiento del sistema, o tiene ambigüedad (podría ir para un lado o para otro), PARÁ y preguntame antes de tocar nada.
3. **No hagas commits ni acciones de git.** Solo editá archivos. Los commits los hago yo.
4. **No modifiques tests** salvo que estén testeando algo que ya no existe.
5. **Reportá en tandas**: al final de cada capa, mostrá una tabla resumen con: hallazgo, archivo(s) afectado(s), severidad (🔴 crítico / 🟡 medio / 🟢 bajo), y si lo arreglaste solo o necesitás mi input.

## Capa 1 — Schema vs Código
Revisá que cada tabla, columna y enum definido en las migraciones (`supabase/migrations/`) realmente se use en el código TypeScript (`src/`). Buscá:
- Columnas definidas en migraciones que no se leen ni escriben en ningún lado
- Enums en `src/lib/types/enums.ts` que no coincidan con los del schema
- Tipos en `src/lib/types/` que declaren campos que no existen en la DB (o les falten campos que sí existen)
- Tablas que existan en migraciones pero no tengan ningún query/acción que las use

## Capa 2 — Documentación vs Código
Ya hiciste CLAUDE.md. Ahora revisá `docs/spec/` (doc1 a doc20, salvo doc9 que no existe). Para cada doc:
- ¿Los flujos que describe coinciden con lo que hace el código?
- ¿Las tablas/campos que menciona siguen existiendo?
- ¿Las reglas de negocio que documenta se implementan correctamente?
No necesitás corregir los docs (son specs de referencia), pero sí reportá las discrepancias para que yo decida si actualizo el doc o el código.

## Capa 3 — Reglas de negocio y permisos
Revisá que las protecciones del sistema sean correctas:
- Cada Server Action y Route Handler: ¿tiene el guard correcto? (`requireAdminStaff` para config, `requireOperatorStaff` para operación, auth de jugador para endpoints de jugador)
- ¿Hay alguna ruta o acción que acceda a datos sensibles sin verificar permisos?
- ¿Las validaciones de Zod en los formularios coinciden con las constraints de la DB?
- ¿Los RLS policies cubren todas las tablas que tienen tenant_id?

## Capa 4 — Dead code y imports muertos
Buscá:
- Funciones exportadas que nadie importa
- Archivos `.ts`/`.tsx` que no son importados por nadie (huérfanos)
- Imports que se traen pero no se usan
- Variables/constantes definidas pero nunca leídas
- Componentes React que no se renderizan en ninguna página/layout
Estos los podés limpiar directamente (fix por obviedad).

## Capa 5 — Consistencia de patrones
Revisá que el código siga patrones uniformes:
- Error handling: ¿todas las Server Actions manejan errores igual? ¿Hay alguna que no tenga try/catch o que trague errores silenciosamente?
- Naming: ¿archivos, funciones y variables siguen la misma convención en todo el proyecto?
- Estructura de carpetas: ¿hay archivos que deberían estar en otro lugar según la estructura del proyecto?
- ¿Se usa `SET LOCAL` siempre (nunca `SET` sin LOCAL) para el tenant context?
Reportá inconsistencias. Los fixes de naming o estructura consultamelos primero.

## Capa 6 — Seguridad (RLS / Auth / Datos sensibles)
Esto es lo más importante. Revisá:
- Que cada tabla con `tenant_id` tenga su RLS policy y que el policy sea correcto
- Que no haya queries que hagan bypass de RLS sin justificación
- Que tokens, secrets y credenciales no estén hardcodeados
- Que los endpoints públicos (`/api/public/*`) no expongan datos que no deberían
- Que el JWT se valide correctamente en cada capa

Empezá por la Capa 1. Cuando termines el reporte, esperá mi OK para seguir con la siguiente.
```
