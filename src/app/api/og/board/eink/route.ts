/**
 * E-ink optimized endpoint that wraps the OG image with Content-Length header
 *
 * ESPHome's online_image component requires Content-Length to download images.
 * The @vercel/og ImageResponse streams without Content-Length, so this endpoint
 * buffers the response and adds the header.
 *
 * GET /api/og/board/eink?stops=tram:1001&limit=3
 */

import { NextRequest, NextResponse } from 'next/server';

// Use Node.js runtime to buffer the response (edge runtime streams)
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Forward to the main OG endpoint
  const ogUrl = new URL('/api/og/board', url.origin);
  ogUrl.search = url.search;

  try {
    const response = await fetch(ogUrl.toString(), {
      headers: {
        // Pass through relevant headers
        'User-Agent': request.headers.get('User-Agent') || 'ESPHome',
      },
    });

    if (!response.ok) {
      return new NextResponse(
        `Upstream error: ${response.status}`,
        { status: response.status }
      );
    }

    // Buffer the entire response
    const imageBuffer = await response.arrayBuffer();

    // Return with explicit Content-Length
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (error) {
    console.error('E-ink image proxy error:', error);
    return new NextResponse(
      'Failed to generate image',
      { status: 500 }
    );
  }
}
