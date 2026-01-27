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
  setStopForMode,
  getStopForMode,
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
  settingsKey: 'tramStop' | 'trainStop' | 'busStop';
}[] = [
  { mode: 'tram', label: 'Tram', icon: '🚊', settingsKey: 'tramStop' },
  { mode: 'train', label: 'Train', icon: '🚆', settingsKey: 'trainStop' },
  { mode: 'bus', label: 'Bus', icon: '🚌', settingsKey: 'busStop' },
];

function StopSelector({
  mode,
  label,
  icon,
  config,
  nearbyStop,
  onChange,
}: {
  mode: TransportMode;
  label: string;
  icon: string;
  config?: StopConfig;
  nearbyStop?: Stop & { distance: number };
  onChange: (config: StopConfig | undefined) => void;
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
        setSearchResults(data.stops.slice(0, 5));
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [mode]);

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
    onChange({ stop, enabled: true });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const useNearbyStop = () => {
    if (nearbyStop) {
      const { distance, ...stop } = nearbyStop;
      onChange({ stop, enabled: true });
    }
  };

  const clearStop = () => {
    onChange(undefined);
  };

  const toggleEnabled = () => {
    if (config) {
      onChange({ ...config, enabled: !config.enabled });
    }
  };

  return (
    <div className="border-b border-black py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="font-bold">{label}</span>
        {config && (
          <label className="ml-auto flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={toggleEnabled}
              className="w-4 h-4"
            />
            Show
          </label>
        )}
      </div>

      {config ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{config.stop.name}</span>
          <button
            onClick={() => setShowSearch(true)}
            className="px-2 py-1 border border-black text-xs"
          >
            Change
          </button>
          <button
            onClick={clearStop}
            className="px-2 py-1 border border-black text-xs"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {nearbyStop && !showSearch && (
            <button
              onClick={useNearbyStop}
              className="w-full text-left p-2 border border-black text-sm hover:bg-gray-100"
            >
              <div className="font-medium">{nearbyStop.name}</div>
              <div className="text-xs text-gray-600">
                {Math.round(nearbyStop.distance)}m away (detected)
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
              Search for a stop
            </button>
          )}
        </div>
      )}
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

  const handleStopChange = (mode: TransportMode, config: StopConfig | undefined) => {
    const newSettings = setStopForMode(settings, mode, config);
    onSettingsChange(newSettings);
  };

  // Find nearby stop for each mode
  const getNearbyForMode = (mode: TransportMode) => {
    return nearbyStops.find((s) => s.stop.modes.includes(mode))
      ? { ...nearbyStops.find((s) => s.stop.modes.includes(mode))!.stop, distance: nearbyStops.find((s) => s.stop.modes.includes(mode))!.distance }
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
            {MODE_CONFIG.map(({ mode, label, icon, settingsKey }) => (
              <StopSelector
                key={mode}
                mode={mode}
                label={label}
                icon={icon}
                config={settings[settingsKey]}
                nearbyStop={getNearbyForMode(mode)}
                onChange={(config) => handleStopChange(mode, config)}
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
                <span className="text-sm">Departures per mode</span>
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
