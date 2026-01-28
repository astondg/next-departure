# Next Departure

A real-time Melbourne public transport departure board optimized for quick glanceability, with support for web browsers, server-side rendering, and e-ink displays.

## Architecture

### Three Dashboard Implementations

The app renders departure information in three contexts that must stay functionally synchronized:

1. **Client Dashboard** (`src/components/CombinedBoard.tsx`)
   - Primary web interface with JavaScript enhancements
   - Features: direction grouping, fade-out animations, real-time clock updates
   - Used by: Home page after hydration

2. **Server Dashboard** (`src/components/ServerBoard.tsx`)
   - No-JS fallback with meta refresh
   - Simpler layout, inline styles for SSR compatibility
   - Used by: Initial page load, browsers without JS

3. **OG Image Endpoint** (`src/app/api/og/board/route.tsx`)
   - PNG image generation via `@vercel/og`
   - Optimized for ESP32 e-ink displays (pure B/W, thick borders)
   - Used by: E-ink displays, social sharing previews

### Data Flow

```
PTV API → /api/departures → Dashboard Components
                ↓
         Departure object:
         - scheduledTime (ISO string)
         - estimatedTime (ISO string, nullable - live data)
         - routeName, destination, platform, mode
```

## Key Features

### Real-Time Data
- PTV API provides `estimated_departure_utc` for live tracking
- Main time display ("5 min") uses estimated time when available
- Delay indicator shows: `live` (on-time), `+N` (late), `-N` (early)

### "Gone" Departure Handling
- Departures in the past are filtered out before display
- Client dashboard: smooth fade-out animation (500ms)
- Server/Image: immediate removal

### Train Route Name Handling
- Train `routeName` contains full line name (e.g., "Hurstbridge")
- This is redundant with destination, so hidden for trains
- Trams/buses show short route numbers (e.g., "86")

## Definition of Done

When modifying departure display logic, ensure all three dashboards are updated:

### Functional Parity Checklist

| Feature | Client | Server | OG Image |
|---------|--------|--------|----------|
| Filter "gone" departures | ✅ | ✅ | ✅ |
| Use live time for display | ✅ | ✅ | ✅ |
| Show real-time indicator | ✅ | ✅ | ✅ |
| Show early arrivals (-N) | ✅ | ✅ | ✅ |
| Show late arrivals (+N) | ✅ | ✅ | ✅ |
| Hide train route names | ✅ | ✅ | ✅ |
| Direction grouping | ✅ | ❌ | ❌ |
| Fade-out animation | ✅ | N/A | N/A |

### Acceptable Differences

- **Direction grouping**: Client-only (requires JS state management)
- **Fade-out animation**: Client-only (requires JS)
- **Real-time indicator style**: OG image uses compact `•` for on-time due to space
- **Inline styles**: Server/OG use inline styles for SSR/edge compatibility

### Testing Changes

1. **Client**: Load home page, verify with browser dev tools
2. **Server**: Disable JS or check initial HTML response
3. **OG Image**: Visit `/api/og/board?stops=tram:2186&limit=3`

## File Locations

```
src/
├── components/
│   ├── CombinedBoard.tsx    # Client dashboard
│   ├── ServerBoard.tsx      # Server dashboard
│   └── DepartureRow.tsx     # Standalone row (used in /board route)
├── app/
│   └── api/
│       └── og/board/route.tsx  # Image generation
└── lib/
    ├── providers/
    │   └── ptv/client.ts    # PTV API integration
    └── utils/
        └── time.ts          # Time formatting utilities
```

## Environment Variables

```
PTV_DEV_ID=xxx       # PTV API developer ID
PTV_API_KEY=xxx      # PTV API key
```

## Common Tasks

### Adding a new departure field
1. Update `Departure` type in `src/lib/providers/types.ts`
2. Map field in `src/lib/providers/ptv/client.ts` (`convertDeparture`)
3. Display in all three dashboards (see checklist above)

### Modifying time display logic
1. Update `src/lib/utils/time.ts`
2. Verify OG image has equivalent logic (uses local `formatDepartureTime`)
3. Check all three dashboards render correctly
