/**
 * @name PingLogger
 * @version 1.1.1 beta2
 * @description Logs any messages in which you are mentioned (except @everyone and role mentioning)
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/PingLogger
 * @updateurl https://raw.githubusercontent.com/notfence/BDplugins/refs/heads/main/Plugins/PingLogger/PingLogger.plugin.js
 */ 
//type = beta
const i18n = (() => {
  const lang = navigator.language.startsWith("ru") ? "ru" : "en";
  const translations = {
    ru: {
      description: "Логгер уведомлений",
      toggle: "Включить/Выключить PingLogger",
      showNotifications: "Показать уведомления",
      modalTitle: "Уведомления PingLogger",
      modalConfirm: "Закрыть",
      modalCancel: "Очистить уведомления",
      noNotifications: "Уведомления отсутствуют",
      idCopied: (id) => `ID ${id} скопирован в буфер обмена`,
      copyError: "Ошибка при копировании ID",
      sliderTitle: "Количество отображаемых уведомлений",
      sticker: "[СТИКЕР]",
      image: "[ИЗОБРАЖЕНИЕ]",
      video: "[ВИДЕО]",
      file: "[ФАЙЛ]",
      copyTooltip: "Нажмите, чтобы скопировать ID автора",
      notificationsCleared: "Уведомления очищены",
      scrollable: "(пролистываемый)"
    },
    en: {
      description: "Notification logger",
      toggle: "Enable/Disable PingLogger",
      showNotifications: "Show notifications",
      modalTitle: "PingLogger Notifications",
      modalConfirm: "Close",
      modalCancel: "Clear notifications",
      noNotifications: "No notifications",
      idCopied: (id) => `ID ${id} copied to clipboard`,
      copyError: "Error copying ID",
      sliderTitle: "Number of notifications to display",
      sticker: "[STICKER]",
      image: "[IMAGE]",
      video: "[VIDEO]",
      file: "[FILE]",
      copyTooltip: "Click to copy the author's ID",
      notificationsCleared: "Notifications cleared",
      scrollable: "(scrollable)"
    }
  };
  return translations[lang];
})();

class PingLogger {
  constructor() {
    this.enabled = BdApi.Data.load("PingLogger", "enabled");
    if (this.enabled === undefined || this.enabled === null) this.enabled = true;
    this.notifications = BdApi.Data.load("PingLogger", "notifications") || [];
    this.displayLimit = BdApi.Data.load("PingLogger", "displayLimit") || 50;
    this.patchModule = null;
  }

  copyText = (text) => {
    const formatted = `<@${text}>`;
    const showCopied = () => BdApi.UI.showToast(i18n.idCopied(formatted), { type: "info" });
    const showError = () => BdApi.UI.showToast(i18n.copyError, { type: "error" });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formatted).then(showCopied).catch(() => this.fallbackCopyText(formatted));
    } else {
      this.fallbackCopyText(formatted);
    }
  };

  fallbackCopyText = (text) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      BdApi.UI.showToast(i18n.idCopied(text), { type: "info" });
    } catch {
      BdApi.UI.showToast(i18n.copyError, { type: "error" });
    }
    document.body.removeChild(ta);
  };

  start() {
    const UserStore = BdApi.Webpack.getByKeys("getCurrentUser");
    if (!UserStore) return;
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;
    const currentUserId = String(currentUser.id);
    const currentUserName = currentUser.username || "";
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const videoExtensions = [".mp4", ".mov", ".webm", ".avi"];
    const Dispatcher = BdApi.Webpack.getByKeys("dispatch");
    if (!Dispatcher) return;

    this.patchModule = BdApi.Patcher.after("PingLogger", Dispatcher, "dispatch", (thisObject, args) => {
      try {
        if (!this.enabled) return;
        const payload = args?.[0];
        if (!payload || payload.type !== "MESSAGE_CREATE") return;
        const message = payload.message;
        if (!message) return;

        let isMentioned = false;
        try {
          const mentions = message.mentions;
          if (Array.isArray(mentions) && mentions.length) {
            isMentioned = mentions.some(m => {
              if (!m) return false;
              const mid = m.id ?? m.userId;
              return mid && String(mid) === currentUserId;
            });
          }
        } catch {
          isMentioned = false;
        }

        if (!isMentioned) {
          try {
            const content = message.content;
            if (typeof content === "string" && content.length) {
              if (content.includes(`<@${currentUserId}>`) || content.includes(`<@!${currentUserId}>`)) {
                isMentioned = true;
              }
            }
          } catch {
            isMentioned = false;
          }
        }

        if (!isMentioned || message.mention_everyone) return;

        let baseText = "";
        try {
          if (typeof message.content === "string" && message.content.length) baseText = message.content;
          else if (typeof message.cleanContent === "string" && message.cleanContent.length) baseText = message.cleanContent;
          else if (Array.isArray(message.embeds) && message.embeds.length) {
            baseText = message.embeds.map(e => (e && (e.title || e.description || ""))).filter(Boolean).join(" ");
          } else baseText = "";
        } catch {
          baseText = "";
        }

        let processedText = "";
        try {
          if (typeof baseText === "string" && baseText.length) {
            processedText = baseText.replace(new RegExp(`<@!?${currentUserId}>`, "g"), `@${currentUserName}`);
          } else {
            processedText = "";
          }
        } catch {
          processedText = "";
        }

        try {
          const hasSticker = Boolean(message.sticker || (Array.isArray(message.sticker_items) && message.sticker_items.length));
          if (hasSticker) processedText = (processedText ? processedText + " " : "") + i18n.sticker;
        } catch {}

        try {
          if (Array.isArray(message.attachments) && message.attachments.length) {
            message.attachments.forEach(att => {
              let label = i18n.file;
              const filename = String(att?.filename || "").toLowerCase();
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
          if (message.author && typeof message.author === "object") {
            senderName = message.author.username || message.author.name || senderName;
            senderId = message.author.id || message.author.userId || "";
          } else if (message.member?.user) {
            senderName = message.member.user.username || senderName;
            senderId = message.member.user.id || senderId;
          }
        } catch {}

        this.notifications.push({
          text: processedText,
          authorName: senderName,
          authorId: senderId,
          accountName: currentUserName,
          timestamp: Date.now()
        });

        try {
          BdApi.Data.save("PingLogger", "notifications", this.notifications);
        } catch (err) {
          console.warn("[PingLogger] Failed saving notifications:", err);
        }
      } catch (err) {
        console.error("[PingLogger] Error handling MESSAGE_CREATE:", err);
      }
    });
  }

  stop() {
    BdApi.Patcher.unpatchAll("PingLogger");
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "10px";

    const style = document.createElement("style");
    style.textContent = `
.setting-container{margin-bottom:15px;padding-bottom:15px}
.setting-container:not(:last-child){border-bottom:1px solid black}
.setting-title{font-size:16px;color:#ffffff;margin-bottom:5px}
.toggle-wrapper{display:flex;align-items:center;justify-content:space-between}
.toggle-label{font-size:16px;color:#ffffff}
.switch{position:relative;display:inline-block;width:50px;height:24px}
.switch input{opacity:0;width:0;height:0}
.slider-switch{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#ccc;transition:.4s;border-radius:24px}
.slider-switch:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.4s;border-radius:50%}
input:checked+.slider-switch{background-color:#7289da}
input:checked+.slider-switch:before{transform:translateX(26px)}
.slider-container{display:flex;flex-direction:column;align-items:center}
.slider-inner{position:relative;width:50%}
.slider-inner input[type="range"]{width:100%;cursor:pointer}
.current-value{position:absolute;top:37px;left:50%;transform:translate(-50%,-50%);color:#ffffff;font-size:16px;pointer-events:none}
.slider-labels{width:50%;display:flex;justify-content:space-between;margin-top:1px;font-size:13px;color:#ffffff}
.discord-button{background-color:#7289da;color:white;border:none;border-radius:3px;padding:8px 16px;font-size:14px;cursor:pointer;margin-top:15px;margin-bottom:1px}
.discord-button:hover{background-color:#5b6eae}
`;
    panel.appendChild(style);

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "setting-container";

    const toggleWrapper = document.createElement("div");
    toggleWrapper.className = "toggle-wrapper";

    const toggleLabel = document.createElement("div");
    toggleLabel.className = "toggle-label";
    toggleLabel.textContent = i18n.toggle;

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";

    const switchInput = document.createElement("input");
    switchInput.type = "checkbox";
    switchInput.checked = Boolean(this.enabled);
    switchInput.addEventListener("change", e => {
      this.enabled = e.target.checked;
      BdApi.Data.save("PingLogger", "enabled", this.enabled);
    });

    const switchSlider = document.createElement("span");
    switchSlider.className = "slider-switch";

    switchLabel.appendChild(switchInput);
    switchLabel.appendChild(switchSlider);
    toggleWrapper.appendChild(toggleLabel);
    toggleWrapper.appendChild(switchLabel);
    toggleContainer.appendChild(toggleWrapper);
    panel.appendChild(toggleContainer);

    const sliderContainer = document.createElement("div");
    sliderContainer.className = "setting-container";

    const sliderTitle = document.createElement("div");
    sliderTitle.className = "setting-title";
    sliderTitle.textContent = i18n.sliderTitle;
    sliderContainer.appendChild(sliderTitle);

    const sliderInner = document.createElement("div");
    sliderInner.className = "slider-inner";

    const sliderInput = document.createElement("input");
    sliderInput.type = "range";
    sliderInput.min = 3;
    sliderInput.max = 100;
    sliderInput.value = this.displayLimit;

    sliderInner.appendChild(sliderInput);

    const currentValueLabel = document.createElement("div");
    currentValueLabel.className = "current-value";
    currentValueLabel.textContent = sliderInput.value;
    sliderInner.appendChild(currentValueLabel);
    sliderContainer.appendChild(sliderInner);

    const sliderLabels = document.createElement("div");
    sliderLabels.className = "slider-labels";
    const minLabel = document.createElement("span");
    minLabel.textContent = "3";
    const maxLabel = document.createElement("span");
    maxLabel.textContent = "100";
    sliderLabels.appendChild(minLabel);
    sliderLabels.appendChild(maxLabel);
    sliderContainer.appendChild(sliderLabels);

    sliderInput.addEventListener("input", (e) => {
      currentValueLabel.textContent = e.target.value;
      this.displayLimit = Number(e.target.value);
      BdApi.Data.save("PingLogger", "displayLimit", this.displayLimit);
    });

    panel.appendChild(sliderContainer);

    const btnContainer = document.createElement("div");
    const btnShowNotifications = document.createElement("button");
    btnShowNotifications.className = "discord-button";
    btnShowNotifications.textContent = i18n.showNotifications;

    btnShowNotifications.addEventListener("click", () => {
      const React = BdApi.React;
      const notificationsToShow = (this.notifications || []).slice(-this.displayLimit);

      const titleElement = React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" } },
        React.createElement("span", null, i18n.modalTitle),
        React.createElement("span", { style: { color: "#999999", fontSize: "11px", position: "absolute", right: "20px" } }, i18n.scrollable)
      );

      const modalContent = React.createElement(
        "div",
        { style: { maxHeight: "300px", overflowY: "auto", padding: "10px" } },
        notificationsToShow.length === 0
          ? React.createElement("div", { style: { color: "#ffffff" } }, i18n.noNotifications)
          : notificationsToShow.map((notification, index) =>
              React.createElement(
                "div",
                { key: index, style: { marginBottom: "8px", display: "flex", alignItems: "center" } },
                React.createElement("span", {
                  style: { color: "#999999", fontSize: "11px", marginRight: "5px" },
                  title: (() => {
                    const now = new Date(notification.timestamp || Date.now());
                    const pad = n => n.toString().padStart(2, "0");
                    const hours = pad(now.getHours());
                    const minutes = pad(now.getMinutes());
                    const seconds = pad(now.getSeconds());
                    const day = pad(now.getDate());
                    const month = pad(now.getMonth() + 1);
                    const year = now.getFullYear();
                    const lang = navigator.language.startsWith("ru") ? "ru" : "en";
                    return lang === "ru"
                      ? `${hours}:${minutes}:${seconds} ${day}.${month}.${year}`
                      : `${((+hours % 12) || 12).toString().padStart(2, "0")}:${minutes}:${seconds} ${month}.${day}.${year}`;
                  })()
                },
                  (() => {
                    const now = new Date(notification.timestamp || Date.now());
                    const pad = n => n.toString().padStart(2, "0");
                    const hours = now.getHours();
                    const minutes = pad(now.getMinutes());
                    const lang = navigator.language.startsWith("ru") ? "ru" : "en";
                    if (lang === "ru") return `${pad(hours)}:${minutes}`;
                    const hours12 = hours % 12 || 12;
                    return `${hours12.toString().padStart(2, "0")}:${minutes}`;
                  })()
                ),
                React.createElement("span", { style: { color: "#ffffff", marginRight: "5px" } }, notification.accountName),
                React.createElement("span", {
                  style: { color: "#7289da", cursor: "pointer", marginRight: "5px" },
                  title: i18n.copyTooltip,
                  onClick: () => this.copyText(notification.authorId)
                }, notification.authorName),
                React.createElement("span", { style: { color: "#ffffff" } }, ": " + notification.text)
              )
            )
      );

      BdApi.UI.showConfirmationModal(titleElement, modalContent, {
        confirmText: i18n.modalConfirm,
        cancelText: i18n.modalCancel,
        onCancel: () => {
          this.notifications = [];
          BdApi.Data.save("PingLogger", "notifications", this.notifications);
          BdApi.UI.showToast(i18n.notificationsCleared, { type: "info" });
        }
      });
    });

    btnContainer.appendChild(btnShowNotifications);
    panel.appendChild(btnContainer);

    return panel;
  }
}

module.exports = PingLogger;

