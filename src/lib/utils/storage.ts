/**
 * Storage utilities for persisting user settings
 *
 * Uses localStorage where available, with cookie fallback for
 * older devices and server-side rendering compatibility.
 */

import { Stop, TransportMode } from '@/lib/providers/types';
import { ProviderId } from '@/lib/providers';
import { DEFAULT_REFRESH_INTERVAL } from '@/lib/config';

/**
 * User's configured stops for each transport mode
 */
export interface StopConfig {
  stop: Stop;
  enabled: boolean;
  /**
   * Direction filter for this stop.
   * - undefined or empty array: show all directions
   * - populated array: only show departures in these directions
   */
  directionIds?: string[];
  /** Cached direction names for display (so we don't need to re-fetch) */
  directionNames?: Record<string, string>;
}

/**
 * Legacy user settings (for migration from single-stop format)
 */
interface LegacyUserSettings {
  tramStop?: StopConfig;
  trainStop?: StopConfig;
  busStop?: StopConfig;
}

/**
 * Legacy flat settings (for migration to per-provider format)
 * This is the format before multi-provider support
 */
interface LegacyFlatSettings {
  tramStops?: StopConfig[];
  trainStops?: StopConfig[];
  busStops?: StopConfig[];
}

/**
 * Per-provider stop configurations
 */
export interface ProviderSettings {
  /** Configured stops for trams (PTV only) */
  tramStops?: StopConfig[];
  /** Configured stops for trains */
  trainStops?: StopConfig[];
  /** Configured stops for buses */
  busStops?: StopConfig[];
  /** Configured stops for ferries (TfNSW only) */
  ferryStops?: StopConfig[];
  /** Configured stops for light rail (TfNSW only) */
  lightRailStops?: StopConfig[];
  /** Configured stops for coaches */
  coachStops?: StopConfig[];
}

/**
 * User settings stored locally
 */
export interface UserSettings {
  /** Currently active provider */
  activeProvider: ProviderId;
  /** Per-provider stop configurations */
  providers: Partial<Record<ProviderId, ProviderSettings>>;
  /** Refresh interval in seconds */
  refreshInterval: number;
  /** Maximum departures per mode */
  departuresPerMode: number;
  /** Maximum minutes to look ahead for departures */
  maxMinutes: number;
  /** Whether to show absolute times instead of relative */
  showAbsoluteTime: boolean;
  /** Whether to use nearby stops based on current location instead of configured stops */
  nearbyMode: boolean;
  /** Number of nearby stops to show per transport mode (default 1) */
  nearbyStopsPerMode: number;
  /** User's last known location (for auto-detection) */
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

const SETTINGS_KEY = 'next-departure-settings';
export const DEFAULT_SETTINGS: UserSettings = {
  activeProvider: 'ptv',
  providers: {},
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  departuresPerMode: 3,
  maxMinutes: 30,
  showAbsoluteTime: false,
  nearbyMode: false,
  nearbyStopsPerMode: 1,
};

/**
 * Detect default provider based on geographic coordinates
 * Victoria (Melbourne area) → ptv
 * NSW (Sydney area) → tfnsw
 */
export function detectProviderFromLocation(latitude: number, longitude: number): ProviderId {
  // Victoria: roughly lat -39 to -34, lng 141 to 150
  // NSW: roughly lat -37 to -28, lng 141 to 154
  // Melbourne: -37.8, 144.9
  // Sydney: -33.9, 151.2

  // Use simple distance-based detection to major cities
  const melbourneDistance = Math.sqrt(
    Math.pow(latitude - (-37.8136), 2) + Math.pow(longitude - 144.9631, 2)
  );
  const sydneyDistance = Math.sqrt(
    Math.pow(latitude - (-33.8688), 2) + Math.pow(longitude - 151.2093, 2)
  );

  // If closer to Sydney and within NSW bounds, use TfNSW
  if (sydneyDistance < melbourneDistance && latitude > -38 && latitude < -28 && longitude > 148) {
    return 'tfnsw';
  }

  // Default to PTV
  return 'ptv';
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cookie helper - get a cookie value
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/**
 * Cookie helper - set a cookie value
 * Uses a long expiry (1 year) for persistence
 */
function setCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;

  const maxAge = 365 * 24 * 60 * 60; // 1 year in seconds
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded};max-age=${maxAge};path=/;SameSite=Lax`;
}

/**
 * Cookie helper - delete a cookie
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;max-age=0;path=/`;
}

/**
 * Migrate old settings formats to current multi-provider format
 * Handles:
 * 1. Single-stop format (tramStop → tramStops)
 * 2. Flat multi-stop format (tramStops at top level → providers.ptv.tramStops)
 */
function migrateSettings(stored: UserSettings & LegacyUserSettings & LegacyFlatSettings): UserSettings {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const migrated: any = { ...stored };
  let needsSave = false;

  // Step 1: Migrate single-stop to multi-stop (very old format)
  if ('tramStop' in stored && stored.tramStop) {
    migrated.tramStops = migrated.tramStops || [];
    migrated.tramStops.push(stored.tramStop);
    delete migrated.tramStop;
    needsSave = true;
  }
  if ('trainStop' in stored && stored.trainStop) {
    migrated.trainStops = migrated.trainStops || [];
    migrated.trainStops.push(stored.trainStop);
    delete migrated.trainStop;
    needsSave = true;
  }
  if ('busStop' in stored && stored.busStop) {
    migrated.busStops = migrated.busStops || [];
    migrated.busStops.push(stored.busStop);
    delete migrated.busStop;
    needsSave = true;
  }

  // Step 2: Migrate flat format to per-provider format
  // Check if we have top-level stop arrays but no providers object
  const hasLegacyStops = 'tramStops' in migrated || 'trainStops' in migrated || 'busStops' in migrated;
  const hasProviders = 'providers' in migrated && typeof migrated.providers === 'object';

  if (hasLegacyStops && !hasProviders) {
    // Move existing stops to providers.ptv (they were all PTV before)
    const ptvSettings: ProviderSettings = {};

    if (migrated.tramStops?.length > 0) {
      ptvSettings.tramStops = migrated.tramStops;
      delete migrated.tramStops;
    }
    if (migrated.trainStops?.length > 0) {
      ptvSettings.trainStops = migrated.trainStops;
      delete migrated.trainStops;
    }
    if (migrated.busStops?.length > 0) {
      ptvSettings.busStops = migrated.busStops;
      delete migrated.busStops;
    }

    migrated.providers = { ptv: ptvSettings };
    migrated.activeProvider = 'ptv';
    needsSave = true;
  }

  // Step 3: Ensure required fields exist
  if (!migrated.activeProvider) {
    migrated.activeProvider = DEFAULT_SETTINGS.activeProvider;
    needsSave = true;
  }
  if (!migrated.providers) {
    migrated.providers = {};
    needsSave = true;
  }
  if (migrated.maxMinutes === undefined) {
    migrated.maxMinutes = DEFAULT_SETTINGS.maxMinutes;
    needsSave = true;
  }

  // Save migrated settings if changes were made
  if (needsSave && typeof window !== 'undefined') {
    // Defer save to avoid issues during load
    setTimeout(() => saveSettings(migrated as UserSettings), 0);
  }

  return migrated as UserSettings;
}

/**
 * Load settings from storage
 * Tries localStorage first, falls back to cookies for older browsers
 */
export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    // Try localStorage first
    if (isLocalStorageAvailable()) {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return migrateSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    }

    // Fall back to cookies
    const cookieData = getCookie(SETTINGS_KEY);
    if (cookieData) {
      const parsed = JSON.parse(cookieData);
      return migrateSettings({ ...DEFAULT_SETTINGS, ...parsed });
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save settings to storage
 * Saves to localStorage and cookies for maximum compatibility
 */
export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Don't save lastLocation to reduce storage size
  const { lastLocation: _lastLocation, ...settingsToSave } = settings;

  try {
    const json = JSON.stringify(settingsToSave);

    // Save to localStorage if available
    if (isLocalStorageAvailable()) {
      localStorage.setItem(SETTINGS_KEY, json);
    }

    // Also save to cookie as fallback (cookies have ~4KB limit, but settings are small)
    setCookie(SETTINGS_KEY, json);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Clear all settings
 */
export function clearSettings(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (isLocalStorageAvailable()) {
      localStorage.removeItem(SETTINGS_KEY);
    }
    deleteCookie(SETTINGS_KEY);
  } catch (error) {
    console.error('Failed to clear settings:', error);
  }
}

/**
 * Get the provider settings for the active provider
 */
export function getActiveProviderSettings(settings: UserSettings): ProviderSettings {
  return settings.providers[settings.activeProvider] || {};
}

/**
 * Get stops for a specific mode from the active provider
 */
export function getStopsForMode(
  settings: UserSettings,
  mode: TransportMode
): StopConfig[] {
  const providerSettings = getActiveProviderSettings(settings);
  switch (mode) {
    case 'tram':
      return providerSettings.tramStops || [];
    case 'train':
      return providerSettings.trainStops || [];
    case 'bus':
      return providerSettings.busStops || [];
    case 'ferry':
      return providerSettings.ferryStops || [];
    case 'light_rail':
      return providerSettings.lightRailStops || [];
    case 'coach':
      return providerSettings.coachStops || [];
    default:
      return [];
  }
}

/**
 * Set stops for a specific mode in the active provider
 */
export function setStopsForMode(
  settings: UserSettings,
  mode: TransportMode,
  configs: StopConfig[]
): UserSettings {
  const providerSettings = getActiveProviderSettings(settings);
  let updatedProviderSettings: ProviderSettings;

  switch (mode) {
    case 'tram':
      updatedProviderSettings = { ...providerSettings, tramStops: configs };
      break;
    case 'train':
      updatedProviderSettings = { ...providerSettings, trainStops: configs };
      break;
    case 'bus':
      updatedProviderSettings = { ...providerSettings, busStops: configs };
      break;
    case 'ferry':
      updatedProviderSettings = { ...providerSettings, ferryStops: configs };
      break;
    case 'light_rail':
      updatedProviderSettings = { ...providerSettings, lightRailStops: configs };
      break;
    case 'coach':
      updatedProviderSettings = { ...providerSettings, coachStops: configs };
      break;
    default:
      return settings;
  }

  return {
    ...settings,
    providers: {
      ...settings.providers,
      [settings.activeProvider]: updatedProviderSettings,
    },
  };
}

/**
 * Add a stop for a specific mode
 */
export function addStopForMode(
  settings: UserSettings,
  mode: TransportMode,
  config: StopConfig
): UserSettings {
  const existing = getStopsForMode(settings, mode);
  // Don't add if stop already exists
  if (existing.some(s => s.stop.id === config.stop.id)) {
    return settings;
  }
  return setStopsForMode(settings, mode, [...existing, config]);
}

/**
 * Remove a stop for a specific mode
 */
export function removeStopForMode(
  settings: UserSettings,
  mode: TransportMode,
  stopId: string
): UserSettings {
  const existing = getStopsForMode(settings, mode);
  return setStopsForMode(settings, mode, existing.filter(s => s.stop.id !== stopId));
}

/**
 * Toggle a stop's enabled state
 */
export function toggleStopEnabled(
  settings: UserSettings,
  mode: TransportMode,
  stopId: string
): UserSettings {
  const existing = getStopsForMode(settings, mode);
  const updated = existing.map(s =>
    s.stop.id === stopId ? { ...s, enabled: !s.enabled } : s
  );
  return setStopsForMode(settings, mode, updated);
}

/**
 * Update direction filter for a stop
 * @param directionIds - Array of direction IDs to filter to, or undefined/empty for all directions
 * @param directionNames - Map of direction ID to name for display
 */
export function updateStopDirections(
  settings: UserSettings,
  mode: TransportMode,
  stopId: string,
  directionIds: string[] | undefined,
  directionNames: Record<string, string>
): UserSettings {
  const existing = getStopsForMode(settings, mode);
  const updated = existing.map(s =>
    s.stop.id === stopId
      ? {
          ...s,
          directionIds: directionIds && directionIds.length > 0 ? directionIds : undefined,
          directionNames: Object.keys(directionNames).length > 0 ? directionNames : undefined,
        }
      : s
  );
  return setStopsForMode(settings, mode, updated);
}

/**
 * Enabled stop with direction filter info
 */
export interface EnabledStopInfo {
  mode: TransportMode;
  stop: Stop;
  directionIds?: string[];
  directionNames?: Record<string, string>;
}

/**
 * Get supported modes for a provider
 */
export function getSupportedModes(providerId: ProviderId): TransportMode[] {
  switch (providerId) {
    case 'ptv':
      return ['tram', 'train', 'bus', 'coach'];
    case 'tfnsw':
      return ['train', 'bus', 'ferry', 'light_rail', 'coach'];
    default:
      return ['train', 'bus'];
  }
}

/**
 * Get all enabled stops across all modes for the active provider
 */
export function getEnabledStops(settings: UserSettings): EnabledStopInfo[] {
  const stops: EnabledStopInfo[] = [];
  const providerSettings = getActiveProviderSettings(settings);

  const addStopsForMode = (mode: TransportMode, configs: StopConfig[] | undefined) => {
    for (const config of configs || []) {
      if (config.enabled) {
        stops.push({
          mode,
          stop: config.stop,
          directionIds: config.directionIds,
          directionNames: config.directionNames,
        });
      }
    }
  };

  addStopsForMode('tram', providerSettings.tramStops);
  addStopsForMode('train', providerSettings.trainStops);
  addStopsForMode('bus', providerSettings.busStops);
  addStopsForMode('ferry', providerSettings.ferryStops);
  addStopsForMode('light_rail', providerSettings.lightRailStops);
  addStopsForMode('coach', providerSettings.coachStops);

  return stops;
}

/**
 * Set the active provider
 */
export function setActiveProvider(
  settings: UserSettings,
  providerId: ProviderId
): UserSettings {
  return {
    ...settings,
    activeProvider: providerId,
  };
}
