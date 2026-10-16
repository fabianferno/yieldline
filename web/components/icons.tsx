// Thin-stroke icons matching the Prism UI line set (1.6px stroke, rounded joins).
type P = { className?: string; size?: number };
const S = ({ size = 20, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

export const IHome = (p: P) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9v11h5v-6h4v6h5V9" />
  </S>
);
export const IChart = (p: P) => (
  <S {...p}>
    <path d="M4 20V10M9.5 20V5M15 20v-8M20.5 20v-5" />
  </S>
);
export const ICube = (p: P) => (
  <S {...p}>
    <path d="M12 2.8 20 7.2v9.6L12 21.2 4 16.8V7.2z" />
    <path d="M4 7.2 12 11.6l8-4.4M12 11.6v9.6" />
  </S>
);
export const IBolt = (p: P) => (
  <S {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </S>
);
export const IUsers = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    <path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.7.7 2.8 2.4 3 5.2" />
  </S>
);
export const ILayers = (p: P) => (
  <S {...p}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" />
  </S>
);
export const IGear = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </S>
);
export const ISearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </S>
);
export const IArrow = (p: P) => (
  <S {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </S>
);
export const IUp = (p: P) => (
  <S {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </S>
);
export const ICheck = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.7 2.7L16.5 9.5" />
  </S>
);
export const IWarn = (p: P) => (
  <S {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </S>
);
export const IX = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </S>
);
export const IInfo = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5v.01" />
  </S>
);
export const IGrid = (p: P) => (
  <S {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
  </S>
);
export const IExternal = (p: P) => (
  <S {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </S>
);

/** The Prism glass cube, as the Horos mark. */
export function PrismCube({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="pc-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9f7fa" stopOpacity=".9" />
          <stop offset="1" stopColor="#36d9e8" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="pc-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#36d9e8" stopOpacity=".85" />
          <stop offset="1" stopColor="#0b1e2c" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="pc-right" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2838" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffb65c" stopOpacity=".95" />
        </linearGradient>
        <filter id="pc-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#pc-glow)" strokeLinejoin="round">
        <path d="M32 6 54 18 32 30 10 18z" fill="url(#pc-top)" stroke="#d9f7fa" strokeWidth="1.2" />
        <path d="M10 18 32 30v28L10 46z" fill="url(#pc-left)" stroke="#36d9e8" strokeWidth="1.2" />
        <path d="M54 18 32 30v28l22-12z" fill="url(#pc-right)" stroke="#ffb65c" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
