import { Modal, Notice, type App } from 'obsidian';
import {
  buildReport,
  environment,
  seedBenchmark,
  type SeedResult,
} from './diagnostics.ts';
import type { Runtime } from './runtime.ts';

export interface DiagnosticsHost {
  readonly app: App;
  readonly version: string;
  readonly vaultKey: () => string;
  readonly runtimeIfStarted: () => Runtime | null;
  readonly seedResults: SeedResult[];
  readonly bundleNote: string;
}

export class DiagnosticsModal extends Modal {
  private output!: HTMLPreElement;
  private buttons: HTMLButtonElement[] = [];
  private busy = false;

  constructor(app: App, private readonly host: DiagnosticsHost) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Allotr: diagnostics';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0';
    this.output = document.createElement('pre');
    this.output.style.cssText =
      'white-space:pre-wrap;user-select:text;max-height:55vh;overflow:auto;font-size:11px;line-height:1.35;border:1px solid var(--background-modifier-border);padding:8px';
    this.output.className = 'allotr-diagnostics-output';
    const add = (label: string, onClick: () => void | Promise<void>) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => void onClick());
      this.buttons.push(b);
      row.append(b);
      return b;
    };
    add('Refresh', () => this.refresh());
    add('Time /v1/today', async () => {
      const runtime = this.host.runtimeIfStarted();
      if (runtime === null) return void new Notice('Open the Allotr view first.');
      const result = await runtime.get('/v1/today');
      new Notice(`/v1/today: ${Math.round(result.ms)} ms (status ${result.status})`);
      await this.refresh();
    });
    for (const rows of [5000, 50000]) {
      const label = rows === 5000 ? 'Seed 5k' : 'Seed 50k';
      const button = add(label, async () => {
        if (this.busy) return;
        this.busy = true;
        for (const b of this.buttons) b.disabled = true;
        try {
          const result = await seedBenchmark(rows, (text) => {
            button.textContent = text;
          });
          this.host.seedResults.push(result);
        } finally {
          button.textContent = label;
          this.busy = false;
          for (const b of this.buttons) b.disabled = false;
        }
        await this.refresh();
      });
    }
    add('Copy report', async () => {
      const text = await this.report();
      try {
        await navigator.clipboard.writeText(text);
        new Notice('Report copied.');
      } catch {
        // Clipboard may be blocked: select the text so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(this.output);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        new Notice('Could not copy automatically; the report is selected, copy it by hand.');
      }
    });
    const note = document.createElement('p');
    note.style.cssText = 'font-size:11px;opacity:.7';
    note.textContent =
      'Seed buttons build a made-up ledger in a throwaway in-memory database; your own data is not touched. 50k can take a while and a lot of memory on a phone.';
    contentEl.append(title, row, note, this.output);
    void this.refresh();
  }

  private report(): Promise<string> {
    return buildReport({
      env: environment(this.app, this.host.vaultKey()),
      runtime: this.host.runtimeIfStarted(),
      seeds: this.host.seedResults,
      pluginVersion: this.host.version,
      bundleNote: this.host.bundleNote,
    });
  }

  private async refresh(): Promise<void> {
    this.output.textContent = await this.report();
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}
