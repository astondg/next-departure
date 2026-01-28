/**
 * OG Image Endpoint for E-ink Displays
 *
 * Returns a PNG image of the departure board optimized for ESP32 e-ink displays.
 * Uses pure B/W colors with thick borders and large fonts.
 *
 * GET /api/og/board?stops=tram:1001,train:2001&width=800&height=480&limit=3&scale=2&orientation=landscape
 *
 * Query parameters:
 *   - stops: comma-separated mode:stopId pairs (required)
 *   - width: image width in pixels (default 800, max 1200)
 *   - height: image height in pixels (default 480, max 800)
 *   - orientation: 'landscape' (default) or 'portrait' - swaps width/height defaults
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

interface TimeInfo {
  display: string;
  isRealTime: boolean;
  delayMinutes: number;
}

function formatDepartureTime(
  scheduledTime: string,
  estimatedTime?: string,
  showAbsolute: boolean = false
): TimeInfo {
  const effectiveTime = estimatedTime || scheduledTime;
  const targetTime = new Date(effectiveTime);
  const now = new Date();

  // Calculate delay (positive = late, negative = early)
  let delayMinutes = 0;
  if (estimatedTime) {
    const scheduled = new Date(scheduledTime).getTime();
    const estimated = new Date(estimatedTime).getTime();
    delayMinutes = Math.round((estimated - scheduled) / 1000 / 60);
  }

  if (showAbsolute) {
    const hours = String(targetTime.getHours()).padStart(2, '0');
    const minutes = String(targetTime.getMinutes()).padStart(2, '0');
    return { display: `${hours}:${minutes}`, isRealTime: !!estimatedTime, delayMinutes };
  }

  const diffMs = targetTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 1000 / 60);

  let display: string;
  if (diffMinutes < 0) display = 'gone';
  else if (diffMinutes === 0) display = 'now';
  else if (diffMinutes < 60) display = `${diffMinutes}m`;
  else {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    display = minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
  }

  return { display, isRealTime: !!estimatedTime, delayMinutes };
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
        stopName: `${mode}:${stopId}`,
        departures: [],
        error: response.status === 404
          ? `Stop not found`
          : `API error (${response.status})`,
      };
    }

    const result = await response.json();

    // Check if stop data was returned
    if (!result.stop?.name) {
      return {
        mode,
        stopId,
        stopName: `${mode}:${stopId}`,
        departures: [],
        error: 'Invalid stop ID',
      };
    }

    // Filter out departed services (same logic as client/server dashboards)
    const now = new Date();
    const upcoming = (result.departures || []).filter((d: Departure) => {
      const time = new Date(d.estimatedTime || d.scheduledTime);
      const diffMinutes = Math.round((time.getTime() - now.getTime()) / 1000 / 60);
      return diffMinutes >= 0; // Filter out "gone" departures
    });

    return {
      mode,
      stopId,
      stopName: result.stop.name,
      departures: upcoming.slice(0, limit),
    };
  } catch (error) {
    console.error(`Error fetching ${mode}:${stopId}:`, error);
    return {
      mode,
      stopId,
      stopName: `${mode}:${stopId}`,
      departures: [],
      error: 'Connection failed',
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
  const orientation = searchParams.get('orientation') || 'landscape';
  const isPortrait = orientation === 'portrait';

  // Default dimensions based on orientation
  const defaultWidth = isPortrait ? 480 : 800;
  const defaultHeight = isPortrait ? 800 : 480;
  const maxWidth = isPortrait ? 800 : 1200;
  const maxHeight = isPortrait ? 1200 : 800;

  const baseWidth = Math.min(parseInt(searchParams.get('width') || String(defaultWidth), 10), maxWidth);
  const baseHeight = Math.min(parseInt(searchParams.get('height') || String(defaultHeight), 10), maxHeight);
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
  const stopRequests = parseStops(stopsParam);
  const [interBoldData, interRegularData, ...stopDataResults] = await Promise.all([
    interBold,
    interRegular,
    ...stopRequests.map(({ mode, stopId }) =>
      fetchStopDepartures(baseUrl, mode, stopId, limit, maxMinutes)
    ),
  ]);

  const stopData = stopDataResults as StopData[];
  const stopCount = stopData.length;

  // Calculate total content rows (headers + departures + gaps)
  const totalDepartures = stopData.reduce(
    (sum, stop) => sum + Math.max(stop.departures.length, 1), // At least 1 for "no departures" message
    0
  );
  const totalHeaders = stopCount;
  const totalGaps = stopCount - 1;

  // Dynamic layout: distribute available height across all rows
  const padding = Math.round(8 * scale);
  const sectionGap = Math.round(6 * scale);
  const borderWidth = Math.round(3 * scale);

  // Available height after padding and gaps
  const availableHeight = height - (padding * 2) - (sectionGap * totalGaps);

  // Headers take ~55% of row height, departures take full row height
  // Total "row units": headers count as 0.55, departures count as 1.0
  const headerRatio = 0.55;
  const totalRowUnits = (totalHeaders * headerRatio) + totalDepartures;

  // Calculate row height but cap it to reasonable maximums
  // Max row height: 70px at scale 1 (prevents giant text with few rows)
  // Min row height: 40px at scale 1 (ensures readability with many rows)
  const maxRowHeight = 70 * scale;
  const minRowHeight = 40 * scale;
  const calculatedRowHeight = availableHeight / totalRowUnits;
  const baseRowHeight = Math.min(Math.max(calculatedRowHeight, minRowHeight), maxRowHeight);

  const rowHeight = Math.round(baseRowHeight);
  const headerHeight = Math.round(baseRowHeight * headerRatio);

  // Scale fonts proportionally to row height
  // Base calculation uses unscaled reference (56px), then apply scale for resolution
  // Cap the row-based multiplier to prevent giant text with few rows
  const rowSizeMultiplier = Math.min(rowHeight / (56 * scale), 1.2);
  const fontScale = rowSizeMultiplier * scale;

  const fontSize = {
    modeLabel: Math.round(18 * fontScale),
    stopName: Math.round(16 * fontScale),
    routeNumber: Math.round(26 * fontScale),
    destination: Math.round(18 * fontScale),
    platform: Math.round(14 * fontScale),
    time: Math.round(30 * fontScale),
    message: Math.round(16 * fontScale),
  };

  const headerPadding = Math.round(6 * scale);

  // Route number width scales with font and orientation
  const routeNumWidth = Math.round(isPortrait ? 60 * fontScale : 72 * fontScale);
  const timeWidth = Math.round(isPortrait ? 70 * fontScale : 90 * fontScale);

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
              }}
            >
              {/* Stop header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  padding: `0 ${padding + 4}px`,
                  height: `${headerHeight}px`,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: `${fontSize.modeLabel}px`,
                    letterSpacing: '0.08em',
                    marginRight: `${Math.round(12 * fontScale)}px`,
                  }}
                >
                  {getModeLabel(stop.mode)}
                </span>
                <span
                  style={{
                    fontSize: `${fontSize.stopName}px`,
                    fontWeight: 400,
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
                    fontWeight: 400,
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
                    fontWeight: 400,
                    color: '#444444',
                  }}
                >
                  No departures
                </div>
              ) : (
                stop.departures.map((departure, depIndex) => {
                  const timeInfo = formatDepartureTime(
                    departure.scheduledTime,
                    departure.estimatedTime,
                    showAbsolute
                  );
                  const isDeparting = timeInfo.display === 'now';
                  const isTrain = departure.mode === 'train';

                  // Delay indicator text (compact for image)
                  const delayText = timeInfo.isRealTime
                    ? timeInfo.delayMinutes < -2
                      ? `${timeInfo.delayMinutes}`
                      : timeInfo.delayMinutes > 2
                      ? `+${timeInfo.delayMinutes}`
                      : '•' // Dot indicates live/on-time
                    : '';

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
                      {/* Route number - hide for trains (redundant with destination) */}
                      {!isTrain && (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: `${fontSize.routeNumber}px`,
                            width: `${routeNumWidth}px`,
                            textAlign: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {departure.routeName}
                        </span>
                      )}

                      {/* Destination */}
                      <span
                        style={{
                          flex: 1,
                          fontSize: `${fontSize.destination}px`,
                          fontWeight: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginLeft: isTrain ? '0' : `${Math.round(8 * fontScale)}px`,
                          marginRight: `${Math.round(8 * fontScale)}px`,
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
                            padding: `${Math.round(2 * fontScale)}px ${Math.round(6 * fontScale)}px`,
                            fontWeight: 700,
                            marginRight: `${Math.round(8 * fontScale)}px`,
                            flexShrink: 0,
                          }}
                        >
                          P{departure.platform}
                        </span>
                      )}

                      {/* Time with delay indicator */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          minWidth: `${timeWidth}px`,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: `${fontSize.time}px`,
                          }}
                        >
                          {timeInfo.display}
                        </span>
                        {delayText && (
                          <span
                            style={{
                              fontSize: `${Math.round(12 * fontScale)}px`,
                              fontWeight: 400,
                              opacity: 0.7,
                            }}
                          >
                            {delayText}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )
        )}
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
