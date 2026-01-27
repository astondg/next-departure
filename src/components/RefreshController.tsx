'use client';

/**
 * RefreshController Component
 *
 * Handles automatic data refresh with support for both modern browsers
 * and legacy devices like old Kindles.
 *
 * Refresh strategies:
 * 1. Modern: Uses JavaScript setInterval for smooth updates
 * 2. Fallback: Uses <meta http-equiv="refresh"> for devices without JS
 * 3. Visibility API: Pauses refresh when tab is hidden (battery saving)
 */

import { useEffect, useCallback, useRef, useState, ReactNode } from 'react';

interface RefreshControllerProps {
  /** Refresh interval in seconds */
  interval?: number;
  /** Callback to refresh data */
  onRefresh: () => Promise<void>;
  /** Enable meta refresh fallback for legacy devices */
  enableMetaRefresh?: boolean;
  /** Children to render */
  children: ReactNode;
}

/**
 * Hook to detect if JavaScript is working (for progressive enhancement)
 */
function useJsEnabled() {
  const [jsEnabled, setJsEnabled] = useState(false);

  useEffect(() => {
    setJsEnabled(true);
  }, []);

  return jsEnabled;
}

/**
 * Hook to detect page visibility
 */
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

export function RefreshController({
  interval = 30,
  onRefresh,
  enableMetaRefresh = true,
  children,
}: RefreshControllerProps) {
  const jsEnabled = useJsEnabled();
  const isVisible = usePageVisibility();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Initialize lastRefresh after hydration to avoid mismatch
  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  // Refresh handler with error handling
  const doRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  // Set up automatic refresh when JS is enabled and page is visible
  useEffect(() => {
    if (!jsEnabled || !isVisible) {
      // Clear any existing timeout when not visible
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      return;
    }

    // Schedule next refresh
    const scheduleRefresh = () => {
      refreshTimeoutRef.current = setTimeout(async () => {
        await doRefresh();
        scheduleRefresh(); // Schedule the next one
      }, interval * 1000);
    };

    scheduleRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [jsEnabled, isVisible, interval, doRefresh]);

  return (
    <>
      {/* Meta refresh fallback for devices without JavaScript (like old Kindles) */}
      {enableMetaRefresh && !jsEnabled && (
        <meta httpEquiv="refresh" content={String(interval)} />
      )}

      {/* Render children */}
      {children}

      {/* Hidden refresh status for debugging (visible in DOM, only after hydration) */}
      {jsEnabled && (
        <div
          data-refresh-status={isRefreshing ? 'refreshing' : 'idle'}
          data-last-refresh={lastRefresh?.toISOString()}
          data-js-enabled={jsEnabled}
          style={{ display: 'none' }}
        />
      )}
    </>
  );
}

/**
 * MetaRefresh component for server-side rendering
 *
 * Include this in your page's <head> to enable refresh for
 * devices that don't support JavaScript.
 */
export function MetaRefresh({ interval = 30 }: { interval?: number }) {
  return (
    <noscript>
      <meta httpEquiv="refresh" content={String(interval)} />
    </noscript>
  );
}
