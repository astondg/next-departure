# Next Departure

Real-time public transport departure information optimized for e-ink displays like Kindle.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **E-ink Optimized**: High contrast black/white design, no gradients, thick borders
- **Real-time Data**: Live departure times from PTV (where available)
- **Location Detection**: Automatically detects nearby stops using browser geolocation
- **Multi-stop Display**: Show tram, train, and bus departures on one screen
- **Configurable**: Set your preferred stops via gear icon settings panel
- **Multiple Refresh Strategies**:
  - Modern browsers: JavaScript-based auto-refresh
  - Legacy devices (old Kindles): `<meta http-equiv="refresh">` fallback
- **Extensible Architecture**: Provider pattern for easy addition of new transit systems
- **Responsive**: Works on any screen size

## Currently Supported

- 🚆 Melbourne trains (PTV)
- 🚊 Melbourne trams (PTV)
- 🚌 Melbourne buses (PTV)
- 🚐 V/Line coaches (PTV)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/astondg/next-departure.git
cd next-departure
npm install
```

### 2. Configure Environment

Copy the example environment file and add your PTV API credentials:

```bash
cp .env.example .env.local
```

To get PTV API credentials:
1. Email `APIKeyRequest@ptv.vic.gov.au` with subject "PTV Timetable API - request for key"
2. You'll receive a developer ID and API key within a few days

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) - the app will try to detect your location and suggest nearby stops.

### 4. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fastondg%2Fnext-departure&env=PTV_DEV_ID,PTV_API_KEY&envDescription=PTV%20API%20credentials%20required)

Add your `PTV_DEV_ID` and `PTV_API_KEY` as environment variables in Vercel.

## Usage

### Home Page (Recommended)

The home page (`/`) provides:
- **Automatic location detection** to find nearby stops
- **Gear icon settings panel** to configure your tram, train, and bus stops
- **Combined view** showing departures from all configured stops
- **Settings persistence** in your browser's localStorage

Just tap the ⚙️ gear icon to configure your stops. The app will suggest nearby stops based on your location, or you can search manually.

### URL-based Boards

For specific stops or shareable URLs, use `/board/ptv/{stopId}`:

```
/board/ptv/{stopId}?mode=tram&refresh=30&title=My%20Stop
```

Visit `/setup` to search for stops and generate URLs.

#### URL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mode` | Transport type: `train`, `tram`, `bus` | All modes |
| `direction` | Filter by direction ID | All directions |
| `limit` | Maximum departures to show | 10 |
| `refresh` | Refresh interval in seconds | 30 |
| `title` | Custom display title | Stop name |

### Kindle Setup

1. Open Settings → Device Options → Advanced Options → Experimental Browser
2. Navigate to your deployment URL
3. Bookmark the page for easy access

For older Kindles without JavaScript support, the page automatically uses `<meta http-equiv="refresh">` for updates.

## API Routes

### GET /api/departures

Fetch departures from a stop.

```
GET /api/departures?provider=ptv&stopId=1234&mode=tram&limit=10
```

### GET /api/stops

Search for stops by name.

```
GET /api/stops?provider=ptv&query=flinders&mode=train
```

### GET /api/nearby

Find stops near a location.

```
GET /api/nearby?provider=ptv&lat=-37.8136&lon=144.9631&mode=tram&distance=500
```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── departures/route.ts    # Departures endpoint
│   │   ├── stops/route.ts         # Stop search endpoint
│   │   └── nearby/route.ts        # Location-based stop search
│   ├── board/[provider]/[stopId]/ # Dynamic board pages
│   ├── setup/                     # URL setup page
│   ├── HomeClient.tsx             # Main client component
│   └── page.tsx                   # Home page
├── components/
│   ├── CombinedBoard.tsx          # Multi-stop display
│   ├── DepartureBoard.tsx         # Single-stop display
│   ├── DepartureRow.tsx           # Single departure
│   ├── SettingsModal.tsx          # Configuration panel
│   ├── GearIcon.tsx               # Settings icon
│   └── RefreshController.tsx      # Auto-refresh logic
└── lib/
    ├── providers/
    │   ├── types.ts               # Common interfaces
    │   ├── ptv/                   # PTV implementation
    │   └── index.ts               # Provider registry
    └── utils/
        ├── time.ts                # Time formatting
        └── storage.ts             # Settings persistence
```

### Adding New Providers

1. Create a new directory in `src/lib/providers/` (e.g., `translink/`)
2. Implement the `TransitProvider` interface
3. Register in `src/lib/providers/index.ts`

See `src/lib/providers/types.ts` for the full interface definition.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run linting
npm run lint

# Build for production
npm run build
```

## Roadmap

- [ ] TransLink (Queensland) support
- [ ] TfNSW (New South Wales) support
- [ ] Transport for London support
- [ ] Offline mode with service worker
- [x] Multiple stops on one display
- [ ] Disruption alerts

## License

MIT

## Acknowledgments

- Data provided by [Public Transport Victoria](https://www.ptv.vic.gov.au/)
- Built with [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/)
