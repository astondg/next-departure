/**
 * TfNSW (Transport for NSW) Provider
 *
 * Re-exports all TfNSW-specific types and the client.
 */

export { TfnswClient, createTfnswClient, type TfnswCredentials } from './client';
export {
  TFNSW_PRODUCT_CLASSES,
  type TfnswProductClass,
  type TfnswLocation,
  type TfnswTransportation,
  type TfnswStopEvent,
  type TfnswStopFinderLocation,
  type TfnswDepartureResponse,
  type TfnswStopFinderResponse,
} from './types';
