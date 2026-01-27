'use client';

/**
 * SettingsForm Component
 *
 * Client component for settings that progressively enhances.
 * Works with basic form submissions for legacy browsers.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TransportMode } from '@/lib/providers/types';
import {
  UserSettings,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from '@/lib/utils/storage';

const MODES: { mode: TransportMode; label: string; icon: string }[] = [
  { mode: 'tram', label: 'Tram', icon: '🚊' },
  { mode: 'train', label: 'Train', icon: '🚆' },
  { mode: 'bus', label: 'Bus', icon: '🚌' },
];

export function SettingsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Track hydration
  const [isHydrated, setIsHydrated] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Search state for each mode
  const [searchMode, setSearchMode] = useState<TransportMode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load settings after hydration
  useEffect(() => {
    setSettings(loadSettings());
    setIsHydrated(true);
  }, []);

  // Handle URL-based stop selection (for no-JS form submission)
  useEffect(() => {
    if (!isHydrated) return;

    const selectMode = searchParams.get('select') as TransportMode | null;
    const stopId = searchParams.get('stopId');
    const stopName = searchParams.get('stopName');

    if (selectMode && stopId && stopName) {
      const newSettings = { ...settings };
      const stopConfig = {
        stop: { id: stopId, name: stopName, modes: [selectMode] },
        enabled: true,
      };

      if (selectMode === 'tram') newSettings.tramStop = stopConfig;
      if (selectMode === 'train') newSettings.trainStop = stopConfig;
      if (selectMode === 'bus') newSettings.busStop = stopConfig;

      saveSettings(newSettings);
      setSettings(newSettings);

      // Clear URL params
      router.replace('/settings');
    }
  }, [isHydrated, searchParams, settings, router]);

  // Save settings when changed
  const updateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    if (isHydrated) {
      saveSettings(newSettings);
    }
  };

  // Search for stops
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchMode || searchQuery.length < 3) return;

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        provider: 'ptv',
        query: searchQuery,
        mode: searchMode,
      });
      const response = await fetch(`/api/stops?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.stops?.slice(0, 8) || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Select a stop from search results
  const selectStop = (mode: TransportMode, stop: { id: string; name: string }) => {
    const stopConfig = {
      stop: { id: stop.id, name: stop.name, modes: [mode] },
      enabled: true,
    };

    const newSettings = { ...settings };
    if (mode === 'tram') newSettings.tramStop = stopConfig;
    if (mode === 'train') newSettings.trainStop = stopConfig;
    if (mode === 'bus') newSettings.busStop = stopConfig;

    updateSettings(newSettings);
    setSearchMode(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Clear a stop
  const clearStop = (mode: TransportMode) => {
    const newSettings = { ...settings };
    if (mode === 'tram') newSettings.tramStop = undefined;
    if (mode === 'train') newSettings.trainStop = undefined;
    if (mode === 'bus') newSettings.busStop = undefined;
    updateSettings(newSettings);
  };

  // Get stop config for mode
  const getStopConfig = (mode: TransportMode) => {
    if (mode === 'tram') return settings.tramStop;
    if (mode === 'train') return settings.trainStop;
    if (mode === 'bus') return settings.busStop;
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Stop Configuration */}
      <section>
        <h2 className="font-bold text-sm uppercase tracking-wider mb-3 border-b border-black pb-1">
          Your Stops
        </h2>

        {MODES.map(({ mode, label, icon }) => {
          const config = getStopConfig(mode);
          const isSearchingThis = searchMode === mode;

          return (
            <div key={mode} className="py-3 border-b border-gray-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{icon}</span>
                <span className="font-bold">{label}</span>
              </div>

              {config ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm truncate">
                    {config.stop.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode(mode);
                      setSearchResults([]);
                    }}
                    className="px-2 py-1 border border-black text-xs"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => clearStop(mode)}
                    className="px-2 py-1 border border-black text-xs"
                  >
                    Remove
                  </button>
                </div>
              ) : isSearchingThis ? (
                <div>
                  {/* Search form - works without JS via form action */}
                  <form
                    onSubmit={handleSearch}
                    action="/api/stops"
                    method="get"
                    className="space-y-2"
                  >
                    <input type="hidden" name="provider" value="ptv" />
                    <input type="hidden" name="mode" value={mode} />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="query"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search ${label.toLowerCase()} stops...`}
                        className="flex-1 p-2 border-2 border-black text-sm"
                        autoFocus
                        minLength={3}
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 bg-black text-white text-sm font-bold"
                      >
                        Search
                      </button>
                    </div>
                  </form>

                  {isSearching && (
                    <p className="text-sm text-center py-2">Searching...</p>
                  )}

                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-black">
                      {searchResults.map((stop) => (
                        <button
                          key={stop.id}
                          type="button"
                          onClick={() => selectStop(mode, stop)}
                          className="w-full text-left p-2 text-sm border-b border-gray-300 last:border-b-0 hover:bg-gray-100"
                        >
                          {stop.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode(null);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="text-sm underline mt-2"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchMode(mode)}
                  className="text-sm underline"
                >
                  Add a {label.toLowerCase()} stop
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* Display Settings */}
      <section>
        <h2 className="font-bold text-sm uppercase tracking-wider mb-3 border-b border-black pb-1">
          Display
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="departuresPerMode" className="text-sm">
              Departures per mode
            </label>
            <select
              id="departuresPerMode"
              value={settings.departuresPerMode}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  departuresPerMode: parseInt(e.target.value, 10),
                })
              }
              className="border border-black p-1 text-sm"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="refreshInterval" className="text-sm">
              Refresh interval
            </label>
            <select
              id="refreshInterval"
              value={settings.refreshInterval}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  refreshInterval: parseInt(e.target.value, 10),
                })
              }
              className="border border-black p-1 text-sm"
            >
              <option value={15}>15 sec</option>
              <option value={30}>30 sec</option>
              <option value={60}>1 min</option>
              <option value={120}>2 min</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.showAbsoluteTime}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  showAbsoluteTime: e.target.checked,
                })
              }
              className="w-4 h-4"
            />
            <span className="text-sm">Show clock times instead of "in X min"</span>
          </label>
        </div>
      </section>

      {/* Actions */}
      <section className="pt-4 border-t border-black">
        <a
          href="/"
          className="block w-full py-3 bg-black text-white text-center font-bold"
        >
          Done - View Departures
        </a>

        <p className="text-xs text-gray-600 mt-4 text-center">
          Settings are saved automatically in your browser.
        </p>
      </section>
    </div>
  );
}
