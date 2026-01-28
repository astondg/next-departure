import { TransportMode } from '@/lib/providers/types';

interface TransportIconProps {
  mode: TransportMode;
  size?: number;
  className?: string;
}

export function TransportIcon({ mode, size = 20, className = '' }: TransportIconProps) {
  const strokeWidth = 2;

  const icons: Record<TransportMode, React.ReactNode> = {
    tram: (
      // Tram: simple rectangular car with pantograph
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="4" y="8" width="16" height="10" rx="2" />
        <line x1="8" y1="18" x2="8" y2="21" />
        <line x1="16" y1="18" x2="16" y2="21" />
        <line x1="6" y1="21" x2="10" y2="21" />
        <line x1="14" y1="21" x2="18" y2="21" />
        <line x1="12" y1="3" x2="12" y2="8" />
        <line x1="9" y1="3" x2="15" y2="3" />
        <circle cx="8" cy="13" r="1" fill="currentColor" />
        <circle cx="16" cy="13" r="1" fill="currentColor" />
      </svg>
    ),
    train: (
      // Train: sleek front-facing locomotive
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="4" y="4" width="16" height="14" rx="2" />
        <line x1="4" y1="10" x2="20" y2="10" />
        <line x1="8" y1="18" x2="8" y2="21" />
        <line x1="16" y1="18" x2="16" y2="21" />
        <line x1="5" y1="21" x2="19" y2="21" />
        <circle cx="8" cy="14" r="1" fill="currentColor" />
        <circle cx="16" cy="14" r="1" fill="currentColor" />
        <rect x="9" y="5" width="6" height="4" />
      </svg>
    ),
    bus: (
      // Bus: simple rectangular bus shape
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <line x1="3" y1="11" x2="21" y2="11" />
        <rect x="5" y="7" width="4" height="3" />
        <rect x="11" y="7" width="4" height="3" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
        <line x1="9" y1="18" x2="15" y2="18" />
      </svg>
    ),
    metro: (
      // Metro: rounded tunnel train
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="4" y="6" width="16" height="12" rx="4" />
        <line x1="4" y1="11" x2="20" y2="11" />
        <line x1="8" y1="18" x2="8" y2="21" />
        <line x1="16" y1="18" x2="16" y2="21" />
        <line x1="5" y1="21" x2="19" y2="21" />
        <circle cx="8" cy="14" r="1" fill="currentColor" />
        <circle cx="16" cy="14" r="1" fill="currentColor" />
        <rect x="9" y="7" width="6" height="3" />
      </svg>
    ),
    ferry: (
      // Ferry: simple boat shape
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M4 18 L12 21 L20 18" />
        <path d="M4 18 C4 14 6 12 12 12 C18 12 20 14 20 18" />
        <line x1="12" y1="12" x2="12" y2="6" />
        <path d="M12 6 L18 10 L12 10" />
      </svg>
    ),
    light_rail: (
      // Light rail: similar to tram
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="4" y="8" width="16" height="10" rx="2" />
        <line x1="8" y1="18" x2="8" y2="21" />
        <line x1="16" y1="18" x2="16" y2="21" />
        <line x1="6" y1="21" x2="10" y2="21" />
        <line x1="14" y1="21" x2="18" y2="21" />
        <line x1="12" y1="3" x2="12" y2="8" />
        <line x1="9" y1="3" x2="15" y2="3" />
        <circle cx="8" cy="13" r="1" fill="currentColor" />
        <circle cx="16" cy="13" r="1" fill="currentColor" />
      </svg>
    ),
    coach: (
      // Coach: longer bus shape
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="2" y="7" width="20" height="10" rx="2" />
        <line x1="2" y1="11" x2="22" y2="11" />
        <rect x="4" y="8" width="3" height="2" />
        <rect x="9" y="8" width="3" height="2" />
        <rect x="14" y="8" width="3" height="2" />
        <circle cx="6" cy="17" r="2" />
        <circle cx="18" cy="17" r="2" />
      </svg>
    ),
  };

  return icons[mode] || icons.bus;
}

export function getModeLabel(mode: TransportMode): string {
  const labels: Record<TransportMode, string> = {
    tram: 'Tram',
    train: 'Train',
    bus: 'Bus',
    metro: 'Metro',
    ferry: 'Ferry',
    light_rail: 'Light Rail',
    coach: 'Coach',
  };
  return labels[mode] || mode;
}
