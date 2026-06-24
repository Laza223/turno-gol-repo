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
      {/* Inner field lines drawn first so outer arcs overlap them cleanly */}
      {/* Midfield Line */}
      <line x1="14" y1="50" x2="86" y2="50" stroke={primaryColor} strokeWidth="5.5" strokeLinecap="round" />

      {/* Center Circle */}
      <circle cx="50" cy="50" r="14" stroke={primaryColor} strokeWidth="5.5" />

      {/* Top Penalty Box */}
      <path d="M 32 10 L 32 25 L 68 25 L 68 10" stroke={primaryColor} strokeWidth="5.5" strokeLinejoin="round" />

      {/* Bottom Penalty Box */}
      <path d="M 32 90 L 32 75 L 68 75 L 68 90" stroke={primaryColor} strokeWidth="5.5" strokeLinejoin="round" />

      {/* Left Outer Arc (Slate/Black) */}
      <path d="M 50 10 A 40 40 0 0 0 50 90" stroke={primaryColor} strokeWidth="6.5" strokeLinecap="round" />

      {/* Right Outer Arc (Green) with gap for arrowhead */}
      <path d="M 50 90 A 40 40 0 0 0 85 24" stroke={accentColor} strokeWidth="6.5" strokeLinecap="round" />
      
      {/* Arrowhead at the end of the right arc */}
      {/* Positioned at (85, 24) pointing roughly up-left */}
      <path d="M 87 35 L 85 24 L 74 26" stroke={accentColor} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Clock Hands (Green) */}
      <path d="M 50 50 L 50 36" stroke={accentColor} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M 50 50 L 64 50" stroke={accentColor} strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  )
}
