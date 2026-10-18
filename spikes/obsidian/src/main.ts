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
import {
  defaultDeviceName,
  DivergenceModal,
  dismiss,
  readBest,
  readSnapshots,
  RestoreModal,
  VaultBackup,
  type DeviceIdentity,
  type Snapshot,
} from './backup.ts';
import { localGet, localSet } from './local-store.ts';
import { ExportOutsideModal } from './share-export.ts';
import { sha256Hex } from './sha256.ts';
import { runReminders } from '../../../apps/server/src/reminders.ts';
import { mountAllotr, type Mounted } from './mount.tsx';
import { Runtime } from './runtime.ts';

export const VIEW_TYPE = 'allotr-view';
const ICON = 'allotr-wallet';
const PLUGIN_VERSION = '0.0.1-spike.7';

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
  private backup!: VaultBackup;
  private restoreOffered = false;
  private tickRunning = false;
  private divergenceOpen = false;

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
    this.addCommand({
      id: 'export-outside-vault',
      name: 'Export Allotr data outside the vault',
      callback: () => void this.exportOutside(),
    });
    this.addCommand({
      id: 'check-devices',
      name: 'Check other devices for newer Allotr data',
      callback: () => void this.checkDevices(true),
    });
    this.addCommand({
      id: 'restore-backup',
      name: 'Restore Allotr data from vault backup',
      callback: () => void this.restoreFromBackup(),
    });
    this.backup = new VaultBackup(this.app, () => this.device());
    // The server's scheduler (reminders) every 15 minutes while the plugin is loaded.
    this.registerInterval(window.setInterval(() => void this.periodic(), 15 * 60 * 1000));
    // Best-effort save when the page goes to the background or closes; the
    // vault backup follows the save.
    const flush = () => {
      void this.runtime?.flush().then(() => this.backup.flushPending());
    };
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
    // Saves, then backs up to the vault and closes the database (these finish after unload).
    void (async () => {
      if (runtime === null) return;
      await runtime.flush();
      await this.backup.flushPending();
      this.backup.detach();
      await runtime.close();
    })();
  }

  /** This device's id: random, kept in Obsidian's local storage so it never syncs with the vault. */
  private deviceId(): string {
    const storageKey = 'allotr-spike-vault-id';
    let id = localGet(this.app, storageKey);
    if (id === null || id === '') {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
      localSet(this.app, storageKey, id);
    }
    return id;
  }

  private device(): DeviceIdentity {
    const id = this.deviceId();
    return { id, name: defaultDeviceName(id) };
  }

  /** The vault's key: its name plus the device id. */
  private vaultKey(): string {
    this.key = `${this.app.vault.getName()}:${this.deviceId()}`;
    return this.key;
  }

  /** One runtime for the plugin: every open leaf shares it. */
  getRuntime(): Promise<Runtime> {
    this.runtimePromise ??= (async () => {
      try {
        // Before anything can save: when this device last wrote is what newer data elsewhere is judged against.
        await this.backup.loadOwn();
        const runtime = await Runtime.open({
          store: indexedDbBlobStore(this.vaultKey()),
          log: (m) => console.warn('[allotr]', m),
        });
        this.runtime = runtime;
        setApiTransport(runtime.fetch);
        this.backup.attach(runtime);
        void this.afterOpen(runtime);
        return runtime;
      } catch (error) {
        this.runtimePromise = null;
        throw error;
      }
    })();
    return this.runtimePromise;
  }

  /**
   * For an empty ledger, the offer to restore from the vault; otherwise the
   * check for newer data on another device, then the scheduler run (which may
   * save, so it comes last).
   */
  private async afterOpen(runtime: Runtime): Promise<void> {
    try {
      const size = await ledgerSize(runtime);
      if (size.accounts === 0 && size.entries === 0) {
        if (this.restoreOffered) return;
        const info = await readBest(this.app);
        if (info === null || runtime !== this.runtime) return;
        this.restoreOffered = true;
        new RestoreModal(
          this.app,
          info,
          () =>
            void (async () => {
              // Restoring takes the newest snapshot on purpose; the older ones are not news afterwards.
              dismiss(this.app, await readSnapshots(this.app));
              await this.replaceWith(info.text, 'the vault backup', info);
            })(),
          () => this.backup.keepOldLatest(),
        ).open();
        return;
      }
      await this.checkDevices(false);
      await this.schedulerTick();
    } catch (error) {
      console.warn('[allotr] start-up check failed', error);
    }
  }

  /**
   * Warns when another device saved data this one has not seen. Until the user
   * decides, this device writes nothing to the vault, so it cannot bury the
   * other device's data or make the warning disappear by saving first.
   */
  async checkDevices(manual: boolean): Promise<void> {
    const runtime = this.runtime;
    if (runtime === null || this.divergenceOpen) return;
    const found = await this.backup.newerElsewhere(runtime);
    if (runtime !== this.runtime || this.divergenceOpen) return;
    if (found === null) {
      if (this.backup.isHeld) this.backup.hold(false);
      if (manual) notice('No other device has changes this device has not seen.');
      return;
    }
    const { other, mine } = found;
    this.backup.hold(true);
    this.divergenceOpen = true;
    new DivergenceModal(this.app, other, mine, {
      replace: () => void this.importText(other.text, other.name, other),
      keep: () => {
        dismiss(this.app, [other]);
        this.backup.hold(false);
      },
      saveBoth: async () => {
        await this.exportToVault('Allotr mine');
        const path = freePath(this.app, `Allotr ${other.name} ${stamp()}`);
        await this.app.vault.create(path, other.text);
        notice(`Allotr saved ${other.name}'s data to ${path}`);
      },
      closed: () => {
        this.divergenceOpen = false;
      },
    }).open();
  }

  /** Every 15 minutes: look again for changes from other devices (an undecided warning comes back), then the scheduler. */
  private async periodic(): Promise<void> {
    try {
      await this.checkDevices(false);
    } catch (error) {
      console.warn('[allotr] device check failed', error);
    }
    await this.schedulerTick();
  }

  /**
   * The server's scheduler runs the reminder job (apps/server/src/scheduler.ts);
   * here it is the same function on the plugin's database, with no push.
   */
  private async schedulerTick(): Promise<void> {
    const runtime = this.runtime;
    if (runtime === null || this.tickRunning) return;
    this.tickRunning = true;
    try {
      const summary = await runtime.exclusive(
        () => runReminders(runtime.db, (() => Promise.reject(new Error('push is off'))) as never, new Date()),
        (s) => s.created > 0,
      );
      if (summary.created > 0) console.warn('[allotr] reminders created', summary.created);
    } catch (error) {
      console.warn('[allotr] reminder job failed', error);
    } finally {
      this.tickRunning = false;
    }
  }

  /** The "Restore from vault backup" command: with confirm and backup when the ledger has data. */
  async restoreFromBackup(): Promise<void> {
    const info = await readBest(this.app);
    if (info === null) {
      notice('No Allotr backup found in the vault (Allotr/devices).');
      return;
    }
    await this.importText(info.text, `the vault backup from ${info.name}`, info);
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

  /** Builds the export, then asks for the tap that shares it (see share-export.ts). */
  async exportOutside(): Promise<void> {
    try {
      const runtime = await this.getRuntime();
      const text = await exportBundle(runtime);
      const size = await ledgerSize(runtime);
      new ExportOutsideModal(
        this.app,
        text,
        `allotr-export-${stamp().replace(' ', '-')}.json`,
        `${size.accounts} accounts, ${size.entries} entries`,
        (message) => notice(message, 15000),
      ).open();
    } catch (error) {
      notice(`Allotr export failed: ${String(error)}`);
    }
  }

  async importFile(file: TFile): Promise<void> {
    try {
      await this.importText(await this.app.vault.read(file), file.path);
    } catch (error) {
      notice(`Allotr import failed: ${String(error)}`);
    }
  }

  private async importText(text: string, name: string, from?: Snapshot): Promise<void> {
    try {
      const runtime = await this.getRuntime();
      const size = await ledgerSize(runtime);
      if (size.accounts === 0 && size.entries === 0) await this.replaceWith(text, name, from);
      else
        new ReplaceConfirmModal(this.app, size, () => {
          void (async () => {
            const backup = await this.exportToVault('Allotr backup');
            if (backup !== null) await this.replaceWith(text, name, from);
          })();
        }).open();
    } catch (error) {
      notice(`Allotr import failed: ${String(error)}`);
    }
  }

  /** Imports into a fresh database; only on success does it replace this device's data. */
  private async replaceWith(text: string, name: string, from?: Snapshot): Promise<void> {
    notice(`Importing ${name}…`, 4000);
    const outcome = await importIntoFresh(text, (m) => console.warn('[allotr]', m));
    if (!outcome.ok) {
      notice(`Allotr import refused, nothing changed:\n${outcome.message}`, 20000);
      return;
    }
    const reopen = this.views.size > 0;
    for (const view of [...this.views]) view.leaf.detach();
    const old = await this.getRuntime();
    await old.flush();
    await this.backup.flushPending();
    this.backup.detach();
    await old.close();
    this.runtime = null;
    this.runtimePromise = null;
    setApiTransport(undefined);
    await indexedDbBlobStore(this.vaultKey()).save(outcome.bytes);
    // Before the new runtime starts its start-up check: that snapshot is what this device now holds.
    if (from !== undefined) this.backup.replacedBy(from);
    const fresh = await this.getRuntime();
    if (from !== undefined) this.backup.derivedHash(sha256Hex(await exportBundle(fresh)));
    this.backup.hold(false);
    this.backup.schedule();
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
