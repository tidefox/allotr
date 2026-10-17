import { addIcon, ItemView, Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import { setApiTransport } from '../../../apps/web/src/lib/embed.tsx';
import { indexedDbBlobStore } from './blob-store.ts';
import { DiagnosticsModal } from './diagnostics-modal.ts';
import type { SeedResult } from './diagnostics.ts';
import type { LayoutSnapshot } from './layout.ts';
import { installHeadStyles, removeHeadStyles } from './head-styles.ts';
import {
  BundlePickerModal,
  countsLine,
  exportBundle,
  freePath,
  importIntoFresh,
  ledgerSize,
  notice,
  ReplaceConfirmModal,
  stamp,
} from './migrate.ts';
import { mountAllotr, type Mounted } from './mount.tsx';
import { Runtime } from './runtime.ts';

export const VIEW_TYPE = 'allotr-view';
const ICON = 'allotr-wallet';
const PLUGIN_VERSION = '0.0.1-spike.3';

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

  layout(): LayoutSnapshot | null {
    return this.mounted?.layout() ?? null;
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
          layouts: () => [...this.views].map((v) => v.layout()).filter((l): l is LayoutSnapshot => l !== null),
          bundleNote: typeof __BUNDLE_NOTE__ === 'string' ? __BUNDLE_NOTE__ : 'dev',
        }).open();
      },
    });
    this.addCommand({
      id: 'import-bundle',
      name: 'Import Allotr export from vault',
      callback: () => new BundlePickerModal(this.app, (file) => void this.importFile(file)).open(),
    });
    this.addCommand({
      id: 'export-bundle',
      name: 'Export Allotr data to vault',
      callback: () => void this.exportToVault('Allotr export'),
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

  /** Writes the ledger as a JSON bundle to the vault root; returns its path. */
  async exportToVault(stem: string): Promise<string | null> {
    try {
      const runtime = await this.getRuntime();
      const path = freePath(this.app, `${stem} ${stamp()}`);
      await this.app.vault.create(path, await exportBundle(runtime));
      notice(`Allotr data saved to ${path}`);
      return path;
    } catch (error) {
      notice(`Allotr export failed: ${String(error)}`);
      return null;
    }
  }

  async importFile(file: TFile): Promise<void> {
    try {
      const text = await this.app.vault.read(file);
      const runtime = await this.getRuntime();
      const size = await ledgerSize(runtime);
      if (size.accounts === 0 && size.entries === 0) await this.replaceWith(text, file.path);
      else
        new ReplaceConfirmModal(this.app, size, () => {
          void (async () => {
            const backup = await this.exportToVault('Allotr backup');
            if (backup !== null) await this.replaceWith(text, file.path);
          })();
        }).open();
    } catch (error) {
      notice(`Allotr import failed: ${String(error)}`);
    }
  }

  /** Imports into a fresh database; only on success does it replace this device's data. */
  private async replaceWith(text: string, name: string): Promise<void> {
    notice(`Importing ${name}…`, 4000);
    const outcome = await importIntoFresh(text, (m) => console.warn('[allotr]', m));
    if (!outcome.ok) {
      notice(`Allotr import refused, nothing changed:\n${outcome.message}`, 20000);
      return;
    }
    const reopen = this.views.size > 0;
    for (const view of [...this.views]) view.leaf.detach();
    const old = await this.getRuntime();
    await old.close();
    this.runtime = null;
    this.runtimePromise = null;
    setApiTransport(undefined);
    await indexedDbBlobStore(this.vaultKey()).save(outcome.bytes);
    await this.getRuntime();
    notice(`Allotr import done: ${countsLine(outcome.counts)}`, 12000);
    if (reopen) await this.openView();
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
