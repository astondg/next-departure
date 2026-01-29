/**
 * ServerBoard Component
 *
 * Server-safe departure board that renders without JavaScript.
 * Optimized for e-ink displays - high contrast, large text, minimal clutter.
 */

import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime } from '@/lib/utils/time';
import { GearIcon } from './GearIcon';

interface StopConfig {
  stop: { id: string; name: string; modes: string[] };
  enabled: boolean;
}

interface UserSettings {
  tramStops?: StopConfig[];
  trainStops?: StopConfig[];
  busStops?: StopConfig[];
  refreshInterval: number;
  departuresPerMode: number;
  maxMinutes: number;
  showAbsoluteTime: boolean;
}

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

function getModeLabel(mode: TransportMode): string {
  return mode.toUpperCase();
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: isDeparting ? '#000' : 'transparent',
        color: isDeparting ? '#fff' : 'inherit',
        borderBottom: '1px solid #ccc',
      }}
    >
      {/* Route number - only for non-trains */}
      {!isTrain && (
        <span
          style={{
            fontWeight: 'bold',
            fontSize: '1.75rem',
            minWidth: '64px',
            textAlign: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {departure.routeName}
        </span>
      )}

      {/* Destination - secondary */}
      <span
        style={{
          flex: 1,
          fontSize: '1.125rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {departure.destination}
      </span>

      {/* Platform if available */}
      {departure.platform && (
        <span
          style={{
            fontSize: '1rem',
            border: '2px solid currentColor',
            padding: '2px 8px',
            fontWeight: 'bold',
            flexShrink: 0,
          }}
        >
          P{departure.platform}
        </span>
      )}

      {/* Time - THE MOST IMPORTANT INFO */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            lineHeight: 1,
          }}
        >
          {showAbsoluteTime ? timeInfo.absolute : timeInfo.relative}
        </span>
        {/* Data quality indicator bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
          {timeInfo.isRealTime ? (
            /* Live data: solid bar */
            <span
              style={{
                display: 'inline-block',
                width: '32px',
                height: '2px',
                backgroundColor: isDeparting ? '#fff' : '#000',
                borderRadius: '1px',
              }}
            />
          ) : (
            /* Scheduled only: dotted bar */
            <span
              style={{
                display: 'inline-block',
                width: '32px',
                height: '2px',
                borderRadius: '1px',
                background: isDeparting
                  ? 'repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 3px, transparent 3px, transparent 5px)'
                  : 'repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 3px, transparent 3px, transparent 5px)',
              }}
            />
          )}
          {/* Show delay info if significant (only for real-time) */}
          {timeInfo.isRealTime && (timeInfo.delayMinutes < -2 || timeInfo.delayMinutes > 2) && (
            <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
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
    <div style={{ marginBottom: '8px' }}>
      {/* Mode header - compact */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          backgroundColor: '#000',
          color: '#fff',
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            fontSize: '1rem',
            letterSpacing: '0.1em',
          }}
        >
          {getModeLabel(section.mode)}
        </span>
        <span
          style={{
            fontSize: '1rem',
            opacity: 0.8,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {section.stopName}
        </span>
      </div>

      {/* Departures */}
      {section.isLoading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: '1.25rem' }}>
          Loading...
        </div>
      ) : section.error ? (
        <div
          style={{
            padding: '16px',
            fontSize: '1rem',
            backgroundColor: '#f5f5f5',
          }}
        >
          {section.error}
        </div>
      ) : displayDepartures.length > 0 ? (
        <div>
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
        <div style={{ padding: '24px 16px', fontSize: '1.125rem', color: '#666' }}>
          No upcoming departures
        </div>
      )}
    </div>
  );
}

function getEnabledStopIds(settings: UserSettings): Set<string> {
  const stopIds = new Set<string>();
  for (const config of settings.tramStops || []) {
    if (config.enabled) stopIds.add(config.stop.id);
  }
  for (const config of settings.trainStops || []) {
    if (config.enabled) stopIds.add(config.stop.id);
  }
  for (const config of settings.busStops || []) {
    if (config.enabled) stopIds.add(config.stop.id);
  }
  return stopIds;
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
      style={{
        minHeight: '100vh',
        backgroundColor: '#fff',
        color: '#000',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Main content - no header, just departures */}
      <main style={{ flex: 1, paddingTop: '4px' }}>
        {!hasConfiguredStops ? (
          /* No stops configured - show welcome */
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                marginBottom: '16px',
              }}
            >
              Welcome
            </p>
            <p style={{ fontSize: '1.125rem', marginBottom: '24px' }}>
              Add your tram, train, or bus stops to see departures.
            </p>
            <a
              href="/settings"
              style={{
                display: 'inline-block',
                backgroundColor: '#000',
                color: '#fff',
                padding: '16px 32px',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                textDecoration: 'none',
              }}
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

      {/* Footer - subtle branding + settings */}
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: '1px solid #ddd',
          color: '#999',
          fontSize: '0.875rem',
        }}
      >
        <span>Next Departure</span>
        <a
          href="/settings"
          style={{
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: '#666',
            textDecoration: 'none',
          }}
          title="Settings"
          id="settings-link"
        >
          <GearIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
