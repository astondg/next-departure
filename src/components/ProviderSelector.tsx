'use client';

/**
 * ProviderSelector Component
 *
 * Allows users to switch between transit providers.
 * Shows the current provider and available alternatives.
 */

import { ProviderId, PROVIDER_INFO, listProviders, isProviderAvailable } from '@/lib/providers';

interface ProviderSelectorProps {
  activeProvider: ProviderId;
  onProviderChange: (providerId: ProviderId) => void;
}

export function ProviderSelector({
  activeProvider,
  onProviderChange,
}: ProviderSelectorProps) {
  const allProviders = listProviders();
  const availableProviders = allProviders.filter(isProviderAvailable);

  // If only one provider is available, don't show the selector
  if (availableProviders.length <= 1) {
    return (
      <span style={{ fontWeight: 500 }}>
        {PROVIDER_INFO[activeProvider]?.region || 'Unknown'}
      </span>
    );
  }

  return (
    <select
      value={activeProvider}
      onChange={(e) => onProviderChange(e.target.value as ProviderId)}
      style={{
        appearance: 'none',
        WebkitAppearance: 'none',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px dashed #666',
        padding: '4px 20px 4px 0',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: '#666',
        cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M3 4l3 4 3-4z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0 center',
      }}
      title="Change region"
    >
      {availableProviders.map((providerId) => (
        <option key={providerId} value={providerId}>
          {PROVIDER_INFO[providerId]?.region || providerId}
        </option>
      ))}
    </select>
  );
}
