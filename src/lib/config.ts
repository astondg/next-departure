/**
 * Application Configuration
 *
 * Centralized configuration with environment variable support.
 */

/**
 * Default auto-refresh interval in seconds.
 * Configurable via NEXT_PUBLIC_REFRESH_INTERVAL environment variable.
 * Defaults to 60 seconds.
 */
export const DEFAULT_REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_REFRESH_INTERVAL || '60',
  10
);
