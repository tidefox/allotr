// Minimal typings for the part of the Obsidian API the spike uses (the real
// package is only needed for type-checking, and the spike is not type-checked
// in CI).
declare module 'obsidian' {
  export const Platform: {
    isDesktopApp: boolean; isMobileApp: boolean; isIosApp: boolean; isAndroidApp: boolean;
    isPhone: boolean; isTablet: boolean; isDesktop: boolean; isMobile: boolean;
  };
  export function addIcon(id: string, svg: string): void;
  export class Notice { constructor(message: string, duration?: number); }
  export interface TFile {
    path: string; name: string; extension: string;
    stat: { ctime: number; mtime: number; size: number };
  }
  export interface DataAdapter {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    remove(path: string): Promise<void>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    stat(path: string): Promise<{ mtime: number; ctime: number; size: number } | null>;
  }
  export interface Vault {
    adapter: DataAdapter;
    getName(): string;
    getFiles(): TFile[];
    read(file: TFile): Promise<string>;
    create(path: string, data: string): Promise<TFile>;
    getAbstractFileByPath(path: string): unknown;
  }
  export interface Workspace {
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getLeaf(newLeaf?: boolean | 'tab' | 'split' | 'window'): WorkspaceLeaf;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
  }
  export interface App { vault: Vault; workspace: Workspace; }
  export class WorkspaceLeaf {
    view: View;
    setViewState(state: { type: string; active?: boolean }): Promise<void>;
    detach(): void;
  }
  export class View { app: App; leaf: WorkspaceLeaf; containerEl: HTMLElement; constructor(leaf: WorkspaceLeaf); }
  export class ItemView extends View {
    contentEl: HTMLElement;
    getIcon(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }
  export class Modal {
    app: App; contentEl: HTMLElement;
    constructor(app: App);
    open(): void; close(): void; onOpen(): void; onClose(): void;
  }
  export class Plugin {
    app: App;
    onload(): Promise<void> | void;
    onunload(): void;
    registerInterval(id: number): number;
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement;
    addCommand(command: { id: string; name: string; callback?: () => void }): void;
    registerDomEvent<K extends keyof WindowEventMap>(el: Window, type: K, cb: (e: WindowEventMap[K]) => void): void;
    registerDomEvent<K extends keyof DocumentEventMap>(el: Document, type: K, cb: (e: DocumentEventMap[K]) => void): void;
  }
}
