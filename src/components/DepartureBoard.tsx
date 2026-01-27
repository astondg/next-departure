'use client';

/**
 * DepartureBoard Component
 *
 * Main display component for departure information.
 * Optimized for e-ink displays with high contrast and minimal color.
 */

import { DeparturesResponse, TransportMode } from '@/lib/providers/types';
import { formatLastUpdated } from '@/lib/utils/time';
import { DepartureRow } from './DepartureRow';

interface DepartureBoardProps {
  /** Departure data */
  data: DeparturesResponse;
  /** Title override (defaults to stop name) */
  title?: string;
  /** Group departures by direction */
  groupByDirection?: boolean;
  /** Filter by transport mode */
  filterMode?: TransportMode;
  /** Show absolute times instead of relative */
  showAbsoluteTime?: boolean;
  /** Current time for relative calculations */
  now?: Date;
  /** Error message to display */
  error?: string;
  /** Whether data is currently loading/refreshing */
  isLoading?: boolean;
}

/**
 * Group departures by direction
 */
function groupDeparturesByDirection(data: DeparturesResponse) {
  const groups: Record<
    string,
    { direction: { id: string; name: string }; departures: typeof data.departures }
  > = {};

  for (const departure of data.departures) {
    const key = departure.direction.id;
    if (!groups[key]) {
      groups[key] = {
        direction: departure.direction,
        departures: [],
      };
    }
    groups[key].departures.push(departure);
  }

  return Object.values(groups);
}

export function DepartureBoard({
  data,
  title,
  groupByDirection = true,
  filterMode,
  showAbsoluteTime = false,
  now = new Date(),
  error,
  isLoading,
}: DepartureBoardProps) {
  // Filter by mode if specified
  const filteredDepartures = filterMode
    ? data.departures.filter((d) => d.mode === filterMode)
    : data.departures;

  const displayData = { ...data, departures: filteredDepartures };

  // Group by direction if enabled
  const groups = groupByDirection
    ? groupDeparturesByDirection(displayData)
    : [{ direction: { id: 'all', name: '' }, departures: displayData.departures }];

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="border-b-4 border-black p-4">
        <h1 className="text-3xl font-bold tracking-tight">
          {title || data.stop.name}
        </h1>
        <div className="flex items-center gap-4 mt-1 text-sm">
          <span className="uppercase tracking-wider">
            Updated {formatLastUpdated(data.fetchedAt)}
          </span>
          {isLoading && (
            <span className="animate-pulse">Refreshing...</span>
          )}
        </div>
      </header>

      {/* Error message */}
      {error && (
        <div className="border-4 border-black m-4 p-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Departures */}
      <main className="p-2">
        {groups.map((group) => (
          <section key={group.direction.id} className="mb-6">
            {/* Direction header (if grouping) */}
            {groupByDirection && group.direction.name && (
              <h2 className="text-xl font-bold uppercase tracking-wider px-2 py-2 bg-black text-white">
                → {group.direction.name}
              </h2>
            )}

            {/* Departure list */}
            {group.departures.length > 0 ? (
              <div>
                {group.departures.map((departure) => (
                  <DepartureRow
                    key={departure.id}
                    departure={departure}
                    showAbsoluteTime={showAbsoluteTime}
                    now={now}
                  />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-lg">
                No upcoming departures
              </p>
            )}
          </section>
        ))}

        {filteredDepartures.length === 0 && !error && (
          <div className="py-16 text-center">
            <p className="text-2xl font-bold">No departures</p>
            <p className="mt-2">Check back later or try a different stop</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t-2 border-black bg-white p-2 text-xs text-center">
        <span>Data from {String(data.meta?.provider || 'PTV')}</span>
        {' • '}
        <span>Refreshes automatically</span>
      </footer>
    </div>
  );
}
