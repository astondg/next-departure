/**
 * Storage utilities for persisting user settings
 *
 * Uses localStorage where available, with cookie fallback for
 * older devices and server-side rendering compatibility.
 */

import { Stop, TransportMode } from '@/lib/providers/types';

/**
 * User's configured stops for each transport mode
 */
export interface StopConfig {
  stop: Stop;
  enabled: boolean;
}

/**
 * User settings stored locally
 */
export interface UserSettings {
  /** Configured stop for trams */
  tramStop?: StopConfig;
  /** Configured stop for trains */
  trainStop?: StopConfig;
  /** Configured stop for buses */
  busStop?: StopConfig;
  /** Refresh interval in seconds */
  refreshInterval: number;
  /** Maximum departures per mode */
  departuresPerMode: number;
  /** Whether to show absolute times instead of relative */
  showAbsoluteTime: boolean;
  /** User's last known location (for auto-detection) */
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

const SETTINGS_KEY = 'next-departure-settings';
export const DEFAULT_SETTINGS: UserSettings = {
  refreshInterval: 30,
  departuresPerMode: 2,
  showAbsoluteTime: false,
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
 * Load settings from storage
 */
export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    if (isLocalStorageAvailable()) {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save settings to storage
 */
export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (isLocalStorageAvailable()) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
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
  } catch (error) {
    console.error('Failed to clear settings:', error);
  }
}

/**
 * Get the stop config for a specific mode
 */
export function getStopForMode(
  settings: UserSettings,
  mode: TransportMode
): StopConfig | undefined {
  switch (mode) {
    case 'tram':
      return settings.tramStop;
    case 'train':
      return settings.trainStop;
    case 'bus':
      return settings.busStop;
    default:
      return undefined;
  }
}

/**
 * Set the stop config for a specific mode
 */
export function setStopForMode(
  settings: UserSettings,
  mode: TransportMode,
  config: StopConfig | undefined
): UserSettings {
  switch (mode) {
    case 'tram':
      return { ...settings, tramStop: config };
    case 'train':
      return { ...settings, trainStop: config };
    case 'bus':
      return { ...settings, busStop: config };
    default:
      return settings;
  }
}

/**
 * Get all enabled stops
 */
export function getEnabledStops(settings: UserSettings): { mode: TransportMode; stop: Stop }[] {
  const stops: { mode: TransportMode; stop: Stop }[] = [];

  if (settings.tramStop?.enabled) {
    stops.push({ mode: 'tram', stop: settings.tramStop.stop });
  }
  if (settings.trainStop?.enabled) {
    stops.push({ mode: 'train', stop: settings.trainStop.stop });
  }
  if (settings.busStop?.enabled) {
    stops.push({ mode: 'bus', stop: settings.busStop.stop });
  }

  return stops;
}
