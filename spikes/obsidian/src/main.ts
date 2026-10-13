import { addIcon, ItemView, Plugin, type WorkspaceLeaf } from 'obsidian';
import { setApiTransport } from '../../../apps/web/src/lib/embed.tsx';
import { indexedDbBlobStore } from './blob-store.ts';
import { DiagnosticsModal } from './diagnostics-modal.ts';
import type { SeedResult } from './diagnostics.ts';
import { installHeadStyles, removeHeadStyles } from './head-styles.ts';
import { mountAllotr, type Mounted } from './mount.tsx';
import { Runtime } from './runtime.ts';

export const VIEW_TYPE = 'allotr-view';
const ICON = 'allotr-wallet';
const PLUGIN_VERSION = '0.0.0-spike-s1';

declare const __BUNDLE_NOTE__: string;

const WALLET_SVG =
  '<path fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" d="M12 28h72a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6zM12 28l62-14v14M62 56h28v14H62z"/>';

class AllotrView extends ItemView {
  private mounted: Mounted | null = null;
  private torn = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: AllotrPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Allotr';
  }
  override getIcon(): string {
    return ICON;
  }

  override async onOpen(): Promise<void> {
    const el = this.contentEl;
    el.replaceChildren();
    el.style.padding = '0';
    el.style.overflow = 'hidden';
    el.style.height = '100%';
    this.plugin.views.add(this);
    try {
      const runtime = await this.plugin.getRuntime();
      if (this.torn) return;
      this.mounted = mountAllotr(el, runtime);
    } catch (error) {
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;padding:12px;user-select:text';
      pre.textContent = `Allotr could not start:\n${String(error)}`;
      el.append(pre);
    }
  }

  override async onClose(): Promise<void> {
    this.teardown();
  }

  teardown(): void {
    this.torn = true;
    this.mounted?.unmount();
    this.mounted = null;
    this.plugin.views.delete(this);
  }
}

export default class AllotrPlugin extends Plugin {
  readonly views = new Set<AllotrView>();
  readonly seedResults: SeedResult[] = [];
  private runtimePromise: Promise<Runtime> | null = null;
  private runtime: Runtime | null = null;
  private key = '';

  override async onload(): Promise<void> {
    installHeadStyles(document);
    addIcon(ICON, WALLET_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new AllotrView(leaf, this));
    this.addRibbonIcon(ICON, 'Open Allotr', () => void this.openView());
    this.addCommand({ id: 'open', name: 'Open Allotr', callback: () => void this.openView() });
    this.addCommand({
      id: 'diagnostics',
      name: 'Diagnostics',
      callback: () => {
        new DiagnosticsModal(this.app, {
          app: this.app,
          version: PLUGIN_VERSION,
          vaultKey: () => this.key || this.vaultKey(),
          runtimeIfStarted: () => this.runtime,
          seedResults: this.seedResults,
          bundleNote: typeof __BUNDLE_NOTE__ === 'string' ? __BUNDLE_NOTE__ : 'dev',
        }).open();
      },
    });
    // Best-effort save when the page goes to the background or closes.
    const flush = () => void this.runtime?.flush();
    this.registerDomEvent(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    this.registerDomEvent(window, 'pagehide', flush);
  }

  override onunload(): void {
    for (const view of [...this.views]) view.teardown();
    const runtime = this.runtime;
    this.runtime = null;
    this.runtimePromise = null;
    setApiTransport(undefined);
    removeHeadStyles(document);
    // Saves, then closes the database (the write finishes after unload).
    void runtime?.close();
  }

  /** The vault's key: its name plus a random id kept in Obsidian's local storage. */
  private vaultKey(): string {
    const storageKey = 'allotr-spike-vault-id';
    const app = this.app as unknown as {
      loadLocalStorage?: (key: string) => string | null;
      saveLocalStorage?: (key: string, value: string | null) => void;
    };
    const read = (): string | null =>
      typeof app.loadLocalStorage === 'function'
        ? app.loadLocalStorage(storageKey)
        : window.localStorage.getItem(storageKey);
    let id = read();
    if (id === null || id === '') {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      if (typeof app.saveLocalStorage === 'function') app.saveLocalStorage(storageKey, id);
      else window.localStorage.setItem(storageKey, id);
    }
    this.key = `${this.app.vault.getName()}:${id}`;
    return this.key;
  }

  /** One runtime for the plugin: every open leaf shares it. */
  getRuntime(): Promise<Runtime> {
    this.runtimePromise ??= (async () => {
      try {
        const runtime = await Runtime.open({
          store: indexedDbBlobStore(this.vaultKey()),
          log: (m) => console.warn('[allotr]', m),
        });
        this.runtime = runtime;
        setApiTransport(runtime.fetch);
        return runtime;
      } catch (error) {
        this.runtimePromise = null;
        throw error;
      }
    })();
    return this.runtimePromise;
  }

  async openView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing !== undefined) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}
