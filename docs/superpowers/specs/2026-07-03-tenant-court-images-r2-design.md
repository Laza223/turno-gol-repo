# Imágenes de complejo y canchas (logo, portada, fotos) — Cloudflare R2

**Fecha:** 2026-07-03
**Estado:** Diseño aprobado — pendiente plan de implementación
**Autor:** brainstorming (Claude) + Lázaro

## 1. Problema

Igual que ATC Sports, cada complejo debe mostrar su **logo real** en las cards del
explorador y **fotos por cancha** (Cancha 1, Cancha 2, …) en su perfil público.
Hoy no se puede: el complejo no tiene forma de subir ninguna imagen.

## 2. Hallazgo clave: el lado lectura YA existe

El modelo de datos y toda la vista están construidos. **Falta solo el lado escritura.**

| Pieza | Estado | Ubicación |
|---|---|---|
| Logo complejo | Columna existe | `tenants.logo_url` (`src/shared/db/schema/tenants.ts:23`) |
| Portada complejo | Columna existe | `tenants.cover_url` (`src/shared/db/schema/tenants.ts:24`) |
| Fotos por cancha | Columna existe `text[]` | `courts.photos` (`src/shared/db/schema/courts.ts:37`) |
| Galería pública | Renderiza + lightbox | `src/app/(public)/[slug]/components/TenantGallery.tsx` |
| Card de cancha | Renderiza `photos[0]` + placeholder | `src/app/(public)/[slug]/components/CourtCard.tsx:9` |
| Logo en cards explorador / header / SEO | Consumen `logoUrl`/`coverUrl` | `TenantCard`, `FeaturedComplexCard`, `TenantHeader`, `structured-data.ts` |

**Falta (todo el lado escritura):** bucket/storage, componente de subida, server
actions de upload/borrado, y escribir las URLs en la DB. `CourtForm.tsx` hoy guarda
`photos: []` literal (`src/app/(admin)/canchas/components/CourtForm.tsx:88`);
`/settings` no tiene sección de identidad; el onboarding no sube nada.

## 3. Decisión de proveedor: Cloudflare R2

Bucket **R2 público con custom domain** `media.turnogol.com`, subida por **API
S3-compatible** (`@aws-sdk/client-s3`).

Racional: sin egress fees, escala barata con volumen de fotos, custom domain servido
por el CDN de Cloudflare. (Nota histórica: el codebase estaba pre-cableado para
Supabase Storage —`next.config.js` allowlist `**.supabase.co`, CSP `img-src`—; con
R2 hay que **agregar** `media.turnogol.com` a esos dos lugares, ver §7.)

### Alternativas descartadas
- **Supabase Storage** — ya en el stack, cero vendor nuevo, pero egress con costo y
  transformaciones detrás de plan Pro. Se eligió R2 por costo a escala.
- **Cloudinary / UploadThing** — DX top pero costo escala mal y otro vendor.

## 4. Alcance

Las **3 imágenes de una** (deciden A): logo + portada + fotos de cancha. Son el
**mismo componente `<ImageUploader>` con distinto preset**.

Fuera de alcance (YAGNI): avatares de jugador, video, editor de crop con arrastre
(usamos center-crop automático), moderación de contenido, purga programática de CDN
(los nombres versionados resuelven el cache), stripping de EXIF manual (el
re-encode a webp por canvas ya descarta EXIF).

## 5. Arquitectura

### 5.1 Bucket y paths
Un bucket R2 público, prefijos por tenant:
```
{tenantId}/logo-{hash}.webp
{tenantId}/cover-{hash}.webp
{tenantId}/courts/{courtId}/{uuid}.webp
```
- **Logo/portada** usan nombre **versionado** (`-{hash}` = hash corto del contenido
  o uuid). Al reemplazar se borra el objeto anterior. Esto evita el CDN sirviendo
  una versión vieja cacheada (el nombre fijo `logo.webp` lo sufriría). **Confirmado:
  sin query string** (`?v=`) — el nombre de archivo es la única fuente de invalidación,
  más simple y sin sorpresas de cache por query-param en distintos edges de CDN.
- **Fotos de cancha** ya son `uuid` → inmutables, sin problema de cache.
- La URL pública persistida en DB es `${R2_PUBLIC_BASE_URL}/${key}`.

### 5.2 Flujo de subida
```
[cliente] elegir archivo (jpg/png/webp, máx 2MB)
   → resize + center-crop al aspecto del preset, encode webp (~q0.82) en canvas
   → Blob (~<500KB)
   → [server action] valida guard + mime + tamaño + pertenencia de tenant/court
   → sube a R2 (PutObject, @aws-sdk/client-s3)
   → borra objeto anterior si corresponde (logo/cover)
   → escribe URL en DB (tenants.logo_url|cover_url  |  courts.photos append)
   → revalidatePath
```
- **Resize en cliente** es obligatorio: las Server Actions de Next 14 topan en
  **1MB de body** por default. Comprimir antes evita subir `bodySizeLimit` y mejora
  la carga pública. El aislamiento vive en la capa app (guards + `withTenantContext`),
  no en RLS de storage (R2 no tiene RLS) — consistente con `SET LOCAL`.

### 5.3 Módulos nuevos

**`src/shared/storage/r2.ts`** — cliente R2 (server-only).
- `S3Client` con endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  `region: 'auto'`, credenciales de env.
- `putImage(key, bytes, contentType): Promise<void>`
- `deleteImage(key): Promise<void>`
- `publicUrl(key): string` → `${R2_PUBLIC_BASE_URL}/${key}`
- `keyFromPublicUrl(url): string | null` — para validar que un borrado apunta a un
  objeto **dentro del prefijo del tenant** (anti-IDOR, ver §8).

**`src/shared/images/resize-image.ts`** — util cliente.
- `resizeToPreset(file, preset): Promise<Blob>` con presets:
  - `logo`: cuadrado 1:1, lado máx 512px
  - `cover`: 16:9, ancho máx 1600px
  - `court`: 4:3, ancho máx 1280px
- center-crop al aspecto, encode `image/webp` q≈0.82. Rechaza mime no-imagen.

**`src/components/ui/image-uploader.tsx`** — `<ImageUploader>` (client).
- Props: `preset`, `value` (url actual o `string[]` para court), `onUpload(file)`,
  `onRemove(url)`, `max` (court = 6), `disabled`.
- UI: click/drop, preview `blob:` inmediato, estado subiendo, botón borrar, y para
  court: grilla de miniaturas con reordenar (la primera = imagen de card) + slot
  "agregar" hasta `max`.

### 5.4 Server actions

**Complejo** (`src/app/(admin)/settings/perfil/actions.ts`, guard `requireAdminStaffAction`):
- `setTenantImageAction(kind: 'logo'|'cover', formData)` → resize ya hecho en
  cliente; valida, sube a R2 (versionado), borra anterior, `updateTenant({logoUrl|coverUrl})`, devuelve `{ url }`.
- `removeTenantImageAction(kind)` → borra objeto R2, setea columna a `null`.

**Cancha** (agregar a `src/app/(admin)/canchas/actions.ts`, guard `requireAdminStaffAction`
— crear/editar cancha ya es admin-only):
- `uploadCourtPhotoAction(courtId, formData)` → valida `count < 6`, sube a
  `{tenantId}/courts/{courtId}/{uuid}.webp`, append a `courts.photos`, devuelve `photos[]`.
- `removeCourtPhotoAction(courtId, url)` → valida prefijo, borra R2, quita del array.
- `reorderCourtPhotosAction(courtId, urls: string[])` → valida igualdad de conjunto,
  persiste el nuevo orden (`photos[0]` = imagen de card).

Todas: `adminRateLimited(tenant.id)` + `withTenantContext` + `revalidatePath`.

### 5.5 Cambios de tipos/servicios
- `UpdateTenantInput` (`src/modules/tenants/tenant.types.ts:56`) → agregar
  `logoUrl: string | null` y `coverUrl: string | null`. `updateTenant` ya hace
  `.set({...data})` genérico (`tenant.service.ts:134`) — no toca jsonb, sin el bug
  de doble-encode.
- Persistencia de `courts.photos`: helper en `court.service.ts` (append / set array)
  dentro de `withTenantContext`.

### 5.6 Placeholder / estado vacío

- **Cards del explorador, header de perfil, `CourtCard`**: ya tienen placeholder
  (gradiente + ícono, `CourtCard.tsx:24-41`) para cuando `logoUrl`/`photos[0]` es
  `null`/vacío. Sin cambios — se reusa tal cual.
- **`/settings/perfil` (nuevo)**: el `<ImageUploader>` en estado vacío (sin
  `value`) no debe verse como un error ni un cuadro roto. Muestra un dropzone con
  ícono + texto invitando a subir (ej. "Subí el logo de tu complejo" / "Subí una
  foto de portada"), con el aspecto del preset ya recortado (cuadrado/16:9) para
  que el admin vea el encuadre esperado antes de elegir archivo.
- **`CourtForm.tsx`**: mismo dropzone vacío para la grilla de fotos (preset
  `court`, aspecto 4:3), con contador "0/6" que sube a medida que se agregan.

## 6. Dónde carga el complejo (pregunta central)

- **Logo + Portada** → **nueva sección `/settings/perfil`** ("Perfil público").
  Hoy `/settings` tiene reservas/facturación/horarios; falta identidad. `/settings`
  ya es admin-only (`settings/layout.tsx` → `requireAdminStaff`). Agregar item a la
  sub-nav de settings.
- **Fotos de cancha** → dentro de `CourtForm.tsx` (crear/editar cancha).
- **Onboarding** → **NO** suma paso (deciden B). El aha moment es la primera reserva;
  no frenar el wizard subiendo fotos. El logo se carga después en `/settings/perfil`.

## 7. Config a modificar (⚠ security-relevant)

`next.config.js`:
- **CSP `img-src`** (línea 34): agregar `media.turnogol.com`. Sin esto el navegador
  bloquea todas las imágenes servidas desde R2.
- **`images.remotePatterns`** (línea 62): agregar
  `{ protocol: 'https', hostname: 'media.turnogol.com' }` para que `next/image`
  optimice desde ese host.

`src/shared/env.ts` (zod `makeSchema`) — secretos nuevos:
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (server-only, secretos)
- `R2_PUBLIC_BASE_URL` (ej. `https://media.turnogol.com`) — server-only; la URL se
  arma y persiste en el server. `isProd` requeridos; `optional()` en dev.

Infra Cloudflare (fuera del código, checklist de deploy):
- Crear bucket R2, conectar custom domain `media.turnogol.com`, generar API token
  S3 (Access Key/Secret). Bucket **público** de lectura (deciden C).

Dependencia nueva: `@aws-sdk/client-s3`.

## 8. Aislamiento y autorización

- Uploads: **admin-only** (`requireAdminStaffAction`) tanto para complejo como para
  cancha. Rate-limited.
- `courtId` se valida vía `withTenantContext` (RLS por tenant) → no se puede subir a
  la cancha de otro complejo.
- **Anti-IDOR en borrado**: `removeCourtPhotoAction` / `removeTenantImageAction`
  reconstruyen la key con `keyFromPublicUrl(url)` y **verifican que empiece con
  `{tenantId}/`** antes de llamar `deleteImage`. Sin esto, una URL manipulada podría
  borrar objetos de otro tenant.
- Validación de mime: el server chequea `content-type` declarado ∈ {webp} (el
  cliente ya re-encodea a webp) y tamaño ≤ límite. Opcional: magic-bytes.

## 9. Manejo de errores

- **Dev sin R2 configurado**: guard temprano al inicio de cada action (antes de
  tocar R2), en `src/shared/storage/r2.ts` o inline en cada action:
  ```ts
  if (!env.R2_ACCOUNT_ID) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }
  ```
  Con `R2_ACCOUNT_ID` etc. `optional()` en dev (§7), esto permite levantar y
  desarrollar el resto de la app localmente sin credenciales R2 reales, sin que
  las actions de imagen tiren una excepción no controlada.
- Falla resize cliente (archivo corrupto / no-imagen) → mensaje inline, no llama al server.
- Falla R2 PutObject → la action devuelve `{success:false, error}`; no se escribe DB.
- Falla DB tras PutObject OK (raro) → objeto huérfano en R2 (aceptable; barrido futuro
  fuera de alcance). Alternativa: try/catch que borra el objeto recién subido.
- Cap de 6 fotos superado → error claro antes de subir.

## 10. Testing

- **Unit**: `resizeToPreset` (aspecto/crop/webp), `keyFromPublicUrl` + validación de
  prefijo, cap de 6 en photos, armado de `publicUrl`.
- **Integration**: `uploadCourtPhotoAction` / `setTenantImageAction` con el módulo
  `r2.ts` mockeado (put/delete espiados) → verifica DB + orden de llamadas + guard.
- **e2e** (opcional, con R2 mock): subir logo en `/settings/perfil` → aparece en la
  card del explorador; subir foto de cancha → aparece en `CourtCard`.

## 11. Decisiones tomadas
- **A**: las 3 imágenes de una (un componente, 3 presets).
- **B**: onboarding NO suma paso de logo.
- **C**: bucket público.
- **D**: 6 fotos por cancha.
- Proveedor: **Cloudflare R2** (S3 API, custom domain).
