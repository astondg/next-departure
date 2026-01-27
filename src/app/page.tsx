/**
 * Next Departure - Home Page
 *
 * Main departure board display with location detection
 * and configurable stops.
 */

import { Metadata } from 'next';
import { HomeClient } from './HomeClient';

export const metadata: Metadata = {
  title: 'Next Departure - E-ink Transit Display',
  description:
    'Real-time public transport departure times optimized for e-ink displays',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function HomePage() {
  return <HomeClient />;
}
