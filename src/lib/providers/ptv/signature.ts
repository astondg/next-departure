/**
 * PTV API v3 HMAC-SHA1 Signature Generation
 *
 * The PTV API requires all requests to be signed using HMAC-SHA1.
 * The signature is computed over the request path (including query params)
 * using the API key as the secret.
 */

import crypto from 'crypto';

/**
 * Generate a signed URL for the PTV API
 *
 * @param path - The API path (e.g., "/v3/departures/route_type/1/stop/1234")
 * @param devId - Your PTV developer ID
 * @param apiKey - Your PTV API key (used as HMAC secret)
 * @param baseUrl - The API base URL (defaults to production)
 * @returns The full signed URL
 *
 * @example
 * ```ts
 * const url = signPtvRequest(
 *   '/v3/departures/route_type/1/stop/1234',
 *   'your-dev-id',
 *   'your-api-key'
 * );
 * // Returns: https://timetableapi.ptv.vic.gov.au/v3/departures/route_type/1/stop/1234?devid=your-dev-id&signature=abc123...
 * ```
 */
export function signPtvRequest(
  path: string,
  devId: string,
  apiKey: string,
  baseUrl: string = 'https://timetableapi.ptv.vic.gov.au'
): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Add devid to the path
  const separator = normalizedPath.includes('?') ? '&' : '?';
  const pathWithDevId = `${normalizedPath}${separator}devid=${devId}`;

  // Generate HMAC-SHA1 signature
  const signature = crypto
    .createHmac('sha1', apiKey)
    .update(pathWithDevId)
    .digest('hex')
    .toUpperCase();

  // Return the full signed URL
  return `${baseUrl}${pathWithDevId}&signature=${signature}`;
}

/**
 * Build a query string from parameters, filtering out undefined values
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const filtered = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );

  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
}
