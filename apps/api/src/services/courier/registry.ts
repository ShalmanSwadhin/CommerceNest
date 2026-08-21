import type { CourierProvider } from './types.js';
import { steadfastProvider } from './steadfast.provider.js';

/** Every registered provider, by id. Adding a second courier means adding
 * one adapter file + one line here — nothing else in the app changes. */
const PROVIDERS: Record<string, CourierProvider> = {
  [steadfastProvider.id]: steadfastProvider,
};

export function getCourierProvider(providerId: string): CourierProvider | undefined {
  return PROVIDERS[providerId];
}

export function listCourierProviders(): CourierProvider[] {
  return Object.values(PROVIDERS);
}
