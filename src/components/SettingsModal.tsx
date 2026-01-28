'use client';

/**
 * SettingsModal Component
 *
 * Compact settings panel for configuring stops.
 * Appears as a slide-in panel from the gear icon.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stop, TransportMode, Direction } from '@/lib/providers/types';
import {
  UserSettings,
  StopConfig,
  getStopsForMode,
  addStopForMode,
  removeStopForMode,
  toggleStopEnabled,
  updateStopDirections,
} from '@/lib/utils/storage';
import { TransportIcon, getModeLabel } from './TransportIcon';

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
  settingsKey: 'tramStops' | 'trainStops' | 'busStops';
}[] = [
  { mode: 'tram', label: 'Tram', settingsKey: 'tramStops' },
  { mode: 'train', label: 'Train', settingsKey: 'trainStops' },
  { mode: 'bus', label: 'Bus', settingsKey: 'busStops' },
];

/**
 * Direction picker component for configuring which directions to show
 */
function DirectionPicker({
  config,
  mode,
  onUpdateDirections,
  onClose,
}: {
  config: StopConfig;
  mode: TransportMode;
  onUpdateDirections: (directionIds: string[] | undefined, directionNames: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [availableDirections, setAvailableDirections] = useState<Direction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(config.directionIds || [])
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(!config.directionIds || config.directionIds.length === 0);

  // Fetch available directions from departures
  useEffect(() => {
    async function fetchDirections() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          provider: 'ptv',
          stopId: config.stop.id,
          mode,
          limit: '50', // Get more departures to capture all directions
        });
        const response = await fetch(`/api/departures?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          // Extract unique directions from departures
          const dirMap = new Map<string, Direction>();
          for (const dep of data.departures || []) {
            if (dep.direction && !dirMap.has(dep.direction.id)) {
              dirMap.set(dep.direction.id, dep.direction);
            }
          }
          setAvailableDirections(Array.from(dirMap.values()));
        }
      } catch (error) {
        console.error('Failed to fetch directions:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDirections();
  }, [config.stop.id, mode]);

  const toggleDirection = (dirId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(dirId)) {
      newSelected.delete(dirId);
    } else {
      newSelected.add(dirId);
    }
    setSelectedIds(newSelected);
    setShowAll(false);
  };

  const handleSave = () => {
    if (showAll || selectedIds.size === 0) {
      onUpdateDirections(undefined, {});
    } else {
      const dirNames: Record<string, string> = {};
      for (const dir of availableDirections) {
        if (selectedIds.has(dir.id)) {
          dirNames[dir.id] = dir.name;
        }
      }
      onUpdateDirections(Array.from(selectedIds), dirNames);
    }
    onClose();
  };

  return (
    <div className="bg-gray-50 border border-black p-2 mt-1 text-sm">
      <div className="font-medium mb-2">Filter directions:</div>

      {isLoading ? (
        <div className="text-xs py-2">Loading directions...</div>
      ) : availableDirections.length === 0 ? (
        <div className="text-xs py-2">No directions found</div>
      ) : (
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showAll}
              onChange={() => {
                setShowAll(true);
                setSelectedIds(new Set());
              }}
              className="w-4 h-4"
            />
            <span>All directions</span>
          </label>
          {availableDirections.map((dir) => (
            <label key={dir.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!showAll && selectedIds.has(dir.id)}
                onChange={() => toggleDirection(dir.id)}
                className="w-4 h-4"
              />
              <span className="truncate">{dir.name}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          className="flex-1 px-2 py-1 bg-black text-white text-xs"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1 border border-black text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Get a short display string for the direction filter
 */
function getDirectionFilterLabel(config: StopConfig): string | null {
  if (!config.directionIds || config.directionIds.length === 0) {
    return null;
  }
  if (!config.directionNames) {
    return `${config.directionIds.length} dir`;
  }
  const names = config.directionIds
    .map(id => config.directionNames?.[id])
    .filter(Boolean);
  if (names.length === 1) {
    // Shorten single direction name
    const name = names[0]!;
    return name.length > 15 ? name.slice(0, 12) + '...' : name;
  }
  return `${names.length} directions`;
}

function StopListManager({
  mode,
  label,
  stops,
  nearbyStop,
  onAddStop,
  onRemoveStop,
  onToggleEnabled,
  onUpdateDirections,
}: {
  mode: TransportMode;
  label: string;
  stops: StopConfig[];
  nearbyStop?: Stop & { distance: number };
  onAddStop: (config: StopConfig) => void;
  onRemoveStop: (stopId: string) => void;
  onToggleEnabled: (stopId: string) => void;
  onUpdateDirections: (stopId: string, directionIds: string[] | undefined, directionNames: Record<string, string>) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stop[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [editingDirections, setEditingDirections] = useState<string | null>(null);
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
        <TransportIcon mode={mode} size={20} />
        <span className="font-bold">{label}</span>
        <span className="text-xs text-gray-600 ml-auto">
          {stops.length} stop{stops.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List of configured stops */}
      {stops.length > 0 && (
        <div className="space-y-1 mb-2">
          {stops.map((config) => {
            const dirLabel = getDirectionFilterLabel(config);
            return (
              <div key={config.stop.id}>
                <div className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={() => onToggleEnabled(config.stop.id)}
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <div className={`flex-1 min-w-0 ${!config.enabled ? 'opacity-50' : ''}`}>
                    <div className="truncate">{config.stop.name}</div>
                    <button
                      onClick={() => setEditingDirections(
                        editingDirections === config.stop.id ? null : config.stop.id
                      )}
                      className="text-xs text-gray-600 hover:text-black hover:underline"
                    >
                      {dirLabel ? `→ ${dirLabel}` : 'All directions'} ▾
                    </button>
                  </div>
                  <button
                    onClick={() => onRemoveStop(config.stop.id)}
                    className="px-2 py-0.5 border border-black text-xs hover:bg-gray-100"
                    title="Remove stop"
                  >
                    ✕
                  </button>
                </div>

                {/* Direction picker */}
                {editingDirections === config.stop.id && (
                  <DirectionPicker
                    config={config}
                    mode={mode}
                    onUpdateDirections={(dirIds, dirNames) =>
                      onUpdateDirections(config.stop.id, dirIds, dirNames)
                    }
                    onClose={() => setEditingDirections(null)}
                  />
                )}
              </div>
            );
          })}
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

  const handleUpdateDirections = (
    mode: TransportMode,
    stopId: string,
    directionIds: string[] | undefined,
    directionNames: Record<string, string>
  ) => {
    const newSettings = updateStopDirections(settings, mode, stopId, directionIds, directionNames);
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

          {/* Mode toggle */}
          <div className="mb-6">
            <h3 className="font-bold mb-2 text-sm uppercase tracking-wider">
              Mode
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  onSettingsChange({ ...settings, nearbyMode: false })
                }
                className={`flex-1 py-2 px-3 text-sm font-medium border-2 ${
                  !settings.nearbyMode
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-100'
                }`}
              >
                Home
              </button>
              <button
                onClick={() =>
                  onSettingsChange({ ...settings, nearbyMode: true })
                }
                className={`flex-1 py-2 px-3 text-sm font-medium border-2 ${
                  settings.nearbyMode
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-black border-black hover:bg-gray-100'
                }`}
              >
                Nearby
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {settings.nearbyMode
                ? 'Showing stops near your current location'
                : 'Showing your configured home stops'}
            </p>
          </div>

          {/* Stop selectors (only shown in Home mode) */}
          {!settings.nearbyMode && (
            <div className="mb-6">
              <h3 className="font-bold mb-2 text-sm uppercase tracking-wider">
                Your Stops
              </h3>
              {MODE_CONFIG.map(({ mode, label }) => (
                <StopListManager
                  key={mode}
                  mode={mode}
                  label={label}
                  stops={getStopsForMode(settings, mode)}
                  nearbyStop={getNearbyForMode(mode)}
                  onAddStop={(config) => handleAddStop(mode, config)}
                  onRemoveStop={(stopId) => handleRemoveStop(mode, stopId)}
                  onToggleEnabled={(stopId) => handleToggleEnabled(mode, stopId)}
                  onUpdateDirections={(stopId, dirIds, dirNames) =>
                    handleUpdateDirections(mode, stopId, dirIds, dirNames)
                  }
                />
              ))}
            </div>
          )}

          {/* Nearby mode settings */}
          {settings.nearbyMode && (
            <div className="mb-6">
              <h3 className="font-bold mb-2 text-sm uppercase tracking-wider">
                Nearby Settings
              </h3>
              <label className="flex items-center justify-between">
                <span className="text-sm">Stops per mode</span>
                <select
                  value={settings.nearbyStopsPerMode || 1}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      nearbyStopsPerMode: parseInt(e.target.value, 10),
                    })
                  }
                  className="border border-black p-1 text-sm"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
              <p className="text-xs text-gray-600 mt-1">
                Number of nearby stops to show for each transport type
              </p>
            </div>
          )}

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
