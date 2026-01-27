/**
 * Common types for transit data providers
 * Designed to be extensible across different transit systems worldwide
 */

/**
 * Transport mode - extensible enum for different transit types
 */
export type TransportMode =
  | 'train'
  | 'tram'
  | 'bus'
  | 'ferry'
  | 'metro'
  | 'light_rail'
  | 'coach';

/**
 * Direction of travel - can be customized per stop
 */
export interface Direction {
  id: string;
  name: string;
  /** Optional short name for display (e.g., "City" vs "Towards City") */
  shortName?: string;
}

/**
 * A single departure from a stop
 */
export interface Departure {
  /** Unique identifier for this departure */
  id: string;

  /** The route/line identifier (e.g., "Route 96", "Sandringham Line") */
  routeId: string;

  /** Display name for the route (e.g., "96", "Sandringham") */
  routeName: string;

  /** Full route description if available */
  routeDescription?: string;

  /** Destination/terminus name */
  destination: string;

  /** Direction of travel */
  direction: Direction;

  /** Scheduled departure time (ISO 8601) */
  scheduledTime: string;

  /** Estimated/real-time departure time if available (ISO 8601) */
  estimatedTime?: string;

  /** Platform/stop number if applicable */
  platform?: string;

  /** Transport mode */
  mode: TransportMode;

  /** Whether real-time data is available for this departure */
  isRealTime: boolean;

  /** Status flags */
  status?: {
    /** Is the service cancelled? */
    cancelled?: boolean;
    /** Is the service delayed? */
    delayed?: boolean;
    /** Any disruption/alert message */
    alert?: string;
  };
}

/**
 * A transit stop/station
 */
export interface Stop {
  /** Provider-specific stop ID */
  id: string;

  /** Human-readable stop name */
  name: string;

  /** Optional stop number/code */
  code?: string;

  /** Transport modes served at this stop */
  modes: TransportMode[];

  /** Geographic coordinates */
  location?: {
    latitude: number;
    longitude: number;
  };

  /** Available directions from this stop */
  directions?: Direction[];
}

/**
 * Response from a departures query
 */
export interface DeparturesResponse {
  /** The stop these departures are from */
  stop: Stop;

  /** List of upcoming departures */
  departures: Departure[];

  /** When this data was fetched (ISO 8601) */
  fetchedAt: string;

  /** Provider-specific metadata */
  meta?: Record<string, unknown>;
}

/**
 * Query parameters for fetching departures
 */
export interface DeparturesQuery {
  /** Stop ID to fetch departures for */
  stopId: string;

  /** Transport mode to filter by (optional) */
  mode?: TransportMode;

  /** Direction ID to filter by (optional) */
  directionId?: string;

  /** Route ID to filter by (optional) */
  routeId?: string;

  /** Maximum number of departures to return */
  limit?: number;

  /** Maximum minutes into the future to look */
  maxMinutes?: number;
}

/**
 * Configuration for a transit provider
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;

  /** Human-readable provider name */
  name: string;

  /** Region/location this provider covers */
  region: string;

  /** Country code (ISO 3166-1 alpha-2) */
  country: string;

  /** Transport modes supported by this provider */
  supportedModes: TransportMode[];

  /** Whether this provider supports real-time data */
  supportsRealTime: boolean;

  /** API base URL */
  baseUrl: string;
}

/**
 * Interface that all transit providers must implement
 */
export interface TransitProvider {
  /** Provider configuration */
  readonly config: ProviderConfig;

  /**
   * Fetch departures from a stop
   */
  getDepartures(query: DeparturesQuery): Promise<DeparturesResponse>;

  /**
   * Search for stops by name or location
   */
  searchStops(query: string, mode?: TransportMode): Promise<Stop[]>;

  /**
   * Get details for a specific stop
   */
  getStop(stopId: string, mode?: TransportMode): Promise<Stop | null>;
}
