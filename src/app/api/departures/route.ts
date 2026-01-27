/**
 * Departures API Route
 *
 * Fetches departure data from transit providers.
 * Keeps API credentials secure on the server side.
 *
 * GET /api/departures?provider=ptv&stopId=1234&mode=tram&limit=10
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProvider,
  isProviderAvailable,
  ProviderId,
  TransportMode,
} from '@/lib/providers';

/**
 * Query parameters for the departures endpoint
 */
interface DeparturesParams {
  provider: ProviderId;
  stopId: string;
  mode?: TransportMode;
  directionId?: string;
  routeId?: string;
  limit?: number;
  maxMinutes?: number;
}

/**
 * Parse and validate query parameters
 */
function parseParams(searchParams: URLSearchParams): DeparturesParams | { error: string } {
  const provider = searchParams.get('provider') as ProviderId | null;
  const stopId = searchParams.get('stopId');
  const mode = searchParams.get('mode') as TransportMode | null;
  const directionId = searchParams.get('directionId');
  const routeId = searchParams.get('routeId');
  const limitStr = searchParams.get('limit');
  const maxMinutesStr = searchParams.get('maxMinutes');

  // Validate required params
  if (!provider) {
    return { error: 'Missing required parameter: provider' };
  }
  if (!stopId) {
    return { error: 'Missing required parameter: stopId' };
  }

  // Check provider is available
  if (!isProviderAvailable(provider)) {
    return { error: `Provider not available: ${provider}. Check environment variables.` };
  }

  // Parse optional numeric params
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  const maxMinutes = maxMinutesStr ? parseInt(maxMinutesStr, 10) : undefined;

  if (limitStr && (isNaN(limit!) || limit! < 1)) {
    return { error: 'Invalid limit parameter' };
  }
  if (maxMinutesStr && (isNaN(maxMinutes!) || maxMinutes! < 1)) {
    return { error: 'Invalid maxMinutes parameter' };
  }

  return {
    provider,
    stopId,
    mode: mode || undefined,
    directionId: directionId || undefined,
    routeId: routeId || undefined,
    limit: limit || 10,
    maxMinutes: maxMinutes || 120,
  };
}

/**
 * GET /api/departures
 *
 * Fetch departures from a transit stop
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = parseParams(searchParams);

    // Return validation errors
    if ('error' in params) {
      return NextResponse.json({ error: params.error }, { status: 400 });
    }

    // Get the provider and fetch departures
    const provider = getProvider(params.provider);
    const departures = await provider.getDepartures({
      stopId: params.stopId,
      mode: params.mode,
      directionId: params.directionId,
      routeId: params.routeId,
      limit: params.limit,
      maxMinutes: params.maxMinutes,
    });

    // Return with cache headers for client-side caching
    return NextResponse.json(departures, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error fetching departures:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch departures', details: message },
      { status: 500 }
    );
  }
}
