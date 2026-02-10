/**
 * Nearby Stops API Route
 *
 * Find stops near a geographic location.
 *
 * GET /api/nearby?provider=ptv&lat=-37.8136&lon=144.9631&mode=tram&distance=500
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isProviderAvailable,
  ProviderId,
  TransportMode,
  Stop,
} from '@/lib/providers';
import { createPtvClient } from '@/lib/providers/ptv';
import { createTfnswClient } from '@/lib/providers/tfnsw/client';

/**
 * GET /api/nearby
 *
 * Find stops near a location
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get('provider') as ProviderId | null;
    const latStr = searchParams.get('lat');
    const lonStr = searchParams.get('lon');
    const mode = searchParams.get('mode') as TransportMode | null;
    const distanceStr = searchParams.get('distance');

    // Validate required params
    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required parameter: provider' },
        { status: 400 }
      );
    }
    if (!latStr || !lonStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat, lon' },
        { status: 400 }
      );
    }

    // Parse coordinates
    const latitude = parseFloat(latStr);
    const longitude = parseFloat(lonStr);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Validate coordinate ranges (roughly for Australia)
    if (latitude < -45 || latitude > -10 || longitude < 110 || longitude > 155) {
      return NextResponse.json(
        { error: 'Coordinates outside supported region (Australia)' },
        { status: 400 }
      );
    }

    // Check provider is available
    if (!isProviderAvailable(provider)) {
      return NextResponse.json(
        { error: `Provider not available: ${provider}` },
        { status: 400 }
      );
    }

    // Parse optional distance
    const maxDistance = distanceStr ? parseInt(distanceStr, 10) : 500;

    let stops: (Stop & { distance: number })[];

    switch (provider) {
      case 'ptv': {
        const ptvClient = createPtvClient();
        stops = await ptvClient.getNearbyStops(
          latitude,
          longitude,
          mode || undefined,
          maxDistance
        );
        break;
      }
      case 'tfnsw': {
        const tfnswClient = createTfnswClient();
        stops = await tfnswClient.getNearbyStops(
          latitude,
          longitude,
          mode || undefined,
          maxDistance
        );
        break;
      }
      default:
        return NextResponse.json(
          { error: `Provider ${provider} does not support nearby search` },
          { status: 400 }
        );
    }

    return NextResponse.json(
      { stops },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error finding nearby stops:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to find nearby stops', details: message },
      { status: 500 }
    );
  }
}
