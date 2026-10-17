// Mounts the real apps/web React app inside a Shadow DOM root.
import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { Platform } from 'obsidian';
import { UNSAFE_PortalProvider } from 'react-aria';
import { enableShadowDOM } from 'allotr:shadow-flag';
import { createRoot } from 'react-dom/client';
import { appCss } from 'virtual:css';
import { ThemeProvider } from '../../../apps/web/src/components/theme-provider.tsx';
import { applyPrefs, readPref } from '../../../apps/web/src/lib/device-prefs.ts';
import { EmbedContext, type EmbedHost } from '../../../apps/web/src/lib/embed.tsx';
import { createQueryClient } from '../../../apps/web/src/lib/query-client.ts';
import { sessionQuery } from '../../../apps/web/src/lib/session.ts';
import { createAppRouter } from '../../../apps/web/src/router.tsx';
import { trackBottomInset, type LayoutController, type LayoutSnapshot } from './layout.ts';
import type { Runtime } from './runtime.ts';

// Must run before any overlay renders.
enableShadowDOM();

export const BANNER_TEXT = 'Spike build: data stays on this device and is not synced yet.';

// Layout glue around the app: the host fills the leaf, the wrapper carries the
// theme attributes (`:root` in the app CSS is rewritten to `.ar`), and the app
// area is the containing block for the app's `fixed` sheets.
const EMBED_CSS = `
:host { all: initial; display: block; position: relative; width: 100%; height: 100%; overflow: hidden; contain: layout paint; }
.ar { position: relative; box-sizing: border-box; width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
/* Mobile: keep the frame above Obsidian's floating navbar (layout.ts sets the inset on the host). */
.ar-mobile { padding-bottom: max(var(--allotr-bottom-inset, 0px), env(safe-area-inset-bottom, 0px)); }
.ar-banner { flex: none; padding: 4px 12px; font-size: 0.6875rem; line-height: 1.3; background: var(--warning-container); color: var(--on-primary-container); border-bottom: 1px solid var(--outline-variant); }
.ar-app { position: relative; flex: 1 1 0; min-height: 0; overflow: hidden; contain: layout paint; }
.ar-root { position: absolute; inset: 0; overflow: hidden; }
.ar-portals { position: absolute; inset: 0; pointer-events: none; z-index: 1000; }
.ar-portals > * { pointer-events: auto; }
`;

function isEditable(node: EventTarget | undefined): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return node.isContentEditable || node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
}

export interface Mounted {
  readonly shadow: ShadowRoot;
  readonly host: HTMLElement;
  layout(): LayoutSnapshot;
  unmount(): void;
}

/** Follows Obsidian's light/dark class on <body>. */
function obsidianColorScheme(doc: Document) {
  return {
    prefersDark: () => doc.body.classList.contains('theme-dark'),
    subscribe(onChange: () => void) {
      const observer = new MutationObserver(onChange);
      observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
  };
}

function sharedQueryClient(runtime: Runtime): QueryClient {
  let client = runtime.shared['queryClient'] as QueryClient | undefined;
  if (client === undefined) {
    const created: QueryClient = createQueryClient({
      onUnauthorized: () => created.setQueryData(sessionQuery.queryKey, null),
    });
    client = created;
    runtime.shared['queryClient'] = created;
  }
  return client;
}

export function mountAllotr(container: HTMLElement, runtime: Runtime): Mounted {
  const doc = container.ownerDocument;
  // No network to lose: keep React Query from pausing on `navigator.onLine`.
  onlineManager.setEventListener(() => () => undefined);
  onlineManager.setOnline(true);

  const host = doc.createElement('div');
  host.className = 'allotr-host';
  container.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = appCss + EMBED_CSS;
  const wrapper = doc.createElement('div');
  wrapper.className = Platform.isMobile ? 'ar ar-mobile' : 'ar';
  const banner = doc.createElement('div');
  banner.className = 'ar-banner';
  banner.textContent = BANNER_TEXT;
  const appArea = doc.createElement('div');
  appArea.className = 'ar-app';
  const rootEl = doc.createElement('div');
  rootEl.className = 'ar-root';
  rootEl.id = 'root';
  const portals = doc.createElement('div');
  portals.className = 'ar-portals';
  appArea.append(rootEl, portals);
  wrapper.append(banner, appArea);
  shadow.append(style, wrapper);

  // The pre-paint work theme-init.js does on a normal page.
  const scheme = obsidianColorScheme(doc);
  wrapper.dataset['theme'] = scheme.prefersDark() ? 'dark' : 'light';
  applyPrefs(
    { documentElement: wrapper },
    { motion: readPref('motion'), density: readPref('density'), hints: readPref('hints') },
  );

  const embed: EmbedHost = {
    themeTarget: { documentElement: wrapper, querySelectorAll: () => [] as unknown as NodeListOf<Element> },
    colorScheme: scheme,
    root: shadow,
    keyTarget: wrapper,
  };

  // Keys typed in the view must not reach Obsidian's hotkeys. The app has
  // already handled the event (React listens inside the shadow root), so
  // stopping it here only hides it from the page. Editable targets keep
  // every key; elsewhere only modified keys (Ctrl/Cmd+P and friends) pass.
  const keyGuard = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const origin = event.composedPath()[0];
    if (isEditable(origin) || !(event.ctrlKey || event.metaKey || event.altKey)) event.stopPropagation();
  };
  const keyEvents = ['keydown', 'keyup', 'keypress'] as const;
  for (const name of keyEvents) host.addEventListener(name, keyGuard);

  // react-aria bug in shadow roots (3.52): when a menu opens inside a dialog,
  // the dialog's still-running shadow-root observer hides the new popover or
  // phone sheet (inert), because only the light-DOM observer is swapped out
  // by the newer overlay. Marking an overlay's wrapper as a "top layer"
  // element makes react-aria keep it visible. Created before any overlay, so it runs first.
  const topLayer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof HTMLElement && node.tagName === 'DIV') node.setAttribute('data-react-aria-top-layer', '');
  });
  topLayer.observe(portals, { childList: true });

  const layout: LayoutController = trackBottomInset(host);

  const queryClient = sharedQueryClient(runtime);
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: ['/'] }));
  const root = createRoot(rootEl);
  root.render(
    <EmbedContext value={embed}>
      <UNSAFE_PortalProvider getContainer={() => portals}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </QueryClientProvider>
      </UNSAFE_PortalProvider>
    </EmbedContext>,
  );

  return {
    shadow,
    host,
    layout: () => layout.snapshot(),
    unmount() {
      layout.dispose();
      root.unmount();
      topLayer.disconnect();
      for (const name of keyEvents) host.removeEventListener(name, keyGuard);
      host.remove();
    },
  };
}
