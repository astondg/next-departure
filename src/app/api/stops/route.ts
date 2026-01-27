/**
 * Stops Search API Route
 *
 * Search for transit stops by name.
 *
 * GET /api/stops?provider=ptv&query=flinders&mode=train
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProvider,
  isProviderAvailable,
  ProviderId,
  TransportMode,
} from '@/lib/providers';

/**
 * GET /api/stops
 *
 * Search for stops by name
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get('provider') as ProviderId | null;
    const query = searchParams.get('query');
    const mode = searchParams.get('mode') as TransportMode | null;

    // Validate required params
    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required parameter: provider' },
        { status: 400 }
      );
    }
    if (!query) {
      return NextResponse.json(
        { error: 'Missing required parameter: query' },
        { status: 400 }
      );
    }
    if (query.length < 3) {
      return NextResponse.json(
        { stops: [], message: 'Search query must be at least 3 characters' },
        { status: 200 }
      );
    }

    // Check provider is available
    if (!isProviderAvailable(provider)) {
      return NextResponse.json(
        { error: `Provider not available: ${provider}` },
        { status: 400 }
      );
    }

    // Search for stops
    const transitProvider = getProvider(provider);
    const stops = await transitProvider.searchStops(query, mode || undefined);

    return NextResponse.json(
      { stops },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error searching stops:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to search stops', details: message },
      { status: 500 }
    );
  }
}
