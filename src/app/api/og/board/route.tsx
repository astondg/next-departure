/**
 * OG Image Endpoint for E-ink Displays
 *
 * Returns a PNG image of the departure board optimized for ESP32 e-ink displays.
 * Uses pure B/W colors with thick borders and large fonts.
 *
 * GET /api/og/board?stops=tram:1001,train:2001:5&width=800&height=480&limit=3&scale=2&orientation=landscape
 *
 * Query parameters:
 *   - stops: comma-separated mode:stopId[:directionIds] (required, directionIds optional, use + for multiple: train:1001:5+12)
 *   - width: image width in pixels (default 800, max 1200)
 *   - height: image height in pixels (default 480, max 800)
 *   - orientation: 'landscape' (default) or 'portrait' - swaps width/height defaults
 *   - limit: max departures per stop (default 3, max 5)
 *   - maxMinutes: time window in minutes (default 30, max 120)
 *   - showAbsolute: show absolute times instead of relative (default false)
 *   - scale: render at higher resolution for crispness (default 1, max 3)
 *   - temp: temperature in Celsius from device sensor (optional, e.g., "21.5")
 *   - humidity: relative humidity percentage from device sensor (optional, e.g., "45")
 *   - battery: battery level percentage from device sensor (optional, e.g., "87")
 *   - sidebar: enable sidebar layout with weather panel (default false, e.g., "true")
 *             When enabled, displays 2/3 timetable + 1/3 weather sidebar
 *   - lat: latitude for weather data and timezone (e.g., "-37.8136")
 *   - lon: longitude for weather data and timezone (e.g., "144.9631")
 *   - tz: timezone for "Updated" timestamp (e.g., "Australia/Melbourne"). Falls back to auto-detect from lat/lon, then UTC.
 *   - invert: invert colors for dark mode e-ink displays (default false, e.g., "true")
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { TransportMode, Departure } from "@/lib/providers/types";

export const runtime = "edge";

// Load Inter fonts from local bundle (committed to repo).
// Local fonts are co-located with the edge function — zero network overhead on cold starts.
// Falls back to Google Fonts CDN if local files are missing.
const interBold = fetch(
  new URL("./fonts/Inter-Bold.woff", import.meta.url),
)
  .then((res) => {
    if (!res.ok) throw new Error("local font missing");
    return res.arrayBuffer();
  })
  .catch(() =>
    fetch(
      "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff",
    ).then((res) => res.arrayBuffer()),
  );

const interRegular = fetch(
  new URL("./fonts/Inter-Regular.woff", import.meta.url),
)
  .then((res) => {
    if (!res.ok) throw new Error("local font missing");
    return res.arrayBuffer();
  })
  .catch(() =>
    fetch(
      "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff",
    ).then((res) => res.arrayBuffer()),
  );

interface StopData {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  error?: string;
}

interface WeatherData {
  timezone: string;
  rain: {
    willRain: boolean;
    hour: number | null; // Hour (0-23) when rain is expected, null if no rain
    probability: number | null; // Probability percentage at that hour
  };
}

// Precipitation probability threshold (30%) - based on NWS "scattered" category
// and research showing this is where risk-averse people start bringing umbrellas
const RAIN_PROBABILITY_THRESHOLD = 30;

async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  try {
    // Fetch hourly precipitation probability for today with auto timezone
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability&timezone=auto&forecast_days=1`;
    const response = await fetch(url, {
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`Weather API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const timezone = data.timezone || "UTC";
    const probabilities: number[] =
      data.hourly?.precipitation_probability || [];

    // Find first hour from now where probability exceeds threshold
    const now = new Date();
    // Convert to local hour using the timezone from the response
    const localTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone }),
    );
    const currentHour = localTime.getHours();

    for (let i = currentHour; i < probabilities.length && i < 24; i++) {
      if (probabilities[i] >= RAIN_PROBABILITY_THRESHOLD) {
        return {
          timezone,
          rain: {
            willRain: true,
            hour: i,
            probability: probabilities[i],
          },
        };
      }
    }

    return {
      timezone,
      rain: {
        willRain: false,
        hour: null,
        probability: null,
      },
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
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
  showAbsolute: boolean = false,
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
    const hours = String(targetTime.getHours()).padStart(2, "0");
    const minutes = String(targetTime.getMinutes()).padStart(2, "0");
    return {
      display: `${hours}:${minutes}`,
      isRealTime: !!estimatedTime,
      delayMinutes,
    };
  }

  const diffMs = targetTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 1000 / 60);

  let display: string;
  if (diffMinutes < 0) display = "gone";
  else if (diffMinutes === 0) display = "now";
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
  maxMinutes: number,
  directionIds?: string[],
): Promise<StopData> {
  try {
    // Fetch more if filtering by direction (to ensure we get enough after filtering)
    const fetchLimit =
      directionIds && directionIds.length > 0 ? (limit + 2) * 3 : limit + 2;

    const params = new URLSearchParams({
      provider: "ptv",
      stopId,
      mode,
      limit: String(fetchLimit),
      maxMinutes: String(maxMinutes),
    });

    const response = await fetch(
      `${baseUrl}/api/departures?${params.toString()}`,
      {
        cache: "no-store", // Always fetch fresh data for the image
      },
    );

    if (!response.ok) {
      return {
        mode,
        stopId,
        stopName: `${mode}:${stopId}`,
        departures: [],
        error:
          response.status === 404
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
        error: "Invalid stop ID",
      };
    }

    // Filter out departed services (same logic as client/server dashboards)
    const now = new Date();
    let upcoming = (result.departures || []).filter((d: Departure) => {
      const time = new Date(d.estimatedTime || d.scheduledTime);
      const diffMinutes = Math.round(
        (time.getTime() - now.getTime()) / 1000 / 60,
      );
      return diffMinutes >= 0; // Filter out "gone" departures
    });

    // Filter by direction if specified
    if (directionIds && directionIds.length > 0) {
      upcoming = upcoming.filter(
        (d: Departure) =>
          d.direction?.id && directionIds.includes(d.direction.id),
      );
    }

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
      error: "Connection failed",
    };
  }
}

function parseStops(
  stopsParam: string,
): { mode: TransportMode; stopId: string; directionIds?: string[] }[] {
  return stopsParam.split(",").map((pair) => {
    const parts = pair.split(":");
    const [mode, stopId, directionsPart] = parts;
    // Support multiple directions with + separator: train:1001:5+12
    const directionIds = directionsPart ? directionsPart.split("+") : undefined;
    return { mode: mode as TransportMode, stopId, directionIds };
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const { searchParams } = url;

  // Parse query parameters
  const stopsParam = searchParams.get("stops");
  const orientation = searchParams.get("orientation") || "landscape";
  const isPortrait = orientation === "portrait";

  // Default dimensions based on orientation
  const defaultWidth = isPortrait ? 480 : 800;
  const defaultHeight = isPortrait ? 800 : 480;
  const maxWidth = isPortrait ? 800 : 1200;
  const maxHeight = isPortrait ? 1200 : 800;

  const baseWidth = Math.min(
    parseInt(searchParams.get("width") || String(defaultWidth), 10),
    maxWidth,
  );
  const baseHeight = Math.min(
    parseInt(searchParams.get("height") || String(defaultHeight), 10),
    maxHeight,
  );
  const limit = Math.min(parseInt(searchParams.get("limit") || "3", 10), 5);
  const maxMinutes = Math.min(
    parseInt(searchParams.get("maxMinutes") || "30", 10),
    120,
  );
  const showAbsolute = searchParams.get("showAbsolute") === "true";
  const scale = Math.min(
    Math.max(parseFloat(searchParams.get("scale") || "1"), 1),
    3,
  );

  // Device sensor data (optional, passed from ESPHome)
  const tempParam = searchParams.get("temp");
  const humidityParam = searchParams.get("humidity");
  const batteryParam = searchParams.get("battery");

  const deviceTemp = tempParam ? parseFloat(tempParam) : null;
  const deviceHumidity = humidityParam ? parseFloat(humidityParam) : null;
  const deviceBattery = batteryParam ? parseFloat(batteryParam) : null;

  // Check if we have any device sensor data to display
  const hasDeviceData =
    deviceTemp !== null || deviceHumidity !== null || deviceBattery !== null;

  // Sidebar layout: 2/3 timetable + 1/3 weather panel
  const useSidebar = searchParams.get("sidebar") === "true" && hasDeviceData;

  // Location for weather data and timezone derivation
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const lat = latParam ? parseFloat(latParam) : null;
  const lon = lonParam ? parseFloat(lonParam) : null;
  const hasLocation =
    lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon);

  // Timezone: prefer explicit tz param if provided, otherwise derive from weather API
  const tzParam = searchParams.get("tz");

  // Color inversion for dark mode e-ink displays
  const invert = searchParams.get("invert") === "true";
  const fg = invert ? "#ffffff" : "#000000"; // Foreground (text, borders)
  const bg = invert ? "#000000" : "#ffffff"; // Background

  // Apply scale for higher resolution rendering
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);

  if (!stopsParam) {
    return new Response("Missing required parameter: stops", { status: 400 });
  }

  // Load fonts, departure data, and weather in parallel
  const stopRequests = parseStops(stopsParam);
  const [interBoldData, interRegularData, weatherData, ...stopDataResults] =
    await Promise.all([
      interBold,
      interRegular,
      hasLocation ? fetchWeather(lat!, lon!) : Promise.resolve(null),
      ...stopRequests.map(({ mode, stopId, directionIds }) =>
        fetchStopDepartures(
          baseUrl,
          mode,
          stopId,
          limit,
          maxMinutes,
          directionIds,
        ),
      ),
    ]);

  const stopData = stopDataResults as StopData[];

  // Use explicit tz param if provided, otherwise derive from weather API, fallback to UTC
  const timezone =
    tzParam || (weatherData as WeatherData | null)?.timezone || "UTC";
  const stopCount = stopData.length;

  // Calculate total content rows (headers + departures + gaps)
  const totalDepartures = stopData.reduce(
    (sum, stop) => sum + Math.max(stop.departures.length, 1), // At least 1 for "no departures" message
    0,
  );
  const totalHeaders = stopCount;
  const totalGaps = stopCount - 1;

  // Dynamic layout: distribute available height across all rows
  const padding = Math.round(8 * scale);
  const sectionGap = Math.round(6 * scale);
  const borderWidth = Math.round(3 * scale);

  // Available height after padding and gaps
  const availableHeight = height - padding * 2 - sectionGap * totalGaps;

  // Reserve space for timestamp footer
  const footerHeight = Math.round(16 * scale);
  const availableContentHeight = availableHeight - footerHeight;

  // Headers take ~65% of row height (increased for readability), departures take full row height
  // Total "row units": headers count as 0.65, departures count as 1.0
  const headerRatio = 0.65;
  const totalRowUnits = totalHeaders * headerRatio + totalDepartures;

  // Calculate row height but cap it to reasonable maximums
  // Max row height: 70px at scale 1 (prevents giant text with few rows)
  // Min row height: 40px at scale 1 (ensures readability with many rows)
  const maxRowHeight = 70 * scale;
  const minRowHeight = 40 * scale;
  const calculatedRowHeight = availableContentHeight / totalRowUnits;
  const baseRowHeight = Math.min(
    Math.max(calculatedRowHeight, minRowHeight),
    maxRowHeight,
  );

  const rowHeight = Math.round(baseRowHeight);
  const headerHeight = Math.round(baseRowHeight * headerRatio);

  // Scale fonts proportionally to row height
  // Base calculation uses unscaled reference (56px), then apply scale for resolution
  // Cap the row-based multiplier to prevent giant text with few rows
  const rowSizeMultiplier = Math.min(rowHeight / (56 * scale), 1.2);
  const fontScale = rowSizeMultiplier * scale;

  const fontSize = {
    modeLabel: Math.round(20 * fontScale), // Increased for header readability
    stopName: Math.round(18 * fontScale), // Increased for header readability
    routeNumber: Math.round(26 * fontScale),
    destination: Math.round(18 * fontScale),
    trainDestination: Math.round(22 * fontScale), // Larger for trains (no route number)
    platform: Math.round(16 * fontScale), // Increased for bolder badges
    time: Math.round(30 * fontScale),
    message: Math.round(16 * fontScale),
    timestamp: Math.round(18 * fontScale), // Footer text (larger for e-ink readability)
  };

  const headerPadding = Math.round(6 * scale);

  // Route number width scales with font and orientation
  const routeNumWidth = Math.round(
    isPortrait ? 60 * fontScale : 72 * fontScale,
  );
  const timeWidth = Math.round(isPortrait ? 70 * fontScale : 90 * fontScale);

  // Generate timestamp for footer (in requested timezone)
  const now = new Date();
  let timestamp: string;
  try {
    timestamp = now.toLocaleTimeString("en-AU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    // Invalid timezone, fall back to UTC
    timestamp = now.toLocaleTimeString("en-AU", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  // Sidebar dimensions (1/4 width for tighter layout)
  const sidebarWidth = useSidebar ? Math.round(width / 4) : 0;
  const mainWidth = useSidebar ? width - sidebarWidth : width;

  // Sidebar-specific font sizes (large for glanceability, sized for 1/4 width)
  const sidebarFontSize = {
    temp: Math.round(64 * scale),
    humidity: Math.round(32 * scale),
    label: Math.round(14 * scale),
  };

  // Timetable content (shared between both layouts)
  const timetableContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: useSidebar ? `${mainWidth}px` : "100%",
        height: "100%",
        padding: `${padding}px`,
      }}
    >
      {stopData.map((stop, stopIndex) => (
        <div
          key={`${stop.mode}-${stop.stopId}`}
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: stopIndex < stopCount - 1 ? `${sectionGap}px` : "0",
          }}
        >
          {/* Stop header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: fg,
              color: bg,
              padding: `0 ${padding + 4}px`,
              height: `${headerHeight}px`,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: `${fontSize.modeLabel}px`,
                letterSpacing: "0.08em",
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
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stop.stopName}
            </span>
          </div>

          {/* Departures */}
          {stop.error ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: `${rowHeight}px`,
                fontSize: `${fontSize.message}px`,
                fontWeight: 400,
                color: fg,
              }}
            >
              {stop.error}
            </div>
          ) : stop.departures.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: `${rowHeight}px`,
                fontSize: `${fontSize.message}px`,
                fontWeight: 400,
                color: fg,
              }}
            >
              No departures
            </div>
          ) : (
            stop.departures.map((departure, depIndex) => {
              const timeInfo = formatDepartureTime(
                departure.scheduledTime,
                departure.estimatedTime,
                showAbsolute,
              );
              const isDeparting = timeInfo.display === "now";
              const isTrain = departure.mode === "train";
              const isExpress =
                departure.expressStopCount && departure.expressStopCount > 0;
              const isLastInSection = depIndex === stop.departures.length - 1;

              return (
                <div
                  key={departure.id || depIndex}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: `${rowHeight}px`,
                    padding: `0 ${padding + 4}px`,
                    borderTop: isDeparting
                      ? `${borderWidth}px solid ${bg}`
                      : "none",
                    borderBottom: isLastInSection
                      ? "none"
                      : `${borderWidth}px solid ${fg}`,
                    backgroundColor: isDeparting ? fg : bg,
                    color: isDeparting ? bg : fg,
                  }}
                >
                  {/* Route number - hide for trains (redundant with destination) */}
                  {!isTrain && (
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: `${fontSize.routeNumber}px`,
                        width: `${routeNumWidth}px`,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {departure.routeName}
                    </span>
                  )}

                  {/* Destination - larger font for trains since they have no route number */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: `${isTrain ? fontSize.trainDestination : fontSize.destination}px`,
                      fontWeight: isTrain ? 500 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginLeft: isTrain
                        ? "0"
                        : `${Math.round(8 * fontScale)}px`,
                      marginRight: `${Math.round(8 * fontScale)}px`,
                    }}
                  >
                    {departure.destination}
                  </span>

                  {/* Express indicator */}
                  {isExpress && (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: `${fontSize.destination}px`,
                        fontWeight: 700,
                        padding: `${Math.round(2 * fontScale)}px 0`,
                        border: `${Math.round(2 * fontScale)}px solid ${isDeparting ? bg : fg}`,
                        marginRight: `${Math.round(8 * fontScale)}px`,
                        minWidth: `${Math.round(28 * fontScale)}px`,
                        flexShrink: 0,
                      }}
                    >
                      E
                    </span>
                  )}

                  {/* Platform */}
                  {departure.platform && (
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: `${fontSize.destination}px`,
                        border: `${Math.round(2 * fontScale)}px solid ${isDeparting ? bg : fg}`,
                        padding: `${Math.round(2 * fontScale)}px 0`,
                        fontWeight: 700,
                        marginRight: `${Math.round(8 * fontScale)}px`,
                        minWidth: `${Math.round(28 * fontScale)}px`,
                        flexShrink: 0,
                      }}
                    >
                      {departure.platform}
                    </span>
                  )}

                  {/* Time */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "flex-end",
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
                  </div>
                </div>
              );
            })
          )}
        </div>
      ))}

      {/* Footer with timestamp (and device data if not using sidebar) */}
      <div
        style={{
          display: "flex",
          justifyContent: useSidebar ? "flex-end" : "space-between",
          alignItems: "flex-end",
          flex: 1,
          paddingTop: `${Math.round(4 * scale)}px`,
        }}
      >
        {/* Device sensor data in footer (only when NOT using sidebar) */}
        {!useSidebar && hasDeviceData ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: `${Math.round(12 * scale)}px`,
              fontSize: `${fontSize.timestamp}px`,
              color: fg,
              fontWeight: 400,
            }}
          >
            {deviceTemp !== null && <span>{Math.round(deviceTemp)}°C</span>}
            {deviceHumidity !== null && (
              <span>{Math.round(deviceHumidity)}%</span>
            )}
            {deviceBattery !== null && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: `${Math.round(4 * scale)}px`,
                }}
              >
                <svg
                  width={Math.round(16 * scale)}
                  height={Math.round(10 * scale)}
                  viewBox="0 0 16 10"
                  fill="none"
                >
                  <rect
                    x="0.5"
                    y="0.5"
                    width="13"
                    height="9"
                    rx="1.5"
                    stroke={fg}
                    strokeWidth="1"
                  />
                  <rect x="14" y="3" width="2" height="4" rx="0.5" fill={fg} />
                  <rect
                    x="2"
                    y="2"
                    width={Math.round(
                      (10 * Math.min(deviceBattery, 100)) / 100,
                    )}
                    height="6"
                    rx="0.5"
                    fill={fg}
                  />
                </svg>
                {Math.round(deviceBattery)}%
              </span>
            )}
          </div>
        ) : !useSidebar ? (
          <div />
        ) : null}

        {/* Timestamp with clock icon (right side) - only when NOT using sidebar */}
        {!useSidebar && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: `${Math.round(6 * scale)}px`,
              fontSize: `${fontSize.timestamp}px`,
              color: fg,
              fontWeight: 400,
            }}
          >
            <svg
              width={Math.round(16 * scale)}
              height={Math.round(16 * scale)}
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="8" cy="8" r="7" stroke={fg} strokeWidth="1.5" />
              <path
                d="M8 4V8L11 10"
                stroke={fg}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{timestamp}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Sidebar content (weather panel)
  const sidebarContent = useSidebar ? (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: `${sidebarWidth}px`,
        height: "100%",
        borderLeft: `${Math.round(3 * scale)}px solid ${fg}`,
        padding: `${padding}px`,
      }}
    >
      {/* Weather data (centered, large) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: `${Math.round(16 * scale)}px`,
        }}
      >
        {/* Temperature (large, primary) */}
        {deviceTemp !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: `${sidebarFontSize.temp}px`,
                fontWeight: 700,
                lineHeight: 1,
                color: fg,
              }}
            >
              {Math.round(deviceTemp)}
            </span>
            <span
              style={{
                fontSize: `${Math.round(sidebarFontSize.temp * 0.4)}px`,
                fontWeight: 400,
                marginTop: `${Math.round(8 * scale)}px`,
                color: fg,
              }}
            >
              °C
            </span>
          </div>
        )}

        {/* Humidity (medium, secondary) */}
        {deviceHumidity !== null && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: `${sidebarFontSize.humidity}px`,
                fontWeight: 700,
                lineHeight: 1,
                color: fg,
              }}
            >
              {Math.round(deviceHumidity)}%
            </span>
            <span
              style={{
                fontSize: `${sidebarFontSize.label}px`,
                fontWeight: 400,
                color: fg,
                marginTop: `${Math.round(4 * scale)}px`,
              }}
            >
              humidity
            </span>
          </div>
        )}

        {/* Rain indicator (only shown when rain expected) */}
        {(weatherData as WeatherData | null)?.rain?.willRain && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: `${Math.round(8 * scale)}px`,
              marginTop: `${Math.round(8 * scale)}px`,
            }}
          >
            {/* Rain cloud icon */}
            <svg
              width={Math.round(28 * scale)}
              height={Math.round(28 * scale)}
              viewBox="0 0 24 24"
              fill="none"
            >
              {/* Cloud */}
              <path
                d="M19 18H6a4 4 0 0 1-1-7.9 5.5 5.5 0 0 1 10.8-1.3A3.5 3.5 0 0 1 19 13v0a3 3 0 0 1 0 5z"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Rain drops */}
              <path
                d="M8 19v2M12 19v2M16 19v2"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {/* Time when rain expected */}
            <span
              style={{
                fontSize: `${sidebarFontSize.label}px`,
                fontWeight: 700,
                color: fg,
              }}
            >
              ~{(weatherData as WeatherData).rain.hour! % 12 || 12}
              {(weatherData as WeatherData).rain.hour! < 12 ? "am" : "pm"}
            </span>
          </div>
        )}
      </div>

      {/* Footer with timestamp and battery */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: `${fontSize.timestamp}px`,
          color: fg,
          fontWeight: 400,
        }}
      >
        {/* Timestamp with clock icon (left side) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: `${Math.round(6 * scale)}px`,
          }}
        >
          <svg
            width={Math.round(16 * scale)}
            height={Math.round(16 * scale)}
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="8" cy="8" r="7" stroke={fg} strokeWidth="1.5" />
            <path
              d="M8 4V8L11 10"
              stroke={fg}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{timestamp}</span>
        </div>

        {/* Battery (right side) */}
        {deviceBattery !== null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: `${Math.round(6 * scale)}px`,
            }}
          >
            <svg
              width={Math.round(20 * scale)}
              height={Math.round(12 * scale)}
              viewBox="0 0 16 10"
              fill="none"
            >
              <rect
                x="0.5"
                y="0.5"
                width="13"
                height="9"
                rx="1.5"
                stroke={fg}
                strokeWidth="1"
              />
              <rect x="14" y="3" width="2" height="4" rx="0.5" fill={fg} />
              <rect
                x="2"
                y="2"
                width={Math.round((10 * Math.min(deviceBattery, 100)) / 100)}
                height="6"
                rx="0.5"
                fill={fg}
              />
            </svg>
            {Math.round(deviceBattery)}%
          </div>
        )}
      </div>
    </div>
  ) : null;

  const imageResponse = new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        height: "100%",
        backgroundColor: bg,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {timetableContent}
      {sidebarContent}
    </div>,
    {
      width,
      height,
      fonts: [
        {
          name: "Inter",
          data: interBoldData,
          style: "normal",
          weight: 700,
        },
        {
          name: "Inter",
          data: interRegularData,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );

  // Buffer the streamed ImageResponse so we can set Content-Length.
  // ESPHome's online_image component requires Content-Length to allocate
  // its PNG decode buffer. This eliminates the need for the separate
  // /api/og/board/eink proxy route (saving a full HTTP round-trip).
  const buffer = await imageResponse.arrayBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "public, max-age=30",
    },
  });
}
