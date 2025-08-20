/**
 * @name ParanoicVC
 * @version 1.0.1 (39)
 * @description Shows a confirmation window when trying to connect to a voice/voice channel.
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/ParanoicVC
 */
const { Webpack, Data, UI, Patcher, React, DOM } = BdApi;

class ParanoicVC {
  constructor(meta) {
    this.meta = meta;
    this.defaultSettings = { enabled: true, ignored: [] };
    this.settings = Object.assign({}, this.defaultSettings, Data.load(this.meta.name, "settings"));

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
        resetButtonLabel: "Reset list",
        resetDone: "Ignored channels cleared."
      },
      ru: {
        pluginName: "ParanoicVC",
        enablePlugin: "Включить ParanoicVC",
        enablePluginNote: "Показывает окно подтверждения перед подключением к голосовым/сценовым каналам.",
        confirmTitle: "Подтвердите подключение",
        confirmJoin: "Вы действительно хотите подключиться к «{name}»?",
        yes: "Да",
        no: "Нет",
        dontShow: "Больше не спрашивать для этого канала",
        resetChannelsName: "Сброс сохранённых каналов",
        resetChannelsNote: "Очищает список каналов, для которых выбрано «Больше не спрашивать».",
        resetButtonLabel: "Очистить",
        resetDone: "Список игнорируемых каналов очищен."
      }
    };

    // Защита: в некоторых окружениях console может быть переопределён.
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
        { type: "custom", id: "resetIgnored", name: t.resetChannelsName, note: t.resetChannelsNote, children: resetRow }
      ],
      onChange: (_cat, id, value) => {
        if (id === "enabled") { this.settings.enabled = !!value; this._save(); }
      }
    });
  }
}


module.exports = ParanoicVC;
