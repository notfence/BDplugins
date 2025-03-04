/**
 * @name PingLogger
 * @version 1.0.9
 * @description Notification logger
 * @author notfence
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/PingLogger
 */
 
// Определяем словарь переводов
const i18n = (() => {
  const lang = navigator.language.startsWith("ru") ? "ru" : "en";
  const translations = {
    ru: {
      description: "Логгер уведомлений",
      toggle: "Включить PingLogger",
      showNotifications: "Показать уведомления",
      modalTitle: "Уведомления PingLogger",
      modalConfirm: "Закрыть",
      modalCancel: "Очистить уведомления",
      noNotifications: "Уведомления отсутствуют",
      idCopied: (id) => `ID ${id} скопирован в буфер обмена`,
      copyError: "Ошибка при копировании ID",
    },
    en: {
      description: "Notification logger",
      toggle: "Enable PingLogger",
      showNotifications: "Show notifications",
      modalTitle: "PingLogger Notifications",
      modalConfirm: "Close",
      modalCancel: "Clear notifications",
      noNotifications: "No notifications",
      idCopied: (id) => `ID ${id} copied to clipboard`,
      copyError: "Error copying ID",
    }
  };
  return translations[lang];
})();

class PingLogger {
  constructor() {
    // Загружаем сохранённые данные или задаём значения по умолчанию
    this.enabled = BdApi.loadData("PingLogger", "enabled");
    if (this.enabled === undefined || this.enabled === null) this.enabled = true;
    this.notifications = BdApi.loadData("PingLogger", "notifications") || [];
    this.patchModule = null;
  }

  // Функция копирования с fallback. Копируется строка вида <@ID>
  copyText(text) {
    const formattedText = `<@${text}>`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formattedText)
        .then(() => BdApi.showToast(i18n.idCopied(formattedText), { type: "info" }))
        .catch(() => {
          this.fallbackCopyText(formattedText);
        });
    } else {
      this.fallbackCopyText(formattedText);
    }
  }

  fallbackCopyText(text) {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      BdApi.showToast(i18n.idCopied(text), { type: "info" });
    } catch (err) {
      BdApi.showToast(i18n.copyError, { type: "error" });
    }
    document.body.removeChild(el);
  }

  start() {
    const UserStore = BdApi.findModuleByProps("getCurrentUser");
    if (!UserStore) {
      console.error("[PingLogger] UserStore not found!");
      return;
    }
    const currentUser = UserStore.getCurrentUser();
    const currentUserId = currentUser.id;

    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const videoExtensions = [".mp4", ".mov", ".webm", ".avi"];

    const Dispatcher = BdApi.findModuleByProps("dispatch");
    if (!Dispatcher) {
      console.error("[PingLogger] Dispatcher not found!");
      return;
    }

    // Патчим Dispatcher для обработки события MESSAGE_CREATE
    this.patchModule = BdApi.Patcher.after("PingLogger", Dispatcher, "dispatch", (thisObject, args, returnValue) => {
      if (!this.enabled) return;
      const payload = args[0];
      if (!payload || payload.type !== "MESSAGE_CREATE") return;

      const message = payload.message;
      if (!message || !message.content) return;

      console.log("[PingLogger] Received message:", message);

      // Если сообщение содержит стикер, добавляем метку [СТИКЕР]
      if (message.sticker) {
        message.content += " [СТИКЕР]";
      }
      if (message.sticker_items && Array.isArray(message.sticker_items) && message.sticker_items.length > 0) {
        message.content += " [СТИКЕР]";
      }

      // Проверяем наличие прямого упоминания текущего пользователя (без @everyone)
      if (
        (message.content.includes(`<@${currentUserId}>`) || message.content.includes(`<@!${currentUserId}>`)) &&
        !message.mention_everyone
      ) {
        // Заменяем упоминание на ваш ник, чтобы не отображался ваш ID
        let processedText = message.content.replace(new RegExp(`<@!?${currentUserId}>`, 'g'), `@${currentUser.username}`);

        // Обработка вложений: заменяем их на метки
        if (message.attachments && Array.isArray(message.attachments) && message.attachments.length) {
          message.attachments.forEach(attachment => {
            let label = "[ФАЙЛ]";
            if (attachment.filename) {
              const filename = attachment.filename.toLowerCase();
              if (imageExtensions.some(ext => filename.endsWith(ext))) label = "[ИЗОБРАЖЕНИЕ]";
              else if (videoExtensions.some(ext => filename.endsWith(ext))) label = "[ВИДЕО]";
            }
            processedText += " " + label;
          });
        }
        // Ограничиваем список уведомлений до 50 (FIFO)
        if (this.notifications.length >= 50) {
          this.notifications.shift();
        }
        // Сохраняем уведомление с данными отправителя
        let senderName = (message.author && message.author.username) || "Unknown";
        this.notifications.push({
          text: processedText,
          authorName: senderName,
          authorId: message.author ? message.author.id : ""
        });
        // Сохраняем обновлённый список уведомлений
        BdApi.saveData("PingLogger", "notifications", this.notifications);
        console.log("[PingLogger] Notification saved:", processedText);
      }
    });
  }

  stop() {
    BdApi.Patcher.unpatchAll("PingLogger");
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "10px";

    // Добавляем стили для свитча и кнопки (подобно Discord)
    const style = document.createElement("style");
    style.textContent = `
      .switch {
        position: relative;
        display: inline-block;
        width: 50px;
        height: 24px;
      }
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
        border-radius: 24px;
      }
      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
      }
      input:checked + .slider {
        background-color: #7289da;
      }
      input:checked + .slider:before {
        transform: translateX(26px);
      }
      .switch-label {
        color: #ffffff;
        margin-left: 10px;
        vertical-align: middle;
        font-size: 14px;
      }
      .discord-button {
        background-color: #7289da;
        color: white;
        border: none;
        border-radius: 3px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        margin-top: 10px;
      }
      .discord-button:hover {
        background-color: #5b6eae;
      }
    `;
    panel.appendChild(style);

    // Создаем контейнер со свитчем для включения/выключения плагина
    const switchContainer = document.createElement("div");
    switchContainer.style.display = "flex";
    switchContainer.style.alignItems = "center";
    switchContainer.style.marginBottom = "10px";

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";
    const switchInput = document.createElement("input");
    switchInput.type = "checkbox";
    switchInput.checked = this.enabled;
    switchInput.addEventListener("change", e => {
      this.enabled = e.target.checked;
      BdApi.saveData("PingLogger", "enabled", this.enabled);
    });
    const slider = document.createElement("span");
    slider.className = "slider";
    switchLabel.appendChild(switchInput);
    switchLabel.appendChild(slider);

    const textLabel = document.createElement("span");
    textLabel.className = "switch-label";
    textLabel.textContent = i18n.toggle;

    switchContainer.appendChild(switchLabel);
    switchContainer.appendChild(textLabel);
    panel.appendChild(switchContainer);

    // Кнопка для отображения уведомлений, стилизованная под Discord
    const btnShowNotifications = document.createElement("button");
    btnShowNotifications.className = "discord-button";
    btnShowNotifications.textContent = i18n.showNotifications;
    btnShowNotifications.addEventListener("click", () => {
      const React = BdApi.React;
      const modalContent = React.createElement(
        "div",
        { style: { maxHeight: "300px", overflowY: "auto", padding: "10px" } },
        this.notifications.length === 0 ?
          React.createElement("div", { style: { color: "#ffffff" } }, i18n.noNotifications) :
          this.notifications.map((notification, index) =>
            React.createElement(
              "div",
              { key: index, style: { marginBottom: "8px" } },
              React.createElement("span", {
                style: { color: "#7289da", cursor: "pointer", marginRight: "5px" },
                title: "Нажмите, чтобы скопировать ID автора",
                onClick: () => this.copyText(notification.authorId)
              }, notification.authorName),
              React.createElement("span", { style: { color: "#ffffff" } }, ": " + notification.text)
            )
          )
      );

      BdApi.showConfirmationModal(i18n.modalTitle, modalContent, {
        confirmText: i18n.modalConfirm,
        cancelText: i18n.modalCancel,
        onCancel: () => {
          this.notifications = [];
          BdApi.saveData("PingLogger", "notifications", this.notifications);
          BdApi.showToast(i18n.copyError, { type: "info" });
          BdApi.showToast(i18n.modalCancel, { type: "info" });
        }
      });
    });
    panel.appendChild(btnShowNotifications);

    return panel;
  }
}

module.exports = PingLogger;
