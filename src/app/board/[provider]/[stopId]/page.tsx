/**
 * Departure Board Page
 *
 * Dynamic page that displays departures for a specific stop.
 * URL format: /board/{provider}/{stopId}?mode=tram&direction=1&refresh=30
 *
 * Optimized for e-ink displays with:
 * - Server-side rendering for initial data
 * - Client-side refresh for updates
 * - Meta refresh fallback for legacy devices
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import {
  getProvider,
  isProviderAvailable,
  ProviderId,
  TransportMode,
} from '@/lib/providers';
import { BoardClient } from './BoardClient';

interface PageProps {
  params: Promise<{
    provider: string;
    stopId: string;
  }>;
  searchParams: Promise<{
    mode?: string;
    direction?: string;
    route?: string;
    limit?: string;
    refresh?: string;
    title?: string;
  }>;
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { provider, stopId } = await params;
  const { title } = await searchParams;

  // Try to get stop name for title
  let stopName = `Stop ${stopId}`;
  try {
    if (isProviderAvailable(provider as ProviderId)) {
      const transitProvider = getProvider(provider as ProviderId);
      const stop = await transitProvider.getStop(stopId);
      if (stop) {
        stopName = stop.name;
      }
    }
  } catch {
    // Use fallback
  }

  const pageTitle = title || `${stopName} - Next Departure`;

  return {
    title: pageTitle,
    description: `Real-time departure information for ${stopName}`,
    // Prevent caching of HTML
    other: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  };
}

/**
 * Fetch initial departure data on the server
 */
async function getInitialData(
  provider: ProviderId,
  stopId: string,
  mode?: TransportMode,
  directionId?: string,
  routeId?: string,
  limit?: number
) {
  try {
    const transitProvider = getProvider(provider);
    return await transitProvider.getDepartures({
      stopId,
      mode,
      directionId,
      routeId,
      limit: limit || 10,
      maxMinutes: 120,
    });
  } catch (error) {
    console.error('Error fetching initial data:', error);
    return null;
  }
}

/**
 * Loading component
 */
function BoardSkeleton() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <header className="border-b-4 border-black p-4">
        <div className="h-9 w-64 bg-gray-200 animate-pulse" />
        <div className="h-4 w-32 bg-gray-200 animate-pulse mt-2" />
      </header>
      <main className="p-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-3 px-2 border-b-2 border-black"
          >
            <div className="h-8 w-8 bg-gray-200 animate-pulse" />
            <div className="h-8 w-16 bg-gray-200 animate-pulse" />
            <div className="h-6 flex-1 bg-gray-200 animate-pulse" />
            <div className="h-8 w-20 bg-gray-200 animate-pulse" />
          </div>
        ))}
      </main>
    </div>
  );
}

/**
 * Main page component
 */
export default async function BoardPage({ params, searchParams }: PageProps) {
  const { provider, stopId } = await params;
  const {
    mode,
    direction,
    route,
    limit,
    refresh,
    title,
  } = await searchParams;

  // Validate provider
  if (!isProviderAvailable(provider as ProviderId)) {
    notFound();
  }

  // Parse parameters
  const transportMode = mode as TransportMode | undefined;
  const refreshInterval = refresh ? parseInt(refresh, 10) : 30;
  const maxResults = limit ? parseInt(limit, 10) : 10;

  // Fetch initial data server-side
  const initialData = await getInitialData(
    provider as ProviderId,
    stopId,
    transportMode,
    direction,
    route,
    maxResults
  );

  if (!initialData) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <div className="text-center p-8 border-4 border-black">
          <h1 className="text-2xl font-bold">Unable to load departures</h1>
          <p className="mt-2">Please check the stop ID and try again</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Meta refresh for legacy devices (no JS) */}
      <noscript>
        {/* Using dangerouslySetInnerHTML to insert meta tag in noscript */}
        <meta httpEquiv="refresh" content={String(refreshInterval)} />
      </noscript>

      <Suspense fallback={<BoardSkeleton />}>
        <BoardClient
          provider={provider as ProviderId}
          stopId={stopId}
          initialData={initialData}
          mode={transportMode}
          directionId={direction}
          routeId={route}
          limit={maxResults}
          refreshInterval={refreshInterval}
          title={title}
        />
      </Suspense>
    </>
  );
}
