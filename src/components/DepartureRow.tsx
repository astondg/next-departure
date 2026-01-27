'use client';

/**
 * DepartureRow Component
 *
 * Displays a single departure in an e-ink friendly format.
 * Optimized for high contrast and quick scanning.
 */

import { Departure } from '@/lib/providers/types';
import { formatDepartureTime } from '@/lib/utils/time';

interface DepartureRowProps {
  departure: Departure;
  /** Show absolute time instead of relative */
  showAbsoluteTime?: boolean;
  /** Current time for relative calculations */
  now?: Date;
}

/**
 * Get the mode icon/emoji for display
 * Using simple text for e-ink compatibility
 */
function getModeIndicator(mode: Departure['mode']): string {
  switch (mode) {
    case 'train':
      return '🚆';
    case 'tram':
      return '🚊';
    case 'bus':
      return '🚌';
    case 'ferry':
      return '⛴';
    case 'metro':
      return '🚇';
    case 'light_rail':
      return '🚈';
    case 'coach':
      return '🚐';
    default:
      return '•';
  }
}

export function DepartureRow({
  departure,
  showAbsoluteTime = false,
  now = new Date(),
}: DepartureRowProps) {
  const timeInfo = formatDepartureTime(
    departure.scheduledTime,
    departure.estimatedTime,
    now
  );

  const isCancelled = departure.status?.cancelled;
  const isDelayed = timeInfo.delayMinutes > 2;
  const isDeparting = timeInfo.relative === 'now';
  const isGone = timeInfo.relative === 'gone';

  // Status classes for e-ink (using borders and weight, not color)
  const rowClasses = [
    'flex items-center gap-3 py-3 px-2 border-b-2 border-black',
    isCancelled && 'opacity-50 line-through',
    isDeparting && 'bg-black text-white',
    isGone && 'opacity-30',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClasses}>
      {/* Mode indicator */}
      <span className="text-xl w-8 text-center flex-shrink-0" aria-hidden="true">
        {getModeIndicator(departure.mode)}
      </span>

      {/* Route number */}
      <span className="font-bold text-2xl w-16 text-center flex-shrink-0">
        {departure.routeName}
      </span>

      {/* Destination */}
      <span className="flex-1 text-lg truncate font-medium">
        {departure.destination}
      </span>

      {/* Platform (if available) */}
      {departure.platform && (
        <span className="text-sm border border-black px-2 py-0.5 flex-shrink-0">
          P{departure.platform}
        </span>
      )}

      {/* Time */}
      <div className="flex flex-col items-end flex-shrink-0 min-w-[80px]">
        <span
          className={`text-2xl font-bold ${isDeparting ? 'animate-pulse' : ''}`}
        >
          {showAbsoluteTime ? timeInfo.absolute : timeInfo.relative}
        </span>

        {/* Real-time indicator */}
        {timeInfo.isRealTime && !isCancelled && (
          <span className="text-xs uppercase tracking-wider">
            {isDelayed ? `+${timeInfo.delayMinutes}` : 'live'}
          </span>
        )}
      </div>
    </div>
  );
}
