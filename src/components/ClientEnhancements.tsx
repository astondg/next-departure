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
  stopId: string;
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
  const lastLocationFetchRef = useRef<number>(0);

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

  // Fetch departures for a list of stops
  const fetchDeparturesForStops = useCallback(async (
    stops: { mode: TransportMode; stop: Stop }[]
  ) => {
    if (stops.length === 0) {
      setSections([]);
      return;
    }

    const newSections: ModeSection[] = [];

    for (const { mode, stop } of stops) {
      try {
        const params = new URLSearchParams({
          provider: 'ptv',
          stopId: stop.id,
          mode,
          limit: String(settings.departuresPerMode + 2),
          maxMinutes: String(settings.maxMinutes),
        });

        const response = await fetch(`/api/departures?${params.toString()}`);

        if (response.ok) {
          const data = await response.json();
          newSections.push({
            mode,
            stopId: stop.id,
            stopName: data.stop?.name || stop.name,
            departures: data.departures || [],
            isLoading: false,
          });
        } else {
          newSections.push({
            mode,
            stopId: stop.id,
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
          stopId: stop.id,
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
  }, [settings.departuresPerMode, settings.maxMinutes]);

  // Fetch departures based on current mode (home or nearby)
  const fetchDepartures = useCallback(async () => {
    if (settings.nearbyMode) {
      // In nearby mode, use nearby stops
      if (nearbyStops.length > 0) {
        const stops = nearbyStops.map(ns => ({ mode: ns.mode, stop: ns.stop }));
        await fetchDeparturesForStops(stops);
      }
      // If no nearby stops yet, they'll be fetched by location detection
    } else {
      // In home mode, use configured stops
      const enabledStops = getEnabledStops(settings);
      await fetchDeparturesForStops(enabledStops);
    }
  }, [settings, nearbyStops, fetchDeparturesForStops]);

  // Fetch nearby stops based on current location
  const fetchNearbyStops = useCallback(async (clearExisting = true) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not available');
      return;
    }

    if (clearExisting) {
      setNearbyStops([]);
    }
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
          lastLocationFetchRef.current = Date.now();
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setIsLoadingNearby(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000, // Cache location for 1 minute
      }
    );
  }, []);

  // Auto-refresh with visibility handling
  useEffect(() => {
    if (!jsEnabled) return;

    let isVisible = !document.hidden;
    let lastFetchTime = Date.now();
    const LOCATION_STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(async () => {
        if (isVisible) {
          await fetchDepartures();
          lastFetchTime = Date.now();
        }
        scheduleRefresh();
      }, settings.refreshInterval * 1000);
    };

    // Handle page visibility changes (device lock, app background, tab switch)
    const handleVisibilityChange = async () => {
      isVisible = !document.hidden;

      if (isVisible) {
        // Page became visible - check if data is stale
        const timeSinceLastFetch = Date.now() - lastFetchTime;
        const isStale = timeSinceLastFetch > settings.refreshInterval * 1000;

        // In nearby mode, also check if location is stale (user may have moved)
        if (settings.nearbyMode) {
          const timeSinceLocationFetch = Date.now() - lastLocationFetchRef.current;
          if (timeSinceLocationFetch > LOCATION_STALE_THRESHOLD) {
            // Location is stale, re-fetch nearby stops (which will trigger departure fetch)
            fetchNearbyStops(false);
          } else if (isStale) {
            // Location is fresh but departures are stale
            await fetchDepartures();
            lastFetchTime = Date.now();
          }
        } else if (isStale) {
          // Home mode - just refresh departures
          await fetchDepartures();
          lastFetchTime = Date.now();
        }

        // Restart the refresh timer
        scheduleRefresh();
      } else {
        // Page is hidden - stop the timer to save battery
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
      }
    };

    // Handle bfcache restoration (back-forward navigation)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page was restored from bfcache - refresh data
        handleVisibilityChange();
      }
    };

    // Start polling
    scheduleRefresh();

    // Listen for visibility changes and bfcache
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [jsEnabled, settings.refreshInterval, settings.nearbyMode, fetchDepartures, fetchNearbyStops]);

  // Fetch when settings change (home mode)
  useEffect(() => {
    if (!jsEnabled) return;
    if (settings.nearbyMode) return; // Handled by nearby mode effect
    fetchDepartures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsEnabled, settings.nearbyMode, JSON.stringify([settings.tramStops, settings.trainStops, settings.busStops])]);

  // Fetch when nearby stops are available (nearby mode)
  useEffect(() => {
    if (!jsEnabled) return;
    if (!settings.nearbyMode) return;
    if (nearbyStops.length === 0) return;

    fetchDepartures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsEnabled, settings.nearbyMode, nearbyStops]);

  // Detect location when nearby mode is enabled
  useEffect(() => {
    if (!jsEnabled) return;
    if (!settings.nearbyMode) return;

    fetchNearbyStops(true);
  }, [jsEnabled, settings.nearbyMode, fetchNearbyStops]);

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
        isLoadingNearby={isLoadingNearby}
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
