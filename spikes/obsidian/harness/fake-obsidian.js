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
    open() { document.body.appendChild(this.containerEl); this.onOpen(); }
    close() { this.onClose(); this.containerEl.remove(); }
    onOpen() {}
    onClose() {}
  }

  class Plugin {
    constructor(app, manifest) {
      this.app = app;
      this.manifest = manifest;
      this._domEvents = [];
    }
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
      for (const r of state.ribbon) r.el.remove();
      state.ribbon = [];
      for (const [name] of [...state.commands]) if (name.startsWith(this.manifest.name + ':')) state.commands.delete(name);
      this.app.viewCreators.clear();
    }
  }

  const app = {
    viewCreators: new Map(),
    vault: { getName: () => params.get('vault') || 'Test Vault' },
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
    state, app, Platform,
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
    clickRibbon: () => state.ribbon[0] && state.ribbon[0].el.click(),
  };
})();
