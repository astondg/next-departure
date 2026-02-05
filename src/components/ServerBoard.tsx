/**
 * ServerBoard Component
 *
 * Server-safe departure board that renders without JavaScript.
 * Optimized for e-ink displays - high contrast, large text, minimal clutter.
 * Uses Tailwind CSS classes matching CombinedBoard for consistent styling.
 */

import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime } from '@/lib/utils/time';
import { GearIcon } from './GearIcon';
import { TransportIcon, getModeLabel } from './TransportIcon';
import { UserSettings, getEnabledStops } from '@/lib/utils/storage';
import { PROVIDER_INFO } from '@/lib/providers';

interface ModeSection {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
}

interface ServerBoardProps {
  sections: ModeSection[];
  settings: UserSettings;
  fetchedAt: string;
}

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

  // Don't show departed services
  if (isGone) return null;

  // For trains, routeName is often the full line name (e.g., "Hurstbridge")
  // which is redundant with the direction header - don't show it
  const isTrain = departure.mode === 'train';
  const isExpress = departure.expressStopCount && departure.expressStopCount > 0;

  return (
    <div
      className={`flex items-center gap-2 py-2 px-2 ${
        isDeparting ? 'bg-black text-white border-t-2 border-white' : ''
      }`}
    >
      {/* Route number - only for non-trains */}
      {!isTrain && (
        <span className="font-bold text-xl w-14 text-center flex-shrink-0 truncate">
          {departure.routeName}
        </span>
      )}

      {/* Destination */}
      <span className="flex-1 truncate text-base min-w-0">
        {departure.destination}
      </span>

      {/* Express indicator */}
      {isExpress && (
        <span className={`text-sm font-bold border ${isDeparting ? 'border-white' : 'border-current'} flex-shrink-0 min-w-[28px] text-center py-0.5`}>
          E
        </span>
      )}

      {/* Platform if available */}
      {departure.platform && (
        <span className={`text-sm font-bold border ${isDeparting ? 'border-white' : 'border-current'} flex-shrink-0 min-w-[28px] text-center py-0.5`}>
          P{departure.platform}
        </span>
      )}

      {/* Time - THE MOST IMPORTANT INFO */}
      <div className="flex flex-col items-end flex-shrink-0 min-w-[70px]">
        <span className="text-xl font-bold">
          {showAbsoluteTime ? timeInfo.absolute : timeInfo.relative}
        </span>
        {/* Data quality indicator bar */}
        <div className="flex items-center gap-1 mt-0.5">
          {timeInfo.isRealTime ? (
            /* Live data: solid bar */
            <span className="h-0.5 w-8 bg-current rounded-full" />
          ) : (
            /* Scheduled only: dotted dim bar */
            <span className="h-0.5 w-8 rounded-full scheduled-bar" />
          )}
          {/* Show delay info if significant (only for real-time) */}
          {timeInfo.isRealTime && (timeInfo.delayMinutes < -2 || timeInfo.delayMinutes > 2) && (
            <span className="text-xs font-medium">
              {timeInfo.delayMinutes < 0 ? timeInfo.delayMinutes : `+${timeInfo.delayMinutes}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeSectionComponent({
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
  // Filter out departed services before slicing
  const upcomingDepartures = section.departures.filter((d) => {
    const timeInfo = formatDepartureTime(d.scheduledTime, d.estimatedTime, now);
    return timeInfo.relative !== 'gone';
  });
  const displayDepartures = upcomingDepartures.slice(0, departuresPerMode);

  return (
    <div className="mb-4">
      {/* Mode header - compact */}
      <div className="flex items-center gap-2 px-2 py-1 bg-black text-white">
        <TransportIcon mode={section.mode} size={18} className="text-white" />
        <span className="font-bold text-sm uppercase tracking-wider">
          {getModeLabel(section.mode)}
        </span>
        <span className="text-xs opacity-75 truncate flex-1">
          {section.stopName}
        </span>
      </div>

      {/* Departures */}
      {section.isLoading ? (
        <div className="py-4 text-center text-sm">
          Loading...
        </div>
      ) : section.error ? (
        <div className="py-2 px-2 text-sm border-l-4 border-black">
          {section.error}
        </div>
      ) : displayDepartures.length > 0 ? (
        <div className="border-l-2 border-black">
          {displayDepartures.map((departure, index) => (
            <CompactDepartureRow
              key={departure.id || index}
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

function getEnabledStopIds(settings: UserSettings): Set<string> {
  const enabledStops = getEnabledStops(settings);
  return new Set(enabledStops.map(s => s.stop.id));
}

export function ServerBoard({
  sections,
  settings,
}: ServerBoardProps) {
  const currentTime = new Date();
  const enabledStopIds = getEnabledStopIds(settings);
  const hasConfiguredStops = enabledStopIds.size > 0;

  return (
    <div
      id="departure-board"
      className="min-h-screen bg-white text-black font-sans flex flex-col"
    >
      {/* Main content - no header, just departures */}
      <main className="flex-1 pt-1">
        {!hasConfiguredStops ? (
          /* No stops configured - show welcome */
          <div className="p-4 text-center">
            <p className="text-lg font-bold mb-2">
              Welcome
            </p>
            <p className="text-sm mb-4">
              Add your tram, train, or bus stops to see departures.
            </p>
            <a
              href="/settings"
              className="inline-block bg-black text-white px-8 py-4 text-lg font-bold no-underline"
            >
              Add Stops
            </a>
          </div>
        ) : (
          /* Show departures for each stop */
          sections
            .filter((s) => enabledStopIds.has(s.stopId))
            .map((section) => (
              <ModeSectionComponent
                key={`${section.mode}-${section.stopId}`}
                section={section}
                showAbsoluteTime={settings.showAbsoluteTime}
                departuresPerMode={settings.departuresPerMode}
                now={currentTime}
              />
            ))
        )}
      </main>

      {/* Footer - provider indicator + settings */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-gray-300 text-gray-400 text-sm">
        <span
          id="provider-indicator"
          data-provider={settings.activeProvider}
          className="flex items-center gap-2"
        >
          <span className="font-medium">
            {PROVIDER_INFO[settings.activeProvider]?.region || 'Unknown'}
          </span>
        </span>
        <a
          href="/settings"
          className="p-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 no-underline"
          title="Settings"
          id="settings-link"
        >
          <GearIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
