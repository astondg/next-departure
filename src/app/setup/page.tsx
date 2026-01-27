/**
 * Setup Page
 *
 * URL-based configuration for departure boards.
 * Useful for setting up specific stops with custom URLs.
 */

import Link from 'next/link';
import { StopSearch } from '../StopSearch';

export const metadata = {
  title: 'Setup - Next Departure',
  description: 'Configure your departure board URL',
};

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header */}
      <header className="border-b-4 border-black p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Next Departure
            </h1>
            <p className="mt-1 text-lg">URL Setup</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 border-2 border-black hover:bg-gray-100"
          >
            ← Back to Board
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* Instructions */}
        <section className="mb-8">
          <p className="text-lg mb-4">
            Search for a stop below to generate a shareable URL for your e-ink
            display.
          </p>
          <p className="text-sm text-gray-600">
            This is useful for setting up specific stops or sharing board URLs
            with others. For personal use, the{' '}
            <Link href="/" className="underline">
              main board
            </Link>{' '}
            with its settings panel is recommended.
          </p>
        </section>

        {/* Stop Search */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 border-b-2 border-black pb-2">
            Find Your Stop
          </h2>
          <StopSearch />
        </section>

        {/* URL Format Reference */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 border-b-2 border-black pb-2">
            URL Format Reference
          </h2>
          <div className="bg-gray-100 p-4 font-mono text-sm break-all">
            /board/ptv/&#123;stopId&#125;?mode=tram&amp;refresh=30
          </div>
          <div className="mt-4 space-y-2">
            <p>
              <strong>Parameters:</strong>
            </p>
            <ul className="ml-4 space-y-1 text-sm">
              <li>
                <code className="bg-gray-100 px-1">mode</code> - Filter by
                transport: train, tram, bus
              </li>
              <li>
                <code className="bg-gray-100 px-1">direction</code> - Filter by
                direction ID
              </li>
              <li>
                <code className="bg-gray-100 px-1">limit</code> - Max departures
                (default: 10)
              </li>
              <li>
                <code className="bg-gray-100 px-1">refresh</code> - Interval in
                seconds (default: 30)
              </li>
              <li>
                <code className="bg-gray-100 px-1">title</code> - Custom title
              </li>
            </ul>
          </div>
        </section>

        {/* Tips */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 border-b-2 border-black pb-2">
            Kindle Tips
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              • Enable Experimental Browser: Settings → Device Options →
              Advanced Options
            </li>
            <li>• Bookmark your board URL for easy access</li>
            <li>• The page auto-refreshes even without JavaScript</li>
            <li>• High contrast design works great on e-ink</li>
          </ul>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-black p-6 text-center text-sm">
        <p>
          <Link
            href="https://github.com/astondg/next-departure"
            className="underline"
          >
            View on GitHub
          </Link>
        </p>
      </footer>
    </div>
  );
}
