# Imágenes de complejo y canchas (Cloudflare R2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar la carga de logo, portada e imágenes por cancha, almacenadas en Cloudflare R2, para que se vean en las cards del explorador y el perfil público (paridad con ATC Sports).

**Architecture:** Cliente resize+encode a webp en canvas → Server Action valida (guard admin-only, tamaño, pertenencia de tenant) → sube a R2 vía `@aws-sdk/client-s3` → escribe URL pública en `tenants.logo_url`/`cover_url` o `courts.photos[]` → `revalidatePath`. Un componente `<ImageUploader>` reusado con 3 presets (logo 1:1, cover 16:9, court 4:3) cubre las 3 superficies de carga: nueva sección `/settings/perfil` (logo+portada) y `CourtForm.tsx` (fotos de cancha).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Drizzle ORM, `@aws-sdk/client-s3` (nuevo), Zod, Vitest.

## Global Constraints

- TypeScript strict, nunca `any`.
- Server Actions para todas las mutaciones (upload/borrado/reorder) — no Route Handlers.
- Uploads son **admin-only** (`requireAdminStaffAction`), igual que crear/editar cancha y Configuración.
- Montos/IDs sin cambios de convención; esto no toca centavos ni UUIDs de negocio.
- `pnpm typecheck` después de cada tarea que toque tipos o compile.
- Correr `pnpm test` (unit) tras cada tarea con tests nuevos.
- Nombres de archivo en R2: **sin doble-L, sin query string** — versionado por nombre (`logo-{uuid}.webp`), no por `?v=`.
- CSP e `images.remotePatterns` en `next.config.js` deben incluir `media.turnogol.com` (§7 del spec) — sin esto las imágenes quedan bloqueadas por el navegador, es un cambio security-relevant, no cosmético.
- En dev sin credenciales R2, las actions devuelven `{ success: false, error: 'Storage no configurado en este entorno' }` en vez de lanzar una excepción no controlada.
- Spec de referencia: `docs/superpowers/specs/2026-07-03-tenant-court-images-r2-design.md`.

---

## Task 1: Dependencia, env vars y config de red/CSP

**Files:**
- Modify: `package.json`
- Modify: `src/shared/env.ts`
- Modify: `next.config.js`
- Modify: `.env.example` (si existe; si no existe, saltar — ver Step 1)

**Interfaces:**
- Produces: `process.env.R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` disponibles server-side. `ServerEnv` (tipo zod) incluye los 5 campos, `optional()` fuera de prod.

- [ ] **Step 1: Revisar si existe `.env.example` y agregar placeholders**

Run: `ls .env.example 2>/dev/null || echo "NO EXISTE"`

Si existe, agregar al final:
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=turnogol-media
R2_PUBLIC_BASE_URL=https://media.turnogol.com
```
Si no existe, saltar este step (no crear el archivo — fuera de alcance).

- [ ] **Step 2: Instalar `@aws-sdk/client-s3`**

Run: `pnpm add @aws-sdk/client-s3`
Expected: agrega la dependencia a `package.json` bajo `dependencies`.

- [ ] **Step 3: Agregar las 5 env vars al schema zod**

En `src/shared/env.ts`, dentro de `makeSchema(isProd)`, agregar antes del cierre `})`:

```ts
    R2_ACCOUNT_ID: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_BUCKET: isProd ? z.string().min(1) : z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: isProd ? z.string().url() : z.string().url().optional(),
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (zod schema es sintácticamente válido, no rompe nada más).

- [ ] **Step 5: Agregar `media.turnogol.com` a CSP e `images.remotePatterns`**

En `next.config.js` línea 34, cambiar:
```js
"img-src 'self' *.supabase.co images.unsplash.com *.tile.openstreetmap.org data: blob:",
```
por:
```js
"img-src 'self' *.supabase.co images.unsplash.com *.tile.openstreetmap.org media.turnogol.com data: blob:",
```

En `next.config.js`, dentro de `images.remotePatterns` (línea ~62), agregar:
```js
{ protocol: 'https', hostname: 'media.turnogol.com' },
```

- [ ] **Step 6: Run typecheck y build de config**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/env.ts next.config.js
git commit -m "chore: agregar @aws-sdk/client-s3 y config R2 (env, CSP, remotePatterns)"
```

---

## Task 2: Cliente R2 (`src/shared/storage/r2.ts`)

**Files:**
- Create: `src/shared/storage/r2.ts`
- Test: `tests/unit/r2-storage.test.ts`

**Interfaces:**
- Consumes: `process.env.R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (Task 1).
- Produces:
  - `isR2Configured(): boolean`
  - `putImage(key: string, bytes: Uint8Array, contentType: string): Promise<void>`
  - `deleteImage(key: string): Promise<void>`
  - `publicUrl(key: string): string`
  - `keyFromPublicUrl(url: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/r2-storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: vi.fn((input) => ({ input, __type: 'Put' })),
  DeleteObjectCommand: vi.fn((input) => ({ input, __type: 'Delete' })),
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.R2_ACCOUNT_ID = 'acc123'
  process.env.R2_ACCESS_KEY_ID = 'key123'
  process.env.R2_SECRET_ACCESS_KEY = 'secret123'
  process.env.R2_BUCKET = 'turnogol-media'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.turnogol.com'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('isR2Configured', () => {
  it('true cuando las 5 env vars están seteadas', async () => {
    const { isR2Configured } = await import('@/shared/storage/r2')
    expect(isR2Configured()).toBe(true)
  })

  it('false si falta R2_ACCOUNT_ID', async () => {
    delete process.env.R2_ACCOUNT_ID
    vi.resetModules()
    const { isR2Configured } = await import('@/shared/storage/r2')
    expect(isR2Configured()).toBe(false)
  })
})

describe('publicUrl', () => {
  it('arma la URL pública a partir de la key', async () => {
    const { publicUrl } = await import('@/shared/storage/r2')
    expect(publicUrl('tenant-1/logo-abc.webp')).toBe(
      'https://media.turnogol.com/tenant-1/logo-abc.webp',
    )
  })
})

describe('keyFromPublicUrl', () => {
  it('extrae la key de una URL pública válida', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('https://media.turnogol.com/tenant-1/logo-abc.webp')).toBe(
      'tenant-1/logo-abc.webp',
    )
  })

  it('devuelve null para una URL de otro host', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('https://evil.com/tenant-1/logo-abc.webp')).toBeNull()
  })

  it('devuelve null para una URL malformada', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('no-es-una-url')).toBeNull()
  })
})

describe('putImage / deleteImage', () => {
  it('putImage llama S3Client.send con PutObjectCommand', async () => {
    const { putImage } = await import('@/shared/storage/r2')
    await putImage('tenant-1/logo-abc.webp', new Uint8Array([1, 2, 3]), 'image/webp')
    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0][0]
    expect(call.__type).toBe('Put')
    expect(call.input).toMatchObject({
      Bucket: 'turnogol-media',
      Key: 'tenant-1/logo-abc.webp',
      ContentType: 'image/webp',
    })
  })

  it('deleteImage llama S3Client.send con DeleteObjectCommand', async () => {
    const { deleteImage } = await import('@/shared/storage/r2')
    await deleteImage('tenant-1/logo-abc.webp')
    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0][0]
    expect(call.__type).toBe('Delete')
    expect(call.input).toMatchObject({ Bucket: 'turnogol-media', Key: 'tenant-1/logo-abc.webp' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/r2-storage.test.ts`
Expected: FAIL — `Cannot find module '@/shared/storage/r2'`

- [ ] **Step 3: Write the implementation**

Create `src/shared/storage/r2.ts`:

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

function getConfig() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  }
}

/** true si las 5 credenciales R2 están presentes en el entorno actual. */
export function isR2Configured(): boolean {
  const c = getConfig()
  return Boolean(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicBaseUrl)
}

let cachedClient: S3Client | null = null

function getClient(): S3Client {
  const c = getConfig()
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.accessKeyId!,
        secretAccessKey: c.secretAccessKey!,
      },
    })
  }
  return cachedClient
}

/** Sube bytes a R2 bajo `key`. Llamar solo tras `isR2Configured()`. */
export async function putImage(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const c = getConfig()
  await getClient().send(
    new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: bytes, ContentType: contentType }),
  )
}

/** Borra el objeto en `key`. No falla si no existe (semántica S3 idempotente). */
export async function deleteImage(key: string): Promise<void> {
  const c = getConfig()
  await getClient().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }))
}

/** URL pública servida por el custom domain para una key dada. */
export function publicUrl(key: string): string {
  const c = getConfig()
  return `${c.publicBaseUrl}/${key}`
}

/**
 * Inverso de `publicUrl`: extrae la key de una URL pública. Devuelve `null` si
 * la URL no pertenece al host configurado (anti-IDOR: el caller debe validar
 * la key resultante contra el prefijo del tenant antes de borrar).
 */
export function keyFromPublicUrl(url: string): string | null {
  const c = getConfig()
  if (!c.publicBaseUrl) return null
  try {
    const base = new URL(c.publicBaseUrl)
    const target = new URL(url)
    if (target.host !== base.host) return null
    return target.pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/r2-storage.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage/r2.ts tests/unit/r2-storage.test.ts
git commit -m "feat(storage): cliente R2 (put/delete/publicUrl/keyFromPublicUrl)"
```

---

## Task 3: Resize a webp en cliente (`src/shared/images/resize-image.ts`)

**Files:**
- Create: `src/shared/images/resize-image.ts`
- Test: `tests/unit/resize-image.test.ts` (jsdom/happy-dom — usa `HTMLCanvasElement`/`Image` mockeados)

**Interfaces:**
- Produces:
  - `type ImagePreset = 'logo' | 'cover' | 'court'`
  - `PRESET_CONFIG: Record<ImagePreset, { aspect: number; maxWidth: number }>`
  - `resizeToPreset(file: File, preset: ImagePreset): Promise<Blob>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/resize-image.test.ts`. Este test corre en `happy-dom` (ya es el entorno de `vitest` del proyecto — ver `vitest.config`) y mockea `Image`/`canvas` porque happy-dom no decodifica bytes de imagen reales.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PRESET_CONFIG, resizeToPreset } from '@/shared/images/resize-image'

class FakeImage {
  width = 800
  height = 600
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) {
    this._src = v
    queueMicrotask(() => this.onload?.())
  }
  get src() {
    return this._src
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })

  const fakeCtx = { drawImage: vi.fn() }
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => fakeCtx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/webp' }))),
  }
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
    return document.createElement.wrappedMethod?.(tag) ?? ({} as HTMLElement)
  })
})

describe('PRESET_CONFIG', () => {
  it('logo es 1:1, cover 16:9, court 4:3', () => {
    expect(PRESET_CONFIG.logo.aspect).toBeCloseTo(1)
    expect(PRESET_CONFIG.cover.aspect).toBeCloseTo(16 / 9)
    expect(PRESET_CONFIG.court.aspect).toBeCloseTo(4 / 3)
  })
})

describe('resizeToPreset', () => {
  it('rechaza archivos que no son imagen', async () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await expect(resizeToPreset(file, 'logo')).rejects.toThrow(/imagen/i)
  })

  it('devuelve un Blob webp para un archivo imagen válido', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await resizeToPreset(file, 'court')
    expect(blob.type).toBe('image/webp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/resize-image.test.ts`
Expected: FAIL — `Cannot find module '@/shared/images/resize-image'`

- [ ] **Step 3: Write the implementation**

Create `src/shared/images/resize-image.ts`:

```ts
'use client'

export type ImagePreset = 'logo' | 'cover' | 'court'

export const PRESET_CONFIG: Record<ImagePreset, { aspect: number; maxWidth: number }> = {
  logo: { aspect: 1, maxWidth: 512 },
  cover: { aspect: 16 / 9, maxWidth: 1600 },
  court: { aspect: 4 / 3, maxWidth: 1280 },
}

/**
 * Redimensiona `file` al aspecto/ancho del preset con center-crop, re-encodea
 * a webp (q≈0.82) en un `<canvas>` y devuelve el Blob resultante. El re-encode
 * también descarta EXIF (no hay metadata a limpiar aparte).
 */
export function resizeToPreset(file: File, preset: ImagePreset): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('El archivo debe ser una imagen'))
  }

  const { aspect, maxWidth } = PRESET_CONFIG[preset]

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const srcAspect = img.width / img.height
      let cropW = img.width
      let cropH = img.height
      if (srcAspect > aspect) {
        cropW = img.height * aspect
      } else {
        cropH = img.width / aspect
      }
      const cropX = (img.width - cropW) / 2
      const cropY = (img.height - cropH) / 2

      const outW = Math.min(maxWidth, cropW)
      const outH = outW / aspect

      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen'))
        return
      }
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo generar la imagen'))
            return
          }
          resolve(blob)
        },
        'image/webp',
        0.82,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('No se pudo leer la imagen'))
    }

    img.src = objectUrl
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/resize-image.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/images/resize-image.ts tests/unit/resize-image.test.ts
git commit -m "feat(images): resize+crop a webp por preset (logo/cover/court)"
```

---

## Task 4: Tipos + persistencia de `logoUrl`/`coverUrl` en tenants

**Files:**
- Modify: `src/modules/tenants/tenant.types.ts`
- Modify: `src/modules/tenants/tenant.service.ts`
- Test: `tests/unit/tenant-service-image-fields.test.ts`

**Interfaces:**
- Consumes: `tenants` schema (`src/shared/db/schema/tenants.ts`, ya tiene `logoUrl`/`coverUrl`).
- Produces: `TenantRow.coverUrl: string | null`, `UpdateTenantInput.logoUrl?: string | null`, `UpdateTenantInput.coverUrl?: string | null`. `rowToTenantRow` mapea `coverUrl`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tenant-service-image-fields.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRow = {
  id: 't1',
  slug: 'complejo-san-martin',
  name: 'Complejo San Martín',
  description: null,
  logoUrl: 'https://media.turnogol.com/t1/logo-a.webp',
  coverUrl: 'https://media.turnogol.com/t1/cover-b.webp',
  address: 'Av. Siempreviva 742',
  city: 'Luján',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  email: 'hola@complejo.com',
  status: 'active',
  trialEndsAt: null,
  settings: {},
  openingHours: {},
  closedDates: [],
  closesNextDay: false,
  mpConnectedAt: null,
}

const limitMock = vi.fn().mockResolvedValue([mockRow])
const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
const fromMock = vi.fn().mockReturnValue({ where: whereMock })
const selectMock = vi.fn().mockReturnValue({ from: fromMock })

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => ({ select: selectMock })),
  getSql: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  selectMock.mockReturnValue({ from: fromMock })
  fromMock.mockReturnValue({ where: whereMock })
  whereMock.mockReturnValue({ limit: limitMock })
  limitMock.mockResolvedValue([mockRow])
})

describe('getTenantById — coverUrl', () => {
  it('mapea coverUrl desde la fila de DB', async () => {
    const { getTenantById } = await import('@/modules/tenants/tenant.service')
    const tenant = await getTenantById('t1')
    expect(tenant?.coverUrl).toBe('https://media.turnogol.com/t1/cover-b.webp')
    expect(tenant?.logoUrl).toBe('https://media.turnogol.com/t1/logo-a.webp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/tenant-service-image-fields.test.ts`
Expected: FAIL — `tenant.coverUrl` es `undefined` (no está en `rowToTenantRow`).

- [ ] **Step 3: Agregar `coverUrl` al tipo `TenantRow`**

En `src/modules/tenants/tenant.types.ts`, dentro de `TenantRow` (línea 90, tras `logoUrl`):

```ts
  logoUrl: string | null
  coverUrl: string | null
```

- [ ] **Step 4: Agregar `logoUrl`/`coverUrl` a `UpdateTenantInput`**

En `src/modules/tenants/tenant.types.ts`, dentro de `UpdateTenantInput` (línea 56-68), agregar dos líneas:

```ts
export type UpdateTenantInput = Partial<{
  name: string
  description: string
  logoUrl: string | null
  coverUrl: string | null
  address: string
  city: string
  province: string
  phone: string
  whatsapp: string | null
  email: string
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
}>
```

- [ ] **Step 5: Mapear `coverUrl` en `rowToTenantRow`**

En `src/modules/tenants/tenant.service.ts`, función `rowToTenantRow` (línea 83-103), agregar tras `logoUrl: t.logoUrl,`:

```ts
    logoUrl: t.logoUrl,
    coverUrl: t.coverUrl,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test tests/unit/tenant-service-image-fields.test.ts`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — si algún otro sitio construye un `TenantRow` literal sin `coverUrl`, el compilador lo señala; agregar `coverUrl: null` ahí (buscar con el error de tsc, no adivinar ubicaciones).

- [ ] **Step 8: Commit**

```bash
git add src/modules/tenants/tenant.types.ts src/modules/tenants/tenant.service.ts tests/unit/tenant-service-image-fields.test.ts
git commit -m "feat(tenants): exponer coverUrl en TenantRow/UpdateTenantInput"
```

---

## Task 5: Server actions de imagen del complejo (`/settings/perfil/actions.ts`)

**Files:**
- Create: `src/app/(admin)/settings/perfil/actions.ts`
- Test: `tests/unit/settings-perfil-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdminStaffAction` (`@/modules/staff/guards`), `adminRateLimited` (`@/shared/rate-limit/server-action`), `isR2Configured`/`putImage`/`deleteImage`/`publicUrl`/`keyFromPublicUrl` (`@/shared/storage/r2`, Task 2), `updateTenant` (`@/modules/tenants/tenant.service`), `UpdateTenantInput` (Task 4).
- Produces:
  - `type TenantImageActionResult = { success: true; url: string } | { success: false; error: string }`
  - `setTenantImageAction(kind: 'logo' | 'cover', formData: FormData): Promise<TenantImageActionResult>` — espera `formData.get('file')` como `Blob`/`File` y `formData.get('previousUrl')` como `string | null`.
  - `removeTenantImageAction(kind: 'logo' | 'cover', previousUrl: string | null): Promise<{ success: true } | { success: false; error: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/settings-perfil-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
  updateTenant: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/storage/r2', () => ({
  isR2Configured: vi.fn(),
  putImage: vi.fn(),
  deleteImage: vi.fn(),
  publicUrl: vi.fn((key: string) => `https://media.turnogol.com/${key}`),
  keyFromPublicUrl: vi.fn((url: string) => url.replace('https://media.turnogol.com/', '')),
}))

import { setTenantImageAction, removeTenantImageAction } from '@/app/(admin)/settings/perfil/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant, updateTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { isR2Configured, putImage, deleteImage } from '@/shared/storage/r2'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1' }
const TENANT = { id: 'tenant-1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(isR2Configured).mockReturnValue(true)
})

function fakeFormData(fileBytes = 'abc', previousUrl: string | null = null) {
  const fd = new FormData()
  fd.set('file', new Blob([fileBytes], { type: 'image/webp' }), 'logo.webp')
  if (previousUrl) fd.set('previousUrl', previousUrl)
  return fd
}

describe('setTenantImageAction — guard de rol', () => {
  it('manager no puede subir logo (Sin acceso a configuración)', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(false)
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })
})

describe('setTenantImageAction — admin', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
  })

  it('sube el archivo y actualiza logoUrl', async () => {
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res.success).toBe(true)
    expect(vi.mocked(putImage)).toHaveBeenCalledTimes(1)
    const [key] = vi.mocked(putImage).mock.calls[0]
    expect(key).toMatch(/^tenant-1\/logo-.+\.webp$/)
    expect(vi.mocked(updateTenant)).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ logoUrl: expect.stringContaining('tenant-1/logo-') }),
    )
  })

  it('borra el objeto anterior si se pasa previousUrl', async () => {
    await setTenantImageAction(
      'cover',
      fakeFormData('abc', 'https://media.turnogol.com/tenant-1/cover-old.webp'),
    )
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/cover-old.webp')
  })

  it('rechaza sin R2 configurado (dev sin credenciales)', async () => {
    vi.mocked(isR2Configured).mockReturnValue(false)
    const res = await setTenantImageAction('logo', fakeFormData())
    expect(res).toEqual({ success: false, error: 'Storage no configurado en este entorno' })
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })
})

describe('removeTenantImageAction', () => {
  it('admin borra el logo y limpia la columna', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    const res = await removeTenantImageAction(
      'logo',
      'https://media.turnogol.com/tenant-1/logo-old.webp',
    )
    expect(res.success).toBe(true)
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/logo-old.webp')
    expect(vi.mocked(updateTenant)).toHaveBeenCalledWith('tenant-1', { logoUrl: null })
  })

  it('anti-IDOR: rechaza borrar una key que no pertenece al tenant', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    const res = await removeTenantImageAction(
      'logo',
      'https://media.turnogol.com/OTRO-TENANT/logo-old.webp',
    )
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/settings-perfil-actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/(admin)/settings/perfil/actions'`

- [ ] **Step 3: Write the implementation**

Create `src/app/(admin)/settings/perfil/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { updateTenant } from '@/modules/tenants/tenant.service'
import {
  isR2Configured,
  putImage,
  deleteImage,
  publicUrl,
  keyFromPublicUrl,
} from '@/shared/storage/r2'

export type TenantImageActionResult =
  | { success: true; url: string }
  | { success: false; error: string }

const MAX_BYTES = 2 * 1024 * 1024

function isOwnedByTenant(key: string | null, tenantId: string): key is string {
  return key !== null && key.startsWith(`${tenantId}/`)
}

async function deletePreviousIfOwned(previousUrl: string | null, tenantId: string) {
  if (!previousUrl) return
  const key = keyFromPublicUrl(previousUrl)
  if (isOwnedByTenant(key, tenantId)) await deleteImage(key)
}

export async function setTenantImageAction(
  kind: 'logo' | 'cover',
  formData: FormData,
): Promise<TenantImageActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return { success: false, error: 'Archivo inválido' }
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'La imagen no puede superar 2MB' }
  }

  const previousUrl = formData.get('previousUrl')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${tenant.id}/${kind}-${crypto.randomUUID()}.webp`

  await putImage(key, bytes, 'image/webp')
  await deletePreviousIfOwned(typeof previousUrl === 'string' ? previousUrl : null, tenant.id)

  const url = publicUrl(key)
  await updateTenant(tenant.id, kind === 'logo' ? { logoUrl: url } : { coverUrl: url })

  revalidatePath('/settings/perfil')
  revalidatePath(`/${tenant.slug}`)
  return { success: true, url }
}

export async function removeTenantImageAction(
  kind: 'logo' | 'cover',
  previousUrl: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const key = keyFromPublicUrl(previousUrl ?? '')
  if (!isOwnedByTenant(key, tenant.id)) {
    return { success: false, error: 'Imagen inválida' }
  }

  if (isR2Configured()) await deleteImage(key)
  await updateTenant(tenant.id, kind === 'logo' ? { logoUrl: null } : { coverUrl: null })

  revalidatePath('/settings/perfil')
  revalidatePath(`/${tenant.slug}`)
  return { success: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/settings-perfil-actions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/settings/perfil/actions.ts" tests/unit/settings-perfil-actions.test.ts
git commit -m "feat(settings): server actions de logo/portada del complejo (R2)"
```

---

## Task 6: `<ImageUploader>` component

**Files:**
- Create: `src/components/ui/image-uploader.tsx`
- Test: `tests/unit/image-uploader.test.tsx`

**Interfaces:**
- Consumes: `resizeToPreset`, `ImagePreset`, `PRESET_CONFIG` (`@/shared/images/resize-image`, Task 3), `Button` (`@/components/ui/button`).
- Produces: `<ImageUploader preset value onUpload onRemove max disabled emptyLabel />` (client component).
  ```ts
  type ImageUploaderProps = {
    preset: ImagePreset
    value: string | string[]        // string para logo/cover, string[] para court
    onUpload: (blob: Blob) => Promise<void>
    onRemove: (url: string) => Promise<void>
    onReorder?: (urls: string[]) => Promise<void>  // solo relevante cuando value es string[] y hay 2+ fotos
    max?: number                    // solo aplica cuando value es string[]; default 1
    disabled?: boolean
    emptyLabel: string              // texto del dropzone vacío (spec §5.6)
  }
  ```
  La primera url del array es la imagen de card (spec §5.3/§5.4) — los botones
  ◄/► de cada miniatura mueven su posición dentro del array y llaman `onReorder`
  con el array completo reordenado.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/image-uploader.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageUploader } from '@/components/ui/image-uploader'

vi.mock('@/shared/images/resize-image', () => ({
  resizeToPreset: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/webp' })),
  PRESET_CONFIG: {
    logo: { aspect: 1, maxWidth: 512 },
    cover: { aspect: 16 / 9, maxWidth: 1600 },
    court: { aspect: 4 / 3, maxWidth: 1280 },
  },
}))

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview') })
})

describe('ImageUploader — logo/cover (value: string)', () => {
  it('estado vacío muestra el emptyLabel y ningún botón de borrar', () => {
    render(
      <ImageUploader
        preset="logo"
        value=""
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        emptyLabel="Subí el logo de tu complejo"
      />,
    )
    expect(screen.getByText('Subí el logo de tu complejo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
  })

  it('elegir un archivo llama onUpload con el blob redimensionado', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)
    render(
      <ImageUploader preset="logo" value="" onUpload={onUpload} onRemove={vi.fn()} emptyLabel="Subí el logo" />,
    )
    const input = screen.getByLabelText(/subí el logo/i) as HTMLInputElement
    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it('con value seteado muestra botón de borrar', () => {
    render(
      <ImageUploader
        preset="cover"
        value="https://media.turnogol.com/t1/cover-a.webp"
        onUpload={vi.fn()}
        onRemove={vi.fn()}
        emptyLabel="Subí una portada"
      />,
    )
    expect(screen.getByRole('button', { name: /quitar/i })).toBeInTheDocument()
  })
})

describe('ImageUploader — court (value: string[])', () => {
  it('respeta el máximo: oculta el dropzone al llegar a `max`', () => {
    const photos = Array.from({ length: 6 }, (_, i) => `https://media.turnogol.com/t1/courts/c1/${i}.webp`)
    render(
      <ImageUploader preset="court" value={photos} onUpload={vi.fn()} onRemove={vi.fn()} max={6} emptyLabel="Agregar foto" />,
    )
    expect(screen.queryByLabelText(/agregar foto/i)).not.toBeInTheDocument()
  })

  it('muestra contador de fotos', () => {
    const photos = ['https://media.turnogol.com/t1/courts/c1/0.webp']
    render(
      <ImageUploader preset="court" value={photos} onUpload={vi.fn()} onRemove={vi.fn()} max={6} emptyLabel="Agregar foto" />,
    )
    expect(screen.getByText('1/6')).toBeInTheDocument()
  })

  it('con 1 sola foto no muestra botones de reordenar', () => {
    const photos = ['https://media.turnogol.com/t1/courts/c1/0.webp']
    render(
      <ImageUploader preset="court" value={photos} onUpload={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} max={6} emptyLabel="Agregar foto" />,
    )
    expect(screen.queryByRole('button', { name: /mover a la izquierda/i })).not.toBeInTheDocument()
  })

  it('con 2+ fotos, mover la segunda a la izquierda llama onReorder con el array swappeado', async () => {
    const photos = [
      'https://media.turnogol.com/t1/courts/c1/a.webp',
      'https://media.turnogol.com/t1/courts/c1/b.webp',
    ]
    const onReorder = vi.fn().mockResolvedValue(undefined)
    render(
      <ImageUploader preset="court" value={photos} onUpload={vi.fn()} onRemove={vi.fn()} onReorder={onReorder} max={6} emptyLabel="Agregar foto" />,
    )
    const leftButtons = screen.getAllByRole('button', { name: /mover a la izquierda/i })
    fireEvent.click(leftButtons[0]!)
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith([photos[1], photos[0]]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/image-uploader.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/image-uploader'`

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/image-uploader.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { resizeToPreset, type ImagePreset } from '@/shared/images/resize-image'
import { cn } from '@/lib/utils'

type ImageUploaderProps = {
  preset: ImagePreset
  value: string | string[]
  onUpload: (blob: Blob) => Promise<void>
  onRemove: (url: string) => Promise<void>
  onReorder?: (urls: string[]) => Promise<void>
  max?: number
  disabled?: boolean
  emptyLabel: string
}

const ASPECT_CLASS: Record<ImagePreset, string> = {
  logo: 'aspect-square',
  cover: 'aspect-video',
  court: 'aspect-[4/3]',
}

export function ImageUploader({
  preset,
  value,
  onUpload,
  onRemove,
  onReorder,
  max = 1,
  disabled,
  emptyLabel,
}: ImageUploaderProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMulti = Array.isArray(value)
  const urls = isMulti ? value : value ? [value] : []
  const atMax = isMulti && urls.length >= max

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const blob = await resizeToPreset(file, preset)
      await onUpload(blob)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(url: string) {
    setBusy(true)
    try {
      await onRemove(url)
    } finally {
      setBusy(false)
    }
  }

  async function handleMove(index: number, dir: -1 | 1) {
    if (!onReorder) return
    const target = index + dir
    if (target < 0 || target >= urls.length) return
    const next = [...urls]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setBusy(true)
    try {
      await onReorder(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {isMulti && (
        <p className="text-xs text-muted-foreground">
          {urls.length}/{max}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {urls.map((url, index) => (
          <div
            key={url}
            className={cn(
              'relative w-32 overflow-hidden rounded-lg border border-border bg-muted',
              ASPECT_CLASS[preset],
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- preview genérico, no necesita next/image */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Quitar imagen"
              disabled={disabled || busy}
              onClick={() => handleRemove(url)}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
            {onReorder && urls.length > 1 && (
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                {index > 0 ? (
                  <button
                    type="button"
                    aria-label="Mover a la izquierda"
                    disabled={disabled || busy}
                    onClick={() => handleMove(index, -1)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : (
                  <span />
                )}
                {index < urls.length - 1 && (
                  <button
                    type="button"
                    aria-label="Mover a la derecha"
                    disabled={disabled || busy}
                    onClick={() => handleMove(index, 1)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {!atMax && (
          <label
            className={cn(
              'flex w-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border text-center text-xs text-muted-foreground hover:border-emerald-500/60 hover:text-foreground',
              ASPECT_CLASS[preset],
              (disabled || busy) && 'pointer-events-none opacity-50',
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-5 w-5" aria-hidden />
            )}
            <span className="px-2">{emptyLabel}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={emptyLabel}
              disabled={disabled || busy}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/image-uploader.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/image-uploader.tsx tests/unit/image-uploader.test.tsx
git commit -m "feat(ui): componente ImageUploader (3 presets, dropzone, borrar)"
```

---

## Task 7: Página `/settings/perfil` (logo + portada)

**Files:**
- Create: `src/app/(admin)/settings/perfil/page.tsx`
- Create: `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx`
- Modify: `src/app/(admin)/settings/reservas/page.tsx` (agregar tab a `SETTINGS_TABS`)
- Modify: `src/app/(admin)/settings/horarios/page.tsx` (agregar tab a `SETTINGS_TABS`, si tiene el mismo array)
- Modify: `src/app/(admin)/settings/facturacion/page.tsx` (agregar tab a `SETTINGS_TABS`, si tiene el mismo array)
- Test: `tests/unit/perfil-images-form.test.tsx`

**Interfaces:**
- Consumes: `extractAuthUser`, `getStaffTenant` (patrón idéntico a `settings/reservas/page.tsx`), `ImageUploader` (Task 6), `setTenantImageAction`/`removeTenantImageAction` (Task 5).
- Produces: ruta `/settings/perfil` navegable desde la sub-nav de Configuración.

- [ ] **Step 1: Confirmar si `SETTINGS_TABS` está duplicado por página**

Run: `grep -rn "SETTINGS_TABS" src/app/\(admin\)/settings/`

Si el array `SETTINGS_TABS` está copiado en cada `page.tsx` (como en `reservas/page.tsx:6-10`), agregar ahí mismo la nueva entrada en cada archivo que lo tenga (no extraer a un módulo compartido — fuera de alcance, seguir el patrón existente). Si en cambio ya vive centralizado en un solo archivo, editar solo ese.

- [ ] **Step 2: Agregar el tab "Perfil" a `SETTINGS_TABS` en cada page.tsx que lo declara**

En cada ocurrencia (ej. `src/app/(admin)/settings/reservas/page.tsx:6-10`), agregar como primer ítem:

```ts
const SETTINGS_TABS = [
  { href: '/settings/perfil', label: 'Perfil' },
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
]
```

- [ ] **Step 3: Write the failing test para el form**

Create `tests/unit/perfil-images-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerfilImagesForm } from '@/app/(admin)/settings/perfil/PerfilImagesForm'

vi.mock('@/app/(admin)/settings/perfil/actions', () => ({
  setTenantImageAction: vi.fn(),
  removeTenantImageAction: vi.fn(),
}))

describe('PerfilImagesForm', () => {
  it('sin logo/portada muestra los dos dropzones vacíos', () => {
    render(<PerfilImagesForm logoUrl={null} coverUrl={null} />)
    expect(screen.getByText(/subí el logo/i)).toBeInTheDocument()
    expect(screen.getByText(/subí una portada/i)).toBeInTheDocument()
  })

  it('con logo existente muestra la imagen y no el dropzone', () => {
    render(<PerfilImagesForm logoUrl="https://media.turnogol.com/t1/logo-a.webp" coverUrl={null} />)
    expect(screen.getAllByRole('button', { name: /quitar/i })).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test tests/unit/perfil-images-form.test.tsx`
Expected: FAIL — módulo no existe.

- [ ] **Step 5: Write `PerfilImagesForm.tsx`**

Create `src/app/(admin)/settings/perfil/PerfilImagesForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ImageUploader } from '@/components/ui/image-uploader'
import { setTenantImageAction, removeTenantImageAction } from './actions'

type Props = {
  logoUrl: string | null
  coverUrl: string | null
}

export function PerfilImagesForm({ logoUrl: initialLogo, coverUrl: initialCover }: Props) {
  const [logoUrl, setLogoUrl] = useState(initialLogo)
  const [coverUrl, setCoverUrl] = useState(initialCover)
  const [error, setError] = useState<string | null>(null)

  async function upload(kind: 'logo' | 'cover', blob: Blob) {
    setError(null)
    const fd = new FormData()
    fd.set('file', blob, `${kind}.webp`)
    const previous = kind === 'logo' ? logoUrl : coverUrl
    if (previous) fd.set('previousUrl', previous)
    const result = await setTenantImageAction(kind, fd)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (kind === 'logo') setLogoUrl(result.url)
    else setCoverUrl(result.url)
  }

  async function remove(kind: 'logo' | 'cover', url: string) {
    setError(null)
    const result = await removeTenantImageAction(kind, url)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (kind === 'logo') setLogoUrl(null)
    else setCoverUrl(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Logo</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Se muestra en las cards del explorador y en tu perfil público.
        </p>
        <ImageUploader
          preset="logo"
          value={logoUrl ?? ''}
          onUpload={(blob) => upload('logo', blob)}
          onRemove={(url) => remove('logo', url)}
          emptyLabel="Subí el logo de tu complejo"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Portada</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Banner grande en la parte superior de tu perfil público.
        </p>
        <ImageUploader
          preset="cover"
          value={coverUrl ?? ''}
          onUpload={(blob) => upload('cover', blob)}
          onRemove={(url) => remove('cover', url)}
          emptyLabel="Subí una portada"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test tests/unit/perfil-images-form.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Write `page.tsx`**

Create `src/app/(admin)/settings/perfil/page.tsx` (calca la estructura de `settings/reservas/page.tsx`):

```tsx
import { redirect } from 'next/navigation'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { PerfilImagesForm } from './PerfilImagesForm'

const SETTINGS_TABS = [
  { href: '/settings/perfil', label: 'Perfil' },
  { href: '/settings/reservas', label: 'Reservas' },
  { href: '/settings/horarios', label: 'Horarios' },
  { href: '/settings/facturacion', label: 'Facturación' },
]

export default async function PerfilPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <nav className="flex gap-1 border-b border-border">
        {SETTINGS_TABS.map(({ href, label }) => {
          const active = href === '/settings/perfil'
          return (
            <a
              key={href}
              href={href}
              className={
                'px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 ' +
                (active
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              {label}
            </a>
          )
        })}
      </nav>

      <div className="card-premium rounded-lg p-6">
        <h2 className="mb-6 text-base font-semibold text-foreground">Perfil público</h2>
        <PerfilImagesForm logoUrl={tenant.logoUrl} coverUrl={tenant.coverUrl} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "src/app/(admin)/settings/perfil" "src/app/(admin)/settings/reservas/page.tsx" "src/app/(admin)/settings/horarios/page.tsx" "src/app/(admin)/settings/facturacion/page.tsx" tests/unit/perfil-images-form.test.tsx
git commit -m "feat(settings): página /settings/perfil para logo y portada"
```

---

## Task 8: Persistencia de `courts.photos` (append/remove/reorder)

**Files:**
- Modify: `src/modules/courts/court.service.ts`
- Test: `tests/unit/court-service-photos.test.ts`

**Interfaces:**
- Consumes: `courts` schema, `DbTx` (ya importados en `court.service.ts`).
- Produces:
  - `appendCourtPhoto(courtId: string, tenantId: string, url: string, tx: DbTx): Promise<string[] | null>`
  - `removeCourtPhoto(courtId: string, tenantId: string, url: string, tx: DbTx): Promise<string[] | null>`
  - `reorderCourtPhotos(courtId: string, tenantId: string, urls: string[], tx: DbTx): Promise<string[] | null>`
  - Todos devuelven `null` si la cancha no existe/no pertenece al tenant; si no, el array `photos` resultante.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/court-service-photos.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { appendCourtPhoto, removeCourtPhoto, reorderCourtPhotos } from '@/modules/courts/court.service'

function fakeTx(existingPhotos: string[], returningPhotos: string[]) {
  const returning = vi.fn().mockResolvedValue([{ photos: returningPhotos }])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })

  const limit = vi.fn().mockResolvedValue([{ photos: existingPhotos }])
  const selWhere = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where: selWhere })
  const select = vi.fn().mockReturnValue({ from })

  return { update, select, set, where } as never
}

describe('appendCourtPhoto', () => {
  it('agrega la url al array existente', async () => {
    const tx = fakeTx(['a.webp'], ['a.webp', 'b.webp'])
    const result = await appendCourtPhoto('court-1', 'tenant-1', 'b.webp', tx)
    expect(result).toEqual(['a.webp', 'b.webp'])
  })

  it('rechaza cuando ya hay 6 fotos', async () => {
    const six = Array.from({ length: 6 }, (_, i) => `${i}.webp`)
    const tx = fakeTx(six, six)
    await expect(appendCourtPhoto('court-1', 'tenant-1', 'seven.webp', tx)).rejects.toThrow(/6/)
  })
})

describe('removeCourtPhoto', () => {
  it('quita la url del array', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], ['a.webp'])
    const result = await removeCourtPhoto('court-1', 'tenant-1', 'b.webp', tx)
    expect(result).toEqual(['a.webp'])
  })
})

describe('reorderCourtPhotos', () => {
  it('persiste el nuevo orden si el conjunto coincide', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], ['b.webp', 'a.webp'])
    const result = await reorderCourtPhotos('court-1', 'tenant-1', ['b.webp', 'a.webp'], tx)
    expect(result).toEqual(['b.webp', 'a.webp'])
  })

  it('rechaza si el conjunto de urls no coincide con el existente', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], [])
    await expect(
      reorderCourtPhotos('court-1', 'tenant-1', ['a.webp', 'c.webp'], tx),
    ).rejects.toThrow(/no coincide/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/court-service-photos.test.ts`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Write the implementation**

En `src/modules/courts/court.service.ts`, agregar al final del archivo:

```ts
async function getCourtPhotos(courtId: string, tenantId: string, tx: DbTx): Promise<string[] | null> {
  const rows = await tx
    .select({ photos: courts.photos })
    .from(courts)
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .limit(1)
  if (!rows.length) return null
  return (rows[0]!.photos as string[]) ?? []
}

const MAX_COURT_PHOTOS = 6

/** Agrega `url` al final de `courts.photos`. Rechaza al superar 6 fotos. */
export async function appendCourtPhoto(
  courtId: string,
  tenantId: string,
  url: string,
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  if (current.length >= MAX_COURT_PHOTOS) {
    throw new Error(`No se pueden cargar más de ${MAX_COURT_PHOTOS} fotos por cancha`)
  }
  const next = [...current, url]
  const rows = await tx
    .update(courts)
    .set({ photos: next, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}

/** Quita `url` de `courts.photos`. No falla si `url` no estaba presente. */
export async function removeCourtPhoto(
  courtId: string,
  tenantId: string,
  url: string,
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  const next = current.filter((p) => p !== url)
  const rows = await tx
    .update(courts)
    .set({ photos: next, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}

/** Persiste un nuevo orden de `courts.photos`. Rechaza si el conjunto no coincide con el actual (anti-injection de urls ajenas). */
export async function reorderCourtPhotos(
  courtId: string,
  tenantId: string,
  urls: string[],
  tx: DbTx,
): Promise<string[] | null> {
  const current = await getCourtPhotos(courtId, tenantId, tx)
  if (current === null) return null
  const sameSet =
    current.length === urls.length && [...current].sort().join('|') === [...urls].sort().join('|')
  if (!sameSet) {
    throw new Error('El nuevo orden no coincide con las fotos existentes')
  }
  const rows = await tx
    .update(courts)
    .set({ photos: urls, updatedAt: new Date() })
    .where(and(eq(courts.id, courtId), eq(courts.tenantId, tenantId)))
    .returning({ photos: courts.photos })
  return (rows[0]?.photos as string[]) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/court-service-photos.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/courts/court.service.ts tests/unit/court-service-photos.test.ts
git commit -m "feat(courts): append/remove/reorder de courts.photos con cap de 6"
```

---

## Task 9: Server actions de fotos de cancha

**Files:**
- Modify: `src/app/(admin)/canchas/actions.ts`
- Test: `tests/unit/canchas-photo-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdminStaffAction`, `withTenantContext`, `adminRateLimited` (ya importados en el archivo), `appendCourtPhoto`/`removeCourtPhoto`/`reorderCourtPhotos` (Task 8), `isR2Configured`/`putImage`/`deleteImage`/`publicUrl`/`keyFromPublicUrl` (Task 2).
- Produces:
  - `type CourtPhotoActionResult = { success: true; photos: string[] } | { success: false; error: string }`
  - `uploadCourtPhotoAction(courtId: string, formData: FormData): Promise<CourtPhotoActionResult>`
  - `removeCourtPhotoAction(courtId: string, url: string): Promise<CourtPhotoActionResult>`
  - `reorderCourtPhotosAction(courtId: string, urls: string[]): Promise<CourtPhotoActionResult>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/canchas-photo-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireOperatorStaff: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/storage/r2', () => ({
  isR2Configured: vi.fn().mockReturnValue(true),
  putImage: vi.fn(),
  deleteImage: vi.fn(),
  publicUrl: vi.fn((key: string) => `https://media.turnogol.com/${key}`),
  keyFromPublicUrl: vi.fn((url: string) => url.replace('https://media.turnogol.com/', '')),
}))
vi.mock('@/modules/courts/court.service', () => ({
  createCourt: vi.fn(),
  updateCourt: vi.fn(),
  toggleStatus: vi.fn(),
  getCourtCountAndLimit: vi.fn(),
  validatePricingRulesCoverage: vi.fn(),
  appendCourtPhoto: vi.fn(),
  removeCourtPhoto: vi.fn(),
  reorderCourtPhotos: vi.fn(),
}))

import {
  uploadCourtPhotoAction,
  removeCourtPhotoAction,
  reorderCourtPhotosAction,
} from '@/app/(admin)/canchas/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { putImage, deleteImage, isR2Configured } from '@/shared/storage/r2'
import { appendCourtPhoto, removeCourtPhoto, reorderCourtPhotos } from '@/modules/courts/court.service'

const TENANT = { id: 'tenant-1', slug: 'demo' }
const FAKE_TX = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: true, tenant: TENANT } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(isR2Configured).mockReturnValue(true)
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
})

describe('uploadCourtPhotoAction', () => {
  it('rechaza sin rol admin', async () => {
    vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: false, error: 'no' } as never)
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-1', fd)
    expect(res.success).toBe(false)
    expect(vi.mocked(putImage)).not.toHaveBeenCalled()
  })

  it('sube a R2 y appendea a courts.photos', async () => {
    vi.mocked(appendCourtPhoto).mockResolvedValue(['https://media.turnogol.com/tenant-1/courts/court-1/x.webp'])
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-1', fd)
    expect(res.success).toBe(true)
    expect(vi.mocked(putImage)).toHaveBeenCalledTimes(1)
    const [key] = vi.mocked(putImage).mock.calls[0]
    expect(key).toMatch(/^tenant-1\/courts\/court-1\/.+\.webp$/)
  })

  it('cancha inexistente devuelve error sin subir', async () => {
    vi.mocked(appendCourtPhoto).mockResolvedValue(null)
    const fd = new FormData()
    fd.set('file', new Blob(['x'], { type: 'image/webp' }), 'a.webp')
    const res = await uploadCourtPhotoAction('court-inexistente', fd)
    expect(res.success).toBe(false)
  })
})

describe('removeCourtPhotoAction', () => {
  it('anti-IDOR: rechaza url de otro tenant', async () => {
    const res = await removeCourtPhotoAction(
      'court-1',
      'https://media.turnogol.com/OTRO-TENANT/courts/court-1/x.webp',
    )
    expect(res.success).toBe(false)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  it('borra en R2 y en DB', async () => {
    vi.mocked(removeCourtPhoto).mockResolvedValue([])
    const res = await removeCourtPhotoAction(
      'court-1',
      'https://media.turnogol.com/tenant-1/courts/court-1/x.webp',
    )
    expect(res.success).toBe(true)
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith('tenant-1/courts/court-1/x.webp')
  })
})

describe('reorderCourtPhotosAction', () => {
  it('persiste el nuevo orden', async () => {
    vi.mocked(reorderCourtPhotos).mockResolvedValue(['b.webp', 'a.webp'])
    const res = await reorderCourtPhotosAction('court-1', ['b.webp', 'a.webp'])
    expect(res.success).toBe(true)
    expect(res.success && res.photos).toEqual(['b.webp', 'a.webp'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/canchas-photo-actions.test.ts`
Expected: FAIL — las 3 actions no existen.

- [ ] **Step 3: Write the implementation**

En `src/app/(admin)/canchas/actions.ts`, agregar los imports necesarios al bloque existente (arriba del archivo, junto a los otros de `@/modules/courts/court.service`):

```ts
import {
  createCourt,
  updateCourt,
  toggleStatus,
  getCourtCountAndLimit,
  validatePricingRulesCoverage,
  appendCourtPhoto,
  removeCourtPhoto,
  reorderCourtPhotos,
} from '@/modules/courts/court.service'
import {
  isR2Configured,
  putImage,
  deleteImage,
  publicUrl,
  keyFromPublicUrl,
} from '@/shared/storage/r2'
```

Y agregar al final del archivo:

```ts
export type CourtPhotoActionResult =
  | { success: true; photos: string[] }
  | { success: false; error: string }

const MAX_PHOTO_BYTES = 2 * 1024 * 1024

// Fotos de cancha son Configuración (misma cancha = solo admin, ver
// createCourtAction/updateCourtAction arriba).
export async function uploadCourtPhotoAction(
  courtId: string,
  formData: FormData,
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  if (!isR2Configured()) {
    console.warn('[storage] R2 no configurado — upload deshabilitado en este entorno')
    return { success: false, error: 'Storage no configurado en este entorno' }
  }

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    return { success: false, error: 'Archivo inválido' }
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { success: false, error: 'La imagen no puede superar 2MB' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${tenant.id}/courts/${courtId}/${crypto.randomUUID()}.webp`

  try {
    await putImage(key, bytes, 'image/webp')
  } catch {
    return { success: false, error: 'No se pudo subir la imagen' }
  }

  const url = publicUrl(key)

  try {
    const photos = await withTenantContext(tenant.id, (tx) =>
      appendCourtPhoto(courtId, tenant.id, url, tx),
    )
    if (photos === null) return { success: false, error: 'Cancha no encontrada' }
    revalidatePath('/canchas')
    return { success: true, photos }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'No se pudo guardar la foto' }
  }
}

export async function removeCourtPhotoAction(
  courtId: string,
  url: string,
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const key = keyFromPublicUrl(url)
  if (!key || !key.startsWith(`${tenant.id}/`)) {
    return { success: false, error: 'Imagen inválida' }
  }

  const photos = await withTenantContext(tenant.id, (tx) =>
    removeCourtPhoto(courtId, tenant.id, url, tx),
  )
  if (photos === null) return { success: false, error: 'Cancha no encontrada' }

  if (isR2Configured()) await deleteImage(key)

  revalidatePath('/canchas')
  return { success: true, photos }
}

export async function reorderCourtPhotosAction(
  courtId: string,
  urls: string[],
): Promise<CourtPhotoActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  try {
    const photos = await withTenantContext(tenant.id, (tx) =>
      reorderCourtPhotos(courtId, tenant.id, urls, tx),
    )
    if (photos === null) return { success: false, error: 'Cancha no encontrada' }
    revalidatePath('/canchas')
    return { success: true, photos }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'No se pudo reordenar' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/canchas-photo-actions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/canchas/actions.ts" tests/unit/canchas-photo-actions.test.ts
git commit -m "feat(canchas): server actions de fotos por cancha (upload/remove/reorder, R2)"
```

---

## Task 10: Integrar `<ImageUploader>` en `CourtForm.tsx`

**Files:**
- Modify: `src/app/(admin)/canchas/components/CourtForm.tsx`
- Test: `tests/e2e/canchas-crud.spec.ts` (extender, no crear nuevo — ver Step 3)

**Interfaces:**
- Consumes: `ImageUploader` (Task 6), `uploadCourtPhotoAction`/`removeCourtPhotoAction`/`reorderCourtPhotosAction` (Task 9).

- [ ] **Step 1: Agregar sección de fotos al form (solo en modo edición)**

En `src/app/(admin)/canchas/components/CourtForm.tsx`, la subida de fotos requiere un `courtId` existente (las fotos cuelgan de `{tenantId}/courts/{courtId}/...`). Para una cancha nueva, el flujo es: crear primero (ya sin fotos, como hoy) → tras `onSaved`, el padre re-renderiza `CourtForm` en modo edición con el `court.id` real → recién ahí aparece la sección de fotos. Esto es consistente con el comentario ya existente en el archivo (línea 40-41: "Cancha nueva arranca SIN precios").

Agregar el import al inicio del archivo:

```ts
import { ImageUploader } from '@/components/ui/image-uploader'
import {
  uploadCourtPhotoAction,
  removeCourtPhotoAction,
  reorderCourtPhotosAction,
} from '../actions'
```

Agregar estado tras la línea 46 (`const [emptyCount, setEmptyCount] = useState...)`):

```ts
  const [photos, setPhotos] = useState<string[]>(court?.photos ?? [])
```

Agregar las funciones de subida/borrado tras `handleRulesChange` (línea 54):

```ts
  async function handlePhotoUpload(blob: Blob) {
    if (!court) return
    const fd = new FormData()
    fd.set('file', blob, 'photo.webp')
    const result = await uploadCourtPhotoAction(court.id, fd)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoRemove(url: string) {
    if (!court) return
    const result = await removeCourtPhotoAction(court.id, url)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }

  async function handlePhotoReorder(urls: string[]) {
    if (!court) return
    const result = await reorderCourtPhotosAction(court.id, urls)
    if (result.success) setPhotos(result.photos)
    else setError(result.error)
  }
```

Agregar la sección de UI entre el bloque "Precios" (cierra en línea 184) y el bloque de `error` (línea 186) — solo cuando `isEdit`:

```tsx
      {isEdit && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fotos</h3>
            <p className="text-xs text-muted-foreground">
              La primera foto es la que se ve en la card de la cancha. Hasta 6.
            </p>
          </div>
          <ImageUploader
            preset="court"
            value={photos}
            max={6}
            onUpload={handlePhotoUpload}
            onRemove={handlePhotoRemove}
            onReorder={handlePhotoReorder}
            emptyLabel="Agregar foto"
          />
        </div>
      )}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Extender el e2e existente de canchas**

Run: `grep -n "test(" tests/e2e/canchas-crud.spec.ts | head -20`

Leer los primeros tests de ese archivo para calcar el patrón de setup (login admin, navegación a `/canchas`, apertura del form). Agregar un test nuevo al final del `describe` existente:

```ts
test('cancha existente permite agregar y quitar una foto', async ({ page }) => {
  // Precondición: usa una cancha ya creada por el seed/setup del archivo —
  // ajustar el selector de apertura de "editar" al patrón real usado arriba
  // en este mismo spec (no hay una cancha nueva sin guardar: la sección de
  // fotos solo aparece en modo edición, ver CourtForm.tsx).
  await page.goto('/canchas')
  await page.getByRole('button', { name: /editar/i }).first().click()
  await expect(page.getByText('Fotos')).toBeVisible()
  // Sin R2 configurado en el entorno e2e local, el upload real queda fuera
  // de este smoke test — se verifica solo que la sección se renderiza.
})
```

Nota: este test es un smoke mínimo (la sección aparece), no un upload real — evita depender de credenciales R2 en CI. Ajustar el selector `getByRole('button', { name: /editar/i })` al que realmente usa el resto del spec (revisar los tests existentes en el mismo archivo antes de escribir este, pueden usar un `data-testid` distinto).

- [ ] **Step 4: Run typecheck una vez más tras el ajuste del e2e**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/canchas/components/CourtForm.tsx" tests/e2e/canchas-crud.spec.ts
git commit -m "feat(canchas): integrar ImageUploader en CourtForm (modo edición)"
```

---

## Task 11: Verificación final end-to-end del set

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck`
Expected: PASS, cero errores.

- [ ] **Step 2: Lint completo**

Run: `pnpm lint`
Expected: PASS (o solo warnings preexistentes no relacionados a los archivos tocados).

- [ ] **Step 3: Suite unit completa**

Run: `pnpm test`
Expected: PASS, incluye todos los tests nuevos de las Tasks 2-9.

- [ ] **Step 4: Confirmar que las cards de lectura ya consumen los campos nuevos**

Run: `grep -n "logoUrl\|coverUrl" src/app/\(public\)/explorar/components/TenantCard.tsx src/components/site/FeaturedComplexCard.tsx src/app/\(public\)/\[slug\]/components/TenantHeader.tsx`

Expected: coinciden con lo documentado en el spec §2 — no requiere cambios, solo confirma que al setear `logoUrl`/`coverUrl`/`courts.photos` vía las actions nuevas, esas vistas ya los reflejan sin código adicional.

- [ ] **Step 5: Revisar el diff completo antes de terminar**

Run: `git log --oneline main..HEAD`
Expected: 9 commits (Tasks 1-10, Task 11 no commitea nada propio), uno por task, mensajes descriptivos.

No hay Step de commit en esta tarea — es solo verificación del trabajo ya commiteado en las tareas anteriores.

---

## Fuera de alcance de este plan (documentado en el spec, no implementar acá)

- Infra Cloudflare real (crear el bucket, conectar el custom domain, generar el API token S3) — checklist manual de deploy, no código.
- Barrido de objetos huérfanos en R2 (falla DB tras PutObject exitoso) — spec §9, aceptado como riesgo menor.
- e2e con R2 real/mock completo (Task 10 solo verifica que la UI aparece).
- Paso opcional de logo en el onboarding — decisión B del spec: no se agrega.
