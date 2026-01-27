/**
 * Time formatting utilities for departure displays
 *
 * Provides "in X min" style formatting optimized for quick scanning
 * on e-ink displays.
 */

/**
 * Format a departure time relative to now
 *
 * @param isoTime - ISO 8601 timestamp (e.g., "2024-01-15T10:30:00Z")
 * @param now - Current time (defaults to new Date())
 * @returns Formatted string like "now", "1 min", "5 min", "1 hr 5 min", etc.
 *
 * @example
 * ```ts
 * formatRelativeTime("2024-01-15T10:35:00Z") // "5 min" (if now is 10:30)
 * formatRelativeTime("2024-01-15T10:30:30Z") // "now" (if within 1 minute)
 * formatRelativeTime("2024-01-15T11:45:00Z") // "1 hr 15 min" (if now is 10:30)
 * ```
 */
export function formatRelativeTime(
  isoTime: string,
  now: Date = new Date()
): string {
  const targetTime = new Date(isoTime);
  const diffMs = targetTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 1000 / 60);

  // Already departed
  if (diffMinutes < 0) {
    return 'gone';
  }

  // Departing now (within 1 minute)
  if (diffMinutes === 0) {
    return 'now';
  }

  // Less than 1 hour
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }

  // 1 hour or more
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

/**
 * Format a time for display (e.g., "10:30")
 *
 * @param isoTime - ISO 8601 timestamp
 * @param timezone - Optional timezone (defaults to local)
 * @returns Formatted time string like "10:30"
 */
export function formatTime(isoTime: string, timezone?: string): string {
  const date = new Date(isoTime);
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}

/**
 * Format scheduled vs estimated time for display
 *
 * Shows the estimated time if available, with scheduled time as fallback.
 * Indicates delay status if there's a significant difference.
 *
 * @param scheduledTime - ISO 8601 scheduled time
 * @param estimatedTime - ISO 8601 estimated time (optional)
 * @param now - Current time (defaults to new Date())
 * @returns Object with formatted time and status
 */
export function formatDepartureTime(
  scheduledTime: string,
  estimatedTime?: string,
  now: Date = new Date()
): {
  relative: string;
  absolute: string;
  isRealTime: boolean;
  delayMinutes: number;
} {
  const effectiveTime = estimatedTime || scheduledTime;

  // Calculate delay
  let delayMinutes = 0;
  if (estimatedTime) {
    const scheduled = new Date(scheduledTime).getTime();
    const estimated = new Date(estimatedTime).getTime();
    delayMinutes = Math.round((estimated - scheduled) / 1000 / 60);
  }

  return {
    relative: formatRelativeTime(effectiveTime, now),
    absolute: formatTime(effectiveTime),
    isRealTime: !!estimatedTime,
    delayMinutes,
  };
}

/**
 * Get a CSS class based on delay status
 */
export function getDelayClass(delayMinutes: number): string {
  if (delayMinutes <= 0) {
    return 'on-time';
  }
  if (delayMinutes <= 2) {
    return 'slight-delay';
  }
  if (delayMinutes <= 5) {
    return 'moderate-delay';
  }
  return 'major-delay';
}

/**
 * Format "last updated" time
 */
export function formatLastUpdated(isoTime: string): string {
  const date = new Date(isoTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  if (diffSeconds < 60) {
    return 'just now';
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  return formatTime(isoTime);
}
