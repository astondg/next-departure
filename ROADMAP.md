# Roadmap

## In Progress

### Sidebar weather alerts
Weather and environmental alerts in the sidebar panel using Open-Meteo API data.
- [x] Rain probability alert (~3pm format, 30% threshold)
- [x] UV index alert (UV 8 ~2pm format, threshold >= 3)
- [x] Wind speed alert (35km/h format, threshold >= 32 km/h)
- [x] AQI alert (AQI 120 format, threshold >= 101 US EPA)
- [x] Sunrise/sunset alert (45m format, within 60 min of event)
- [x] API-sourced outdoor temp & humidity (replaces device sensors, opt-in override via query params)

## Planned

### Walking time to stop
Show a "leave in X min" countdown by subtracting walking time from next departure.
- Needs device location (lat/lon already sent) to calculate distance to each stop
- Walking time is per-stop, so best displayed in the stop header in the timetable
- Could use straight-line distance with a walking speed estimate, or a routing API
- Consider a `walkMins` query param as a simple first pass before full routing

### Service disruption alerts
Show disruption/alert indicators when services are affected.
- Check PTV API for disruption data on requested routes/stops
- Could be per-stop (in stop header) or per-departure (on individual rows)
- Simple warning icon with tooltip-style info
- Needs investigation into PTV disruption API response format

## Backlog

### Bin collection day indicator
Show which bin (recycling, general waste, green waste) goes out today.
- Needs configurable council schedule (day of week + rotation)
- Simple colored icon in sidebar
- Low complexity but requires per-council configuration

### Parking / traffic indicator
Show traffic conditions for common driving routes as an alternative to transit.
- Useful for transit-vs-drive decision
- Would need Google Maps or TomTom API integration
- More complex than other features, lower priority

### Calendar integration
Show next calendar event / meeting countdown in sidebar.
- Google Calendar or CalDAV integration
- "Meeting in 45 min" or "Standup 9:30am" format
- Separate project (Boox Note) may cover this use case

### Direct provider import for OG route
Eliminate HTTP self-fetch overhead by importing PTV provider directly.
- Port PTV signature to async Web Crypto API (currently uses Node.js crypto)
- See `docs/direct-provider-import.md` for detailed analysis
- Expected to save 20-100ms per image generation
