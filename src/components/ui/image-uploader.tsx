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
              className="absolute right-1 top-1 inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
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
                    className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
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
                    className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950/90 disabled:opacity-50"
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
