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
import { UserSettings, DEFAULT_SETTINGS } from '@/lib/utils/storage';
import { getProvider, isProviderAvailable } from '@/lib/providers';

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
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decoded) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  return DEFAULT_SETTINGS;
}

function getEnabledStops(settings: UserSettings): { mode: TransportMode; stop: { id: string; name: string } }[] {
  const stops: { mode: TransportMode; stop: { id: string; name: string } }[] = [];

  for (const config of settings.tramStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'tram', stop: config.stop });
    }
  }
  for (const config of settings.trainStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'train', stop: config.stop });
    }
  }
  for (const config of settings.busStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'bus', stop: config.stop });
    }
  }

  return stops;
}

async function fetchDepartures(
  stopId: string,
  mode: TransportMode,
  limit: number,
  maxMinutes: number
): Promise<{ departures: Departure[]; stopName: string } | null> {
  try {
    if (!isProviderAvailable('ptv')) {
      console.error('PTV provider not available');
      return null;
    }

    const provider = getProvider('ptv');
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
    console.error(`Error fetching ${mode} departures:`, error);
  }

  return null;
}

export default async function HomePage() {
  const settings = await getSettings();
  const enabledStops = getEnabledStops(settings);
  const fetchedAt = new Date().toISOString();

  // Fetch departures for all enabled stops in parallel
  const sections: ModeSection[] = await Promise.all(
    enabledStops.map(async ({ mode, stop }) => {
      const result = await fetchDepartures(
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
