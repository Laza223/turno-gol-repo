# El entorno Preview de Vercel queda apagado

**Fecha**: 2026-08-26
**Estado**: aplicado
**Cierra**: C-3 de `docs/audit/2026-08-25-auditoria-infra.md`

## Lo que pasaba

El entorno **Preview** de Vercel estaba cargado con las variables de
**producción**. No es una sospecha: se midió.

El deploy de la rama `fix/tipos-fecha-sql-crudo`
(`turno-gol-repo-bu1kez2if-lazaros-projects-345d2270.vercel.app`) contestó
`GET /api/public/search` con los complejos reales del negocio:

```json
{"results":[
  {"id":"9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6","slug":"complejo-elite-futbol", ...},
  {"id":"fbeda410-39eb-4ed0-b248-2f732ad14d26","slug":"complejo-titi", ...}
],"total":2}
```

Esos son los ids de producción. O sea que **cada push a cualquier rama**
levantaba una copia de la app con:

- la **base de datos real** (lectura y escritura),
- `MP_TURNOGOL_ACCESS_TOKEN`, el token maestro de MercadoPago que **cobra de
  verdad**,
- `MP_CLIENT_SECRET`, con el que se firma el OAuth de las señas de cada
  complejo,
- `RESEND_API_KEY`, que le manda mail **a jugadores reales** desde
  `turnogol.app`,
- `ENCRYPTION_KEY`, la que descifra los tokens de MercadoPago guardados,
- las credenciales de R2 con permiso de **escritura y borrado** sobre las
  imágenes reales.

De los últimos 20 deploys del proyecto, **12 fueron de este tipo**.

La mitigación que ya existía —SSO de Vercel en todo lo que no sea dominio
propio— evita que un tercero entre, pero no evita nada de lo que importa: el
riesgo no es que alguien de afuera mire, es que una rama a medio hacer escriba
sobre datos reales, o que uno pruebe un flujo de pago en un preview creyendo
que es un sandbox y termine con un cobro real.

## Lo que se decidió

**Apagar los previews**, no mitigarlos.

`vercel.json` gana un `ignoreCommand` que solo deja pasar el build cuando
`VERCEL_ENV` es `production`:

```
if [ "$VERCEL_ENV" = preview ]; then ... exit 0; fi; exit 1
```

El contrato de Vercel va al revés de la intuición: **exit 0 ignora el build,
exit 1 lo deja correr**. La condición está escrita para que solo el valor
exacto `preview` omita el build; cualquier otra cosa —`production`,
`development`, la variable vacía, un valor nuevo que Vercel invente— **buildea**.
Es a propósito: el modo de falla de este archivo tiene que ser "volvieron los
previews", nunca "producción dejó de deployarse en silencio".

Las cuatro ramas se probaron a mano antes de commitear:

```
VERCEL_ENV='preview'     -> exit 0   (omite)
VERCEL_ENV='production'  -> exit 1   (buildea)
VERCEL_ENV='development' -> exit 1   (buildea)
VERCEL_ENV=''            -> exit 1   (buildea)
```

## Por qué se puede apagar sin perder nada

- **Los tests no viven ahí.** El gate de un PR es GitHub Actions
  (lint+types → unit → integration+isolation → e2e). Nada de eso usa la URL del
  preview.
- **No hay crons de Vercel.** Los jobs de fondo corren en Railway, así que un
  preview nunca ejecutaba nada solo: solo respondía si alguien lo visitaba.
- **Nadie los visitaba.** Durante toda la auditoría de infraestructura se probó
  contra producción, nunca contra un preview.

## Lo que NO es esta decisión

No es "los previews son malos". Es que un preview **sin entorno propio** es
producción con otro nombre. Si algún día hacen falta de verdad, la puerta se
abre dándoles lo suyo —base aparte con las migraciones aplicadas, credenciales
de sandbox de MercadoPago, el bucket `turnogol-dev` que ya existe, y Resend
afuera o con dominio de prueba— y recién ahí se saca el `ignoreCommand`.
Borrar la línea sin hacer eso primero devuelve exactamente el problema que
cerró este documento.

## Pendiente que esto NO cierra

Las variables de producción **siguen cargadas** en el entorno Preview de
Vercel. Con los builds apagados ya no se usan, pero siguen ahí: cualquiera con
acceso al panel las puede leer, y alcanza con volver a habilitar un preview
para que se usen otra vez. Limpiarlas es un paso aparte, manual, en
Vercel → Settings → Environment Variables.
