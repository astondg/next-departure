/**
 * Transit Provider Registry
 *
 * Central registry for all transit data providers.
 * Designed to be extensible - add new providers by implementing
 * the TransitProvider interface and registering them here.
 */

import { TransitProvider, ProviderConfig } from './types';
import { createPtvClient } from './ptv';
import { createTfnswClient } from './tfnsw';

// Re-export common types
export * from './types';

/**
 * Available provider IDs
 */
export type ProviderId = 'ptv' | 'tfnsw';
// Future providers: 'translink' | 'transperth' | 'tfl' | etc.

/**
 * Provider factory function type
 */
type ProviderFactory = () => TransitProvider;

/**
 * Registry of available providers
 */
const PROVIDER_REGISTRY: Record<ProviderId, ProviderFactory> = {
  ptv: createPtvClient,
  tfnsw: createTfnswClient,
};

/**
 * Provider metadata for display purposes
 */
export const PROVIDER_INFO: Record<ProviderId, Omit<ProviderConfig, 'baseUrl'>> = {
  ptv: {
    id: 'ptv',
    name: 'Public Transport Victoria',
    region: 'Victoria',
    country: 'AU',
    supportedModes: ['train', 'tram', 'bus', 'coach'],
    supportsRealTime: true,
  },
  tfnsw: {
    id: 'tfnsw',
    name: 'Transport for NSW',
    region: 'New South Wales',
    country: 'AU',
    supportedModes: ['train', 'bus', 'ferry', 'light_rail', 'coach'],
    supportsRealTime: true,
  },
};

/**
 * Get a provider instance by ID
 */
export function getProvider(id: ProviderId): TransitProvider {
  const factory = PROVIDER_REGISTRY[id];
  if (!factory) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return factory();
}

/**
 * Check if a provider is available (has required credentials)
 */
export function isProviderAvailable(id: ProviderId): boolean {
  switch (id) {
    case 'ptv':
      return !!(process.env.PTV_DEV_ID && process.env.PTV_API_KEY);
    case 'tfnsw':
      return !!process.env.TFNSW_API_KEY;
    default:
      return false;
  }
}

/**
 * List all registered providers
 */
export function listProviders(): ProviderId[] {
  return Object.keys(PROVIDER_REGISTRY) as ProviderId[];
}

/**
 * List providers that are currently available (configured)
 */
export function listAvailableProviders(): ProviderId[] {
  return listProviders().filter(isProviderAvailable);
}
