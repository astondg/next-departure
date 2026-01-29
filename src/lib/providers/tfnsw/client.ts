/**
 * TfNSW (Transport for NSW) API Client
 *
 * Implements the TransitProvider interface for NSW public transport.
 * Supports trains, buses, ferries, light rail, and coach services.
 *
 * API Documentation: https://opendata.transport.nsw.gov.au/
 */

import {
  TransitProvider,
  ProviderConfig,
  DeparturesQuery,
  DeparturesResponse,
  Stop,
  Departure,
  TransportMode,
} from '../types';
import {
  TfnswDepartureResponse,
  TfnswStopFinderResponse,
  TfnswStopEvent,
  TfnswStopFinderLocation,
  TfnswProductClass,
  TFNSW_PRODUCT_CLASSES,
} from './types';

/**
 * Map TfNSW product classes to our generic transport modes
 */
const PRODUCT_CLASS_TO_MODE: Record<TfnswProductClass, TransportMode> = {
  [TFNSW_PRODUCT_CLASSES.TRAIN]: 'train',
  [TFNSW_PRODUCT_CLASSES.LIGHT_RAIL]: 'light_rail',
  [TFNSW_PRODUCT_CLASSES.BUS]: 'bus',
  [TFNSW_PRODUCT_CLASSES.COACH]: 'coach',
  [TFNSW_PRODUCT_CLASSES.FERRY]: 'ferry',
  [TFNSW_PRODUCT_CLASSES.SCHOOL_BUS]: 'bus',
};

/**
 * Map our generic transport modes to TfNSW product classes
 */
const MODE_TO_PRODUCT_CLASS: Record<TransportMode, TfnswProductClass | undefined> = {
  train: TFNSW_PRODUCT_CLASSES.TRAIN,
  light_rail: TFNSW_PRODUCT_CLASSES.LIGHT_RAIL,
  bus: TFNSW_PRODUCT_CLASSES.BUS,
  coach: TFNSW_PRODUCT_CLASSES.COACH,
  ferry: TFNSW_PRODUCT_CLASSES.FERRY,
  tram: undefined,
  metro: undefined,
};

/**
 * TfNSW API credentials
 */
export interface TfnswCredentials {
  apiKey: string;
}

/**
 * TfNSW Provider Configuration
 */
const TFNSW_CONFIG: ProviderConfig = {
  id: 'tfnsw',
  name: 'Transport for NSW',
  region: 'New South Wales',
  country: 'AU',
  supportedModes: ['train', 'bus', 'ferry', 'light_rail', 'coach'],
  supportsRealTime: true,
  baseUrl: 'https://api.transport.nsw.gov.au/v1/tp/',
};

/**
 * TfNSW API Client
 */
export class TfnswClient implements TransitProvider {
  readonly config = TFNSW_CONFIG;

  private credentials: TfnswCredentials;

  constructor(credentials: TfnswCredentials) {
    this.credentials = credentials;
  }

  /**
   * Make an authenticated request to the TfNSW API
   */
  private async request<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    // Add required parameters
    const queryParams = new URLSearchParams({
      outputFormat: 'rapidJSON',
      coordOutputFormat: 'EPSG:4326',
      ...params,
    });

    const url = `${this.config.baseUrl}${endpoint}?${queryParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `apikey ${this.credentials.apiKey}`,
      },
      // Cache for 30 seconds to avoid hammering the API
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      throw new Error(
        `TfNSW API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Convert TfNSW stop finder location to our generic Stop type
   */
  private convertStopFinderLocation(location: TfnswStopFinderLocation): Stop {
    const modes: TransportMode[] = [];

    if (location.productClasses) {
      for (const productClass of location.productClasses) {
        const mode = PRODUCT_CLASS_TO_MODE[productClass as TfnswProductClass];
        if (mode && !modes.includes(mode)) {
          modes.push(mode);
        }
      }
    }

    return {
      id: location.id,
      name: location.disassembledName || location.name,
      modes,
      location: location.coord
        ? {
            latitude: location.coord[1],
            longitude: location.coord[0],
          }
        : undefined,
    };
  }

  /**
   * Convert TfNSW stop event to our generic Departure type
   */
  private convertDeparture(stopEvent: TfnswStopEvent): Departure {
    const transportation = stopEvent.transportation;
    const productClass = transportation.product?.class;
    const mode = productClass
      ? PRODUCT_CLASS_TO_MODE[productClass] || 'bus'
      : 'bus';

    // Parse scheduled and estimated times
    const scheduledTime = stopEvent.departureTimePlanned;
    const estimatedTime = stopEvent.departureTimeEstimated || undefined;

    // Determine delay status
    let delayed = false;
    if (estimatedTime && scheduledTime) {
      const scheduled = new Date(scheduledTime);
      const estimated = new Date(estimatedTime);
      delayed = estimated > scheduled;
    }

    return {
      id: `${transportation.id}-${scheduledTime}`,
      routeId: transportation.id,
      routeName: transportation.number || transportation.disassembledName || transportation.name,
      routeDescription: transportation.description || transportation.name,
      destination: transportation.destination?.name || 'Unknown',
      direction: {
        id: transportation.destination?.id || 'unknown',
        name: transportation.destination?.name || 'Unknown',
      },
      scheduledTime,
      estimatedTime,
      platform: stopEvent.location.disassembledName || undefined,
      mode,
      isRealTime: !!estimatedTime,
      status: {
        cancelled: false,
        delayed,
      },
    };
  }

  /**
   * Fetch departures from a stop
   */
  async getDepartures(query: DeparturesQuery): Promise<DeparturesResponse> {
    // Build date/time parameters
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const timeStr = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM

    const params: Record<string, string> = {
      mode: 'direct',
      type_dm: 'stop',
      name_dm: query.stopId,
      depArrMacro: 'dep',
      itdDate: dateStr,
      itdTime: timeStr,
      TfNSWDM: 'true',
    };

    const response = await this.request<TfnswDepartureResponse>('departure_mon', params);

    if (!response.stopEvents || response.stopEvents.length === 0) {
      return {
        stop: {
          id: query.stopId,
          name: 'Unknown Stop',
          modes: [],
        },
        departures: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    // Extract stop info from first stop event
    const firstEvent = response.stopEvents[0];
    const stopInfo: Stop = {
      id: query.stopId,
      name: firstEvent.location.name,
      modes: [],
      location: firstEvent.location.coord
        ? {
            latitude: firstEvent.location.coord[1],
            longitude: firstEvent.location.coord[0],
          }
        : undefined,
    };

    // Convert and filter departures
    let departures = response.stopEvents.map((event) => this.convertDeparture(event));

    // Filter by mode if specified
    if (query.mode) {
      const productClass = MODE_TO_PRODUCT_CLASS[query.mode];
      if (productClass !== undefined) {
        departures = departures.filter((dep) => dep.mode === query.mode);
      }
    }

    // Filter by direction if specified
    if (query.directionId) {
      departures = departures.filter((dep) => dep.direction.id === query.directionId);
    }

    // Sort by departure time
    departures.sort((a, b) => {
      const timeA = a.estimatedTime || a.scheduledTime;
      const timeB = b.estimatedTime || b.scheduledTime;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    // Apply limit
    if (query.limit) {
      departures = departures.slice(0, query.limit);
    }

    // Filter by max minutes if specified
    if (query.maxMinutes) {
      const maxTime = new Date(now.getTime() + query.maxMinutes * 60 * 1000);
      departures = departures.filter((dep) => {
        const depTime = new Date(dep.estimatedTime || dep.scheduledTime);
        return depTime <= maxTime;
      });
    }

    // Collect unique modes from departures
    const modes = new Set<TransportMode>();
    departures.forEach((dep) => modes.add(dep.mode));
    stopInfo.modes = Array.from(modes);

    return {
      stop: stopInfo,
      departures,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Search for stops by name
   */
  async searchStops(searchQuery: string, mode?: TransportMode): Promise<Stop[]> {
    const params: Record<string, string> = {
      type_sf: 'any',
      name_sf: searchQuery,
      TfNSWSF: 'true',
    };

    const response = await this.request<TfnswStopFinderResponse>('stop_finder', params);

    if (!response.locations) {
      return [];
    }

    // Filter to only stop types
    let stops = response.locations
      .filter((loc) => loc.type === 'stop' || loc.type === 'platform')
      .map((loc) => this.convertStopFinderLocation(loc));

    // Filter by mode if specified
    if (mode) {
      stops = stops.filter((stop) => stop.modes.includes(mode));
    }

    return stops;
  }

  /**
   * Get details for a specific stop
   */
  async getStop(stopId: string, mode?: TransportMode): Promise<Stop | null> {
    const params: Record<string, string> = {
      type_sf: 'stop',
      name_sf: stopId,
      TfNSWSF: 'true',
    };

    try {
      const response = await this.request<TfnswStopFinderResponse>('stop_finder', params);

      if (!response.locations || response.locations.length === 0) {
        return null;
      }

      const location = response.locations[0];
      const stop = this.convertStopFinderLocation(location);

      // Filter modes if specified
      if (mode && !stop.modes.includes(mode)) {
        return null;
      }

      return stop;
    } catch {
      return null;
    }
  }
}

/**
 * Create a TfNSW client from environment variables
 */
export function createTfnswClient(): TfnswClient {
  const apiKey = process.env.TFNSW_API_KEY;

  if (!apiKey) {
    throw new Error(
      'TfNSW credentials not configured. Set TFNSW_API_KEY environment variable.'
    );
  }

  return new TfnswClient({ apiKey });
}
