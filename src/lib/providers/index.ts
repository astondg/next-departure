/**
 * Transit Provider Registry
 *
 * Central registry for all transit data providers.
 * Designed to be extensible - add new providers by implementing
 * the TransitProvider interface and registering them here.
 */

import { TransitProvider, ProviderConfig } from './types';
import { createPtvClient } from './ptv';

// Re-export common types
export * from './types';

/**
 * Available provider IDs
 */
export type ProviderId = 'ptv';
// Future providers: 'translink' | 'tfnsw' | 'transperth' | 'tfl' | etc.

/**
 * Provider factory function type
 */
type ProviderFactory = () => TransitProvider;

/**
 * Registry of available providers
 */
const PROVIDER_REGISTRY: Record<ProviderId, ProviderFactory> = {
  ptv: createPtvClient,
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
