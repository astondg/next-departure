/**
 * PTV API v3 Response Types
 *
 * These types match the actual PTV API responses.
 * Documentation: https://timetableapi.ptv.vic.gov.au/swagger/ui/index
 */

/**
 * PTV Route Types (transport modes)
 * 0 = Train, 1 = Tram, 2 = Bus, 3 = V/Line, 4 = Night Bus
 */
export const PTV_ROUTE_TYPES = {
  TRAIN: 0,
  TRAM: 1,
  BUS: 2,
  VLINE: 3,
  NIGHT_BUS: 4,
} as const;

export type PtvRouteType = (typeof PTV_ROUTE_TYPES)[keyof typeof PTV_ROUTE_TYPES];

/**
 * PTV API Departure object
 */
export interface PtvDeparture {
  stop_id: number;
  route_id: number;
  run_id: number;
  run_ref: string;
  direction_id: number;
  disruption_ids: number[];
  scheduled_departure_utc: string;
  estimated_departure_utc: string | null;
  at_platform: boolean;
  platform_number: string | null;
  flags: string;
  departure_sequence: number;
}

/**
 * PTV API Route object
 */
export interface PtvRoute {
  route_type: PtvRouteType;
  route_id: number;
  route_name: string;
  route_number: string;
  route_gtfs_id: string;
  geopath: unknown[];
}

/**
 * PTV API Direction object
 */
export interface PtvDirection {
  direction_id: number;
  direction_name: string;
  route_id: number;
  route_type: PtvRouteType;
}

/**
 * PTV API Run object
 */
export interface PtvRun {
  run_id: number;
  run_ref: string;
  route_id: number;
  route_type: PtvRouteType;
  final_stop_id: number;
  destination_name: string;
  status: string;
  direction_id: number;
  run_sequence: number;
  express_stop_count: number;
  vehicle_position: unknown | null;
  vehicle_descriptor: unknown | null;
  geopath: unknown[];
}

/**
 * PTV API Stop object
 */
export interface PtvStop {
  stop_distance?: number;
  stop_suburb: string;
  stop_name: string;
  stop_id: number;
  route_type: PtvRouteType;
  stop_latitude: number;
  stop_longitude: number;
  stop_landmark?: string;
  stop_sequence?: number;
}

/**
 * PTV API Disruption object
 */
export interface PtvDisruption {
  disruption_id: number;
  title: string;
  url: string;
  description: string;
  disruption_status: string;
  disruption_type: string;
  published_on: string;
  last_updated: string;
  from_date: string | null;
  to_date: string | null;
  routes: PtvRoute[];
  stops: PtvStop[];
  colour: string;
  display_on_board: boolean;
  display_status: boolean;
}

/**
 * PTV API Status object (included in all responses)
 */
export interface PtvStatus {
  version: string;
  health: number;
}

/**
 * PTV Departures API Response
 */
export interface PtvDeparturesResponse {
  departures: PtvDeparture[];
  stops: Record<string, PtvStop>;
  routes: Record<string, PtvRoute>;
  runs: Record<string, PtvRun>;
  directions: Record<string, PtvDirection>;
  disruptions: Record<string, PtvDisruption>;
  status: PtvStatus;
}

/**
 * PTV Stops Search API Response
 */
export interface PtvStopsResponse {
  stops: PtvStop[];
  status: PtvStatus;
}

/**
 * PTV Directions for Route API Response
 */
export interface PtvDirectionsResponse {
  directions: PtvDirection[];
  status: PtvStatus;
}
