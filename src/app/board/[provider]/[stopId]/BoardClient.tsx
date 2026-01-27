'use client';

/**
 * BoardClient Component
 *
 * Client-side wrapper for the departure board that handles:
 * - Automatic data refresh
 * - Real-time clock updates
 * - Error handling and recovery
 */

import { useState, useCallback, useEffect } from 'react';
import { DeparturesResponse, TransportMode } from '@/lib/providers/types';
import { ProviderId } from '@/lib/providers';
import { DepartureBoard } from '@/components/DepartureBoard';
import { RefreshController } from '@/components/RefreshController';

interface BoardClientProps {
  provider: ProviderId;
  stopId: string;
  initialData: DeparturesResponse;
  mode?: TransportMode;
  directionId?: string;
  routeId?: string;
  limit?: number;
  refreshInterval?: number;
  title?: string;
}

export function BoardClient({
  provider,
  stopId,
  initialData,
  mode,
  directionId,
  routeId,
  limit = 10,
  refreshInterval = 30,
  title,
}: BoardClientProps) {
  const [data, setData] = useState<DeparturesResponse>(initialData);
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  // Update clock every second for accurate "in X min" display
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Refresh data from API
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const params = new URLSearchParams({
        provider,
        stopId,
        limit: String(limit),
      });

      if (mode) params.set('mode', mode);
      if (directionId) params.set('directionId', directionId);
      if (routeId) params.set('routeId', routeId);

      const response = await fetch(`/api/departures?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const newData: DeparturesResponse = await response.json();
      setData(newData);
    } catch (err) {
      console.error('Failed to refresh data:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh');
      // Keep showing stale data
    } finally {
      setIsLoading(false);
    }
  }, [provider, stopId, mode, directionId, routeId, limit]);

  return (
    <RefreshController
      interval={refreshInterval}
      onRefresh={refreshData}
      enableMetaRefresh={true}
    >
      <DepartureBoard
        data={data}
        title={title}
        filterMode={mode}
        now={now}
        error={error}
        isLoading={isLoading}
        groupByDirection={true}
      />
    </RefreshController>
  );
}
