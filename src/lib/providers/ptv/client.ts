/**
 * PTV (Public Transport Victoria) API Client
 *
 * Implements the TransitProvider interface for Victorian public transport.
 * Supports trains, trams, buses, V/Line, and Night Bus services.
 *
 * API Documentation: https://timetableapi.ptv.vic.gov.au/swagger/ui/index
 */

import {
  TransitProvider,
  ProviderConfig,
  DeparturesQuery,
  DeparturesResponse,
  Stop,
  Departure,
  TransportMode,
  Direction,
} from '../types';
import { signPtvRequest, buildQueryString } from './signature';
import {
  PtvDeparturesResponse,
  PtvStopsResponse,
  PtvRouteType,
  PTV_ROUTE_TYPES,
  PtvStop,
  PtvDeparture,
  PtvRoute,
  PtvRun,
  PtvDirection,
} from './types';

/**
 * Map our generic transport modes to PTV route types
 */
const MODE_TO_ROUTE_TYPE: Record<TransportMode, PtvRouteType | undefined> = {
  train: PTV_ROUTE_TYPES.TRAIN,
  tram: PTV_ROUTE_TYPES.TRAM,
  bus: PTV_ROUTE_TYPES.BUS,
  coach: PTV_ROUTE_TYPES.VLINE,
  metro: undefined,
  ferry: undefined,
  light_rail: undefined,
};

/**
 * Map PTV route types to our generic transport modes
 */
const ROUTE_TYPE_TO_MODE: Record<PtvRouteType, TransportMode> = {
  [PTV_ROUTE_TYPES.TRAIN]: 'train',
  [PTV_ROUTE_TYPES.TRAM]: 'tram',
  [PTV_ROUTE_TYPES.BUS]: 'bus',
  [PTV_ROUTE_TYPES.VLINE]: 'coach',
  [PTV_ROUTE_TYPES.NIGHT_BUS]: 'bus',
};

/**
 * PTV API credentials
 */
export interface PtvCredentials {
  devId: string;
  apiKey: string;
}

/**
 * PTV Provider Configuration
 */
const PTV_CONFIG: ProviderConfig = {
  id: 'ptv',
  name: 'Public Transport Victoria',
  region: 'Victoria',
  country: 'AU',
  supportedModes: ['train', 'tram', 'bus', 'coach'],
  supportsRealTime: true,
  baseUrl: 'https://timetableapi.ptv.vic.gov.au',
};

/**
 * PTV API Client
 */
export class PtvClient implements TransitProvider {
  readonly config = PTV_CONFIG;

  private credentials: PtvCredentials;

  constructor(credentials: PtvCredentials) {
    this.credentials = credentials;
  }

  /**
   * Make a signed request to the PTV API
   */
  private async request<T>(path: string): Promise<T> {
    const url = signPtvRequest(
      path,
      this.credentials.devId,
      this.credentials.apiKey,
      this.config.baseUrl
    );

    console.log('[PTV API] Request URL:', url);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      // Cache for 30 seconds to avoid hammering the API
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[PTV API] Error response:', errorBody);
      throw new Error(
        `PTV API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Convert PTV stop to our generic Stop type
   */
  private convertStop(ptvStop: PtvStop): Stop {
    return {
      id: String(ptvStop.stop_id),
      name: ptvStop.stop_name,
      modes: [ROUTE_TYPE_TO_MODE[ptvStop.route_type]],
      location: {
        latitude: ptvStop.stop_latitude,
        longitude: ptvStop.stop_longitude,
      },
    };
  }

  /**
   * Convert PTV departure to our generic Departure type
   */
  private convertDeparture(
    ptvDeparture: PtvDeparture,
    routes: Record<string, PtvRoute>,
    runs: Record<string, PtvRun>,
    directions: Record<string, PtvDirection>
  ): Departure {
    const route = routes[String(ptvDeparture.route_id)];
    const run = runs[ptvDeparture.run_ref];
    const direction = directions[String(ptvDeparture.direction_id)];

    const mode = route
      ? ROUTE_TYPE_TO_MODE[route.route_type]
      : 'bus';

    return {
      id: `${ptvDeparture.run_ref}-${ptvDeparture.scheduled_departure_utc}`,
      routeId: String(ptvDeparture.route_id),
      routeName: route?.route_number || route?.route_name || 'Unknown',
      routeDescription: route?.route_name,
      destination: run?.destination_name || direction?.direction_name || 'Unknown',
      direction: {
        id: String(ptvDeparture.direction_id),
        name: direction?.direction_name || 'Unknown',
      },
      scheduledTime: ptvDeparture.scheduled_departure_utc,
      estimatedTime: ptvDeparture.estimated_departure_utc || undefined,
      platform: ptvDeparture.platform_number || undefined,
      mode,
      isRealTime: !!ptvDeparture.estimated_departure_utc,
      status: {
        cancelled: ptvDeparture.flags?.includes('CAN') || false,
        delayed:
          !!ptvDeparture.estimated_departure_utc &&
          new Date(ptvDeparture.estimated_departure_utc) >
            new Date(ptvDeparture.scheduled_departure_utc),
      },
    };
  }

  /**
   * Fetch departures from a stop
   */
  async getDepartures(query: DeparturesQuery): Promise<DeparturesResponse> {
    const routeType = query.mode
      ? MODE_TO_ROUTE_TYPE[query.mode]
      : undefined;

    if (query.mode && routeType === undefined) {
      throw new Error(`Unsupported transport mode for PTV: ${query.mode}`);
    }

    // Build the API path
    // If we have a specific route type, use that endpoint
    // Otherwise, we need to query each route type separately
    const routeTypes =
      routeType !== undefined
        ? [routeType]
        : [
            PTV_ROUTE_TYPES.TRAIN,
            PTV_ROUTE_TYPES.TRAM,
            PTV_ROUTE_TYPES.BUS,
          ];

    const allDepartures: Departure[] = [];
    let stopInfo: Stop | null = null;

    for (const rt of routeTypes) {
      const queryParams = buildQueryString({
        direction_id: query.directionId,
        max_results: query.limit || 10,
        expand: 'all', // Include stops, routes, runs, directions, disruptions
        include_cancelled: 'false',
      });

      const path = `/v3/departures/route_type/${rt}/stop/${query.stopId}${queryParams}`;

      try {
        const response = await this.request<PtvDeparturesResponse>(path);

        // Get stop info from first response
        if (!stopInfo && response.stops) {
          const ptvStop = Object.values(response.stops)[0];
          if (ptvStop) {
            stopInfo = this.convertStop(ptvStop);
          }
        }

        // Convert departures
        const departures = response.departures.map((dep) =>
          this.convertDeparture(
            dep,
            response.routes,
            response.runs,
            response.directions
          )
        );

        allDepartures.push(...departures);
      } catch (error) {
        // Log but continue with other route types
        console.error(`Error fetching route type ${rt}:`, error);
      }
    }

    // Sort all departures by time
    allDepartures.sort((a, b) => {
      const timeA = a.estimatedTime || a.scheduledTime;
      const timeB = b.estimatedTime || b.scheduledTime;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    // Apply limit across all departures
    const limitedDepartures = query.limit
      ? allDepartures.slice(0, query.limit)
      : allDepartures;

    // Filter by max minutes if specified
    const now = new Date();
    const filteredDepartures = query.maxMinutes
      ? limitedDepartures.filter((dep) => {
          const depTime = new Date(dep.estimatedTime || dep.scheduledTime);
          const minutesUntil = (depTime.getTime() - now.getTime()) / 1000 / 60;
          return minutesUntil <= query.maxMinutes!;
        })
      : limitedDepartures;

    return {
      stop: stopInfo || {
        id: query.stopId,
        name: 'Unknown Stop',
        modes: [],
      },
      departures: filteredDepartures,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Search for stops by name
   * Note: PTV API requires a minimum of 3 characters for search
   */
  async searchStops(searchQuery: string, mode?: TransportMode): Promise<Stop[]> {
    // PTV API requires minimum 3 characters
    if (searchQuery.length < 3) {
      return [];
    }

    const routeTypes = mode
      ? MODE_TO_ROUTE_TYPE[mode] !== undefined
        ? [MODE_TO_ROUTE_TYPE[mode]!]
        : []
      : [
          PTV_ROUTE_TYPES.TRAIN,
          PTV_ROUTE_TYPES.TRAM,
          PTV_ROUTE_TYPES.BUS,
        ];

    const queryParams = buildQueryString({
      route_types: routeTypes.join(','),
    });

    const path = `/v3/search/${encodeURIComponent(searchQuery)}${queryParams}`;
    const response = await this.request<PtvStopsResponse>(path);

    return response.stops.map((stop) => this.convertStop(stop));
  }

  /**
   * Get details for a specific stop
   */
  async getStop(stopId: string, mode?: TransportMode): Promise<Stop | null> {
    const routeType = mode ? MODE_TO_ROUTE_TYPE[mode] : PTV_ROUTE_TYPES.TRAM;

    if (routeType === undefined) {
      return null;
    }

    const path = `/v3/stops/${stopId}/route_type/${routeType}`;

    try {
      const response = await this.request<{ stop: PtvStop }>(path);
      return this.convertStop(response.stop);
    } catch {
      return null;
    }
  }

  /**
   * Get directions for a route (useful for filtering departures)
   */
  async getDirections(routeId: string): Promise<Direction[]> {
    const path = `/v3/directions/route/${routeId}`;
    const response = await this.request<{ directions: PtvDirection[] }>(path);

    return response.directions.map((dir) => ({
      id: String(dir.direction_id),
      name: dir.direction_name,
    }));
  }

  /**
   * Find stops near a geographic location
   *
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param mode - Optional transport mode filter
   * @param maxDistance - Maximum distance in meters (default 500)
   * @returns Nearby stops sorted by distance
   */
  async getNearbyStops(
    latitude: number,
    longitude: number,
    mode?: TransportMode,
    maxDistance: number = 500
  ): Promise<(Stop & { distance: number })[]> {
    const routeTypes = mode
      ? MODE_TO_ROUTE_TYPE[mode] !== undefined
        ? [MODE_TO_ROUTE_TYPE[mode]!]
        : []
      : [
          PTV_ROUTE_TYPES.TRAIN,
          PTV_ROUTE_TYPES.TRAM,
          PTV_ROUTE_TYPES.BUS,
        ];

    const allStops: (Stop & { distance: number })[] = [];

    for (const routeType of routeTypes) {
      const queryParams = buildQueryString({
        route_types: routeType,
        max_distance: maxDistance,
        max_results: 10,
      });

      const path = `/v3/stops/location/${latitude},${longitude}${queryParams}`;

      try {
        const response = await this.request<PtvStopsResponse>(path);

        const stops = response.stops.map((stop) => ({
          ...this.convertStop(stop),
          distance: stop.stop_distance || 0,
        }));

        allStops.push(...stops);
      } catch (error) {
        console.error(`Error fetching nearby stops for route type ${routeType}:`, error);
      }
    }

    // Sort by distance and remove duplicates (same stop might serve multiple modes)
    const uniqueStops = new Map<string, (Stop & { distance: number })>();
    for (const stop of allStops) {
      const existing = uniqueStops.get(stop.id);
      if (!existing || stop.distance < existing.distance) {
        uniqueStops.set(stop.id, stop);
      }
    }

    return Array.from(uniqueStops.values()).sort((a, b) => a.distance - b.distance);
  }
}

/**
 * Create a PTV client from environment variables
 */
export function createPtvClient(): PtvClient {
  const devId = process.env.PTV_DEV_ID;
  const apiKey = process.env.PTV_API_KEY;

  if (!devId || !apiKey) {
    throw new Error(
      'PTV credentials not configured. Set PTV_DEV_ID and PTV_API_KEY environment variables.'
    );
  }

  return new PtvClient({ devId, apiKey });
}
