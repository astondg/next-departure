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
import { getProvider, isProviderAvailable, ProviderId, PROVIDER_INFO } from '@/lib/providers';
import { DEFAULT_REFRESH_INTERVAL } from '@/lib/config';
import {
  UserSettings,
  DEFAULT_SETTINGS as STORAGE_DEFAULT_SETTINGS,
  StopConfig,
  ProviderSettings,
  getStopsForMode,
  getSupportedModes,
} from '@/lib/utils/storage';
import { TransportMode } from '@/lib/providers/types';

const SETTINGS_KEY = 'next-departure-settings';

async function getSettings(): Promise<UserSettings> {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get(SETTINGS_KEY);

  if (settingsCookie?.value) {
    try {
      const decoded = decodeURIComponent(settingsCookie.value);
      const parsed = JSON.parse(decoded);

      // Ensure required fields exist
      const settings: UserSettings = {
        ...STORAGE_DEFAULT_SETTINGS,
        ...parsed,
      };

      // Migrate legacy flat format if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = parsed as any;
      if (
        (legacy.tramStops || legacy.trainStops || legacy.busStops) &&
        (!settings.providers || Object.keys(settings.providers).length === 0)
      ) {
        const ptvSettings: ProviderSettings = {};
        if (legacy.tramStops) ptvSettings.tramStops = legacy.tramStops;
        if (legacy.trainStops) ptvSettings.trainStops = legacy.trainStops;
        if (legacy.busStops) ptvSettings.busStops = legacy.busStops;
        settings.providers = { ptv: ptvSettings };
        settings.activeProvider = 'ptv';
      }

      if (!settings.activeProvider) settings.activeProvider = 'ptv';
      if (!settings.providers) settings.providers = {};

      return settings;
    } catch {
      return STORAGE_DEFAULT_SETTINGS;
    }
  }

  return STORAGE_DEFAULT_SETTINGS;
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

function setStopForMode(settings: UserSettings, mode: TransportMode, config: StopConfig): UserSettings {
  const providerSettings = settings.providers[settings.activeProvider] || {};
  let updatedProviderSettings: ProviderSettings;

  switch (mode) {
    case 'tram':
      updatedProviderSettings = { ...providerSettings, tramStops: [config] };
      break;
    case 'train':
      updatedProviderSettings = { ...providerSettings, trainStops: [config] };
      break;
    case 'bus':
      updatedProviderSettings = { ...providerSettings, busStops: [config] };
      break;
    case 'ferry':
      updatedProviderSettings = { ...providerSettings, ferryStops: [config] };
      break;
    case 'light_rail':
      updatedProviderSettings = { ...providerSettings, lightRailStops: [config] };
      break;
    case 'coach':
      updatedProviderSettings = { ...providerSettings, coachStops: [config] };
      break;
    default:
      return settings;
  }

  return {
    ...settings,
    providers: {
      ...settings.providers,
      [settings.activeProvider]: updatedProviderSettings,
    },
  };
}

function removeStopForModeFromSettings(settings: UserSettings, mode: TransportMode): UserSettings {
  const providerSettings = settings.providers[settings.activeProvider] || {};
  let updatedProviderSettings: ProviderSettings;

  switch (mode) {
    case 'tram':
      updatedProviderSettings = { ...providerSettings, tramStops: undefined };
      break;
    case 'train':
      updatedProviderSettings = { ...providerSettings, trainStops: undefined };
      break;
    case 'bus':
      updatedProviderSettings = { ...providerSettings, busStops: undefined };
      break;
    case 'ferry':
      updatedProviderSettings = { ...providerSettings, ferryStops: undefined };
      break;
    case 'light_rail':
      updatedProviderSettings = { ...providerSettings, lightRailStops: undefined };
      break;
    case 'coach':
      updatedProviderSettings = { ...providerSettings, coachStops: undefined };
      break;
    default:
      return settings;
  }

  return {
    ...settings,
    providers: {
      ...settings.providers,
      [settings.activeProvider]: updatedProviderSettings,
    },
  };
}

async function selectStop(formData: FormData) {
  'use server';

  let settings = await getSettings();
  const mode = formData.get('mode') as TransportMode;
  const stopId = formData.get('stopId') as string;
  const stopName = formData.get('stopName') as string;

  const stopConfig: StopConfig = {
    stop: { id: stopId, name: stopName, modes: [mode] },
    enabled: true,
  };

  settings = setStopForMode(settings, mode, stopConfig);

  await saveSettingsCookie(settings);
  revalidatePath('/settings');
  redirect('/settings');
}

async function removeStop(formData: FormData) {
  'use server';

  let settings = await getSettings();
  const mode = formData.get('mode') as TransportMode;

  settings = removeStopForModeFromSettings(settings, mode);

  await saveSettingsCookie(settings);
  revalidatePath('/settings');
  redirect('/settings');
}

async function searchStops(query: string, mode: string, providerId: ProviderId): Promise<{ id: string; name: string }[]> {
  if (!query || query.length < 3) return [];

  try {
    if (!isProviderAvailable(providerId)) {
      console.error(`${providerId} provider not available`);
      return [];
    }

    const provider = getProvider(providerId);
    const transportMode = mode as TransportMode;
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

function getModeLabel(mode: TransportMode): string {
  const labels: Record<TransportMode, string> = {
    train: 'Train',
    tram: 'Tram',
    bus: 'Bus',
    ferry: 'Ferry',
    light_rail: 'Light Rail',
    metro: 'Metro',
    coach: 'Coach',
  };
  return labels[mode] || mode;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const settings = await getSettings();
  const params = await searchParams;

  const searchMode = params.searchMode as TransportMode | undefined;
  const searchQuery = params.q as string | undefined;
  const activeProvider = settings.activeProvider;

  // Get supported modes for the active provider
  const supportedModes = getSupportedModes(activeProvider);

  let searchResults: { id: string; name: string }[] = [];
  if (searchMode && searchQuery && searchQuery.length >= 3) {
    searchResults = await searchStops(searchQuery, searchMode, activeProvider);
  }

  const getFirstStopConfig = (mode: TransportMode): StopConfig | undefined => {
    const stops = getStopsForMode(settings, mode);
    return stops.length > 0 ? stops[0] : undefined;
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
        {/* Provider indicator */}
        <section className="mb-4 p-3 bg-gray-100 border border-black">
          <div className="text-sm">
            <span className="font-bold">Region:</span>{' '}
            {PROVIDER_INFO[activeProvider]?.region || activeProvider}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Enable JavaScript for full settings including region switching.
          </p>
        </section>

        {/* Stop Configuration */}
        <section className="mb-6">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-3 border-b border-black pb-1">
            Your Stops
          </h2>

          {supportedModes.map((mode) => {
            const label = getModeLabel(mode);
            const config = getFirstStopConfig(mode);
            const isSearchingThis = searchMode === mode;

            return (
              <div key={mode} className="py-3 border-b border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold">[{label}]</span>
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
