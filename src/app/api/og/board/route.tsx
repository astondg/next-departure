/**
 * OG Image Endpoint for E-ink Displays
 *
 * Returns a PNG image of the departure board optimized for ESP32 e-ink displays.
 * Uses pure B/W colors with thick borders and large fonts.
 *
 * GET /api/og/board?stops=tram:1001,train:2001&width=800&height=480&limit=3
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { TransportMode, Departure } from '@/lib/providers/types';

export const runtime = 'edge';

interface StopData {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  error?: string;
}

function getModeLabel(mode: TransportMode): string {
  return mode.toUpperCase();
}

function formatDepartureTime(
  scheduledTime: string,
  estimatedTime?: string,
  showAbsolute: boolean = false
): string {
  const effectiveTime = estimatedTime || scheduledTime;
  const targetTime = new Date(effectiveTime);
  const now = new Date();

  if (showAbsolute) {
    const hours = String(targetTime.getHours()).padStart(2, '0');
    const minutes = String(targetTime.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const diffMs = targetTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 1000 / 60);

  if (diffMinutes < 0) return 'gone';
  if (diffMinutes === 0) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
}

async function fetchStopDepartures(
  baseUrl: string,
  mode: TransportMode,
  stopId: string,
  limit: number,
  maxMinutes: number
): Promise<StopData> {
  try {
    const params = new URLSearchParams({
      provider: 'ptv',
      stopId,
      mode,
      limit: String(limit + 2),
      maxMinutes: String(maxMinutes),
    });

    const response = await fetch(`${baseUrl}/api/departures?${params.toString()}`);

    if (!response.ok) {
      return {
        mode,
        stopId,
        stopName: 'Error',
        departures: [],
        error: 'API error',
      };
    }

    const result = await response.json();

    // Filter out departed services
    const now = new Date();
    const upcoming = (result.departures || []).filter((d: Departure) => {
      const time = new Date(d.estimatedTime || d.scheduledTime);
      return time.getTime() >= now.getTime() - 60000;
    });

    return {
      mode,
      stopId,
      stopName: result.stop?.name || 'Unknown Stop',
      departures: upcoming.slice(0, limit),
    };
  } catch (error) {
    console.error(`Error fetching ${mode}:${stopId}:`, error);
    return {
      mode,
      stopId,
      stopName: 'Error',
      departures: [],
      error: 'Failed to fetch',
    };
  }
}

function parseStops(stopsParam: string): { mode: TransportMode; stopId: string }[] {
  return stopsParam.split(',').map((pair) => {
    const [mode, stopId] = pair.split(':');
    return { mode: mode as TransportMode, stopId };
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const { searchParams } = url;

  // Parse query parameters
  const stopsParam = searchParams.get('stops');
  const width = Math.min(parseInt(searchParams.get('width') || '800', 10), 1200);
  const height = Math.min(parseInt(searchParams.get('height') || '480', 10), 800);
  const limit = Math.min(parseInt(searchParams.get('limit') || '3', 10), 5);
  const maxMinutes = Math.min(parseInt(searchParams.get('maxMinutes') || '30', 10), 120);
  const showAbsolute = searchParams.get('showAbsolute') === 'true';

  if (!stopsParam) {
    return new Response('Missing required parameter: stops', { status: 400 });
  }

  // Parse stops and fetch departures in parallel
  const stopRequests = parseStops(stopsParam);
  const stopData = await Promise.all(
    stopRequests.map(({ mode, stopId }) =>
      fetchStopDepartures(baseUrl, mode, stopId, limit, maxMinutes)
    )
  );

  // Calculate layout
  const headerHeight = 36;
  const rowHeight = 48;
  const sectionGap = 8;
  const stopCount = stopData.length;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          padding: '8px',
        }}
      >
        {stopData.map((stop, stopIndex) => (
          <div
            key={`${stop.mode}-${stop.stopId}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginBottom: stopIndex < stopCount - 1 ? `${sectionGap}px` : '0',
              flex: 1,
            }}
          >
            {/* Stop header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#000000',
                color: '#ffffff',
                padding: '6px 12px',
                height: `${headerHeight}px`,
              }}
            >
              <span
                style={{
                  fontWeight: 'bold',
                  fontSize: '18px',
                  letterSpacing: '0.1em',
                  marginRight: '12px',
                }}
              >
                {getModeLabel(stop.mode)}
              </span>
              <span
                style={{
                  fontSize: '16px',
                  opacity: 0.85,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {stop.stopName}
              </span>
            </div>

            {/* Departures */}
            {stop.error ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: `${rowHeight}px`,
                  borderBottom: '2px solid #000000',
                  fontSize: '16px',
                  color: '#666666',
                }}
              >
                {stop.error}
              </div>
            ) : stop.departures.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: `${rowHeight}px`,
                  borderBottom: '2px solid #000000',
                  fontSize: '16px',
                  color: '#666666',
                }}
              >
                No departures
              </div>
            ) : (
              stop.departures.map((departure, depIndex) => {
                const timeStr = formatDepartureTime(
                  departure.scheduledTime,
                  departure.estimatedTime,
                  showAbsolute
                );
                const isDeparting = timeStr === 'now';

                return (
                  <div
                    key={departure.id || depIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: `${rowHeight}px`,
                      padding: '0 12px',
                      borderBottom: '2px solid #000000',
                      backgroundColor: isDeparting ? '#000000' : '#ffffff',
                      color: isDeparting ? '#ffffff' : '#000000',
                    }}
                  >
                    {/* Route number */}
                    <span
                      style={{
                        fontWeight: 'bold',
                        fontSize: '24px',
                        width: '64px',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {departure.routeName}
                    </span>

                    {/* Destination */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: '18px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginLeft: '8px',
                        marginRight: '8px',
                      }}
                    >
                      {departure.destination}
                    </span>

                    {/* Platform */}
                    {departure.platform && (
                      <span
                        style={{
                          fontSize: '14px',
                          border: '2px solid currentColor',
                          padding: '2px 6px',
                          fontWeight: 'bold',
                          marginRight: '8px',
                          flexShrink: 0,
                        }}
                      >
                        P{departure.platform}
                      </span>
                    )}

                    {/* Time */}
                    <span
                      style={{
                        fontWeight: 'bold',
                        fontSize: '28px',
                        minWidth: '80px',
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {timeStr}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    ),
    {
      width,
      height,
      headers: {
        'Cache-Control': 'public, max-age=30',
      },
    }
  );
}
