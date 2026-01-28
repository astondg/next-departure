'use client';

/**
 * ClientEnhancements Component
 *
 * Provides JavaScript enhancements when available:
 * - Settings modal (instead of navigating to /settings)
 * - Client-side auto-refresh (smoother than meta refresh)
 * - Location detection for nearby stops
 * - Live clock updates
 *
 * If JS doesn't work, this component does nothing and the
 * server-rendered board works via meta refresh.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Departure, Stop, TransportMode } from '@/lib/providers/types';
import {
  UserSettings,
  loadSettings,
  saveSettings,
  getEnabledStops,
  DEFAULT_SETTINGS,
} from '@/lib/utils/storage';
import { CombinedBoard } from './CombinedBoard';
import { SettingsModal } from './SettingsModal';

interface ModeSection {
  mode: TransportMode;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
}

interface NearbyStop {
  mode: TransportMode;
  stop: Stop;
  distance: number;
}

interface ClientEnhancementsProps {
  initialSettings: UserSettings;
  initialSections: ModeSection[];
  initialFetchedAt: string;
}

export function ClientEnhancements({
  initialSettings,
  initialSections,
  initialFetchedAt,
}: ClientEnhancementsProps) {
  // Track if JS is working
  const [jsEnabled, setJsEnabled] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  }));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Location state
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

  // Departures state
  const [sections, setSections] = useState<ModeSection[]>(initialSections);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
  const [now, setNow] = useState(new Date());

  // Refs
  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Enable JS features after hydration
  useEffect(() => {
    // Load settings from localStorage (may have more recent data than cookies)
    const localSettings = loadSettings();
    setSettings(localSettings);
    setJsEnabled(true);

    // Hide server-rendered board, show client-rendered one
    const serverBoard = document.getElementById('departure-board');
    if (serverBoard) {
      serverBoard.style.display = 'none';
    }

    // Intercept settings link clicks to open modal instead
    const settingsLink = document.getElementById('settings-link');
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        setIsSettingsOpen(true);
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Update clock every second
  useEffect(() => {
    if (!jsEnabled) return;

    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [jsEnabled]);

  // Save settings when they change
  useEffect(() => {
    if (!jsEnabled) return;
    saveSettings(settings);
  }, [jsEnabled, settings]);

  // Fetch departures
  const fetchDepartures = useCallback(async () => {
    const enabledStops = getEnabledStops(settings);

    if (enabledStops.length === 0) {
      setSections([]);
      return;
    }

    const newSections: ModeSection[] = [];

    for (const { mode, stop } of enabledStops) {
      try {
        const params = new URLSearchParams({
          provider: 'ptv',
          stopId: stop.id,
          mode,
          limit: String(settings.departuresPerMode + 2),
        });

        const response = await fetch(`/api/departures?${params.toString()}`);

        if (response.ok) {
          const data = await response.json();
          newSections.push({
            mode,
            stopName: data.stop?.name || stop.name,
            departures: data.departures || [],
            isLoading: false,
          });
        } else {
          newSections.push({
            mode,
            stopName: stop.name,
            departures: [],
            isLoading: false,
            error: 'Failed to fetch',
          });
        }
      } catch (error) {
        console.error(`Error fetching ${mode} departures:`, error);
        newSections.push({
          mode,
          stopName: stop.name,
          departures: [],
          isLoading: false,
          error: 'Network error',
        });
      }
    }

    if (mountedRef.current) {
      setSections(newSections);
      setFetchedAt(new Date().toISOString());
    }
  }, [settings]);

  // Auto-refresh
  useEffect(() => {
    if (!jsEnabled) return;

    const scheduleRefresh = () => {
      refreshTimeoutRef.current = setTimeout(async () => {
        await fetchDepartures();
        scheduleRefresh();
      }, settings.refreshInterval * 1000);
    };

    scheduleRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [jsEnabled, settings.refreshInterval, fetchDepartures]);

  // Fetch when settings change
  useEffect(() => {
    if (!jsEnabled) return;
    fetchDepartures();
  }, [jsEnabled, settings.tramStop, settings.trainStop, settings.busStop]);

  // Detect location
  useEffect(() => {
    if (!jsEnabled) return;
    if (!navigator.geolocation) return;

    setIsLoadingNearby(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const modes: TransportMode[] = ['tram', 'train', 'bus'];
        const allNearby: NearbyStop[] = [];

        for (const mode of modes) {
          try {
            const params = new URLSearchParams({
              provider: 'ptv',
              lat: String(latitude),
              lon: String(longitude),
              mode,
              distance: '1000',
            });

            const response = await fetch(`/api/nearby?${params.toString()}`);
            if (response.ok) {
              const data = await response.json();
              if (data.stops?.length > 0) {
                const closest = data.stops[0];
                allNearby.push({
                  mode,
                  stop: closest,
                  distance: closest.distance,
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching nearby ${mode} stops:`, error);
          }
        }

        if (mountedRef.current) {
          setNearbyStops(allNearby);
          setIsLoadingNearby(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setIsLoadingNearby(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [jsEnabled]);

  // Handle settings change
  const handleSettingsChange = useCallback((newSettings: UserSettings) => {
    setSettings(newSettings);
  }, []);

  // Don't render anything until JS is confirmed working
  if (!jsEnabled) {
    return null;
  }

  return (
    <>
      {/* Client-rendered board (replaces server-rendered one) */}
      <CombinedBoard
        sections={sections}
        settings={settings}
        fetchedAt={fetchedAt}
        onSettingsClick={() => setIsSettingsOpen(true)}
        now={now}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        nearbyStops={nearbyStops}
        isLoadingNearby={isLoadingNearby}
      />
    </>
  );
}
