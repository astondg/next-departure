'use client';

/**
 * StopSearch Component
 *
 * Search for stops and generate board URLs.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stop, TransportMode } from '@/lib/providers/types';
import Link from 'next/link';

const TRANSPORT_MODES: { value: TransportMode | ''; label: string }[] = [
  { value: '', label: 'All modes' },
  { value: 'train', label: '🚆 Train' },
  { value: 'tram', label: '🚊 Tram' },
  { value: 'bus', label: '🚌 Bus' },
];

export function StopSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<TransportMode | ''>('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);

  // Debounce search
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchStops = useCallback(async (searchQuery: string, searchMode: TransportMode | '') => {
    if (searchQuery.length < 2) {
      setStops([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        provider: 'ptv',
        query: searchQuery,
      });
      if (searchMode) {
        params.set('mode', searchMode);
      }

      const response = await fetch(`/api/stops?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }

      const data = await response.json();
      setStops(data.stops.slice(0, 10)); // Limit to 10 results
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setStops([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchStops(query, mode);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, mode, searchStops]);

  // Generate board URL for a stop
  const getBoardUrl = (stop: Stop, selectedMode?: TransportMode) => {
    const modeParam = selectedMode || (stop.modes.length === 1 ? stop.modes[0] : '');
    let url = `/board/ptv/${stop.id}`;
    if (modeParam) {
      url += `?mode=${modeParam}`;
    }
    return url;
  };

  return (
    <div className="space-y-4">
      {/* Search inputs */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedStop(null);
          }}
          placeholder="Search for a stop (e.g. 'Flinders' or 'Stop 1')"
          className="flex-1 border-2 border-black p-3 text-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as TransportMode | '')}
          className="border-2 border-black p-3 bg-white focus:outline-none focus:ring-2 focus:ring-black"
        >
          {TRANSPORT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <p className="text-center py-4 animate-pulse">Searching...</p>
      )}

      {/* Error state */}
      {error && (
        <div className="border-2 border-black p-4 bg-gray-100">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <p className="mt-2 text-sm">
            Make sure the PTV API is configured. Check the environment variables.
          </p>
        </div>
      )}

      {/* Search results */}
      {stops.length > 0 && !selectedStop && (
        <div className="border-2 border-black">
          {stops.map((stop) => (
            <button
              key={stop.id}
              onClick={() => setSelectedStop(stop)}
              className="w-full p-3 text-left border-b border-black last:border-b-0 hover:bg-gray-100 flex items-center gap-3"
            >
              <span className="text-xl">
                {stop.modes.includes('train')
                  ? '🚆'
                  : stop.modes.includes('tram')
                  ? '🚊'
                  : '🚌'}
              </span>
              <span className="flex-1">
                <span className="font-bold">{stop.name}</span>
                <span className="text-sm text-gray-600 ml-2">
                  ID: {stop.id}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Selected stop */}
      {selectedStop && (
        <div className="border-4 border-black p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">
              {selectedStop.modes.includes('train')
                ? '🚆'
                : selectedStop.modes.includes('tram')
                ? '🚊'
                : '🚌'}
            </span>
            <div>
              <h3 className="text-xl font-bold">{selectedStop.name}</h3>
              <p className="text-sm text-gray-600">Stop ID: {selectedStop.id}</p>
            </div>
          </div>

          {/* Board URL */}
          <div className="mb-4">
            <label className="font-bold block mb-2">Your Board URL:</label>
            <div className="bg-gray-100 p-3 font-mono text-sm break-all border border-black">
              {typeof window !== 'undefined'
                ? `${window.location.origin}${getBoardUrl(selectedStop, mode || undefined)}`
                : getBoardUrl(selectedStop, mode || undefined)}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Link
              href={getBoardUrl(selectedStop, mode || undefined)}
              className="flex-1 bg-black text-white p-3 text-center font-bold hover:bg-gray-800"
            >
              Open Board
            </Link>
            <button
              onClick={() => {
                const url = `${window.location.origin}${getBoardUrl(selectedStop, mode || undefined)}`;
                navigator.clipboard.writeText(url);
              }}
              className="px-4 border-2 border-black font-bold hover:bg-gray-100"
            >
              Copy URL
            </button>
            <button
              onClick={() => setSelectedStop(null)}
              className="px-4 border-2 border-black font-bold hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* No results */}
      {query.length >= 2 && !isLoading && stops.length === 0 && !error && (
        <p className="text-center py-4">No stops found for "{query}"</p>
      )}
    </div>
  );
}
