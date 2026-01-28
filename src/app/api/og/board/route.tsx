/**
 * OG Image Endpoint for E-ink Displays
 *
 * Returns a PNG image of the departure board optimized for ESP32 e-ink displays.
 * Uses pure B/W colors with thick borders and large fonts.
 *
 * GET /api/og/board?stops=tram:1001,train:2001&width=800&height=480&limit=3&scale=2
 *
 * Query parameters:
 *   - stops: comma-separated mode:stopId pairs (required)
 *   - width: image width in pixels (default 800, max 1200)
 *   - height: image height in pixels (default 480, max 800)
 *   - limit: max departures per stop (default 3, max 5)
 *   - maxMinutes: time window in minutes (default 30, max 120)
 *   - showAbsolute: show absolute times instead of relative (default false)
 *   - scale: render at higher resolution for crispness (default 1, max 3)
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { TransportMode, Departure } from '@/lib/providers/types';

export const runtime = 'edge';

// Load Inter font for crisp rendering
const interBold = fetch(
  new URL('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff', import.meta.url)
).then((res) => res.arrayBuffer());

const interRegular = fetch(
  new URL('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff', import.meta.url)
).then((res) => res.arrayBuffer());

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
  const baseWidth = Math.min(parseInt(searchParams.get('width') || '800', 10), 1200);
  const baseHeight = Math.min(parseInt(searchParams.get('height') || '480', 10), 800);
  const limit = Math.min(parseInt(searchParams.get('limit') || '3', 10), 5);
  const maxMinutes = Math.min(parseInt(searchParams.get('maxMinutes') || '30', 10), 120);
  const showAbsolute = searchParams.get('showAbsolute') === 'true';
  const scale = Math.min(Math.max(parseFloat(searchParams.get('scale') || '1'), 1), 3);

  // Apply scale for higher resolution rendering
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);

  if (!stopsParam) {
    return new Response('Missing required parameter: stops', { status: 400 });
  }

  // Load fonts in parallel with departure data
  const [interBoldData, interRegularData, ...stopDataResults] = await Promise.all([
    interBold,
    interRegular,
    ...parseStops(stopsParam).map(({ mode, stopId }) =>
      fetchStopDepartures(baseUrl, mode, stopId, limit, maxMinutes)
    ),
  ]);

  const stopData = stopDataResults as StopData[];

  // Calculate layout - scale all dimensions
  const headerHeight = Math.round(44 * scale);
  const rowHeight = Math.round(56 * scale);
  const sectionGap = Math.round(10 * scale);
  const stopCount = stopData.length;

  // Font sizes scaled for crispness
  const fontSize = {
    modeLabel: Math.round(20 * scale),
    stopName: Math.round(18 * scale),
    routeNumber: Math.round(28 * scale),
    destination: Math.round(20 * scale),
    platform: Math.round(16 * scale),
    time: Math.round(32 * scale),
    message: Math.round(18 * scale),
  };

  // Border and spacing scaled
  const borderWidth = Math.round(3 * scale);
  const padding = Math.round(10 * scale);
  const headerPadding = Math.round(8 * scale);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          padding: `${padding}px`,
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
                padding: `${headerPadding}px ${padding + 4}px`,
                height: `${headerHeight}px`,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: `${fontSize.modeLabel}px`,
                  letterSpacing: '0.1em',
                  marginRight: `${Math.round(14 * scale)}px`,
                }}
              >
                {getModeLabel(stop.mode)}
              </span>
              <span
                style={{
                  fontSize: `${fontSize.stopName}px`,
                  fontWeight: 500,
                  opacity: 0.9,
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
                  borderBottom: `${borderWidth}px solid #000000`,
                  fontSize: `${fontSize.message}px`,
                  fontWeight: 500,
                  color: '#444444',
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
                  borderBottom: `${borderWidth}px solid #000000`,
                  fontSize: `${fontSize.message}px`,
                  fontWeight: 500,
                  color: '#444444',
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
                      padding: `0 ${padding + 4}px`,
                      borderBottom: `${borderWidth}px solid #000000`,
                      backgroundColor: isDeparting ? '#000000' : '#ffffff',
                      color: isDeparting ? '#ffffff' : '#000000',
                    }}
                  >
                    {/* Route number */}
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: `${fontSize.routeNumber}px`,
                        width: `${Math.round(72 * scale)}px`,
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
                        fontSize: `${fontSize.destination}px`,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginLeft: `${Math.round(10 * scale)}px`,
                        marginRight: `${Math.round(10 * scale)}px`,
                      }}
                    >
                      {departure.destination}
                    </span>

                    {/* Platform */}
                    {departure.platform && (
                      <span
                        style={{
                          fontSize: `${fontSize.platform}px`,
                          border: `${borderWidth}px solid currentColor`,
                          padding: `${Math.round(3 * scale)}px ${Math.round(8 * scale)}px`,
                          fontWeight: 700,
                          marginRight: `${Math.round(10 * scale)}px`,
                          flexShrink: 0,
                        }}
                      >
                        P{departure.platform}
                      </span>
                    )}

                    {/* Time */}
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: `${fontSize.time}px`,
                        minWidth: `${Math.round(90 * scale)}px`,
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
      fonts: [
        {
          name: 'Inter',
          data: interBoldData,
          style: 'normal',
          weight: 700,
        },
        {
          name: 'Inter',
          data: interRegularData,
          style: 'normal',
          weight: 400,
        },
      ],
      headers: {
        'Cache-Control': 'public, max-age=30',
      },
    }
  );
}
