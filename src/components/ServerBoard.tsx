/**
 * ServerBoard Component
 *
 * Server-safe departure board that renders without JavaScript.
 * No 'use client' directive - can be rendered on the server.
 */

import { Departure, TransportMode } from '@/lib/providers/types';
import { formatDepartureTime, formatLastUpdated } from '@/lib/utils/time';
import { GearIcon } from './GearIcon';

interface StopConfig {
  stop: { id: string; name: string; modes: string[] };
  enabled: boolean;
}

interface UserSettings {
  tramStop?: StopConfig;
  trainStop?: StopConfig;
  busStop?: StopConfig;
  refreshInterval: number;
  departuresPerMode: number;
  showAbsoluteTime: boolean;
}

interface ModeSection {
  mode: TransportMode;
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
  return mode.charAt(0).toUpperCase() + mode.slice(1);
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

  // Use inline styles for maximum compatibility with old browsers
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    backgroundColor: isDeparting ? '#000' : 'transparent',
    color: isDeparting ? '#fff' : 'inherit',
    opacity: isGone ? 0.3 : 1,
  };

  return (
    <div style={rowStyle}>
      {/* Route number */}
      <span style={{ fontWeight: 'bold', fontSize: '1.25rem', width: '56px', textAlign: 'center', flexShrink: 0 }}>
        {departure.routeName}
      </span>

      {/* Destination */}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {departure.destination}
      </span>

      {/* Platform */}
      {departure.platform && (
        <span style={{ fontSize: '0.75rem', border: '1px solid currentColor', padding: '0 4px', flexShrink: 0 }}>
          P{departure.platform}
        </span>
      )}

      {/* Time */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: '70px' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
          {showAbsoluteTime ? timeInfo.absolute : timeInfo.relative}
        </span>
        {timeInfo.isRealTime && (
          <span style={{ fontSize: '0.75rem' }}>
            {timeInfo.delayMinutes > 2 ? `+${timeInfo.delayMinutes}` : 'live'}
          </span>
        )}
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
  const displayDepartures = section.departures.slice(0, departuresPerMode);

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Mode header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        backgroundColor: '#000',
        color: '#fff'
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {getModeLabel(section.mode)}
        </span>
        <span style={{ fontSize: '0.75rem', opacity: 0.75, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {section.stopName}
        </span>
      </div>

      {/* Departures */}
      {section.isLoading ? (
        <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.875rem' }}>Loading...</div>
      ) : section.error ? (
        <div style={{ padding: '8px', fontSize: '0.875rem', borderLeft: '4px solid #000' }}>
          {section.error}
        </div>
      ) : displayDepartures.length > 0 ? (
        <div style={{ borderLeft: '2px solid #000' }}>
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
        <div style={{ padding: '8px', fontSize: '0.875rem', color: '#666' }}>
          No upcoming departures
        </div>
      )}
    </div>
  );
}

function getEnabledStops(settings: UserSettings) {
  const stops: { mode: TransportMode }[] = [];
  if (settings.tramStop?.enabled) stops.push({ mode: 'tram' });
  if (settings.trainStop?.enabled) stops.push({ mode: 'train' });
  if (settings.busStop?.enabled) stops.push({ mode: 'bus' });
  return stops;
}

export function ServerBoard({
  sections,
  settings,
  fetchedAt,
}: ServerBoardProps) {
  const currentTime = new Date();
  const enabledStops = getEnabledStops(settings);
  const hasConfiguredStops = enabledStops.length > 0;

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
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '2px solid #000'
      }}>
        <div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0 }}>Next Departure</h1>
          <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>
            {formatLastUpdated(fetchedAt)}
          </p>
        </div>
        <a
          href="/settings"
          style={{ padding: '8px', display: 'block' }}
          title="Settings"
          id="settings-link"
        >
          <GearIcon size={20} />
        </a>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '8px 0' }}>
        {!hasConfiguredStops ? (
          /* No stops configured - show welcome */
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '8px' }}>Welcome!</p>
            <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
              Configure your tram, train, or bus stops to see departures.
            </p>
            <a
              href="/settings"
              style={{
                display: 'inline-block',
                backgroundColor: '#000',
                color: '#fff',
                padding: '8px 16px',
                fontWeight: 'bold',
                textDecoration: 'none',
              }}
            >
              Configure Stops
            </a>
          </div>
        ) : (
          /* Show departures for each mode */
          sections
            .filter((s) => enabledStops.some((es) => es.mode === s.mode))
            .map((section) => (
              <ModeSectionComponent
                key={section.mode}
                section={section}
                showAbsoluteTime={settings.showAbsoluteTime}
                departuresPerMode={settings.departuresPerMode}
                now={currentTime}
              />
            ))
        )}
      </main>

      {/* Footer */}
      <footer style={{
        fontSize: '0.75rem',
        textAlign: 'center',
        padding: '4px',
        borderTop: '1px solid #000',
        color: '#666'
      }}>
        Auto-refreshing every {settings.refreshInterval}s
      </footer>
    </div>
  );
}
