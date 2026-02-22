/**
 * Metadata endpoint for e-ink dynamic refresh
 *
 * Returns the recommended refresh interval based on how soon the next
 * departure is. Accepts the same stops/limit/maxMinutes parameters as
 * the OG board image endpoint.
 *
 * GET /api/og/board/meta?stops=tram:2186,train:1201:1&limit=3
 *
 * Response: { "refreshSeconds": 300, "nextDepartureMinutes": 18 }
 */

import { NextRequest, NextResponse } from "next/server";
import { TransportMode, Departure } from "@/lib/providers/types";
import { getProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const preferredRegion = "syd1";

function parseStops(
  stopsParam: string,
): { mode: TransportMode; stopId: string; directionIds?: string[] }[] {
  return stopsParam.split(",").map((pair) => {
    const parts = pair.split(":");
    const [mode, stopId, directionsPart] = parts;
    const directionIds = directionsPart
      ? directionsPart.split("+")
      : undefined;
    return { mode: mode as TransportMode, stopId, directionIds };
  });
}

/**
 * Compute the recommended refresh interval in seconds.
 * Same tiers as the JS client dynamic refresh.
 */
function getRefreshSeconds(soonestMinutes: number | null): number {
  if (soonestMinutes === null || soonestMinutes > 10) return 300; // 5 min
  if (soonestMinutes > 5) return 120; // 2 min
  return 60; // 1 min
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stopsParam = searchParams.get("stops");

  if (!stopsParam) {
    return NextResponse.json(
      { error: "Missing required parameter: stops" },
      { status: 400 },
    );
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "3", 10), 5);
  const maxMinutes = Math.min(
    parseInt(searchParams.get("maxMinutes") || "30", 10),
    120,
  );

  const stops = parseStops(stopsParam);
  const provider = getProvider("ptv");
  const now = Date.now();
  let soonestMinutes: number | null = null;

  await Promise.all(
    stops.map(async ({ mode, stopId, directionIds }) => {
      try {
        const fetchLimit =
          directionIds && directionIds.length > 0 ? (limit + 2) * 3 : limit + 2;
        const result = await provider.getDepartures({
          stopId,
          mode,
          limit: fetchLimit,
          maxMinutes,
        });

        let departures: Departure[] = result.departures || [];

        if (directionIds && directionIds.length > 0) {
          departures = departures.filter(
            (d) => d.direction?.id && directionIds.includes(d.direction.id),
          );
        }

        for (const dep of departures) {
          const depTime = new Date(
            dep.estimatedTime || dep.scheduledTime,
          ).getTime();
          const minutesAway = (depTime - now) / 60000;
          if (
            minutesAway > 0 &&
            (soonestMinutes === null || minutesAway < soonestMinutes)
          ) {
            soonestMinutes = minutesAway;
          }
        }
      } catch (error) {
        console.error(`Error fetching ${mode}:${stopId}:`, error);
      }
    }),
  );

  const refreshSeconds = getRefreshSeconds(soonestMinutes);

  return NextResponse.json(
    {
      refreshSeconds,
      nextDepartureMinutes:
        soonestMinutes !== null ? Math.round(soonestMinutes) : null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        "X-Next-Refresh": String(refreshSeconds),
      },
    },
  );
}
