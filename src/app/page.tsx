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

  if (settings.tramStop?.enabled) {
    stops.push({ mode: 'tram', stop: settings.tramStop.stop });
  }
  if (settings.trainStop?.enabled) {
    stops.push({ mode: 'train', stop: settings.trainStop.stop });
  }
  if (settings.busStop?.enabled) {
    stops.push({ mode: 'bus', stop: settings.busStop.stop });
  }

  return stops;
}

async function fetchDepartures(
  stopId: string,
  mode: TransportMode,
  limit: number
): Promise<{ departures: Departure[]; stopName: string } | null> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const params = new URLSearchParams({
      provider: 'ptv',
      stopId,
      mode,
      limit: String(limit),
    });

    const response = await fetch(`${baseUrl}/api/departures?${params}`, {
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      return {
        departures: data.departures || [],
        stopName: data.stop?.name || 'Unknown Stop',
      };
    }
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
        settings.departuresPerMode + 2
      );

      if (result) {
        return {
          mode,
          stopName: result.stopName,
          departures: result.departures,
          isLoading: false,
        };
      }

      return {
        mode,
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
