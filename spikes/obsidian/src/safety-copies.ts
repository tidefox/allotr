// A copy of this device's data, kept before it is replaced by another
// snapshot or an import. It lives in IndexedDB next to the database itself
// (not in the vault, where every copy would be synced to every device), the
// newest few per vault, and "Restore an earlier Allotr copy from this device"
// lists them.
import { App, Modal } from 'obsidian';

const DB_NAME = 'allotr-spike-safety';
const STORE = 'copies';
export const KEEP_SAFETY_COPIES = 5;

export interface SafetyCopy {
  /** `${vault key}|${savedAt}` */
  id: string;
  key: string;
  savedAt: number;
  /** Why it was made, e.g. "before taking Desktop 3fa9's data". */
  reason: string;
  accounts: number;
  entries: number;
  text: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/** This vault's copies, newest first. */
export async function listSafetyCopies(key: string): Promise<SafetyCopy[]> {
  const all = await transact<SafetyCopy[]>('readonly', (s) => s.getAll() as IDBRequest<SafetyCopy[]>);
  return all.filter((c) => c.key === key).sort((a, b) => b.savedAt - a.savedAt);
}

/** Stores a copy and drops this vault's older ones beyond the newest five. A copy identical to the newest one is not stored twice. */
export async function saveSafetyCopy(key: string, copy: Omit<SafetyCopy, 'id' | 'key' | 'savedAt'>): Promise<void> {
  const existing = await listSafetyCopies(key);
  if (existing[0]?.text === copy.text) return;
  const savedAt = Math.max(Date.now(), (existing[0]?.savedAt ?? 0) + 1);
  await transact('readwrite', (s) => s.put({ ...copy, id: `${key}|${savedAt}`, key, savedAt }));
  for (const old of existing.slice(KEEP_SAFETY_COPIES - 1)) await transact('readwrite', (s) => s.delete(old.id));
}

function localStamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Lists this device's safety copies; calls back with the chosen one. */
export class SafetyCopyModal extends Modal {
  constructor(
    app: App,
    private readonly copies: SafetyCopy[],
    private readonly onPick: (copy: SafetyCopy) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const el = this.contentEl;
    el.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = 'Restore an earlier Allotr copy from this device';
    const hint = document.createElement('p');
    hint.textContent =
      'Allotr keeps a copy of this device\'s data before it takes another device\'s data or an import. Pick one to put back; the current data is kept as a copy first.';
    el.append(title, hint);
    if (this.copies.length === 0) {
      const none = document.createElement('p');
      none.className = 'allotr-safety-none';
      none.textContent = 'No copies yet.';
      el.append(none);
      return;
    }
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto';
    for (const copy of this.copies) {
      const button = document.createElement('button');
      button.className = 'allotr-safety-copy';
      button.style.cssText = 'text-align:left;height:auto;padding:6px 10px;white-space:normal';
      button.textContent = `${localStamp(copy.savedAt)}: ${copy.accounts} accounts, ${copy.entries} entries (${copy.reason})`;
      button.addEventListener('click', () => {
        this.close();
        this.onPick(copy);
      });
      list.append(button);
    }
    el.append(list);
  }

  override onClose(): void {
    this.contentEl.replaceChildren();
  }
}
