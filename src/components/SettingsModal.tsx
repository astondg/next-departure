'use client';

/**
 * SettingsModal Component
 *
 * Compact settings panel for configuring stops.
 * Appears as a slide-in panel from the gear icon.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stop, TransportMode } from '@/lib/providers/types';
import {
  UserSettings,
  StopConfig,
  getStopsForMode,
  addStopForMode,
  removeStopForMode,
  toggleStopEnabled,
} from '@/lib/utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  nearbyStops?: { mode: TransportMode; stop: Stop; distance: number }[];
  isLoadingNearby?: boolean;
}

const MODE_CONFIG: {
  mode: TransportMode;
  label: string;
  icon: string;
  settingsKey: 'tramStops' | 'trainStops' | 'busStops';
}[] = [
  { mode: 'tram', label: 'Tram', icon: '🚊', settingsKey: 'tramStops' },
  { mode: 'train', label: 'Train', icon: '🚆', settingsKey: 'trainStops' },
  { mode: 'bus', label: 'Bus', icon: '🚌', settingsKey: 'busStops' },
];

function StopListManager({
  mode,
  label,
  icon,
  stops,
  nearbyStop,
  onAddStop,
  onRemoveStop,
  onToggleEnabled,
}: {
  mode: TransportMode;
  label: string;
  icon: string;
  stops: StopConfig[];
  nearbyStop?: Stop & { distance: number };
  onAddStop: (config: StopConfig) => void;
  onRemoveStop: (stopId: string) => void;
  onToggleEnabled: (stopId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stop[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Search for stops
  const searchStops = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        provider: 'ptv',
        query,
        mode,
      });
      const response = await fetch(`/api/stops?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        // Filter out already-added stops
        const existingIds = new Set(stops.map(s => s.stop.id));
        setSearchResults(data.stops.filter((s: Stop) => !existingIds.has(s.id)).slice(0, 5));
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [mode, stops]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchStops(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchStops]);

  const selectStop = (stop: Stop) => {
    onAddStop({ stop, enabled: true });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const useNearbyStop = () => {
    if (nearbyStop) {
      // Extract just the Stop properties without distance
      const stop: Stop = {
        id: nearbyStop.id,
        name: nearbyStop.name,
        modes: nearbyStop.modes,
        ...(nearbyStop.code && { code: nearbyStop.code }),
        ...(nearbyStop.location && { location: nearbyStop.location }),
        ...(nearbyStop.directions && { directions: nearbyStop.directions }),
      };
      onAddStop({ stop, enabled: true });
    }
  };

  const hasNearbyNotAdded = nearbyStop && !stops.some(s => s.stop.id === nearbyStop.id);

  return (
    <div className="border-b border-black py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="font-bold">{label}</span>
        <span className="text-xs text-gray-600 ml-auto">
          {stops.length} stop{stops.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List of configured stops */}
      {stops.length > 0 && (
        <div className="space-y-1 mb-2">
          {stops.map((config) => (
            <div key={config.stop.id} className="flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={() => onToggleEnabled(config.stop.id)}
                className="w-4 h-4 flex-shrink-0"
              />
              <span className={`flex-1 truncate ${!config.enabled ? 'opacity-50' : ''}`}>
                {config.stop.name}
              </span>
              <button
                onClick={() => onRemoveStop(config.stop.id)}
                className="px-2 py-0.5 border border-black text-xs hover:bg-gray-100"
                title="Remove stop"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add stop section */}
      <div className="space-y-2">
        {/* Show nearby stop suggestion if no stops added yet */}
        {stops.length === 0 && hasNearbyNotAdded && !showSearch && (
          <button
            onClick={useNearbyStop}
            className="w-full text-left p-2 border border-black text-sm hover:bg-gray-100"
          >
            <div className="font-medium">{nearbyStop!.name}</div>
            <div className="text-xs text-gray-600">
              {Math.round(nearbyStop!.distance)}m away (detected)
            </div>
          </button>
        )}

        {showSearch ? (
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()} stops...`}
              className="w-full p-2 border-2 border-black text-sm"
              autoFocus
            />
            {isSearching && (
              <div className="text-xs text-center py-2">Searching...</div>
            )}
            {searchResults.length > 0 && (
              <div className="border border-black mt-1">
                {searchResults.map((stop) => (
                  <button
                    key={stop.id}
                    onClick={() => selectStop(stop)}
                    className="w-full text-left p-2 border-b border-black last:border-b-0 text-sm hover:bg-gray-100"
                  >
                    {stop.name}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="text-xs underline mt-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="text-sm underline"
          >
            + Add a stop
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  nearbyStops = [],
  isLoadingNearby = false,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const handleAddStop = (mode: TransportMode, config: StopConfig) => {
    const newSettings = addStopForMode(settings, mode, config);
    onSettingsChange(newSettings);
  };

  const handleRemoveStop = (mode: TransportMode, stopId: string) => {
    const newSettings = removeStopForMode(settings, mode, stopId);
    onSettingsChange(newSettings);
  };

  const handleToggleEnabled = (mode: TransportMode, stopId: string) => {
    const newSettings = toggleStopEnabled(settings, mode, stopId);
    onSettingsChange(newSettings);
  };

  // Find nearby stop for each mode
  const getNearbyForMode = (mode: TransportMode) => {
    const found = nearbyStops.find((s) => s.stop.modes.includes(mode));
    return found
      ? { ...found.stop, distance: found.distance }
      : undefined;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-80 max-w-full bg-white border-l-4 border-black z-50 overflow-y-auto">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-black">
            <h2 className="text-xl font-bold">Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-2xl hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          {/* Location status */}
          {isLoadingNearby && (
            <div className="text-sm text-center py-2 mb-4 bg-gray-100">
              Detecting nearby stops...
            </div>
          )}

          {/* Stop selectors */}
          <div className="mb-6">
            <h3 className="font-bold mb-2 text-sm uppercase tracking-wider">
              Your Stops
            </h3>
            {MODE_CONFIG.map(({ mode, label, icon }) => (
              <StopListManager
                key={mode}
                mode={mode}
                label={label}
                icon={icon}
                stops={getStopsForMode(settings, mode)}
                nearbyStop={getNearbyForMode(mode)}
                onAddStop={(config) => handleAddStop(mode, config)}
                onRemoveStop={(stopId) => handleRemoveStop(mode, stopId)}
                onToggleEnabled={(stopId) => handleToggleEnabled(mode, stopId)}
              />
            ))}
          </div>

          {/* Other settings */}
          <div className="mb-6">
            <h3 className="font-bold mb-2 text-sm uppercase tracking-wider">
              Display
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm">Departures per stop</span>
                <select
                  value={settings.departuresPerMode}
                  onChange={(e) =>
                    onSettingsChange({
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
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm">Show next</span>
                <select
                  value={settings.maxMinutes}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      maxMinutes: parseInt(e.target.value, 10),
                    })
                  }
                  className="border border-black p-1 text-sm"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm">Refresh interval</span>
                <select
                  value={settings.refreshInterval}
                  onChange={(e) =>
                    onSettingsChange({
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
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showAbsoluteTime}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      showAbsoluteTime: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm">Show times (not "in X min")</span>
              </label>
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-gray-600 border-t border-black pt-4">
            <p>Settings are saved in your browser.</p>
            <p className="mt-2">
              <a href="/setup" className="underline">
                Need a shareable URL? Use the Setup page →
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
