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
 *   - temp: temperature in Celsius from device sensor (optional, e.g., "21.5"). Overrides API weather.
 *   - humidity: relative humidity percentage from device sensor (optional, e.g., "45"). Overrides API weather.
 *   - battery: battery level percentage from device sensor (optional, e.g., "87")
 *   - sidebar: enable sidebar layout with weather + alerts panel (default false, e.g., "true")
 *             When enabled, displays 2/3 timetable + 1/3 sidebar with weather and conditional alerts.
 *             Activates when device sensor data OR lat/lon location is provided.
 *             Alerts shown when thresholds exceeded: rain (>=30%), UV (>=3), wind (>=32km/h),
 *             AQI (>=101), sunrise/sunset (within 60min).
 *   - lat: latitude for weather data and timezone (e.g., "-37.8136")
 *   - lon: longitude for weather data and timezone (e.g., "144.9631")
 *   - tz: timezone for "Updated" timestamp (e.g., "Australia/Melbourne"). Falls back to auto-detect from lat/lon, then UTC.
 *   - invert: invert colors for dark mode e-ink displays (default false, e.g., "true")
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { TransportMode, Departure } from "@/lib/providers/types";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const preferredRegion = "syd1";

// Cache font data at module level to avoid disk reads on every request
let _fontsPromise: Promise<{ bold: Buffer; regular: Buffer }> | null = null;
function getFonts() {
  if (!_fontsPromise) {
    const dir = join(process.cwd(), "src/app/api/og/board/fonts");
    _fontsPromise = Promise.all([
      readFile(join(dir, "Inter-Bold.woff")),
      readFile(join(dir, "Inter-Regular.woff")),
    ]).then(([bold, regular]) => ({ bold, regular }));
  }
  return _fontsPromise;
}

interface StopData {
  mode: TransportMode;
  stopId: string;
  stopName: string;
  departures: Departure[];
  error?: string;
}

interface WeatherData {
  timezone: string;
  current: {
    temperature: number | null; // Current outdoor temperature (°C)
    humidity: number | null; // Current outdoor relative humidity (%)
  };
  rain: {
    willRain: boolean;
    hour: number | null; // Hour (0-23) when rain is expected, null if no rain
    probability: number | null; // Probability percentage at that hour
  };
  uv: {
    alert: boolean; // True when max UV index >= 3 (WHO "moderate" threshold)
    maxIndex: number | null; // Peak UV index value for remaining hours
    peakHour: number | null; // Hour (0-23) of peak UV
  };
  wind: {
    alert: boolean; // True when wind speed >= 32 km/h (Beaufort Force 5)
    maxSpeed: number | null; // Peak wind speed in km/h
    maxGust: number | null; // Peak gust speed in km/h
  };
  aqi: {
    alert: boolean; // True when US AQI >= 101 (EPA "Unhealthy for Sensitive Groups")
    value: number | null; // Current US AQI value
  };
  sun: {
    sunrise: string | null; // ISO time string
    sunset: string | null; // ISO time string
  };
}

// Alert thresholds based on internationally recognized standards
const RAIN_PROBABILITY_THRESHOLD = 30; // NWS "scattered" category
const UV_INDEX_THRESHOLD = 3; // WHO "moderate" - sun protection recommended
const WIND_SPEED_THRESHOLD = 32; // km/h, Beaufort Force 5 "fresh breeze"
const AQI_THRESHOLD = 101; // EPA "Unhealthy for Sensitive Groups"
const SUN_ALERT_MINUTES = 60; // Show sunrise/sunset alert within this many minutes

async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  try {
    // Fetch current conditions, hourly forecasts, and daily sun times in one call
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m` +
      `&hourly=precipitation_probability,uv_index,wind_speed_10m,wind_gusts_10m` +
      `&daily=sunrise,sunset` +
      `&timezone=auto&forecast_days=1`;
    const response = await fetch(url, {
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`Weather API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const timezone = data.timezone || "UTC";
    const utcOffsetSeconds: number = data.utc_offset_seconds || 0;

    // Current conditions
    const currentTemp: number | null = data.current?.temperature_2m ?? null;
    const currentHumidity: number | null =
      data.current?.relative_humidity_2m ?? null;

    // Hourly arrays (indexed 0-23, local hours)
    const probabilities: number[] =
      data.hourly?.precipitation_probability || [];
    const uvIndices: number[] = data.hourly?.uv_index || [];
    const windSpeeds: number[] = data.hourly?.wind_speed_10m || [];
    const windGusts: number[] = data.hourly?.wind_gusts_10m || [];

    // Daily sun times
    const sunrise: string | null = data.daily?.sunrise?.[0] ?? null;
    const sunset: string | null = data.daily?.sunset?.[0] ?? null;

    // Compute current local hour using the UTC offset from the API response
    const nowMs = Date.now();
    const currentHour = Math.floor(
      (((nowMs + utcOffsetSeconds * 1000) % 86_400_000) + 86_400_000) %
        86_400_000 /
        3_600_000,
    );

    // Rain: first hour from now with probability >= threshold
    let rain: WeatherData["rain"] = {
      willRain: false,
      hour: null,
      probability: null,
    };
    for (let i = currentHour; i < probabilities.length && i < 24; i++) {
      if (probabilities[i] >= RAIN_PROBABILITY_THRESHOLD) {
        rain = { willRain: true, hour: i, probability: probabilities[i] };
        break;
      }
    }

    // UV: peak index from remaining hours today
    let maxUv = 0;
    let uvPeakHour: number | null = null;
    for (let i = currentHour; i < uvIndices.length && i < 24; i++) {
      if (uvIndices[i] > maxUv) {
        maxUv = uvIndices[i];
        uvPeakHour = i;
      }
    }

    // Wind: peak speed from remaining hours today
    let maxWind = 0;
    let maxGust = 0;
    for (let i = currentHour; i < windSpeeds.length && i < 24; i++) {
      if (windSpeeds[i] > maxWind) {
        maxWind = windSpeeds[i];
      }
      if (windGusts[i] > maxGust) {
        maxGust = windGusts[i];
      }
    }

    return {
      timezone,
      current: {
        temperature: currentTemp,
        humidity: currentHumidity,
      },
      rain,
      uv: {
        alert: maxUv >= UV_INDEX_THRESHOLD,
        maxIndex: maxUv > 0 ? Math.round(maxUv) : null,
        peakHour: uvPeakHour,
      },
      wind: {
        alert: maxWind >= WIND_SPEED_THRESHOLD,
        maxSpeed: maxWind > 0 ? Math.round(maxWind) : null,
        maxGust: maxGust > 0 ? Math.round(maxGust) : null,
      },
      aqi: { alert: false, value: null }, // Populated by fetchAirQuality
      sun: { sunrise, sunset },
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
}

async function fetchAirQuality(
  lat: number,
  lon: number,
): Promise<{ alert: boolean; value: number | null }> {
  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi&timezone=auto`;
    const response = await fetch(url, {
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`AQI API error: ${response.status}`);
      return { alert: false, value: null };
    }

    const data = await response.json();
    const aqi: number | null = data.current?.us_aqi ?? null;
    return {
      alert: aqi !== null && aqi >= AQI_THRESHOLD,
      value: aqi,
    };
  } catch (error) {
    console.error("AQI fetch error:", error);
    return { alert: false, value: null };
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

    const provider = getProvider("ptv");
    const result = await provider.getDepartures({
      stopId,
      mode,
      limit: fetchLimit,
      maxMinutes,
    });

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

  // Location for weather data and timezone derivation
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const lat = latParam ? parseFloat(latParam) : null;
  const lon = lonParam ? parseFloat(lonParam) : null;
  const hasLocation =
    lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon);

  // Sidebar layout: 2/3 timetable + 1/3 weather panel
  // Sidebar activates with sensor data OR location (for API-sourced weather)
  const useSidebar =
    searchParams.get("sidebar") === "true" && (hasDeviceData || hasLocation);

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

  // Load fonts (cached), departure data, weather, and AQI in parallel
  const stopRequests = parseStops(stopsParam);
  const [fonts, weatherDataRaw, aqiData, ...stopDataResults] =
    await Promise.all([
      getFonts(),
      hasLocation ? fetchWeather(lat!, lon!) : Promise.resolve(null),
      hasLocation
        ? fetchAirQuality(lat!, lon!)
        : Promise.resolve({ alert: false, value: null }),
      ...stopRequests.map(({ mode, stopId, directionIds }) =>
        fetchStopDepartures(mode, stopId, limit, maxMinutes, directionIds),
      ),
    ]);

  // Merge AQI data into weather data
  const weatherData: WeatherData | null = weatherDataRaw
    ? { ...weatherDataRaw, aqi: aqiData }
    : null;

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
    alert: Math.round(24 * scale), // Alert text (rain time, UV value, etc.)
    label: Math.round(14 * scale),
  };
  const alertIconSize = Math.round(32 * scale); // Consistent icon size for all alerts

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
                    borderBottom: isLastInSection
                      ? "none"
                      : `${borderWidth}px solid ${fg}`,
                    backgroundColor: bg,
                    color: fg,
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
                        border: `${Math.round(2 * fontScale)}px solid ${fg}`,
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
                        border: `${Math.round(2 * fontScale)}px solid ${fg}`,
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

  // Resolve temperature and humidity: prefer device sensor data, fall back to API
  const displayTemp =
    deviceTemp ?? (weatherData as WeatherData | null)?.current?.temperature ?? null;
  const displayHumidity =
    deviceHumidity ??
    (weatherData as WeatherData | null)?.current?.humidity ??
    null;

  // Compute sunrise/sunset alert: show when within SUN_ALERT_MINUTES
  const weather = weatherData as WeatherData | null;
  let sunAlert: { type: "sunrise" | "sunset"; minutesUntil: number } | null =
    null;
  if (weather?.sun) {
    const nowMs = Date.now();
    for (const type of ["sunrise", "sunset"] as const) {
      const isoTime = weather.sun[type];
      if (isoTime) {
        const eventMs = new Date(isoTime).getTime();
        const diffMin = Math.round((eventMs - nowMs) / 60000);
        if (diffMin > 0 && diffMin <= SUN_ALERT_MINUTES) {
          sunAlert = { type, minutesUntil: diffMin };
          break; // Show whichever is sooner
        }
      }
    }
  }

  // Alert row style shared across all alert indicators
  const alertRowStyle = {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: `${Math.round(8 * scale)}px`,
  };
  const alertTextStyle = {
    fontSize: `${sidebarFontSize.alert}px`,
    fontWeight: 700,
    color: fg,
  };

  // Sidebar content (weather + alerts panel)
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
      {/* Weather data and alerts (centered) */}
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
        {displayTemp !== null && (
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
              {Math.round(displayTemp)}
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
        {displayHumidity !== null && (
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
              {Math.round(displayHumidity)}%
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

        {/* === Alerts section (conditional, icon + value pattern) === */}

        {/* Rain alert */}
        {weather?.rain?.willRain && (
          <div style={alertRowStyle}>
            <svg
              width={alertIconSize}
              height={alertIconSize}
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M19 18H6a4 4 0 0 1-1-7.9 5.5 5.5 0 0 1 10.8-1.3A3.5 3.5 0 0 1 19 13v0a3 3 0 0 1 0 5z"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M8 19v2M12 19v2M16 19v2"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={alertTextStyle}>
              ~{weather.rain.hour! % 12 || 12}
              {weather.rain.hour! < 12 ? "am" : "pm"}
            </span>
          </div>
        )}

        {/* UV alert (shown when max UV index >= 3) */}
        {weather?.uv?.alert && (
          <div style={alertRowStyle}>
            <svg
              width={alertIconSize}
              height={alertIconSize}
              viewBox="0 0 24 24"
              fill="none"
            >
              {/* Sun circle */}
              <circle cx="12" cy="12" r="4" stroke={fg} strokeWidth="2" />
              {/* Sun rays */}
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={alertTextStyle}>
              UV{weather.uv.maxIndex} ~
              {weather.uv.peakHour! % 12 || 12}
              {weather.uv.peakHour! < 12 ? "am" : "pm"}
            </span>
          </div>
        )}

        {/* Wind alert (shown when wind >= 32 km/h) */}
        {weather?.wind?.alert && (
          <div style={alertRowStyle}>
            <svg
              width={alertIconSize}
              height={alertIconSize}
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M9.59 4.59A2 2 0 1 1 11 8H2M12.59 19.41A2 2 0 1 0 14 16H2M17.73 7.73A2.5 2.5 0 1 1 19 12H2"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={alertTextStyle}>
              {weather.wind.maxSpeed}km/h
            </span>
          </div>
        )}

        {/* AQI alert (shown when US AQI >= 101) */}
        {weather?.aqi?.alert && (
          <div style={alertRowStyle}>
            <svg
              width={alertIconSize}
              height={alertIconSize}
              viewBox="0 0 24 24"
              fill="none"
            >
              {/* Haze/smog lines */}
              <path
                d="M3 8h18M5 12h14M3 16h18"
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Warning dot */}
              <circle cx="20" cy="4" r="2.5" fill={fg} />
            </svg>
            <span style={alertTextStyle}>
              AQI {weather.aqi.value}
            </span>
          </div>
        )}

        {/* Sunrise/sunset alert (shown within 60 min of event) */}
        {sunAlert && (
          <div style={alertRowStyle}>
            <svg
              width={alertIconSize}
              height={alertIconSize}
              viewBox="0 0 24 24"
              fill="none"
            >
              {/* Horizon line */}
              <path d="M2 18h20" stroke={fg} strokeWidth="2" strokeLinecap="round" />
              {/* Half sun on horizon */}
              <path
                d={
                  sunAlert.type === "sunrise"
                    ? "M12 14a6 6 0 0 1 6-6M12 14a6 6 0 0 0-6-6" // Rising arc
                    : "M12 14a6 6 0 0 0 6 0M12 14a6 6 0 0 1-6 0" // Setting arc (dipping)
                }
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Rays above horizon */}
              {sunAlert.type === "sunrise" && (
                <>
                  <path d="M12 2v4" stroke={fg} strokeWidth="2" strokeLinecap="round" />
                  <path d="M5.64 5.64l2.12 2.12" stroke={fg} strokeWidth="2" strokeLinecap="round" />
                  <path d="M18.36 5.64l-2.12 2.12" stroke={fg} strokeWidth="2" strokeLinecap="round" />
                </>
              )}
              {/* Arrow direction */}
              <path
                d={sunAlert.type === "sunrise" ? "M12 10V6M9 8l3-3 3 3" : "M12 10v4M9 12l3 3 3-3"}
                stroke={fg}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={alertTextStyle}>
              {sunAlert.minutesUntil}m
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
          data: fonts.bold,
          style: "normal",
          weight: 700,
        },
        {
          name: "Inter",
          data: fonts.regular,
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

  // Compute dynamic refresh interval for e-ink devices
  const nowMs = Date.now();
  let soonestMinutes: number | null = null;
  for (const stop of stopData) {
    for (const dep of stop.departures) {
      const depTime = new Date(dep.estimatedTime || dep.scheduledTime).getTime();
      const minutesAway = (depTime - nowMs) / 60000;
      if (minutesAway > 0 && (soonestMinutes === null || minutesAway < soonestMinutes)) {
        soonestMinutes = minutesAway;
      }
    }
  }
  let refreshSeconds: number;
  if (soonestMinutes === null || soonestMinutes > 10) refreshSeconds = 300;
  else if (soonestMinutes > 5) refreshSeconds = 120;
  else refreshSeconds = 60;

  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": buffer.byteLength.toString(),
      "Cache-Control": "public, max-age=30",
      "X-Next-Refresh": String(refreshSeconds),
    },
  });
}
