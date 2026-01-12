/**
 * @name ParanoicVC
 * @version 1.0.3
 * @description Shows a confirmation window when trying to connect to a voice/stage channel.
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/ParanoicVC
 * @updateurl https://raw.githubusercontent.com/notfence/BDplugins/refs/heads/main/Plugins/ParanoicVC/update/update.js
 */
const { Webpack, Data, UI, Patcher, React, DOM } = BdApi;

class ParanoicVC {
  constructor(meta) {
    this.meta = meta;
    this.defaultSettings = { enabled: true, ignored: [], checkUpdates: true };
    this.settings = Object.assign({}, this.defaultSettings, Data.load(this.meta.name, "settings") || {});
    this.updateUrl = this.meta && (this.meta.updateurl || this.meta.updateUrl || this.meta.updateURL);
    this.sourceUrl = this.meta && (this.meta.source || this.meta.sourceUrl || this.meta.sourceURL);
    this._updateChecked = false;
    this.translations = {
      en: {
        pluginName: "ParanoicVC",
        enablePlugin: "Enable ParanoicVC",
        enablePluginNote: "Shows a confirmation dialog before joining voice/stage channels.",
        confirmTitle: "Join Voice Channel?",
        confirmJoin: "Do you really want to join “{name}”?",
        yes: "Yes",
        no: "No",
        dontShow: "Don't ask again for this channel",
        resetChannelsName: "Reset Saved Channels",
        resetChannelsNote: "Clears channels for which you selected “Don't ask again”.",
        resetButtonLabel: "Reset",
        resetDone: "Ignored channels cleared.",
		autoupdateenbl: "Check for updates on start",
		autoupdateenblNote: "Automatically check for plugin updates when Discord starts."
      },
      ru: {
        pluginName: "ParanoicVC",
        enablePlugin: "Включить ParanoicVC",
        enablePluginNote: "Показывает окно подтверждения перед подключением к голосовым каналам, трибунам.",
        confirmTitle: "Подтвердите подключение",
        confirmJoin: "Вы действительно хотите подключиться к «{name}»?",
        yes: "Да",
        no: "Нет",
        dontShow: "Больше не спрашивать для этого канала",
        resetChannelsName: "Сброс сохранённых каналов",
        resetChannelsNote: "Очищает список каналов, для которых выбрано «Больше не спрашивать».",
        resetButtonLabel: "Очистить",
        resetDone: "Список игнорируемых каналов очищен.",
		autoupdateenbl: "Проверка наличия обновлений при запуске",
		autoupdateenblNote: "Автоматически проверять наличие обновлений плагина при запуске Discord."
      }
    };
    this._log = (...args) => { try { window.console && window.console.log && window.console.log(...args); } catch (_) {} };
    this._warn = (...args) => { try { window.console && window.console.warn && window.console.warn(...args); } catch (_) {} };
    this._error = (...args) => { try { window.console && window.console.error && window.console.error(...args); } catch (_) {} };
  }

  start() {
    DOM.addStyle(this.meta.name, `
      .paranoicvc-modal__text { color: var(--header-primary); margin-bottom: 6px; line-height: 1.3; }
      .paranoicvc-modal__dontask { margin-top: 8px; color: var(--text-muted); text-align: center; cursor: pointer; user-select: none; padding: 6px 8px; border-radius: 6px; }
      .paranoicvc-modal__dontask:hover { background: var(--background-modifier-hover); }
      .paranoicvc-modal__dontask.paranoicvc--active { color: var(--interactive-active); text-decoration: underline; }
      .paranoicvc-reset-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .paranoicvc-reset-row button { flex: 0 0 auto; min-width: 120px; }
    `);

    this._allowOnceFor = null;
    this._patched = [];

    const candidates = ["selectVoiceChannel", "selectChannel", "selectChannelById", "openVoiceChannel", "selectVC"];

    for (const name of candidates) {
      try {
        const mod = Webpack.getModule(m => m && typeof m[name] === "function", { searchExports: true });
        if (!mod) continue;

        this._log(`[ParanoicVC] Found module with method ${name}`);

        Patcher.instead(this.meta.name, mod, name, (thisArg, args, orig) => {
          const channelId = args[0];
          if (!this.settings.enabled) return orig.apply(thisArg, args);
          if (!channelId) return orig.apply(thisArg, args);
          if (this._allowOnceFor === channelId) { this._allowOnceFor = null; return orig.apply(thisArg, args); }
          if (this.settings.ignored.includes(channelId)) return orig.apply(thisArg, args);

          const ChannelStore = Webpack.getStore("ChannelStore");
          const channel = ChannelStore?.getChannel ? ChannelStore.getChannel(channelId) : null;
          if (!channel || !(channel.type === 2 || channel.type === 13)) return orig.apply(thisArg, args);

          this.showConfirmModal(channelId, channel.name, () => {
            this._allowOnceFor = channelId;
            try { orig.apply(thisArg, args); } catch (e) { this._error(e); }
          });
        });

        this._patched.push({ mod, name });
      } catch (e) {
        this._warn(`[ParanoicVC] error while searching/patching ${name}:`, e);
      }
    }

    if (this._patched.length === 0) {
      this._warn("[ParanoicVC] Could not find any suitable method to patch. Modal won't be shown on channel click.");
    } else {
      this._log(`[ParanoicVC] Patched methods: ${this._patched.map(p => p.name).join(", ")}`);
    }

    if (this.settings.checkUpdates) this.checkForUpdates().catch(()=>{});

    this._log(`[ParanoicVC] Plugin loaded.`);
  }

  stop() {
    Patcher.unpatchAll(this.meta.name);
    DOM.removeStyle(this.meta.name);
    Data.save(this.meta.name, "settings", this.settings);
    this._log(`[ParanoicVC] Plugin unloaded.`);
  }

  t() {
    const localeStore = Webpack.getStore("LocaleStore");
    const locale = (localeStore?.locale || navigator.language || "en").toLowerCase();
    if (locale.startsWith("ru")) return this.translations.ru;
    return this.translations.en;
  }

  _save() {
    Data.save(this.meta.name, "settings", this.settings);
  }

  showConfirmModal(channelId, name, onConfirm) {
    const t = this.t();
    let dontAskNextTime = false;

    const mainText = React.createElement("div", { className: "paranoicvc-modal__text" }, t.confirmJoin.replace("{name}", name));

    const dontAsk = React.createElement("div", {
      className: "paranoicvc-modal__dontask",
      onClick: (e) => {
        dontAskNextTime = !dontAskNextTime;
        e.currentTarget.classList.toggle("paranoicvc--active", dontAskNextTime);
      },
      role: "button",
      tabIndex: 0,
      onKeyDown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.currentTarget.click(); } }
    }, t.dontShow);

    const content = React.createElement("div", null, mainText, dontAsk);

    UI.showConfirmationModal(t.confirmTitle, content, {
      confirmText: t.yes,
      cancelText: t.no,
      onConfirm: () => {
        if (dontAskNextTime) {
          if (!this.settings.ignored.includes(channelId)) {
            this.settings.ignored.push(channelId);
            this._save();
          }
        }
        try { onConfirm?.(); } catch (e) { this._error(e); }
      }
    });
  }

  getSettingsPanel() {
    const t = this.t();

    const btnClass = (() => {
      const buttonStates = Webpack.getModule(m => m?.button && m.enabled, { searchExports: false }) || {};
      const buttonLook = Webpack.getModule(m => m?.button && m.colorBrand && (m.lookFilled || m.lookBlank), { searchExports: false }) || {};
      return [ buttonStates.button, buttonStates.enabled, buttonLook.button, buttonLook.lookFilled, buttonLook.colorBrand, buttonLook.grow ].filter(Boolean).join(" ");
    })();

    const resetRow = React.createElement("div", { className: "paranoicvc-reset-row" },
      React.createElement("button", { className: btnClass, onClick: () => { this.settings.ignored = []; this._save(); UI.showToast(t.resetDone, { type: "success", timeout: 2500 }); } }, t.resetButtonLabel)
    );

    return UI.buildSettingsPanel({
      settings: [
        { type: "switch", id: "enabled", name: t.enablePlugin, note: t.enablePluginNote, value: this.settings.enabled },
        { type: "switch", id: "checkUpdates", name: t.autoupdateenbl, note: t.autoupdateenblNote, value: this.settings.checkUpdates },
        { type: "custom", id: "resetIgnored", name: t.resetChannelsName, note: t.resetChannelsNote, children: resetRow }
      ],
      onChange: (_cat, id, value) => {
        if (id === "enabled") { this.settings.enabled = !!value; this._save(); }
        if (id === "checkUpdates") { this.settings.checkUpdates = !!value; Data.save(this.meta.name, "settings", this.settings); }
      }
    });
  }

  async checkForUpdates(){
    if(this._updateChecked) return;
    this._updateChecked = true;
    const currentVersion = this.meta && this.meta.version ? String(this.meta.version).trim() : "0.0.0";
    const url = this.updateUrl;
    if(!url) return;
    try{
      const resp = await fetch(url, { cache: "no-store" });
      if(!resp.ok) return;
      const text = await resp.text();
      let m = text.match(/@version\s*v?([0-9]+(?:\.[0-9]+)*)/i);
      if(!m){
        const commentMatch = text.match(/\/\*\*[\s\S]*?\*\//);
        if(commentMatch) m = commentMatch[0].match(/@version\s*v?([0-9]+(?:\.[0-9]+)*)/i);
      }
      if(!m || !m[1]) return;
      const remoteVersion = m[1].trim();
      if(this._isRemoteNewer(currentVersion, remoteVersion)) this._showUpdateModal(remoteVersion, currentVersion);
    }catch(e){
      try{ this._warn("[ParanoicVC] update check failed:", e); }catch(e2){}
    }
  }

  _isRemoteNewer(localVer, remoteVer){
    const parse = v => String(v).replace(/^v/i,"").split(".").map(s=>parseInt(s.replace(/\D.*$/,"")||"0",10));
    const a = parse(localVer), b = parse(remoteVer);
    const len = Math.max(a.length, b.length, 3);
    for(let i=0;i<len;i++){
      const ai = a[i] || 0;
      const bi = b[i] || 0;
      if(bi > ai) return true;
      if(bi < ai) return false;
    }
    return false;
  }

  _showUpdateModal(remoteVersion, localVersion){
    const title = "Plugin Update Available";
    const content = React.createElement("div", { style: { lineHeight: "1.4" } },
      React.createElement("div", null, `A new version of the plugin "${this.meta.name}" is available.`),
      React.createElement("div", { style: { marginTop: 8 } }, `Installed: ${localVersion}`),
      React.createElement("div", null, `Available: ${remoteVersion}`),
      React.createElement("div", { style: { marginTop: 10, color: "var(--text-muted)" } }, "Open the plugin page?")
    );
    try{
      if(UI && typeof UI.showConfirmationModal === "function"){
        UI.showConfirmationModal(title, content, {
          confirmText: "Open",
          cancelText: "Cancel",
          onConfirm: ()=>{ try{ window.open(this.sourceUrl, "_blank"); }catch{} }
        });
        return;
      }
    }catch{}
    if(window.confirm(`New version ${remoteVersion} is available. Open plugin page?`)) try{ window.open(this.sourceUrl, "_blank"); }catch{}
  }
}

module.exports = ParanoicVC;
