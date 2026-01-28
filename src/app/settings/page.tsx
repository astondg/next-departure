/**
 * Settings Page (Server-Rendered)
 *
 * Fallback settings page for browsers without JavaScript.
 * Uses cookies for storage and form submissions for interactions.
 * Modern browsers use the client-side modal instead.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getProvider, isProviderAvailable } from '@/lib/providers';
import { DEFAULT_REFRESH_INTERVAL } from '@/lib/config';

const SETTINGS_KEY = 'next-departure-settings';

interface StopConfig {
  stop: { id: string; name: string; modes: string[] };
  enabled: boolean;
}

interface UserSettings {
  tramStop?: StopConfig;
  trainStop?: StopConfig;
  busStop?: StopConfig;
  refreshInterval: number;
  departuresPerMode: number;
  showAbsoluteTime: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  refreshInterval: DEFAULT_REFRESH_INTERVAL,
  departuresPerMode: 2,
  showAbsoluteTime: false,
};

async function getSettings(): Promise<UserSettings> {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get(SETTINGS_KEY);

  if (settingsCookie?.value) {
    try {
      const decoded = decodeURIComponent(settingsCookie.value);
      return { ...DEFAULT_SETTINGS, ...JSON.parse(decoded) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  return DEFAULT_SETTINGS;
}

async function saveSettingsCookie(settings: UserSettings) {
  const cookieStore = await cookies();
  const json = JSON.stringify(settings);
  cookieStore.set(SETTINGS_KEY, encodeURIComponent(json), {
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
  });
}

async function updateDisplaySettings(formData: FormData) {
  'use server';

  const settings = await getSettings();
  settings.departuresPerMode = parseInt(formData.get('departuresPerMode') as string, 10) || 2;
  settings.refreshInterval = parseInt(formData.get('refreshInterval') as string, 10) || DEFAULT_REFRESH_INTERVAL;
  settings.showAbsoluteTime = formData.get('showAbsoluteTime') === 'on';

  await saveSettingsCookie(settings);
  revalidatePath('/settings');
  redirect('/settings');
}

async function selectStop(formData: FormData) {
  'use server';

  const settings = await getSettings();
  const mode = formData.get('mode') as string;
  const stopId = formData.get('stopId') as string;
  const stopName = formData.get('stopName') as string;

  const stopConfig: StopConfig = {
    stop: { id: stopId, name: stopName, modes: [mode] },
    enabled: true,
  };

  if (mode === 'tram') settings.tramStop = stopConfig;
  if (mode === 'train') settings.trainStop = stopConfig;
  if (mode === 'bus') settings.busStop = stopConfig;

  await saveSettingsCookie(settings);
  revalidatePath('/settings');
  redirect('/settings');
}

async function removeStop(formData: FormData) {
  'use server';

  const settings = await getSettings();
  const mode = formData.get('mode') as string;

  if (mode === 'tram') settings.tramStop = undefined;
  if (mode === 'train') settings.trainStop = undefined;
  if (mode === 'bus') settings.busStop = undefined;

  await saveSettingsCookie(settings);
  revalidatePath('/settings');
  redirect('/settings');
}

async function searchStops(query: string, mode: string): Promise<{ id: string; name: string }[]> {
  if (!query || query.length < 3) return [];

  try {
    // Call provider directly instead of HTTP request to avoid Vercel deployment protection issues
    if (!isProviderAvailable('ptv')) {
      console.error('PTV provider not available');
      return [];
    }

    const provider = getProvider('ptv');
    // Filter by mode to match client-side behavior
    const transportMode = mode as 'tram' | 'train' | 'bus';
    const stops = await provider.searchStops(query, transportMode);
    return stops.slice(0, 8).map((stop) => ({ id: stop.id, name: stop.name }));
  } catch (error) {
    console.error('Search failed:', error);
  }

  return [];
}

export const metadata = {
  title: 'Settings - Next Departure',
};

const MODES = [
  { mode: 'tram', label: 'Tram', icon: 'Tram' },
  { mode: 'train', label: 'Train', icon: 'Train' },
  { mode: 'bus', label: 'Bus', icon: 'Bus' },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const settings = await getSettings();
  const params = await searchParams;

  const searchMode = params.searchMode as string | undefined;
  const searchQuery = params.q as string | undefined;

  let searchResults: { id: string; name: string }[] = [];
  if (searchMode && searchQuery && searchQuery.length >= 3) {
    searchResults = await searchStops(searchQuery, searchMode);
  }

  const getStopConfig = (mode: string): StopConfig | undefined => {
    if (mode === 'tram') return settings.tramStop;
    if (mode === 'train') return settings.trainStop;
    if (mode === 'bus') return settings.busStop;
    return undefined;
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <header className="flex items-center justify-between px-3 py-2 border-b-2 border-black">
        <h1 className="text-lg font-bold">Settings</h1>
        <a href="/" className="px-3 py-1 border-2 border-black font-bold text-sm">
          Back
        </a>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {/* Stop Configuration */}
        <section className="mb-6">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-3 border-b border-black pb-1">
            Your Stops
          </h2>

          {MODES.map(({ mode, label, icon }) => {
            const config = getStopConfig(mode);
            const isSearchingThis = searchMode === mode;

            return (
              <div key={mode} className="py-3 border-b border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold">[{icon}]</span>
                  <span className="font-bold">{label}</span>
                </div>

                {config ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex-1 text-sm">{config.stop.name}</span>
                    <a
                      href={`/settings?searchMode=${mode}`}
                      className="px-2 py-1 border border-black text-xs"
                    >
                      Change
                    </a>
                    <form action={removeStop} style={{ display: 'inline' }}>
                      <input type="hidden" name="mode" value={mode} />
                      <button type="submit" className="px-2 py-1 border border-black text-xs">
                        Remove
                      </button>
                    </form>
                  </div>
                ) : isSearchingThis ? (
                  <div>
                    <form action="/settings" method="get" className="mb-2">
                      <input type="hidden" name="searchMode" value={mode} />
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="text"
                          name="q"
                          defaultValue={searchQuery || ''}
                          placeholder={`Search ${label.toLowerCase()} stops...`}
                          className="flex-1 min-w-0 p-2 border-2 border-black text-sm"
                        />
                        <button type="submit" className="px-3 py-2 bg-black text-white text-sm font-bold">
                          Go
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">Min 3 characters</p>
                    </form>

                    {searchResults.length > 0 && (
                      <div className="border border-black mb-2">
                        {searchResults.map((stop) => (
                          <form key={stop.id} action={selectStop}>
                            <input type="hidden" name="mode" value={mode} />
                            <input type="hidden" name="stopId" value={stop.id} />
                            <input type="hidden" name="stopName" value={stop.name} />
                            <button
                              type="submit"
                              className="w-full text-left p-2 text-sm border-b border-gray-300 last:border-b-0"
                            >
                              {stop.name}
                            </button>
                          </form>
                        ))}
                      </div>
                    )}

                    {searchQuery && searchQuery.length >= 3 && searchResults.length === 0 && (
                      <p className="text-sm text-gray-600 mb-2">No stops found</p>
                    )}

                    <a href="/settings" className="text-sm underline">Cancel</a>
                  </div>
                ) : (
                  <a href={`/settings?searchMode=${mode}`} className="text-sm underline">
                    Add a {label.toLowerCase()} stop
                  </a>
                )}
              </div>
            );
          })}
        </section>

        {/* Display Settings */}
        <section className="mb-6">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-3 border-b border-black pb-1">
            Display
          </h2>

          <form action={updateDisplaySettings} className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="departuresPerMode" className="text-sm">Departures per mode</label>
              <select
                id="departuresPerMode"
                name="departuresPerMode"
                defaultValue={settings.departuresPerMode}
                className="border border-black p-1 text-sm"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="refreshInterval" className="text-sm">Refresh interval</label>
              <select
                id="refreshInterval"
                name="refreshInterval"
                defaultValue={settings.refreshInterval}
                className="border border-black p-1 text-sm"
              >
                <option value={15}>15 sec</option>
                <option value={30}>30 sec</option>
                <option value={60}>1 min</option>
                <option value={120}>2 min</option>
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="showAbsoluteTime"
                defaultChecked={settings.showAbsoluteTime}
                className="w-4 h-4"
              />
              <span className="text-sm">Show clock times</span>
            </label>

            <button type="submit" className="w-full py-2 bg-black text-white text-sm font-bold">
              Save Display Settings
            </button>
          </form>
        </section>

        {/* Done */}
        <section className="pt-4 border-t border-black">
          <a href="/" className="block w-full py-3 bg-black text-white text-center font-bold">
            Done - View Departures
          </a>
          <p className="text-xs text-gray-600 mt-4 text-center">Settings saved in cookies.</p>
        </section>
      </main>
    </div>
  );
}
