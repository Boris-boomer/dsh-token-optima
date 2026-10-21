import type { FC, CSSProperties, SVGProps } from 'react'

interface IconProps {
  size?: number
  strokeWidth?: number
  style?: CSSProperties
  className?: string
}

function svgProps(p: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: p.size ?? 16,
    height: p.size ?? 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: p.strokeWidth ?? 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: p.style,
    className: p.className,
  }
}

/** 同心环 logo：外环 + 中环 + 中心点，语义是「缓存命中」 */
export const LogoIcon: FC<IconProps> = (p) => {
  const size = p.size ?? 20
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={p.style}
      className={p.className}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.35"
      />
      <circle
        cx="12"
        cy="12"
        r="6"
        stroke="currentColor"
        strokeWidth="1.9"
        opacity="0.9"
      />
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
    </svg>
  )
}

export const CloseIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M6 6l12 12M6 18L18 6" />
  </svg>
)

export const DownloadIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
  </svg>
)

export const ChevronRightIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const SparkIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </svg>
)

export const WarningIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M12 3L2 20h20L12 3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
)

export const CheckIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M4 12l5 5L20 6" />
  </svg>
)

export const ZapIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)} fill="none" stroke="currentColor" strokeWidth={p.strokeWidth ?? 1.75}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" stroke="none" />
  </svg>
)

export const ShrinkIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M4 8h6V2M20 16h-6v6M4 16h6v6M20 8h-6V2" />
  </svg>
)

export const ReplaceIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <path d="M3 12a9 9 0 0116-6.7M21 12a9 9 0 01-16 6.7M19 3v4h-4M5 21v-4h4" />
  </svg>
)

export const ClockIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const WalletIcon: FC<IconProps> = (p) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <path d="M3 10h18M16 15h2" />
  </svg>
)