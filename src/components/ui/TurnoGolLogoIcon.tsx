import React from 'react'
import { cn } from '@/lib/utils'

interface TurnoGolLogoIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  primaryColor?: string
  accentColor?: string
}

export function TurnoGolLogoIcon({
  className,
  primaryColor = 'currentColor',
  accentColor = '#10b981', // emerald-500
  ...props
}: TurnoGolLogoIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      {...props}
    >
      {/* Outer Circle - Left/Bottom section (slate/white) */}
      <path 
        d="M 50 10 A 40 40 0 1 0 90 50" 
        stroke={primaryColor} 
        strokeWidth="8" 
        strokeLinecap="round" 
      />

      {/* Outer Circle - Top Right section (emerald green swoosh indicating motion/goal) */}
      <path 
        d="M 90 50 A 40 40 0 0 0 50 10" 
        stroke={accentColor} 
        strokeWidth="8" 
        strokeLinecap="round" 
      />

      {/* Inner geometric pentagon (negative space/abstract soccer ball core) */}
      {/* Vertices calculated for a perfect upward-pointing pentagon */}
      <path 
        d="M 50 32 L 67 44 L 61 63 L 39 63 L 33 44 Z" 
        fill={primaryColor} 
      />
    </svg>
  )
}
