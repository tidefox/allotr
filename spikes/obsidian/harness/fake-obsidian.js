// A minimal stand-in for Obsidian's API, just enough to load main.js, open
// the view and run diagnostics. Not a faithful emulation: it exists so the
// plugin can be driven by Playwright.
(function () {
  const params = new URLSearchParams(location.search);
  const platform = params.get('platform') || 'desktop';
  const state = { notices: [], hotkeyHits: [], commands: new Map(), ribbon: [], leaves: [], plugins: [] };

  // Obsidian mobile's floating bottom navbar: a rounded pill over the content.
  if (platform !== 'desktop') {
    const nav = document.createElement('div');
    nav.className = 'mobile-navbar';
    nav.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);width:min(340px,calc(100vw - 32px));height:56px;border-radius:28px;box-sizing:border-box;background:#3a3a3cee;box-shadow:0 2px 12px #0006;z-index:50;display:flex;align-items:center;justify-content:space-around;color:#fff;font-size:12px';
    nav.innerHTML = '<span>back</span><span>fwd</span><span>search</span><span>+</span><span>tabs</span><span>menu</span>';
    document.body.appendChild(nav);
  }

  const Platform = {
    isDesktopApp: platform === 'desktop',
    isMobileApp: platform !== 'desktop',
    isIosApp: platform === 'ios',
    isAndroidApp: platform === 'android',
    isPhone: platform !== 'desktop',
    isTablet: false,
    isDesktop: platform === 'desktop',
    isMobile: platform !== 'desktop',
  };

  // Obsidian's own global hotkey handling, to see whether typing leaks to it.
  document.addEventListener('keydown', (e) => {
    state.hotkeyHits.push({ key: e.key, target: e.target && e.target.tagName });
  });

  class Notice {
    constructor(message) {
      state.notices.push(message);
      const el = document.createElement('div');
      el.className = 'notice';
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  }

  class View {
    constructor(leaf) {
      this.leaf = leaf;
      this.app = leaf.app;
      this.containerEl = leaf.containerEl;
    }
  }
  class ItemView extends View {
    constructor(leaf) {
      super(leaf);
      this.contentEl = document.createElement('div');
      this.contentEl.className = 'view-content';
      this.containerEl.appendChild(this.contentEl);
    }
    getIcon() { return 'document'; }
    async onOpen() {}
    async onClose() {}
  }

  class WorkspaceLeaf {
    constructor(app) {
      this.app = app;
      this.containerEl = document.createElement('div');
      this.containerEl.className = 'workspace-leaf';
      document.getElementById('workspace').appendChild(this.containerEl);
      this.view = null;
      this.type = null;
    }
    async setViewState(s) {
      const creator = this.app.viewCreators.get(s.type);
      if (!creator) throw new Error('no view ' + s.type);
      this.type = s.type;
      this.view = creator(this);
      await this.view.onOpen();
    }
    async detach() {
      if (this.view) await this.view.onClose();
      this.containerEl.remove();
      state.leaves = state.leaves.filter((l) => l !== this);
    }
  }

  class Modal {
    constructor(app) {
      this.app = app;
      this.containerEl = document.createElement('div');
      this.containerEl.className = 'modal-container';
      const modal = document.createElement('div');
      modal.className = 'modal';
      this.contentEl = document.createElement('div');
      this.contentEl.className = 'modal-content';
      modal.appendChild(this.contentEl);
      this.containerEl.appendChild(modal);
    }
    open() {
      document.body.appendChild(this.containerEl);
      // Obsidian closes a modal on Escape.
      this._esc = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this._esc);
      this.onOpen();
    }
    close() {
      if (this._esc) document.removeEventListener('keydown', this._esc);
      this._esc = null;
      if (!this.containerEl.isConnected) return;
      this.onClose();
      this.containerEl.remove();
    }
    onOpen() {}
    onClose() {}
  }

  class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
      this._domEvents = [];
    }
    registerInterval(id) { this._intervals = this._intervals || []; this._intervals.push(id); return id; }
    registerView(type, creator) { this.app.viewCreators.set(type, creator); }
    addRibbonIcon(icon, title, cb) {
      const b = document.createElement('button');
      b.className = 'ribbon-icon';
      b.title = title;
      b.textContent = title;
      b.addEventListener('click', cb);
      document.getElementById('ribbon').appendChild(b);
      state.ribbon.push({ icon, title, el: b });
      return b;
    }
    addCommand(c) {
      const name = this.manifest.name + ': ' + c.name;
      state.commands.set(name, c);
    }
    registerDomEvent(el, type, cb) {
      el.addEventListener(type, cb);
      this._domEvents.push([el, type, cb]);
    }
    _unregister() {
      for (const [el, type, cb] of this._domEvents) el.removeEventListener(type, cb);
      this._domEvents = [];
      for (const id of this._intervals || []) clearInterval(id);
      this._intervals = [];
      for (const r of state.ribbon) r.el.remove();
      state.ribbon = [];
      for (const [name] of [...state.commands]) if (name.startsWith(this.manifest.name + ':')) state.commands.delete(name);
      this.app.viewCreators.clear();
    }
  }

  const app = {
    viewCreators: new Map(),
    vault: {
      getName: () => params.get('vault') || 'Test Vault',
      // Files live in memory; the harness adds them with harness.addFile.
      files: new Map(),
      getFiles() { return [...this.files.values()].map((f) => f.file); },
      async read(file) { return this.files.get(file.path).data; },
      async create(path, data) {
        if (this.files.has(path)) throw new Error('File already exists.');
        const t = Date.now();
        const file = { path, name: path.split('/').pop(), extension: path.split('.').pop(), stat: { ctime: t, mtime: t, size: data.length } };
        this.files.set(path, { file, data });
        return file;
      },
      getAbstractFileByPath(path) { return this.files.get(path)?.file ?? null; },
      // Obsidian's DataAdapter, over the same in-memory files; folders are a set.
      folders: new Set(),
      adapter: {
        exists: async (path) => app.vault.files.has(path) || app.vault.folders.has(path),
        read: async (path) => {
          if (!app.vault.files.has(path)) throw new Error('ENOENT: ' + path);
          return app.vault.files.get(path).data;
        },
        write: async (path, data) => {
          const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          if (dir && !app.vault.folders.has(dir)) throw new Error('ENOENT: folder ' + dir);
          if (window.harness.failWrites) throw new Error('disk full (simulated)');
          const t = Date.now();
          const existing = app.vault.files.get(path);
          const file = existing ? existing.file : { path, name: path.split('/').pop(), extension: path.split('.').pop(), stat: { ctime: t, mtime: t, size: 0 } };
          file.stat.mtime = t; file.stat.size = data.length;
          app.vault.files.set(path, { file, data });
          window.harness.writes.push(path);
        },
        // Strict on purpose: the real adapter's rename may refuse an existing target.
        rename: async (from, to) => {
          const entry = app.vault.files.get(from);
          if (!entry) throw new Error('ENOENT: ' + from);
          if (app.vault.files.has(to)) throw new Error('EEXIST: ' + to);
          const dir = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : '';
          if (dir && !app.vault.folders.has(dir)) throw new Error('ENOENT: folder ' + dir);
          app.vault.files.delete(from);
          entry.file.path = to; entry.file.name = to.split('/').pop(); entry.file.extension = to.split('.').pop();
          app.vault.files.set(to, entry);
          window.harness.renames.push([from, to]);
          // A file counts as written when it lands under its real name.
          window.harness.writes.push(to);
        },
        // Like a plain mkdir: the parent must exist.
        mkdir: async (path) => {
          const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          if (parent && !app.vault.folders.has(parent)) throw new Error('ENOENT: folder ' + parent);
          app.vault.folders.add(path);
        },
        remove: async (path) => { app.vault.files.delete(path); },
        list: async (path) => ({
          files: [...app.vault.files.keys()].filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')),
          folders: [...app.vault.folders].filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')),
        }),
        stat: async (path) => { const f = app.vault.files.get(path); return f ? { ...f.file.stat } : null; },
      },
    },
    loadLocalStorage: (k) => localStorage.getItem('fake-obsidian:' + k),
    saveLocalStorage: (k, v) => (v === null ? localStorage.removeItem('fake-obsidian:' + k) : localStorage.setItem('fake-obsidian:' + k, v)),
  };
  app.workspace = {
    getLeavesOfType: (t) => state.leaves.filter((l) => l.type === t),
    getLeaf: () => { const l = new WorkspaceLeaf(app); state.leaves.push(l); return l; },
    revealLeaf: async (l) => { for (const x of state.leaves) x.containerEl.style.display = x === l ? '' : 'none'; },
    detachLeavesOfType: async (t) => { for (const l of state.leaves.filter((x) => x.type === t)) await l.detach(); },
  };
  const obsidianModule = { apiVersion: '1.9.99-fake', Plugin, ItemView, View, WorkspaceLeaf, Modal, Notice, Platform, addIcon() {} };

  window.harness = {
    state, app, Platform, writes: [], renames: [], failWrites: false,
    // Evaluates a CommonJS bundle the way Obsidian does, handing it the fake module.
    async loadPlugin(code) {
      const module = { exports: {} };
      const fakeRequire = (id) => {
        if (id === 'obsidian') return obsidianModule;
        throw new Error('require(' + id + ') is not available');
      };
      new Function('module', 'exports', 'require', code)(module, module.exports, fakeRequire);
      const Ctor = module.exports.default || module.exports;
      const plugin = new Ctor(app, { id: 'allotr', name: 'Allotr' });
      state.plugins.push(plugin);
      await plugin.onload();
      return plugin;
    },
    async unloadPlugin(plugin) {
      for (const l of [...state.leaves]) await l.detach();
      plugin.onunload();
      plugin._unregister();
      state.plugins = state.plugins.filter((p) => p !== plugin);
    },
    runCommand: async (name) => { const c = state.commands.get(name); if (!c) throw new Error('no command ' + name); await c.callback(); },
    addFile: (path, data) => app.vault.create(path, data),
    // Stand-in for a sync tool: copies every file under a prefix out of, or into, this vault.
    dumpFiles: (prefix) => [...app.vault.files.entries()].filter(([p]) => p.startsWith(prefix)).map(([p, v]) => ({ path: p, data: v.data, mtime: v.file.stat.mtime })),
    loadFiles: (list) => {
      for (const { path, data, mtime } of list) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) app.vault.folders.add(parts.slice(0, i).join('/'));
        app.vault.files.set(path, { file: { path, name: parts.at(-1), extension: path.split('.').pop(), stat: { ctime: mtime, mtime, size: data.length } }, data });
      }
    },
    readFile: (path) => app.vault.files.get(path)?.data ?? null,
    clickRibbon: () => state.ribbon[0] && state.ribbon[0].el.click(),
  };
})();
