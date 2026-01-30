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
  getSupportedModes,
  setActiveProvider,
  DEFAULT_SETTINGS,
  EnabledStopInfo,
} from '@/lib/utils/storage';
import { ProviderId } from '@/lib/providers';
import { CombinedBoard } from './CombinedBoard';
import { SettingsModal } from './SettingsModal';

interface ModeSection {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
  groupByDirection?: boolean;
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

  // Track if we've received client data (don't hide server board until then)
  const [hasClientData, setHasClientData] = useState(false);

  // Enable JS features after hydration
  useEffect(() => {
    // Load settings from localStorage (may have more recent data than cookies)
    const localSettings = loadSettings();
    setSettings(localSettings);
    setJsEnabled(true);

    // Intercept settings link clicks to open modal instead
    const settingsLink = document.getElementById('settings-link');
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        setIsSettingsOpen(true);
      });
    }

    // Register service worker for PWA offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hide server board only after we have client data
  useEffect(() => {
    if (hasClientData) {
      const serverBoard = document.getElementById('departure-board');
      if (serverBoard) {
        serverBoard.style.display = 'none';
      }
    }
  }, [hasClientData]);

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

  // Fetch departures for a list of stops with optional direction filters
  // Uses parallel fetching for better performance and preserves existing data on error
  const fetchDeparturesForStops = useCallback(async (
    stops: EnabledStopInfo[]
  ) => {
    if (stops.length === 0) {
      setSections([]);
      setHasClientData(true);
      return;
    }

    // Fetch all stops in parallel for better performance
    const fetchPromises = stops.map(async ({ mode, stop, directionIds }): Promise<ModeSection> => {
      try {
        // Determine if we should group by direction
        // Group when: no direction filter (showing all directions)
        const hasDirectionFilter = directionIds && directionIds.length > 0;
        const groupByDirection = !hasDirectionFilter;

        // Fetch 2x the departures as a buffer for mobile backgrounding
        // This ensures we have useful data to show immediately when the app comes back
        // to foreground, even if some departures have passed during the background period
        const bufferMultiplier = 2;
        const fetchLimit = groupByDirection
          ? (settings.departuresPerMode * bufferMultiplier + 2) * 4  // Enough for multiple directions
          : (settings.departuresPerMode * bufferMultiplier + 2) * 3; // Enough after filtering

        const params = new URLSearchParams({
          provider: settings.activeProvider,
          stopId: stop.id,
          mode,
          limit: String(fetchLimit),
          maxMinutes: String(settings.maxMinutes),
        });

        const response = await fetch(`/api/departures?${params.toString()}`);

        if (response.ok) {
          const data = await response.json();
          let departures: Departure[] = data.departures || [];

          // Apply direction filter if configured
          if (hasDirectionFilter) {
            const directionSet = new Set(directionIds);
            departures = departures.filter(
              (dep) => dep.direction && directionSet.has(dep.direction.id)
            );
          }

          return {
            mode,
            stopId: stop.id,
            stopName: data.stop?.name || stop.name,
            departures,
            isLoading: false,
            groupByDirection,
          };
        } else {
          // On API error, return error state but we'll try to preserve previous data
          return {
            mode,
            stopId: stop.id,
            stopName: stop.name,
            departures: [],
            isLoading: false,
            error: 'Failed to fetch',
          };
        }
      } catch (error) {
        console.error(`Error fetching ${mode} departures for ${stop.id}:`, error);
        return {
          mode,
          stopId: stop.id,
          stopName: stop.name,
          departures: [],
          isLoading: false,
          error: 'Network error',
        };
      }
    });

    // Wait for all fetches to complete in parallel
    const newSections = await Promise.all(fetchPromises);

    if (mountedRef.current) {
      // Merge new sections with existing data: if a new section has an error or no departures,
      // try to keep the previous data for that section (better than showing nothing)
      setSections(prevSections => {
        return newSections.map(newSection => {
          // If new section has data, use it
          if (newSection.departures.length > 0 && !newSection.error) {
            return newSection;
          }

          // If new section has error or no data, try to find previous data for this stop
          const prevSection = prevSections.find(
            ps => ps.stopId === newSection.stopId && ps.mode === newSection.mode
          );

          // If we have previous data with departures, keep it (mark as potentially stale)
          if (prevSection && prevSection.departures.length > 0 && !prevSection.error) {
            return {
              ...prevSection,
              // Keep previous departures but update stop name if we got one
              stopName: newSection.stopName || prevSection.stopName,
            };
          }

          // No previous data, use new (possibly empty) section
          return newSection;
        });
      });
      setFetchedAt(new Date().toISOString());
      setHasClientData(true);
    }
  }, [settings.departuresPerMode, settings.maxMinutes, settings.activeProvider]);

  // Fetch departures based on current mode (home or nearby)
  const fetchDepartures = useCallback(async () => {
    if (settings.nearbyMode) {
      // In nearby mode, use nearby stops (no direction filter - show all directions)
      if (nearbyStops.length > 0) {
        const stops: EnabledStopInfo[] = nearbyStops.map(ns => ({
          mode: ns.mode,
          stop: ns.stop,
          // No direction filter for nearby mode - show all directions
        }));
        await fetchDeparturesForStops(stops);
      }
      // If no nearby stops yet, they'll be fetched by location detection
    } else {
      // In home mode, use configured stops (with their direction filters)
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

    const stopsPerMode = settings.nearbyStopsPerMode || 1;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const modes = getSupportedModes(settings.activeProvider);

        // Fetch all modes in parallel
        const results = await Promise.all(
          modes.map(async (mode): Promise<NearbyStop[]> => {
            try {
              const params = new URLSearchParams({
                provider: settings.activeProvider,
                lat: String(latitude),
                lon: String(longitude),
                mode,
                distance: '1000',
              });

              const response = await fetch(`/api/nearby?${params.toString()}`);
              if (response.ok) {
                const data = await response.json();
                if (data.stops?.length > 0) {
                  // Take up to stopsPerMode stops for this mode
                  return data.stops.slice(0, stopsPerMode).map((stop: Stop & { distance: number }) => ({
                    mode,
                    stop,
                    distance: stop.distance,
                  }));
                }
              }
            } catch (error) {
              console.error(`Error fetching nearby ${mode} stops:`, error);
            }
            return [];
          })
        );

        // Flatten the results
        const allNearby = results.flat();

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
  }, [settings.nearbyStopsPerMode]);

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
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;

      if (isVisible) {
        // Page became visible - immediately update clock to re-filter cached departures
        // This shows useful data instantly without waiting for a fetch
        setNow(new Date());

        // Check if data is stale
        const timeSinceLastFetch = Date.now() - lastFetchTime;
        const isStale = timeSinceLastFetch > settings.refreshInterval * 1000;

        // In nearby mode, also check if location is stale (user may have moved)
        if (settings.nearbyMode) {
          const timeSinceLocationFetch = Date.now() - lastLocationFetchRef.current;
          if (timeSinceLocationFetch > LOCATION_STALE_THRESHOLD) {
            // Location is stale, re-fetch nearby stops (which will trigger departure fetch)
            // This runs in background - no await
            fetchNearbyStops(false);
          } else if (isStale) {
            // Location is fresh but departures are stale - fetch in background (no await)
            fetchDepartures().then(() => {
              lastFetchTime = Date.now();
            });
          }
        } else if (isStale) {
          // Home mode - fetch fresh data in background (no await)
          // User sees cached/buffered data immediately
          fetchDepartures().then(() => {
            lastFetchTime = Date.now();
          });
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
  }, [jsEnabled, settings.nearbyMode, settings.activeProvider, JSON.stringify(settings.providers)]);

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

  // Handle provider change
  const handleProviderChange = useCallback((providerId: ProviderId) => {
    const newSettings = setActiveProvider(settings, providerId);
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [settings]);

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
        onProviderChange={handleProviderChange}
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
