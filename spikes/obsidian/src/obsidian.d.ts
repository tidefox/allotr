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
  export interface Vault { getName(): string; }
  export interface Workspace {
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getLeaf(newLeaf?: boolean | 'tab' | 'split' | 'window'): WorkspaceLeaf;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
  }
  export interface App { vault: Vault; workspace: Workspace; }
  export class WorkspaceLeaf {
    view: View;
    setViewState(state: { type: string; active?: boolean }): Promise<void>;
  }
  export class View { app: App; containerEl: HTMLElement; constructor(leaf: WorkspaceLeaf); }
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
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement;
    addCommand(command: { id: string; name: string; callback?: () => void }): void;
    registerDomEvent<K extends keyof WindowEventMap>(el: Window, type: K, cb: (e: WindowEventMap[K]) => void): void;
    registerDomEvent<K extends keyof DocumentEventMap>(el: Document, type: K, cb: (e: DocumentEventMap[K]) => void): void;
  }
}
