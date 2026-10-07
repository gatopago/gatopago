'use client';

import { useSyncExternalStore } from 'react';

/**
 * The advanced view: networks, per-network balances, moving between networks and technical
 * details. Off by default, so people see their coins and never have to choose a network. Kept on
 * this device.
 */
const ADVANCED = 'gatopago:advanced';
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(ADVANCED) === '1';
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ADVANCED) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setAdvanced(on: boolean) {
  try {
    if (on) localStorage.setItem(ADVANCED, '1');
    else localStorage.removeItem(ADVANCED);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

/** Whether the advanced view is on; the simple view while rendering on the server. */
export const useAdvanced = () => useSyncExternalStore(subscribe, read, () => false);
