'use client';

/**
 * HomeClient Component
 *
 * Main client-side component for the home page.
 * Handles:
 * - Location detection
 * - Settings management
 * - Fetching departures from multiple stops
 * - Auto-refresh
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
import { CombinedBoard } from '@/components/CombinedBoard';
import { SettingsModal } from '@/components/SettingsModal';
import { RefreshController } from '@/components/RefreshController';

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

export function HomeClient() {
  // Track if component has hydrated
  const [isHydrated, setIsHydrated] = useState(false);

  // Settings state - initialize with defaults, load from storage after hydration
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Location state
  const [nearbyStops, setNearbyStops] = useState<NearbyStop[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Departures state
  const [sections, setSections] = useState<ModeSection[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // Refs for tracking mounted state
  const mountedRef = useRef(true);

  // Hydration effect - load settings and initialize time after mount
  useEffect(() => {
    setSettings(loadSettings());
    setFetchedAt(new Date().toISOString());
    setNow(new Date());
    setIsHydrated(true);
  }, []);

  // Update clock every second (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isHydrated]);

  // Save settings when they change (only after hydration to avoid saving defaults)
  useEffect(() => {
    if (!isHydrated) return;
    saveSettings(settings);
  }, [isHydrated, settings]);

  // Detect location on mount (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    const detectLocation = async () => {
      if (!navigator.geolocation) {
        setLocationError('Geolocation not supported');
        return;
      }

      setIsLoadingNearby(true);

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000, // 5 minutes
            });
          }
        );

        const { latitude, longitude } = position.coords;

        // Update settings with location
        setSettings((prev) => ({
          ...prev,
          lastLocation: {
            latitude,
            longitude,
            timestamp: Date.now(),
          },
        }));

        // Fetch nearby stops for each mode
        const modes: TransportMode[] = ['tram', 'train', 'bus'];
        const allNearby: NearbyStop[] = [];

        for (const mode of modes) {
          try {
            const params = new URLSearchParams({
              provider: 'ptv',
              lat: String(latitude),
              lon: String(longitude),
              mode,
              distance: '1000', // 1km radius
            });

            const response = await fetch(`/api/nearby?${params.toString()}`);
            if (response.ok) {
              const data = await response.json();
              if (data.stops?.length > 0) {
                // Get closest stop for this mode
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
        }
      } catch (error) {
        console.error('Geolocation error:', error);
        if (error instanceof GeolocationPositionError) {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setLocationError('Location permission denied');
              break;
            case error.POSITION_UNAVAILABLE:
              setLocationError('Location unavailable');
              break;
            case error.TIMEOUT:
              setLocationError('Location request timed out');
              break;
          }
        }
      } finally {
        if (mountedRef.current) {
          setIsLoadingNearby(false);
        }
      }
    };

    detectLocation();

    return () => {
      mountedRef.current = false;
    };
  }, [isHydrated]);

  // Fetch departures for configured stops
  const fetchDepartures = useCallback(async () => {
    const enabledStops = getEnabledStops(settings);

    if (enabledStops.length === 0) {
      setSections([]);
      return;
    }

    const newSections: ModeSection[] = [];

    for (const { mode, stop } of enabledStops) {
      // Create initial loading state
      const existingSection = sections.find((s) => s.mode === mode);

      try {
        const params = new URLSearchParams({
          provider: 'ptv',
          stopId: stop.id,
          mode,
          limit: String(settings.departuresPerMode + 2), // Fetch a few extra
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
            departures: existingSection?.departures || [],
            isLoading: false,
            error: 'Failed to fetch',
          });
        }
      } catch (error) {
        console.error(`Error fetching ${mode} departures:`, error);
        newSections.push({
          mode,
          stopName: stop.name,
          departures: existingSection?.departures || [],
          isLoading: false,
          error: 'Network error',
        });
      }
    }

    if (mountedRef.current) {
      setSections(newSections);
      setFetchedAt(new Date().toISOString());
    }
  }, [settings, sections]);

  // Initial fetch and when settings change (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    fetchDepartures();
  }, [isHydrated, settings.tramStop, settings.trainStop, settings.busStop]);

  // Handle settings change
  const handleSettingsChange = useCallback((newSettings: UserSettings) => {
    setSettings(newSettings);
  }, []);

  return (
    <>
      {/* Meta refresh fallback for legacy devices */}
      <noscript>
        <meta httpEquiv="refresh" content={String(settings.refreshInterval)} />
      </noscript>

      <RefreshController
        interval={settings.refreshInterval}
        onRefresh={fetchDepartures}
        enableMetaRefresh={true}
      >
        <CombinedBoard
          sections={sections}
          settings={settings}
          fetchedAt={fetchedAt ?? ''}
          onSettingsClick={() => setIsSettingsOpen(true)}
          now={now ?? new Date()}
        />
      </RefreshController>

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
