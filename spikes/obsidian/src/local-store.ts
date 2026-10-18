// Per-device storage. Obsidian's `loadLocalStorage` is kept outside the vault,
// so unlike the plugin's settings it is never carried to other devices by a
// sync tool. Used for the device id and for dismissed warnings.
import type { App } from 'obsidian';

interface LocalStorageApp {
  loadLocalStorage?: (key: string) => string | null;
  saveLocalStorage?: (key: string, value: string | null) => void;
}

export function localGet(app: App, key: string): string | null {
  const host = app as unknown as LocalStorageApp;
  try {
    return typeof host.loadLocalStorage === 'function'
      ? host.loadLocalStorage(key)
      : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localSet(app: App, key: string, value: string | null): void {
  const host = app as unknown as LocalStorageApp;
  try {
    if (typeof host.saveLocalStorage === 'function') host.saveLocalStorage(key, value);
    else if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; callers treat a missing value as "not set".
  }
}
