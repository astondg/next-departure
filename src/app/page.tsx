/**
 * Next Departure - Home Page (Server Component)
 *
 * Server-renders the departure board with real data.
 * Works without JavaScript via meta refresh.
 * Progressively enhanced with client-side features when JS is available.
 */

import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ServerBoard } from '@/components/ServerBoard';
import { ClientEnhancements } from '@/components/ClientEnhancements';
import { TransportMode, Departure } from '@/lib/providers/types';
import {
  UserSettings,
  DEFAULT_SETTINGS,
  getEnabledStops as getEnabledStopsFromSettings,
} from '@/lib/utils/storage';
import { getProvider, isProviderAvailable, ProviderId } from '@/lib/providers';

export const metadata: Metadata = {
  title: 'Next Departure - E-ink Transit Display',
  description:
    'Real-time public transport departure times optimized for e-ink displays',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

// Force dynamic rendering so we always get fresh data
export const dynamic = 'force-dynamic';

const SETTINGS_KEY = 'next-departure-settings';

interface ModeSection {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  isLoading: boolean;
  error?: string;
}

async function getSettings(): Promise<UserSettings> {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get(SETTINGS_KEY);

  if (settingsCookie?.value) {
    try {
      const decoded = decodeURIComponent(settingsCookie.value);
      const parsed = JSON.parse(decoded);

      // Handle migration from legacy flat format to per-provider format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings: any = { ...DEFAULT_SETTINGS, ...parsed };

      // Migrate if we have legacy flat format (tramStops at top level, no providers)
      if (
        ('tramStops' in settings || 'trainStops' in settings || 'busStops' in settings) &&
        (!settings.providers || Object.keys(settings.providers).length === 0)
      ) {
        const ptvSettings: Record<string, unknown> = {};
        if (settings.tramStops?.length > 0) {
          ptvSettings.tramStops = settings.tramStops;
          delete settings.tramStops;
        }
        if (settings.trainStops?.length > 0) {
          ptvSettings.trainStops = settings.trainStops;
          delete settings.trainStops;
        }
        if (settings.busStops?.length > 0) {
          ptvSettings.busStops = settings.busStops;
          delete settings.busStops;
        }
        settings.providers = { ptv: ptvSettings };
        settings.activeProvider = 'ptv';
      }

      // Ensure required fields
      if (!settings.activeProvider) {
        settings.activeProvider = DEFAULT_SETTINGS.activeProvider;
      }
      if (!settings.providers) {
        settings.providers = {};
      }

      return settings as UserSettings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  return DEFAULT_SETTINGS;
}

function getEnabledStops(settings: UserSettings): { mode: TransportMode; stop: { id: string; name: string } }[] {
  const enabledStops = getEnabledStopsFromSettings(settings);
  return enabledStops.map(({ mode, stop }) => ({
    mode,
    stop: { id: stop.id, name: stop.name },
  }));
}

async function fetchDepartures(
  providerId: ProviderId,
  stopId: string,
  mode: TransportMode,
  limit: number,
  maxMinutes: number
): Promise<{ departures: Departure[]; stopName: string } | null> {
  try {
    if (!isProviderAvailable(providerId)) {
      console.error(`${providerId} provider not available`);
      return null;
    }

    const provider = getProvider(providerId);
    const result = await provider.getDepartures({
      stopId,
      mode,
      limit,
      maxMinutes,
    });

    return {
      departures: result.departures,
      stopName: result.stop?.name || 'Unknown Stop',
    };
  } catch (error) {
    console.error(`Error fetching ${mode} departures from ${providerId}:`, error);
  }

  return null;
}

export default async function HomePage() {
  const settings = await getSettings();
  const enabledStops = getEnabledStops(settings);
  const fetchedAt = new Date().toISOString();
  const activeProvider = settings.activeProvider;

  // Fetch departures for all enabled stops in parallel
  const sections: ModeSection[] = await Promise.all(
    enabledStops.map(async ({ mode, stop }) => {
      const result = await fetchDepartures(
        activeProvider,
        stop.id,
        mode,
        settings.departuresPerMode + 2,
        settings.maxMinutes
      );

      if (result) {
        return {
          mode,
          stopId: stop.id,
          stopName: result.stopName,
          departures: result.departures,
          isLoading: false,
        };
      }

      return {
        mode,
        stopId: stop.id,
        stopName: stop.name,
        departures: [],
        isLoading: false,
        error: 'Failed to fetch',
      };
    })
  );

  return (
    <>
      {/* Meta refresh for no-JS browsers */}
      <noscript>
        <meta httpEquiv="refresh" content={String(settings.refreshInterval)} />
      </noscript>

      {/* Server-rendered departure board */}
      <ServerBoard
        sections={sections}
        settings={settings}
        fetchedAt={fetchedAt}
      />

      {/* Client-side enhancements (JS required) */}
      <ClientEnhancements
        initialSettings={settings}
        initialSections={sections}
        initialFetchedAt={fetchedAt}
      />
    </>
  );
}
