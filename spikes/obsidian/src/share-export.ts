// Gets a copy of the ledger out of the vault, so that deleting or corrupting
// the vault (or its sync) cannot take the only copy with it.
//   1. the system share sheet (iOS: "Save to Files", AirDrop, another app);
//   2. on a desktop only, a browser download.
// A phone never falls back to a download: the app's web view may drop it
// without any sign, and a backup that silently went nowhere is worse than an
// error. The share call has to run inside the tap that asked for it (browsers
// expire that permission within seconds), so the export is built first and a
// button in a small dialog makes the call.
import { App, Modal, Platform } from 'obsidian';

export type OutsideResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export async function exportOutsideVault(text: string, filename: string, allowDownload: boolean): Promise<OutsideResult> {
  const type = 'application/json';
  try {
    const file = new File([text], filename, { type });
    if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // The share sheet refused; a desktop may still download.
      }
    }
    if (!allowDownload || typeof URL.createObjectURL !== 'function') return 'failed';
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** The tap that makes the share call. The export is already built when this opens. */
export class ExportOutsideModal extends Modal {
  constructor(
    app: App,
    private readonly text: string,
    private readonly filename: string,
    private readonly counts: string,
    private readonly report: (message: string) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Export Allotr data outside the vault';
    const body = document.createElement('p');
    body.className = 'allotr-export-text';
    body.textContent = Platform.isMobile
      ? `Your export is ready (${this.counts}). Choose "Save to Files" or another app in the share sheet; keep it somewhere that is not in this vault.`
      : `Your export is ready (${this.counts}). It is saved through the share dialog or as a download; keep it somewhere that is not in this vault.`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.className = 'allotr-export-cancel';
    cancel.addEventListener('click', () => this.close());
    const go = document.createElement('button');
    go.textContent = Platform.isMobile ? 'Share…' : 'Save a copy';
    go.className = 'mod-cta allotr-export-go';
    go.addEventListener('click', () => {
      // First thing in the handler: nothing is awaited before the share call.
      void exportOutsideVault(this.text, this.filename, !Platform.isMobile).then((result) => {
        if (result === 'failed') {
          this.report(
            'Allotr could not share the export, so nothing was saved outside the vault. ' +
              'Try again, or use "Export Allotr data to vault" and copy the file out yourself.',
          );
          return;
        }
        this.close();
        if (result === 'shared') this.report('Allotr export shared.');
        else if (result === 'downloaded') this.report('Allotr export downloaded. Keep it somewhere outside the vault.');
      });
    });
    row.append(cancel, go);
    el.append(title, body, row);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}
