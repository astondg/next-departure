'use client';

/**
 * CombinedBoard Component
 *
 * Shows departures from multiple configured stops in one view.
 * Primary display for the home page.
 */

import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime } from '@/lib/utils/time';
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
  isLoadingNearby?: boolean;
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
  isLoadingNearby = false,
}: CombinedBoardProps) {
  const enabledStops = getEnabledStops(settings);
  const hasConfiguredStops = enabledStops.length > 0;
  const isNearbyMode = settings.nearbyMode;

  // Determine what to show
  const showWelcome = !isNearbyMode && !hasConfiguredStops;
  const showNearbyLoading = isNearbyMode && isLoadingNearby && sections.length === 0;
  const showNoNearbyStops = isNearbyMode && !isLoadingNearby && sections.length === 0;
  const showSections = sections.length > 0;

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col">
      {/* Main content - no header, just departures */}
      <main className="flex-1 pt-1">
        {showWelcome && (
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
        )}

        {showNearbyLoading && (
          /* Nearby mode - detecting location */
          <div className="p-4 text-center">
            <p className="text-lg font-bold mb-2">Detecting location...</p>
            <p className="text-sm text-gray-600">
              Finding nearby stops
            </p>
          </div>
        )}

        {showNoNearbyStops && (
          /* Nearby mode - no stops found */
          <div className="p-4 text-center">
            <p className="text-lg font-bold mb-2">No nearby stops</p>
            <p className="text-sm mb-4 text-gray-600">
              Could not find transit stops near your location.
            </p>
            <button
              onClick={onSettingsClick}
              className="bg-black text-white px-4 py-2 font-bold"
            >
              Switch to Home Mode
            </button>
          </div>
        )}

        {showSections && (
          /* Show departures for each stop */
          <>
            {isNearbyMode ? (
              // In nearby mode, show all sections directly
              sections.map((section) => (
                <ModeSection
                  key={`${section.mode}-${section.stopId}`}
                  section={section}
                  showAbsoluteTime={settings.showAbsoluteTime}
                  departuresPerMode={settings.departuresPerMode}
                  now={now}
                />
              ))
            ) : (
              // In home mode, filter to enabled stops
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
          </>
        )}
      </main>

      {/* Footer - subtle branding + settings */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-gray-300 text-gray-400 text-sm">
        <span>Next Departure</span>
        <a
          href="/settings"
          onClick={(e) => {
            // Use modal on JS-enabled browsers, link for fallback
            if (typeof window !== 'undefined' && onSettingsClick) {
              e.preventDefault();
              onSettingsClick();
            }
          }}
          className="p-2 flex items-center text-gray-500 hover:text-gray-700"
          title="Settings"
        >
          <GearIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
