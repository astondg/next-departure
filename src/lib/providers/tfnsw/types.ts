/**
 * TfNSW API Response Types
 *
 * These types match the Transport for NSW Trip Planner API responses.
 * Documentation: https://opendata.transport.nsw.gov.au/
 */

/**
 * TfNSW Product Classes (transport modes)
 * 1 = Train, 4 = Light Rail, 5 = Bus, 7 = Coach, 9 = Ferry, 11 = School Bus
 */
export const TFNSW_PRODUCT_CLASSES = {
  TRAIN: 1,
  LIGHT_RAIL: 4,
  BUS: 5,
  COACH: 7,
  FERRY: 9,
  SCHOOL_BUS: 11,
} as const;

export type TfnswProductClass =
  (typeof TFNSW_PRODUCT_CLASSES)[keyof typeof TFNSW_PRODUCT_CLASSES];

/**
 * TfNSW Location object (used for stops and destinations)
 */
export interface TfnswLocation {
  id: string;
  name: string;
  disassembledName?: string;
  type: string;
  coord?: [number, number]; // [longitude, latitude]
  parent?: {
    id: string;
    name: string;
    type: string;
  };
}

/**
 * TfNSW Transportation object (route/line info)
 */
export interface TfnswTransportation {
  id: string;
  name: string;
  disassembledName?: string;
  number: string;
  iconId: number;
  description?: string;
  product?: {
    class: TfnswProductClass;
    name: string;
    iconId: number;
  };
  operator?: {
    id: string;
    name: string;
  };
  destination?: {
    id: string;
    name: string;
    type: string;
  };
  origin?: {
    id: string;
    name: string;
    type: string;
  };
}

/**
 * TfNSW Stop Event (a single departure)
 */
export interface TfnswStopEvent {
  isRealtimeControlled?: boolean;
  departureTimePlanned: string;
  departureTimeEstimated?: string;
  arrivalTimePlanned?: string;
  arrivalTimeEstimated?: string;
  transportation: TfnswTransportation;
  location: TfnswLocation;
  coord?: [number, number];
  properties?: {
    WheelchairAccess?: string;
    RealtimeTripId?: string;
  };
}

/**
 * TfNSW Stop Finder Location result
 */
export interface TfnswStopFinderLocation {
  id: string;
  name: string;
  disassembledName?: string;
  type: string;
  coord?: [number, number];
  parent?: {
    id: string;
    name: string;
    type: string;
  };
  productClasses?: TfnswProductClass[];
  matchQuality?: number;
  isBest?: boolean;
  modes?: number[];
}

/**
 * TfNSW Departure Monitor API Response
 */
export interface TfnswDepartureResponse {
  version: string;
  systemMessages?: Array<{
    type: string;
    module: string;
    code: number;
    text: string;
  }>;
  stopEvents?: TfnswStopEvent[];
}

/**
 * TfNSW Stop Finder API Response
 */
export interface TfnswStopFinderResponse {
  version: string;
  systemMessages?: Array<{
    type: string;
    module: string;
    code: number;
    text: string;
  }>;
  locations?: TfnswStopFinderLocation[];
}
