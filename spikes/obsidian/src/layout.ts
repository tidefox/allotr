// Keeps the Allotr frame above Obsidian mobile's floating bottom navbar.
//
// Obsidian documents no CSS variable for the mobile navbar or the safe area
// (the CSS variable reference has no mobile section), so the navbar element is
// measured. The result is published as `--allotr-bottom-inset` on the host
// element and applied by the embed CSS as padding-bottom on the `.ar` frame,
// together with `env(safe-area-inset-bottom)`.
import { Platform } from 'obsidian';

/** Class names tried first, in order. */
export const NAVBAR_SELECTORS = ['.mobile-navbar', '.mobile-navbar-container', '.floating-navbar', '.mobile-navbar-actions'];
/** Variables that may carry the navbar height; informational and a last resort. */
export const NAVBAR_VARS = ['--mobile-navbar-height', '--navbar-height', '--mobile-toolbar-height', '--safe-area-inset-bottom'];

export type LayoutMethod = 'not mobile' | 'element' | 'element (class*=navbar)' | 'css variable' | 'none found';

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
}

export interface LayoutSnapshot {
  mobile: boolean;
  method: LayoutMethod;
  navbarSelector: string | null;
  navbarClass: string | null;
  viewRect: Box | null;
  navbarRect: Box | null;
  insetPx: number;
  safeAreaPx: number;
  appliedPaddingPx: number;
  variables: Record<string, string>;
  window: string;
  visualViewport: string;
  updates: number;
}

export interface LayoutController {
  snapshot(): LayoutSnapshot;
  dispose(): void;
}

const box = (r: DOMRect): Box => ({
  top: Math.round(r.top * 10) / 10,
  bottom: Math.round(r.bottom * 10) / 10,
  left: Math.round(r.left * 10) / 10,
  right: Math.round(r.right * 10) / 10,
  height: Math.round(r.height * 10) / 10,
});

export function formatBox(b: Box | null): string {
  return b === null ? 'none' : `top ${b.top}, bottom ${b.bottom}, left ${b.left}, right ${b.right}, height ${b.height}`;
}

interface Found {
  el: HTMLElement;
  selector: string;
  generic: boolean;
}

function usable(el: Element, view: HTMLElement, win: Window, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (el.contains(view) || view.contains(el)) return false;
  if (rect.height > win.innerHeight * 0.4) return false;
  const style = win.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function findNavbar(doc: Document, view: HTMLElement): Found | null {
  const win = doc.defaultView ?? window;
  for (const selector of NAVBAR_SELECTORS) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector))
      if (usable(el, view, win, el.getBoundingClientRect())) return { el, selector, generic: false };
  }
  // Unknown class names: any visible element with "navbar" in a class, in the
  // lower half of the window; the lowest one wins.
  let best: Found | null = null;
  let bestBottom = -Infinity;
  for (const el of doc.querySelectorAll<HTMLElement>('[class*="navbar"]')) {
    const rect = el.getBoundingClientRect();
    if (!usable(el, view, win, rect) || rect.bottom < win.innerHeight * 0.5) continue;
    if (rect.bottom > bestBottom) {
      best = { el, selector: '[class*="navbar"]', generic: true };
      bestBottom = rect.bottom;
    }
  }
  return best;
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Starts tracking. Does nothing (and reports "not mobile") off mobile. */
export function trackBottomInset(host: HTMLElement): LayoutController {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  const mobile = Platform.isMobile;
  let current: LayoutSnapshot = {
    mobile, method: 'not mobile', navbarSelector: null, navbarClass: null, viewRect: null, navbarRect: null,
    insetPx: 0, safeAreaPx: 0, appliedPaddingPx: 0, variables: {}, window: '', visualViewport: '', updates: 0,
  };
  if (!mobile) {
    return { snapshot: () => current, dispose: () => undefined };
  }

  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
  host.append(probe);

  let updates = 0;
  let frame = 0;
  let observed: Element | null = null;
  const resizeObserver = new ResizeObserver(() => schedule());
  resizeObserver.observe(host);
  const navAttrObserver = new MutationObserver(() => schedule());

  function observeNavbar(el: Element | null): void {
    if (el === observed) return;
    if (observed !== null) resizeObserver.unobserve(observed);
    navAttrObserver.disconnect();
    observed = el;
    if (el !== null) {
      resizeObserver.observe(el);
      navAttrObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
  }

  function measure(): void {
    frame = 0;
    const viewRect = host.getBoundingClientRect();
    const found = findNavbar(doc, host);
    observeNavbar(found?.el ?? null);
    const navRect = found?.el.getBoundingClientRect() ?? null;
    const safe = px(win.getComputedStyle(probe).paddingBottom);
    const body = win.getComputedStyle(doc.body);
    const variables: Record<string, string> = {};
    for (const name of NAVBAR_VARS) {
      const value = body.getPropertyValue(name).trim();
      variables[name] = value === '' ? '(unset)' : value;
    }
    let method: LayoutMethod = 'none found';
    let inset = 0;
    if (navRect !== null && found !== null) {
      method = found.generic ? 'element (class*=navbar)' : 'element';
      inset = Math.max(0, viewRect.bottom - navRect.top);
    } else {
      const fromVar = px(variables['--mobile-navbar-height'] ?? '');
      if (fromVar > 0) {
        method = 'css variable';
        inset = fromVar;
      }
    }
    inset = Math.round(inset * 10) / 10;
    host.style.setProperty('--allotr-bottom-inset', `${inset}px`);
    updates += 1;
    current = {
      mobile,
      method,
      navbarSelector: found?.selector ?? null,
      navbarClass: found?.el.className.toString() ?? null,
      viewRect: box(viewRect),
      navbarRect: navRect === null ? null : box(navRect),
      insetPx: inset,
      safeAreaPx: safe,
      appliedPaddingPx: Math.max(inset, safe),
      variables,
      window: `${win.innerWidth}x${win.innerHeight}`,
      visualViewport:
        win.visualViewport === null
          ? 'n/a'
          : `${Math.round(win.visualViewport.width)}x${Math.round(win.visualViewport.height)} offsetTop ${Math.round(win.visualViewport.offsetTop)}`,
      updates,
    };
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(measure);
  }

  // The navbar can appear, disappear or animate without the view resizing.
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const onTransition = (event: Event) => {
    if (!event.composedPath().includes(host)) schedule();
  };
  doc.addEventListener('transitionend', onTransition, true);
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('scroll', schedule);
  // Safety net for changes none of the above signals.
  const timer = win.setInterval(schedule, 1000);
  measure();

  return {
    snapshot() {
      measure();
      return current;
    },
    dispose() {
      if (frame !== 0) win.cancelAnimationFrame(frame);
      win.clearInterval(timer);
      resizeObserver.disconnect();
      navAttrObserver.disconnect();
      bodyObserver.disconnect();
      doc.removeEventListener('transitionend', onTransition, true);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('orientationchange', schedule);
      win.visualViewport?.removeEventListener('resize', schedule);
      win.visualViewport?.removeEventListener('scroll', schedule);
      probe.remove();
    },
  };
}

export function formatLayout(layouts: readonly LayoutSnapshot[]): string[] {
  const lines = ['## Layout'];
  const first = layouts[0];
  if (first === undefined) return [...lines, '- no Allotr view open (open it, then refresh)', ''];
  lines.push(`- Window ${first.window}, visualViewport ${first.visualViewport}`);
  layouts.forEach((l, i) => {
    lines.push(`- View ${i + 1}${layouts.length > 1 ? ` of ${layouts.length}` : ''}: mobile handling ${l.mobile ? 'on' : 'off (not mobile)'}`);
    lines.push(`  - view rect: ${formatBox(l.viewRect)}`);
    lines.push(`  - navbar rect: ${formatBox(l.navbarRect)}`);
    lines.push(`  - navbar element: ${l.navbarSelector ?? 'none'}${l.navbarClass === null ? '' : ` (class "${l.navbarClass}")`}`);
    lines.push(`  - inset (view bottom minus navbar top): ${l.insetPx} px`);
    lines.push(`  - method: ${l.method}`);
    lines.push(`  - safe-area-inset-bottom: ${l.safeAreaPx} px; padding applied to the frame: ${l.appliedPaddingPx} px`);
    lines.push(`  - variables: ${Object.entries(l.variables).map(([k, v]) => `${k}=${v}`).join(', ') || 'n/a'}`);
    lines.push(`  - measurements taken: ${l.updates}`);
  });
  lines.push('');
  return lines;
}

/**
 * Desktop: Obsidian's status bar floats over the bottom-right corner of the
 * view. Publishes how much of the view's bottom edge it covers as
 * `--allotr-statusbar-h` (height) and `--allotr-statusbar-w` (width) on the
 * host; the embed CSS makes the app's own status line at least that tall and
 * keeps its content left of the bar, so nothing important sits behind it.
 */
export function trackStatusBar(host: HTMLElement): () => void {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  if (Platform.isMobile) return () => undefined;
  let frame = 0;
  let observed: Element | null = null;
  const resizeObserver = new ResizeObserver(() => schedule());
  resizeObserver.observe(host);

  function measure(): void {
    frame = 0;
    const bar = doc.querySelector<HTMLElement>('.status-bar');
    if (bar !== observed) {
      if (observed !== null) resizeObserver.unobserve(observed);
      observed = bar;
      if (bar !== null) resizeObserver.observe(bar);
    }
    const view = host.getBoundingClientRect();
    const rect = bar?.getBoundingClientRect();
    let height = 0;
    let width = 0;
    if (rect !== undefined && rect.width > 0 && rect.height > 0 && win.getComputedStyle(bar as Element).display !== 'none') {
      const overlapsX = rect.right > view.left && rect.left < view.right;
      const overlapsY = rect.bottom > view.top && rect.top < view.bottom;
      if (overlapsX && overlapsY) {
        height = Math.ceil(Math.max(0, view.bottom - rect.top));
        width = Math.ceil(Math.max(0, Math.min(rect.right, view.right) - Math.max(rect.left, view.left)));
        // The bar's own right margin keeps it off the edge; cover that too.
        width += Math.max(0, Math.ceil(view.right - rect.right));
      }
    }
    host.style.setProperty('--allotr-statusbar-h', `${height}px`);
    host.style.setProperty('--allotr-statusbar-w', `${width}px`);
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(measure);
  }

  // Its width follows the open file (backlinks, word count), so watch the text.
  const mutationObserver = new MutationObserver(schedule);
  const watch = () => {
    mutationObserver.disconnect();
    const bar = doc.querySelector('.status-bar');
    if (bar !== null) mutationObserver.observe(bar, { childList: true, subtree: true, characterData: true, attributes: true });
    schedule();
  };
  const bodyObserver = new MutationObserver(watch);
  bodyObserver.observe(doc.body, { childList: true, attributes: true, attributeFilter: ['class'] });
  win.addEventListener('resize', schedule);
  // Moving between files changes the bar without any signal on the view.
  const timer = win.setInterval(schedule, 1000);
  watch();

  return () => {
    if (frame !== 0) win.cancelAnimationFrame(frame);
    win.clearInterval(timer);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    bodyObserver.disconnect();
    win.removeEventListener('resize', schedule);
  };
}
