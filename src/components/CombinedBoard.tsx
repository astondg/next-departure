'use client';

/**
 * CombinedBoard Component
 *
 * Shows departures from multiple configured stops in one view.
 * Primary display for the home page.
 */

import { useState, useEffect, useRef } from 'react';
import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime } from '@/lib/utils/time';
import { UserSettings, getEnabledStops } from '@/lib/utils/storage';
import { GearIcon } from './GearIcon';
import { TransportIcon, getModeLabel } from './TransportIcon';

/** Duration of fade-out animation in ms */
const FADE_OUT_DURATION = 500;

interface ModeSection {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
  /** If true, group departures by direction and show N per direction */
  groupByDirection?: boolean;
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
 * Single departure row - compact version
 */
function CompactDepartureRow({
  departure,
  showAbsoluteTime,
  now,
  isFadingOut = false,
}: {
  departure: Departure;
  showAbsoluteTime: boolean;
  now: Date;
  isFadingOut?: boolean;
}) {
  const timeInfo = formatDepartureTime(
    departure.scheduledTime,
    departure.estimatedTime,
    now
  );

  const isDeparting = timeInfo.relative === 'now';

  // For trains, routeName is often the full line name (e.g., "Hurstbridge")
  // which is redundant with the direction header - don't show it
  const isTrain = departure.mode === 'train';

  return (
    <div
      className={`flex items-center gap-2 py-2 px-2 ${
        isDeparting ? 'bg-black text-white' : ''
      } ${isFadingOut ? 'departure-fading-out' : ''}`}
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
            {timeInfo.delayMinutes < -2
              ? `${timeInfo.delayMinutes}` /* Early arrival: -3, -5, etc */
              : timeInfo.delayMinutes > 2
              ? `+${timeInfo.delayMinutes}` /* Late: +3, +5, etc */
              : 'live' /* On time or minor variance */}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Group departures by direction
 */
interface DirectionGroup {
  directionId: string;
  directionName: string;
  departures: Departure[];
}

function groupDeparturesByDirection(
  departures: Departure[],
  maxPerDirection: number
): DirectionGroup[] {
  const groups = new Map<string, DirectionGroup>();

  for (const dep of departures) {
    const dirId = dep.direction?.id || 'unknown';
    const dirName = dep.direction?.name || 'Unknown';

    if (!groups.has(dirId)) {
      groups.set(dirId, {
        directionId: dirId,
        directionName: dirName,
        departures: [],
      });
    }

    const group = groups.get(dirId)!;
    if (group.departures.length < maxPerDirection) {
      group.departures.push(dep);
    }
  }

  // Sort groups by the earliest departure time
  return Array.from(groups.values()).sort((a, b) => {
    const aTime = a.departures[0]?.estimatedTime || a.departures[0]?.scheduledTime || '';
    const bTime = b.departures[0]?.estimatedTime || b.departures[0]?.scheduledTime || '';
    return aTime.localeCompare(bTime);
  });
}

/**
 * Section for one transport mode
 * Tracks departures that are fading out for smooth exit animations
 */
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
  // Track IDs of departures that are currently fading out
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());
  const previousDepartureIdsRef = useRef<Set<string>>(new Set());

  // Categorize departures
  const upcomingDepartures: Departure[] = [];
  const goneDepartures: Departure[] = [];

  for (const d of section.departures) {
    const timeInfo = formatDepartureTime(d.scheduledTime, d.estimatedTime, now);
    if (timeInfo.relative === 'gone') {
      goneDepartures.push(d);
    } else {
      upcomingDepartures.push(d);
    }
  }

  // Detect newly "gone" departures and start their fade-out animation
  useEffect(() => {
    const currentUpcomingIds = new Set(upcomingDepartures.map(d => d.id));
    const previousIds = previousDepartureIdsRef.current;

    // Find IDs that were visible before but are now gone
    const newlyGoneIds: string[] = [];
    for (const id of previousIds) {
      if (!currentUpcomingIds.has(id)) {
        // This departure was visible but is now gone
        const isStillInData = goneDepartures.some(d => d.id === id);
        if (isStillInData && !fadingOutIds.has(id)) {
          newlyGoneIds.push(id);
        }
      }
    }

    if (newlyGoneIds.length > 0) {
      // Start fade-out for newly gone departures
      setFadingOutIds(prev => {
        const next = new Set(prev);
        for (const id of newlyGoneIds) {
          next.add(id);
        }
        return next;
      });

      // Remove from fading set after animation completes
      setTimeout(() => {
        setFadingOutIds(prev => {
          const next = new Set(prev);
          for (const id of newlyGoneIds) {
            next.delete(id);
          }
          return next;
        });
      }, FADE_OUT_DURATION);
    }

    // Update ref for next comparison
    previousDepartureIdsRef.current = currentUpcomingIds;
  }, [upcomingDepartures, goneDepartures, fadingOutIds]);

  // Build the list of departures to display (upcoming + currently fading)
  const fadingDepartures = goneDepartures.filter(d => fadingOutIds.has(d.id));
  const displayDepartures = [...upcomingDepartures, ...fadingDepartures];

  // Group by direction if flag is set, otherwise just take top N
  const shouldGroup = section.groupByDirection && displayDepartures.length > 0;

  const directionGroups = shouldGroup
    ? groupDeparturesByDirection(displayDepartures, departuresPerMode + fadingDepartures.length)
    : null;

  const flatDepartures = shouldGroup
    ? null
    : displayDepartures.slice(0, departuresPerMode + fadingDepartures.length);

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
        <div className="py-4 text-center text-sm animate-pulse">
          Loading...
        </div>
      ) : section.error ? (
        <div className="py-2 px-2 text-sm border-l-4 border-black">
          {section.error}
        </div>
      ) : shouldGroup && directionGroups ? (
        /* Grouped by direction */
        <div className="border-l-2 border-black">
          {directionGroups.map((group, idx) => (
            <div key={group.directionId}>
              {/* Direction header */}
              <div className={`px-2 py-1 bg-gray-100 text-xs font-medium uppercase tracking-wider text-gray-600 ${idx > 0 ? 'border-t border-gray-300' : ''}`}>
                {group.directionName}
              </div>
              {/* Departures for this direction */}
              {group.departures.map((departure) => (
                <CompactDepartureRow
                  key={departure.id}
                  departure={departure}
                  showAbsoluteTime={showAbsoluteTime}
                  now={now}
                  isFadingOut={fadingOutIds.has(departure.id)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : flatDepartures && flatDepartures.length > 0 ? (
        /* Flat list (single direction or filtered) */
        <div className="border-l-2 border-black">
          {flatDepartures.map((departure) => (
            <CompactDepartureRow
              key={departure.id}
              departure={departure}
              showAbsoluteTime={showAbsoluteTime}
              now={now}
              isFadingOut={fadingOutIds.has(departure.id)}
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
                <ModeSectionComponent
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
                  <ModeSectionComponent
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
