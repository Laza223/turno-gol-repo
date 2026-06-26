'use client'

import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTheme } from 'next-themes'

export interface ChartTheme {
  /** stroke de CartesianGrid */
  grid: string
  /** fill de ticks de ejes (XAxis/YAxis) */
  axis: string
  /** Paleta de series (multi-serie). series[0] = acento primario emerald. */
  series: string[]
  /** Color primario (atajo de series[0]) para Bar/Line de una sola serie. */
  primary: string
  /** Props de Tooltip de recharts (contentStyle/itemStyle/labelStyle/cursor). */
  tooltip: {
    contentStyle: CSSProperties
    itemStyle: CSSProperties
    labelStyle: CSSProperties
    cursor: { fill: string } | { stroke: string }
  }
}

const LIGHT: ChartTheme = {
  grid: '#e2e8f0', // slate-200
  axis: '#64748b', // slate-500
  series: ['#059669', '#7c3aed', '#0284c7', '#d97706'], // emerald-600/violet-600/sky-600/amber-600
  primary: '#059669',
  tooltip: {
    contentStyle: {
      fontSize: 12,
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      color: '#0f172a',
      boxShadow: '0 8px 24px -12px rgba(2,6,23,0.18)',
    },
    itemStyle: { color: '#0f172a' },
    labelStyle: { color: '#64748b', fontWeight: 600 },
    cursor: { fill: 'rgba(148,163,184,0.14)' },
  },
}

const DARK: ChartTheme = {
  grid: 'rgba(148,163,184,0.16)', // slate-400 @ baja opacidad
  axis: '#94a3b8', // slate-400
  series: ['#10b981', '#a78bfa', '#38bdf8', '#fbbf24'], // emerald-500/violet-400/sky-400/amber-400
  primary: '#10b981',
  tooltip: {
    contentStyle: {
      fontSize: 12,
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.10)',
      background: '#0d1424', // ~ --card dark
      color: '#f8fafc',
      boxShadow: '0 24px 50px -30px rgba(0,0,0,0.9)',
    },
    itemStyle: { color: '#f8fafc' },
    labelStyle: { color: '#94a3b8', fontWeight: 600 },
    cursor: { fill: 'rgba(255,255,255,0.05)' },
  },
}

/**
 * Devuelve colores de chart (recharts) según el tema activo. recharts toma
 * props inline (hex), que NO responden a `.dark` — por eso se resuelven en JS.
 * Antes de montar/resolver el tema cae a light (evita flash incoherente).
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme()
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme])
}
