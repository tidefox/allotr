import { createContext, use } from 'react';

// SPIKE (Obsidian plugin): seams that let the web app run embedded in
// another page, inside a Shadow DOM, with the API answered in-process.
// Everything defaults to the standalone behaviour, so main.tsx is untouched.

/** What the theme code writes `data-theme`, role colours and prefs onto. */
export type ThemeTarget = Readonly<{
  documentElement: HTMLElement;
  querySelectorAll: Document['querySelectorAll'];
}>;

/** A source for "prefers dark" other than the browser's media query. */
export interface ColorSchemeSource {
  prefersDark(): boolean;
  subscribe(onChange: () => void): () => void;
}

/** Per-mount (per view) settings; a plugin provides them via EmbedContext. */
export interface EmbedHost {
  /** Element that carries `data-theme`, role variables and `data-motion`. */
  readonly themeTarget?: ThemeTarget;
  /** Replaces `matchMedia('(prefers-color-scheme: dark)')` for "system". */
  readonly colorScheme?: ColorSchemeSource;
  /** Where `#strip-controls` is looked up (a shadow root, not `document`). */
  readonly root?: Pick<Document, 'getElementById'>;
  /** Where app-level shortcuts listen instead of `window`. */
  readonly keyTarget?: EventTarget;
}

export const EmbedContext = createContext<EmbedHost>({});

export function useEmbed(): EmbedHost {
  return use(EmbedContext);
}

// The API transport is per runtime, not per view: every view of a vault
// shares one in-process server. Never replaces window.fetch.
let transport: typeof fetch | undefined;

export function setApiTransport(next: typeof fetch | undefined): void {
  transport = next;
}

export function apiFetch(
  ...args: Parameters<typeof fetch>
): ReturnType<typeof fetch> {
  return (transport ?? fetch)(...args);
}

export function hasApiTransport(): boolean {
  return transport !== undefined;
}
