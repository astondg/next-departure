/**
 * Settings Page
 *
 * A simple settings page that works without JavaScript.
 * Uses URL parameters for configuration, which can be bookmarked/shared.
 */

import { Suspense } from 'react';
import { SettingsForm } from './SettingsForm';

export const metadata = {
  title: 'Settings - Next Departure',
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b-2 border-black">
        <h1 className="text-lg font-bold">Settings</h1>
        <a
          href="/"
          className="px-3 py-1 border-2 border-black font-bold text-sm"
        >
          Back
        </a>
      </header>

      {/* Main content */}
      <main className="p-4 max-w-lg mx-auto">
        <Suspense fallback={<div>Loading...</div>}>
          <SettingsForm />
        </Suspense>
      </main>
    </div>
  );
}
