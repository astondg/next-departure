'use client';

/**
 * CombinedBoard Component
 *
 * Shows departures from multiple configured stops in one view.
 * Primary display for the home page.
 */

import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime, formatLastUpdated } from '@/lib/utils/time';
import { UserSettings, getEnabledStops } from '@/lib/utils/storage';
import { GearIcon } from './GearIcon';

interface ModeSection {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
}

interface CombinedBoardProps {
  sections: ModeSection[];
  settings: UserSettings;
  fetchedAt: string;
  onSettingsClick: () => void;
  now?: Date;
}

/**
 * Get icon for transport mode
 */
function getModeIcon(mode: TransportMode): string {
  switch (mode) {
    case 'train':
      return '🚆';
    case 'tram':
      return '🚊';
    case 'bus':
      return '🚌';
    default:
      return '•';
  }
}

/**
 * Get mode label
 */
function getModeLabel(mode: TransportMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/**
 * Single departure row - compact version
 */
function CompactDepartureRow({
  departure,
  showAbsoluteTime,
  now,
}: {
  departure: Departure;
  showAbsoluteTime: boolean;
  now: Date;
}) {
  const timeInfo = formatDepartureTime(
    departure.scheduledTime,
    departure.estimatedTime,
    now
  );

  const isDeparting = timeInfo.relative === 'now';
  const isGone = timeInfo.relative === 'gone';

  return (
    <div
      className={`flex items-center gap-2 py-2 px-2 ${
        isDeparting ? 'bg-black text-white' : ''
      } ${isGone ? 'opacity-30' : ''}`}
    >
      {/* Route number */}
      <span className="font-bold text-xl w-14 text-center flex-shrink-0">
        {departure.routeName}
      </span>

      {/* Destination */}
      <span className="flex-1 truncate text-base">
        {departure.destination}
      </span>

      {/* Platform */}
      {departure.platform && (
        <span className="text-xs border border-current px-1 flex-shrink-0">
          P{departure.platform}
        </span>
      )}

      {/* Time */}
      <div className="flex flex-col items-end flex-shrink-0 min-w-[70px]">
        <span className={`text-xl font-bold ${isDeparting ? 'animate-pulse' : ''}`}>
          {showAbsoluteTime ? timeInfo.absolute : timeInfo.relative}
        </span>
        {timeInfo.isRealTime && (
          <span className="text-xs">
            {timeInfo.delayMinutes > 2 ? `+${timeInfo.delayMinutes}` : 'live'}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Section for one transport mode
 */
function ModeSection({
  section,
  showAbsoluteTime,
  departuresPerMode,
  now,
}: {
  section: ModeSection;
  showAbsoluteTime: boolean;
  departuresPerMode: number;
  now: Date;
}) {
  const displayDepartures = section.departures.slice(0, departuresPerMode);

  return (
    <div className="mb-4">
      {/* Mode header - compact */}
      <div className="flex items-center gap-2 px-2 py-1 bg-black text-white">
        <span className="text-lg">{getModeIcon(section.mode)}</span>
        <span className="font-bold text-sm uppercase tracking-wider">
          {getModeLabel(section.mode)}
        </span>
        <span className="text-xs opacity-75 truncate flex-1">
          {section.stopName}
        </span>
      </div>

      {/* Departures */}
      {section.isLoading ? (
        <div className="py-4 text-center text-sm animate-pulse">
          Loading...
        </div>
      ) : section.error ? (
        <div className="py-2 px-2 text-sm border-l-4 border-black">
          {section.error}
        </div>
      ) : displayDepartures.length > 0 ? (
        <div className="border-l-2 border-black">
          {displayDepartures.map((departure) => (
            <CompactDepartureRow
              key={departure.id}
              departure={departure}
              showAbsoluteTime={showAbsoluteTime}
              now={now}
            />
          ))}
        </div>
      ) : (
        <div className="py-2 px-2 text-sm text-gray-600">
          No upcoming departures
        </div>
      )}
    </div>
  );
}

export function CombinedBoard({
  sections,
  settings,
  fetchedAt,
  onSettingsClick,
  now = new Date(),
}: CombinedBoardProps) {
  const enabledStops = getEnabledStops(settings);
  const hasConfiguredStops = enabledStops.length > 0;

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col">
      {/* Header - minimal */}
      <header className="flex items-center justify-between px-3 py-2 border-b-2 border-black">
        <div>
          <h1 className="text-lg font-bold">Next Departure</h1>
          <p className="text-xs text-gray-600">
            {formatLastUpdated(fetchedAt)}
          </p>
        </div>
        <a
          href="/settings"
          onClick={(e) => {
            // Use modal on JS-enabled browsers, link for fallback
            if (typeof window !== 'undefined' && onSettingsClick) {
              e.preventDefault();
              onSettingsClick();
            }
          }}
          className="p-2 hover:bg-gray-100 rounded"
          title="Settings"
        >
          <GearIcon size={20} />
        </a>
      </header>

      {/* Main content */}
      <main className="flex-1 py-2">
        {!hasConfiguredStops ? (
          /* No stops configured - show welcome */
          <div className="p-4 text-center">
            <p className="text-lg font-bold mb-2">Welcome!</p>
            <p className="text-sm mb-4">
              Tap the gear icon to configure your tram, train, or bus stops.
            </p>
            <button
              onClick={onSettingsClick}
              className="bg-black text-white px-4 py-2 font-bold"
            >
              Configure Stops
            </button>
          </div>
        ) : (
          /* Show departures for each stop */
          sections
            .filter((s) =>
              enabledStops.some((es) => es.stop.id === s.stopId)
            )
            .map((section) => (
              <ModeSection
                key={`${section.mode}-${section.stopId}`}
                section={section}
                showAbsoluteTime={settings.showAbsoluteTime}
                departuresPerMode={settings.departuresPerMode}
                now={now}
              />
            ))
        )}
      </main>

      {/* Footer - minimal */}
      <footer className="text-xs text-center py-1 border-t border-black text-gray-600">
        Auto-refreshing every {settings.refreshInterval}s
      </footer>
    </div>
  );
}
