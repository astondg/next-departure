# Optimize OG route: direct provider import instead of self-fetching /api/departures

## Summary

The OG image route (`/api/og/board`) currently fetches departure data by making HTTP requests to its own `/api/departures` endpoint. This is an unnecessary network round-trip — the request goes out through the HTTP stack and back to the same Vercel deployment. We should import the provider logic directly and call it in-process.

## Current architecture

```
ESP32 → /api/og/board (Edge) → HTTP fetch → /api/departures (Node.js) → PTV API
                                              ↑ unnecessary hop
```

The self-fetch happens in `fetchStopDepartures()` at `src/app/api/og/board/route.tsx:215`:

```typescript
const response = await fetch(
  `${baseUrl}/api/departures?${params.toString()}`,
  { cache: "no-store" },
);
```

Each stop in the request triggers a separate self-fetch. With a typical 2-stop config (`tram:2070,train:1201:1`), that's 2 unnecessary HTTP round-trips per image generation (~10-50ms each).

## Desired architecture

```
/api/og/board (Node.js) → PTV API directly
```

Import `getProvider` from `@/lib/providers` and call `provider.getDepartures()` directly, eliminating the HTTP intermediary.

## Blocker: Edge runtime incompatibility

The OG route currently runs on **Edge runtime** (`export const runtime = "edge"`). The PTV provider can't run on Edge because:

- `src/lib/providers/ptv/signature.ts` imports `crypto` from Node.js (`import crypto from 'crypto'`)
- `crypto.createHmac('sha1', ...)` is a Node.js-only API
- Edge runtime only has the Web Crypto API (`crypto.subtle`)

## Implementation plan

### Option A: Port PTV signature to Web Crypto API (recommended)

Convert `signPtvRequest` in `src/lib/providers/ptv/signature.ts` from Node.js `crypto` to the Web Crypto API. This keeps the OG route on Edge runtime (faster cold starts, global distribution) while enabling direct imports.

```typescript
// Before (Node.js only):
import crypto from 'crypto';
const signature = crypto.createHmac('sha1', apiKey).update(path).digest('hex');

// After (Edge-compatible):
async function hmacSha1(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
```

**Key changes required:**
1. `signPtvRequest` becomes `async` (returns `Promise<string>`)
2. All callers must `await` it — `PtvClient.request()` in `src/lib/providers/ptv/client.ts:94` already is async, so this is a minor change
3. The `/api/departures` route (Node.js) also uses the signature — Web Crypto works there too, so no compatibility issue
4. In the OG route, replace `fetchStopDepartures()` HTTP calls with direct `getProvider('ptv').getDepartures()` calls
5. Remove the `baseUrl` construction logic from the OG route (lines ~190-220) since it's no longer needed

### Option B: Move OG route to Node.js runtime

Change `export const runtime = "edge"` to `export const runtime = "nodejs"` (or remove it, since Node.js is the default). This allows direct import of the provider without modifying the signature module.

**Trade-offs:**
- Simpler change (no crypto refactor)
- Loses Edge runtime benefits: near-zero cold starts, global distribution
- Node.js cold starts are 250ms-1s+ (P99 ~5s on Vercel)
- For a device that fetches every 1-2 minutes, cold starts may be frequent

### Recommendation

Option A is preferred. The Web Crypto conversion is straightforward (one function), and it preserves Edge runtime benefits across all routes. It also future-proofs the codebase if other routes need to use the provider on Edge.

## Expected impact

- Eliminates 1 HTTP round-trip per stop (typically 2 stops = ~20-100ms saved)
- Removes JSON serialization/deserialization overhead per stop
- Simplifies the OG route (no more `baseUrl` construction, no URL parameter encoding/decoding)
- Better error handling (direct stack traces instead of HTTP error codes)

## Files to modify

| File | Change |
|------|--------|
| `src/lib/providers/ptv/signature.ts` | Port `signPtvRequest` to async Web Crypto API |
| `src/lib/providers/ptv/client.ts:94` | Await the now-async `signPtvRequest` |
| `src/app/api/og/board/route.tsx` | Replace `fetchStopDepartures` HTTP calls with direct provider import |
| `src/app/api/departures/route.ts` | No changes needed (Web Crypto works on Node.js too) |
