/**
 * @name PingLogger
 * @version 1.3.1
 * @description Logs any messages in which you are mentioned including @everyone and role mentioning
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/PingLogger
 * @updateurl https://raw.githubusercontent.com/notfence/BDplugins/refs/heads/main/Plugins/PingLogger/PingLogger.plugin.js
 */

const base = {
  toggle: "Enable/Disable PingLogger",
  showNotifications: "Show notifications",
  modalTitle: "PingLogger Notifications",
  modalConfirm: "Close",
  modalCancel: "Clear notifications",
  noNotifications: "No notifications",
  idCopied: id => `ID ${id} copied to clipboard`,
  copyError: "Error copying ID",
  sliderTitle: "Number of notifications to display",
  sticker: "[STICKER]",
  image: "[IMAGE]",
  video: "[VIDEO]",
  file: "[FILE]",
  copyTooltip: "Click to copy the author's ID",
  notificationsCleared: "Notifications cleared",
  localAccountTooltip: "Your local account",
  messageCopied: "Message copied",
  copyMessageTooltip: "Copy message",
  dmLabel: "Direct Messages",
  groupDmLabel: "Group DMs",
  serverLabelPrefix: "Server name: ",
  goToMessage: "Jump to message",
  fetchEveryoneAndRoles: "Fetch @everyone and role mentions"
};

const ru = {
  toggle: "Включить/Выключить PingLogger",
  showNotifications: "Показать уведомления",
  modalTitle: "Уведомления PingLogger",
  modalConfirm: "Закрыть",
  modalCancel: "Очистить уведомления",
  noNotifications: "Уведомления отсутствуют",
  idCopied: id => `ID ${id} скопирован в буфер обмена`,
  copyError: "Ошибка при копировании ID",
  sliderTitle: "Количество отображаемых уведомлений",
  sticker: "[СТИКЕР]",
  image: "[ИЗОБРАЖЕНИЕ]",
  video: "[ВИДЕО]",
  file: "[ФАЙЛ]",
  copyTooltip: "Нажмите, чтобы скопировать ID автора",
  notificationsCleared: "Уведомления очищены",
  localAccountTooltip: "Ваш локальный аккаунт",
  messageCopied: "Сообщение скопировано",
  copyMessageTooltip: "Скопировать сообщение",
  dmLabel: "Личные сообщения",
  groupDmLabel: "Групповые сообщения",
  serverLabelPrefix: "Сервер: ",
  goToMessage: "Перейти к сообщению",
  fetchEveryoneAndRoles: "Логировать @everyone и упоминания ролей"
};

const translations = { en: base, ru: Object.assign({}, base, ru) };

const i18n = new Proxy({}, {
  get: (target, prop) => {
    const localeStore = BdApi.Webpack.getStore("LocaleStore");
    const locale = (localeStore && localeStore.locale || navigator.language || "en").toLowerCase();
    const lang = locale.startsWith("ru") ? "ru" : "en";
    return translations[lang][prop];
  }
});

class PingLogger {
  constructor() {
    this.enabled = BdApi.Data.load("PingLogger", "enabled");
    if (this.enabled === undefined || this.enabled === null) this.enabled = true;

    this.notifications = BdApi.Data.load("PingLogger", "notifications") || [];
    this.displayLimit = BdApi.Data.load("PingLogger", "displayLimit") || 50;
    this.fetchEveryoneAndRoles = BdApi.Data.load("PingLogger", "fetchEveryoneAndRoles") || false;

    this.patchId = null;
    this.guildNameCache = {};
  }

  copyText = text => {
    const formatted = `<@${text}>`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(formatted)
        .then(() => BdApi.UI.showToast(i18n.idCopied(formatted), { type: "info" }))
        .catch(() => this._fallbackCopy(formatted));
    } else this._fallbackCopy(formatted);
  };

  copyPlainText = text => {
    if (!text) return;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => BdApi.UI.showToast(i18n.messageCopied, { type: "info" }))
        .catch(() => this._fallbackCopy(text));
    } else this._fallbackCopy(text);
  };

  _fallbackCopy = text => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();

    try {
      document.execCommand("copy");
      BdApi.UI.showToast(i18n.messageCopied, { type: "info" });
    } catch {
      BdApi.UI.showToast(i18n.copyError, { type: "error" });
    }

    document.body.removeChild(ta);
  };

  resolveGuildNameSafely(guildId) {
    if (!guildId) return null;
    if (this.guildNameCache[guildId]) return this.guildNameCache[guildId];

    try {
      const Store = BdApi.Webpack.getStore && BdApi.Webpack.getStore("GuildStore");
      if (Store && typeof Store.getGuild === 'function') {
        const g = Store.getGuild(guildId);
        if (g && (g.name || g.guildName)) {
          this.guildNameCache[guildId] = g.name || g.guildName;
          return this.guildNameCache[guildId];
        }
      }
    } catch (e) {}

    try {
      const GuildStore = (BdApi.Webpack.getModuleByProps && BdApi.Webpack.getModuleByProps("getGuild", "getGuilds")) ||
        BdApi.Webpack.getModule(m => m && (m.getGuild || m.getGuilds));
      let guild = null;

      if (GuildStore) {
        try {
          if (typeof GuildStore.getGuild === 'function') guild = GuildStore.getGuild(guildId);
          else if (typeof GuildStore.getGuilds === 'function') {
            const map = GuildStore.getGuilds();
            if (map) guild = map[guildId] || (typeof map.get === 'function' ? map.get(guildId) : null);
          }
        } catch (e) {}
      }

      if (guild) {
        const name = guild.name || guild.Name || guild.guildName || guild._name || guild.name_raw ||
          (typeof guild.getName === 'function' ? (() => {
            try {
              return guild.getName();
            } catch {
              return null;
            }
          })() : null);

        const finalName = name || null;
        if (finalName) {
          this.guildNameCache[guildId] = finalName;
          return finalName;
        }
      }
    } catch (e) {}

    return null;
  }

  getDmLabelForLocale() {
    return i18n.dmLabel;
  }

  start() {
    const Dispatcher = BdApi.Webpack.getByKeys && BdApi.Webpack.getByKeys("dispatch");
    if (!Dispatcher) return;

    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const videoExtensions = [".mp4", ".mov", ".webm", ".avi"];

    const ChannelStore = (BdApi.Webpack.getStore ? BdApi.Webpack.getStore("ChannelStore") :
      (BdApi.Webpack.getModuleByProps ? BdApi.Webpack.getModuleByProps("getChannel") : null));

    const MessageActions = BdApi.Webpack.getByKeys ? BdApi.Webpack.getByKeys("fetchMessage", "deleteMessage") : null;

    const transitionToModule = BdApi.Webpack.getByStrings ? BdApi.Webpack.getByStrings(["transitionTo - Transitioning to"], { searchExports: true }) : null;
    const transitionTo = (transitionToModule && (typeof transitionToModule === 'function' ? transitionToModule : transitionToModule.transitionTo)) ||
      (window && window.__transitionTo) || null;

    const safeString = v => (v === null || v === undefined) ? null : String(v);

    this._closeOtherDialogs = () => {
      try {
        document.querySelectorAll('[aria-modal="true"]').forEach(el => { try { el.remove(); } catch {} });
        document.querySelectorAll('.layer-3JKvBn, .backdrop-1WG7uL, .modal-3zV5v4, .modal-2C4O6P, .backdrop-2kV7oH, .backdrop-2Gk4, .backdrop-2EY0G')
          .forEach(el => { try { el.remove(); } catch {} });
        document.querySelectorAll('[role="dialog"] button[aria-label="Close"]').forEach(b => { try { b.click(); } catch {} });
        document.querySelectorAll('div[class*="backdrop"], div[class*="modal"], [data-modal-id]').forEach(el => { try { el.click(); } catch {} });

        const escDown = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
        const escUp = new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
        document.dispatchEvent(escDown);
        document.dispatchEvent(escUp);

        document.querySelectorAll('body > div').forEach(div => {
          try {
            const style = window.getComputedStyle(div);
            const bg = (style.backgroundColor || style.background || '').toLowerCase();
            const z = parseInt(style.zIndex) || 0;
            if ((bg.includes('rgba(0, 0, 0') || bg.includes('rgba(0,0,0') || bg.includes('black')) && z >= 1000) {
              div.remove();
            }
          } catch (e) {}
        });

        setTimeout(() => {
          try {
            document.querySelectorAll('[aria-modal="true"]').forEach(el => { try { el.remove(); } catch {} });
            document.querySelectorAll('.layer-3JKvBn, .backdrop-1WG7uL, .modal-3zV5v4, .modal-2C4O6P').forEach(el => { try { el.remove(); } catch {} });
            document.dispatchEvent(escDown);
            document.dispatchEvent(escUp);
          } catch (e) {}
        }, 50);

      } catch (e) {}
    };

    this.patchId = BdApi.Patcher.after("PingLogger", Dispatcher, "dispatch", (thisObject, args) => {
      try {
        if (!this.enabled) return;

        const payload = args?.[0];
        if (!payload || payload.type !== 'MESSAGE_CREATE') return;

        const message = payload.message;
        if (!message) return;

        const UserStore = BdApi.Webpack.getByKeys && BdApi.Webpack.getByKeys("getCurrentUser");
        if (!UserStore) return;

        const currentUser = UserStore.getCurrentUser();
        if (!currentUser) return;

        const currentUserId = String(currentUser.id);
        const currentUserName = currentUser.username || "";

        let isMentioned = false;

        try {
          const mentions = message.mentions;
          if (Array.isArray(mentions) && mentions.length) isMentioned = mentions.some(m => {
            if (!m) return false;
            const mid = m.id ?? m.userId;
            return mid && String(mid) === currentUserId;
          });
        } catch {}

        if (!isMentioned) {
          try {
            const content = message.content;
            if (typeof content === 'string' && content.length && (content.includes(`<@${currentUserId}>`) || content.includes(`<@!${currentUserId}>`)))
              isMentioned = true;
          } catch {}
        }

        const isEveryoneMention = Boolean(message.mention_everyone);
        let isRoleMention = false;

        try {
          const rawGuildId = message.guild_id || message.guildId || message.guild?.id || null;
          const guildId = safeString(rawGuildId);

          if (this.fetchEveryoneAndRoles && Array.isArray(message.mention_roles) && message.mention_roles.length && guildId) {
            const MemberStore = BdApi.Webpack.getModuleByProps && BdApi.Webpack.getModuleByProps("getMember", "getMembers") ||
              BdApi.Webpack.getModule(m => m && (m.getMember || m.getMembers));

            let member = null;
            try {
              if (MemberStore) {
                if (typeof MemberStore.getMember === 'function') member = MemberStore.getMember(guildId, currentUserId);
                else if (typeof MemberStore.getMembers === 'function') {
                  const map = MemberStore.getMembers(guildId);
                  if (map) member = map[currentUserId] || (typeof map.get === 'function' ? map.get(currentUserId) : null);
                }
              }
            } catch (e) {}

            if (member && Array.isArray(member.roles)) {
              const roleIds = message.mention_roles.map(r => String(r));
              isRoleMention = member.roles.some(r => roleIds.includes(String(r)));
            }
          }
        } catch {}

        if (!isMentioned && !(this.fetchEveryoneAndRoles && (isEveryoneMention || isRoleMention))) return;

        let baseText = "";
        try {
          if (typeof message.content === 'string' && message.content.length) baseText = message.content;
          else if (typeof message.cleanContent === 'string' && message.cleanContent.length) baseText = message.cleanContent;
          else if (Array.isArray(message.embeds) && message.embeds.length) baseText = message.embeds.map(e => (e && (e.title || e.description || ""))).filter(Boolean).join(" ");
        } catch {}

        let processedText = "";
        try {
          if (baseText) processedText = baseText.replace(new RegExp(`<@!?${currentUserId}>`, "g"), `@${currentUserName}`);
        } catch {}

        try {
          if (processedText) processedText = processedText.replace(/<@&\d+>/g, "@role");
        } catch {}

        try {
          const hasSticker = Boolean(message.sticker || (Array.isArray(message.sticker_items) && message.sticker_items.length));
          if (hasSticker) processedText = (processedText ? processedText + " " : "") + i18n.sticker;
        } catch {}

        try {
          if (Array.isArray(message.attachments) && message.attachments.length) {
            message.attachments.forEach(attachment => {
              let label = i18n.file;
              const filename = String(attachment.filename || "").toLowerCase();
              if (imageExtensions.some(ext => filename.endsWith(ext))) label = i18n.image;
              else if (videoExtensions.some(ext => filename.endsWith(ext))) label = i18n.video;
              processedText = (processedText ? processedText + " " : "") + label;
            });
          }
        } catch {}

        if (!processedText || processedText.trim() === "") processedText = "[non-text message]";

        try {
          if (!Array.isArray(this.notifications)) this.notifications = [];
          while (this.notifications.length >= 100) this.notifications.shift();
        } catch {
          this.notifications = this.notifications || [];
        }

        let senderName = "Unknown";
        let senderId = "";

        try {
          if (message.author && typeof message.author === 'object') {
            senderName = message.author.username || message.author.name || senderName;
            senderId = message.author.id || message.author.userId || "";
          } else if (message.member?.user) {
            senderName = message.member.user.username || senderName;
            senderId = message.member.user.id || senderId;
          }
        } catch {}

        const rawGuildId = message.guild_id || message.guildId || message.guild?.id || null;
        const rawChannelId = message.channel_id || message.channelId || message.channel?.id || null;
        const guildId = safeString(rawGuildId);
        const channelId = safeString(rawChannelId);

        let serverName = this.getDmLabelForLocale();
        let isGroupDm = false;
        let channelName = null;

        if (guildId) {
          const resolved = this.resolveGuildNameSafely(guildId);
          if (resolved) serverName = i18n.serverLabelPrefix + resolved;
          else serverName = i18n.serverLabelPrefix + guildId;

          const now = Date.now();
          const mid = safeString(message.id || message.message_id || null);

          const newNote = {
            text: processedText,
            authorName: senderName,
            authorId: senderId,
            accountName: currentUserName,
            timestamp: now,
            serverName,
            guildId,
            channelId: channelId || null,
            messageId: mid,
            channelName: null,
            isGroupDm: false
          };

          const existsIndex = this.notifications.findIndex(n => {
            if (mid && n.messageId && n.messageId === mid) return true;
            const sameAuthor = n.authorId === senderId;
            const sameChannel = n.channelId === channelId;
            const sameText = n.text === processedText;
            const closeTime = Math.abs((n.timestamp || 0) - now) < 5000;
            return sameAuthor && sameChannel && sameText && closeTime;
          });

          if (existsIndex !== -1) {
            const existing = this.notifications[existsIndex];
            if (newNote.guildId && !existing.guildId) this.notifications[existsIndex] = newNote;
            BdApi.Data.save("PingLogger", "notifications", this.notifications);
            return;
          } else {
            this.notifications.push(newNote);
            try { BdApi.Data.save("PingLogger", "notifications", this.notifications); } catch (err) {}
          }

        } else if (channelId) {
          try {
            if (ChannelStore && typeof ChannelStore.getChannel === 'function') {
              const ch = ChannelStore.getChannel(channelId);
              if (ch) {
                channelName = ch.name || ch.lastMessageId || null;
                if (ch.type === 3 || (ch.recipients && Array.isArray(ch.recipients) && ch.recipients.length > 1)) {
                  isGroupDm = true;
                  serverName = i18n.groupDmLabel + (ch.name ? `: ${ch.name}` : '');
                } else {
                  isGroupDm = false;
                  serverName = this.getDmLabelForLocale();
                }
              } else {
                serverName = this.getDmLabelForLocale();
              }
            } else {
              serverName = this.getDmLabelForLocale();
            }
          } catch (e) { serverName = this.getDmLabelForLocale(); }

          const now = Date.now();
          const mid = safeString(message.id || message.message_id || null);

          const newNote = {
            text: processedText,
            authorName: senderName,
            authorId: senderId,
            accountName: currentUserName,
            timestamp: now,
            serverName,
            guildId: null,
            channelId: channelId,
            messageId: mid,
            channelName,
            isGroupDm
          };

          const existsIndex = this.notifications.findIndex(n => {
            if (mid && n.messageId && n.messageId === mid) return true;
            const sameAuthor = n.authorId === senderId;
            const sameChannel = n.channelId === channelId;
            const sameText = n.text === processedText;
            const closeTime = Math.abs((n.timestamp || 0) - now) < 5000;
            return sameAuthor && sameChannel && sameText && closeTime;
          });

          if (existsIndex !== -1) {
            const existing = this.notifications[existsIndex];
            if (newNote.guildId && !existing.guildId) this.notifications[existsIndex] = newNote;
            BdApi.Data.save("PingLogger", "notifications", this.notifications);
            return;
          } else {
            this.notifications.push(newNote);
            try { BdApi.Data.save("PingLogger", "notifications", this.notifications); } catch (err) {}
          }

        } else {
          const now = Date.now();
          const mid = safeString(message.id || message.message_id || null);

          const newNote = {
            text: processedText,
            authorName: senderName,
            authorId: senderId,
            accountName: currentUserName,
            timestamp: now,
            serverName: this.getDmLabelForLocale(),
            guildId: null,
            channelId: null,
            messageId: mid,
            channelName: null,
            isGroupDm: false
          };

          const existsIndex = this.notifications.findIndex(n => {
            if (mid && n.messageId && n.messageId === mid) return true;
            const sameAuthor = n.authorId === senderId;
            const sameChannel = n.channelId === null;
            const sameText = n.text === processedText;
            const closeTime = Math.abs((n.timestamp || 0) - now) < 5000;
            return sameAuthor && sameChannel && sameText && closeTime;
          });

          if (existsIndex !== -1) {
            const existing = this.notifications[existsIndex];
            if (newNote.guildId && !existing.guildId) this.notifications[existsIndex] = newNote;
            BdApi.Data.save("PingLogger", "notifications", this.notifications);
            return;
          } else {
            this.notifications.push(newNote);
            try { BdApi.Data.save("PingLogger", "notifications", this.notifications); } catch (err) {}
          }
        }

      } catch (err) {}
    });

    this._origStop = this.stop;
  }

  stop() {
    BdApi.Patcher.unpatchAll("PingLogger");
  }

  _closeOurModal() {
    const overlay = document.getElementById("pinglogger-modal-overlay");
    if (overlay) try { overlay.remove(); } catch {};
  }

  _createLargeModal(notificationsToShow) {
    if (document.getElementById("pinglogger-modal-overlay")) return;

    notificationsToShow = (notificationsToShow || []).slice().reverse();

    if (!document.getElementById("pinglogger-modal-styles")) {
      const s = document.createElement("style");
      s.id = "pinglogger-modal-styles";
      s.textContent = `@keyframes pinglogger-fade-in{from{opacity:0}to{opacity:1}}@keyframes pinglogger-pop{from{transform:translateY(8px) scale(.99);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@keyframes pinglogger-fade-out{from{opacity:1}to{opacity:0}}@keyframes pinglogger-pop-out{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(8px) scale(.98);opacity:0}}.pinglogger-copy-btn{position:absolute;right:4px;bottom:4px;display:none;padding:4px;border:none;cursor:pointer;background:transparent;color:var(--text-normal,#ffffff);box-sizing:border-box;overflow:visible}.pinglogger-copy-btn svg{width:14px;height:14px;fill:currentColor;display:block;margin:0}.pinglogger-message-text{overflow:visible}.pinglogger-message-text:hover .pinglogger-copy-btn{display:flex;opacity:1;background:transparent}.pinglogger-message-row:hover .pinglogger-copy-btn{display:block;opacity:1}.pinglogger-copy-btn{transition:opacity .12s ease,transform .12s ease;opacity:0}.pinglogger-message-row:hover .pinglogger-copy-btn{opacity:1;transform:translateY(0)}.pinglogger-closing-overlay{animation:pinglogger-fade-out .12s ease-in forwards}.pinglogger-closing-modal{animation:pinglogger-pop-out .14s cubic-bezier(.2,.8,.2,1) forwards}.pinglogger-message-row:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}`;
      document.head.appendChild(s);
    }

    const overlay = document.createElement("div");
    overlay.id = "pinglogger-modal-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      animation: "pinglogger-fade-in .12s ease-out"
    });

    const modal = document.createElement("div");
    modal.id = "pinglogger-modal";
    Object.assign(modal.style, {
      width: "min(1000px,92%)",
      maxWidth: "1200px",
      maxHeight: "85vh",
      background: "var(--background-primary,#2f3136)",
      borderRadius: "8px",
      boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      color: "var(--text-normal,#ffffff)",
      animation: "pinglogger-pop .18s cubic-bezier(.2,.8,.2,1)"
    });

    const header = document.createElement("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.2)" });

    const title = document.createElement("div");
    title.textContent = i18n.modalTitle;
    Object.assign(title.style, { fontSize: "16px", fontWeight: 600 });
    header.appendChild(title);

    const content = document.createElement("div");
    Object.assign(content.style, { padding: "12px 12px 6px 12px", overflowY: "auto", flex: "1 1 auto" });

    if (!notificationsToShow || notificationsToShow.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = i18n.noNotifications;
      Object.assign(empty.style, { color: "var(--text-muted,#b9bbbe)" });
      content.appendChild(empty);
    } else {
      const ChannelStore = (BdApi.Webpack.getStore ? BdApi.Webpack.getStore("ChannelStore") :
        (BdApi.Webpack.getModuleByProps ? BdApi.Webpack.getModuleByProps("getChannel") : null));

      const MessageActions = BdApi.Webpack.getByKeys ? BdApi.Webpack.getByKeys("fetchMessage", "deleteMessage") : null;

      const transitionToModule = BdApi.Webpack.getByStrings ? BdApi.Webpack.getByStrings(["transitionTo - Transitioning to"], { searchExports: true }) : null;
      const transitionTo = (transitionToModule && (typeof transitionToModule === 'function' ? transitionToModule : transitionToModule.transitionTo)) || (window && window.__transitionTo) || null;

      const safeString = v => (v === null || v === undefined) ? null : String(v);

      notificationsToShow.forEach(notification => {
        const row = document.createElement("div");
        row.className = 'pinglogger-message-row';
        Object.assign(row.style, { marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: "1px solid rgba(0,0,0,0.12)", position: "relative" });

        const time = document.createElement("div");
        const d = new Date(notification.timestamp || Date.now());
        const pad = n => n.toString().padStart(2, "0");
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        time.textContent = `${hours}:${minutes}`;
        const seconds = pad(d.getSeconds());
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();

        const localeStore = BdApi.Webpack.getStore("LocaleStore");
        const locale = (localeStore && localeStore.locale || navigator.language || "en").toLowerCase();
        const isRussian = locale.startsWith("ru");
        const dateStr = isRussian ? `${day}.${month}.${year}` : `${month}.${day}.${year}`;
        const full = `${hours}:${minutes}:${seconds} ${dateStr}`;
        time.title = full;
        Object.assign(time.style, { color: "var(--text-muted,#b9bbbe)", fontSize: "12px", minWidth: "56px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" });

        const main = document.createElement("div");
        Object.assign(main.style, { display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 auto" });

        const topLine = document.createElement("div");
        Object.assign(topLine.style, { display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap", width: "100%" });

        const accountSpan = document.createElement("span");
        accountSpan.textContent = `(${notification.accountName})`;
        accountSpan.title = i18n.localAccountTooltip;
        Object.assign(accountSpan.style, { color: "var(--text-normal,#ffffff)", fontWeight: 600, marginRight: "4px" });

        const authorSpan = document.createElement("span");
        authorSpan.textContent = notification.authorName;
        authorSpan.title = i18n.copyTooltip;
        Object.assign(authorSpan.style, { color: "var(--interactive-accent,#7289da)", cursor: "pointer", userSelect: "none", fontWeight: 600, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        authorSpan.addEventListener("click", () => { try { this.copyText(notification.authorId); } catch {} });

        topLine.appendChild(accountSpan);
        topLine.appendChild(authorSpan);

        const serverSpan = document.createElement("span");
        let displayServerName = "";
        if (notification.guildId) {
          const resolvedName = this.resolveGuildNameSafely(notification.guildId) || notification.guildId;
          displayServerName = i18n.serverLabelPrefix + resolvedName;
        } else if (notification.isGroupDm) {
          displayServerName = i18n.groupDmLabel;
        } else {
          displayServerName = this.getDmLabelForLocale();
        }

        serverSpan.textContent = displayServerName;
        serverSpan.title = i18n.goToMessage;
        Object.assign(serverSpan.style, { marginLeft: "auto", color: "var(--text-muted,#b9bbbe)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "35%", cursor: (notification.channelId && notification.messageId ? 'pointer' : 'default') });

        serverSpan.addEventListener('click', e => {
          try {
            if (!notification.channelId || !notification.messageId) return;
            this._closeOurModal();
            this._closeOtherDialogs();

            const chId = safeString(notification.channelId);
            const gId = notification.guildId ? safeString(notification.guildId) : null;
            const path = gId ? `/channels/${gId}/${chId}` : `/channels/@me/${chId}`;

            if (typeof transitionTo === 'function') {
              try { transitionTo(path); } catch (err) {}
            } else {
              try { window.location.hash = `#/channels/${gId || '@me'}/${chId}`; } catch (err) {}
            }

            if (MessageActions && typeof MessageActions.fetchMessage === 'function' && notification.messageId) {
              try { MessageActions.fetchMessage(chId, safeString(notification.messageId)); } catch (err) {}
            }

            setTimeout(() => { try { this._closeOtherDialogs(); } catch {} }, 60);

          } catch (err) {}
        });

        topLine.appendChild(serverSpan);

        const textLine = document.createElement("div");
        textLine.className = 'pinglogger-message-text';
        textLine.textContent = notification.text;
        Object.assign(textLine.style, { color: "var(--text-normal,#ffffff)", whiteSpace: "pre-wrap", background: "var(--background-modifier-hover,rgba(255,255,255,0.02))", padding: "8px", borderRadius: "6px", marginTop: "6px", position: "relative", overflow: "visible", userSelect: "text", cursor: "default" });

        const copyBtn = document.createElement("button");
        copyBtn.className = "pinglogger-copy-btn";
        copyBtn.title = i18n.copyMessageTooltip;
        copyBtn.setAttribute('aria-label', i18n.copyMessageTooltip);
        copyBtn.innerHTML = `<svg width="800px" height="800px" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 9.50006C1 10.3285 1.67157 11.0001 2.5 11.0001H4L4 10.0001H2.5C2.22386 10.0001 2 9.7762 2 9.50006L2 2.50006C2 2.22392 2.22386 2.00006 2.5 2.00006L9.5 2.00006C9.77614 2.00006 10 2.22392 10 2.50006V4.00002H5.5C4.67158 4.00002 4 4.67159 4 5.50002V12.5C4 13.3284 4.67158 14 5.5 14H12.5C13.3284 14 14 13.3284 14 12.5V5.50002C14 4.67159 13.3284 4.00002 12.5 4.00002H11V2.50006C11 1.67163 10.3284 1.00006 9.5 1.00006H2.5C1.67157 1.00006 1 1.67163 1 2.50006V9.50006ZM5 5.50002C5 5.22388 5.22386 5.00002 5.5 5.00002H12.5C12.7761 5.00002 13 5.22388 13 5.50002V12.5C13 12.7762 12.7761 13 12.5 13H5.5C5.22386 13 5 12.7762 5 12.5V5.50002Z" fill="#FFFFFF"/></svg>`;

        copyBtn.addEventListener("click", e => { e.stopPropagation(); this.copyPlainText(notification.text); });

        main.appendChild(topLine);
        main.appendChild(textLine);
        row.appendChild(time);
        row.appendChild(main);
        textLine.appendChild(copyBtn);
        content.appendChild(row);
      });

      const rows = content.querySelectorAll('.pinglogger-message-row');
      if (rows.length) {
        const last = rows[rows.length - 1];
        try { last.style.marginBottom = "0"; last.style.paddingBottom = "0"; last.style.borderBottom = "none"; } catch {}
      }
    }

    const footer = document.createElement("div");
    Object.assign(footer.style, { padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.2)", display: "flex", justifyContent: "flex-end", gap: "8px" });

    const clearBtn = document.createElement("button");
    clearBtn.textContent = i18n.modalCancel;
    Object.assign(clearBtn.style, { minWidth: "110px", padding: "6px 10px", borderRadius: "6px", border: "none", cursor: "pointer", background: "var(--interactive-danger,#f04747)", color: "white", fontWeight: 600 });

    const footerClose = document.createElement("button");
    footerClose.textContent = i18n.modalConfirm;
    Object.assign(footerClose.style, { minWidth: "90px", padding: "6px 12px", borderRadius: "6px", border: "none", cursor: "pointer", background: "var(--background-secondary,#202225)", color: "var(--text-normal,#ffffff)" });

    footer.appendChild(clearBtn);
    footer.appendChild(footerClose);
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    let closing = false;
    function removeModal() {
      if (closing) return;
      closing = true;
      const onFinish = () => { try { overlay.remove(); } catch {} document.removeEventListener("keydown", onKeyDown); };
      try { modal.style.animation = ""; overlay.style.animation = ""; } catch {}
      modal.addEventListener("animationend", onFinish, { once: true });
      overlay.classList.add('pinglogger-closing-overlay');
      modal.classList.add('pinglogger-closing-modal');
      setTimeout(onFinish, 700);
    }

    const onKeyDown = e => { if (e.key === "Escape") removeModal(); };

    footerClose.addEventListener("click", removeModal);

    clearBtn.addEventListener("click", () => {
      this.notifications = [];
      try { BdApi.Data.save("PingLogger", "notifications", this.notifications); } catch {}
      BdApi.UI.showToast(i18n.notificationsCleared, { type: "info" });
      content.innerHTML = "";
      const empty = document.createElement("div");
      empty.textContent = i18n.noNotifications;
      Object.assign(empty.style, { color: "var(--text-muted,#b9bbbe)" });
      content.appendChild(empty);
    });

    overlay.addEventListener("click", ev => { if (ev.target === overlay) removeModal(); });
    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(overlay);
  }

  getSettingsPanel() {
    const UI = BdApi.UI;
    const Webpack = BdApi.Webpack;
    const React = BdApi.React;

    const btnClass = (() => {
      const buttonStates = Webpack.getModule(m => m?.button && m.enabled, { searchExports: false }) || {};
      const buttonLook = Webpack.getModule(m => m?.button && m.colorBrand && (m.lookFilled || m.lookBlank), { searchExports: false }) || {};
      return [buttonStates.button, buttonStates.enabled, buttonLook.button, buttonLook.lookFilled, buttonLook.colorBrand, buttonLook.grow].filter(Boolean).join(" ");
    })();

    const showBtn = React.createElement("div", { style: { paddingTop: 8, display: "flex", justifyContent: "flex-end" } },
      React.createElement("button", { className: btnClass, style: { minWidth: "180px" }, onClick: () => {
        const notificationsToShow = (this.notifications || []).slice(-this.displayLimit).map(n => ({ ...n }));
        this._createLargeModal(notificationsToShow);
      } }, i18n.showNotifications)
    );

    return UI.buildSettingsPanel({
      settings: [
        { type: "switch", id: "enabled", name: i18n.toggle, value: this.enabled },
        { type: "switch", id: "fetchEveryoneAndRoles", name: i18n.fetchEveryoneAndRoles, value: this.fetchEveryoneAndRoles },
        { type: "slider", id: "displayLimit", name: i18n.sliderTitle, note: "", value: this.displayLimit, min: 3, max: 100 },
        { type: "custom", id: "showNotifications", name: "", children: showBtn }
      ],
      onChange: (_cat, id, value) => {
        if (id === "enabled") { this.enabled = !!value; BdApi.Data.save("PingLogger", "enabled", this.enabled); }
        if (id === "displayLimit") { this.displayLimit = Number(value); BdApi.Data.save("PingLogger", "displayLimit", this.displayLimit); }
        if (id === "fetchEveryoneAndRoles") { this.fetchEveryoneAndRoles = !!value; BdApi.Data.save("PingLogger", "fetchEveryoneAndRoles", this.fetchEveryoneAndRoles); }
      }
    });
  }
}

module.exports = PingLogger;
