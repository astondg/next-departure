/**
 * Storage utilities for persisting user settings
 *
 * Uses localStorage where available, with cookie fallback for
 * older devices and server-side rendering compatibility.
 */

import { Stop, TransportMode } from '@/lib/providers/types';
import { DEFAULT_REFRESH_INTERVAL } from '@/lib/config';

/**
 * User's configured stops for each transport mode
 */
export interface StopConfig {
  stop: Stop;
  enabled: boolean;
}

/**
 * Legacy user settings (for migration)
 */
interface LegacyUserSettings {
  tramStop?: StopConfig;
  trainStop?: StopConfig;
  busStop?: StopConfig;
}

/**
 * User settings stored locally
 */
export interface UserSettings {
  /** Configured stops for trams (array for multi-stop support) */
  tramStops?: StopConfig[];
  /** Configured stops for trains (array for multi-stop support) */
  trainStops?: StopConfig[];
  /** Configured stops for buses (array for multi-stop support) */
  busStops?: StopConfig[];
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
  /** User's last known location (for auto-detection) */
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

const SETTINGS_KEY = 'next-departure-settings';
export const DEFAULT_SETTINGS: UserSettings = {
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  departuresPerMode: 3,
  maxMinutes: 30,
  showAbsoluteTime: false,
  nearbyMode: false,
};

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
 * Migrate old single-stop format to new multi-stop format
 */
function migrateSettings(stored: UserSettings & LegacyUserSettings): UserSettings {
  const migrated = { ...stored };
  let needsSave = false;

  // Migrate tramStop -> tramStops
  if ('tramStop' in stored && stored.tramStop && !stored.tramStops) {
    migrated.tramStops = [stored.tramStop];
    delete (migrated as LegacyUserSettings).tramStop;
    needsSave = true;
  }

  // Migrate trainStop -> trainStops
  if ('trainStop' in stored && stored.trainStop && !stored.trainStops) {
    migrated.trainStops = [stored.trainStop];
    delete (migrated as LegacyUserSettings).trainStop;
    needsSave = true;
  }

  // Migrate busStop -> busStops
  if ('busStop' in stored && stored.busStop && !stored.busStops) {
    migrated.busStops = [stored.busStop];
    delete (migrated as LegacyUserSettings).busStop;
    needsSave = true;
  }

  // Apply new defaults for missing maxMinutes
  if (migrated.maxMinutes === undefined) {
    migrated.maxMinutes = DEFAULT_SETTINGS.maxMinutes;
    needsSave = true;
  }

  // Save migrated settings if changes were made
  if (needsSave && typeof window !== 'undefined') {
    // Defer save to avoid issues during load
    setTimeout(() => saveSettings(migrated), 0);
  }

  return migrated;
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
 * Get stops for a specific mode (array)
 */
export function getStopsForMode(
  settings: UserSettings,
  mode: TransportMode
): StopConfig[] {
  switch (mode) {
    case 'tram':
      return settings.tramStops || [];
    case 'train':
      return settings.trainStops || [];
    case 'bus':
      return settings.busStops || [];
    default:
      return [];
  }
}

/**
 * Set stops for a specific mode (array)
 */
export function setStopsForMode(
  settings: UserSettings,
  mode: TransportMode,
  configs: StopConfig[]
): UserSettings {
  switch (mode) {
    case 'tram':
      return { ...settings, tramStops: configs };
    case 'train':
      return { ...settings, trainStops: configs };
    case 'bus':
      return { ...settings, busStops: configs };
    default:
      return settings;
  }
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
 * Get all enabled stops across all modes
 */
export function getEnabledStops(settings: UserSettings): { mode: TransportMode; stop: Stop }[] {
  const stops: { mode: TransportMode; stop: Stop }[] = [];

  for (const config of settings.tramStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'tram', stop: config.stop });
    }
  }
  for (const config of settings.trainStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'train', stop: config.stop });
    }
  }
  for (const config of settings.busStops || []) {
    if (config.enabled) {
      stops.push({ mode: 'bus', stop: config.stop });
    }
  }

  return stops;
}
