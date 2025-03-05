/**
 * @name PingLogger
 * @version 1.1.0
 * @description Logs any messages in which you are mentioned (except @everyone and role mentioning)
 * @author notfence
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/PingLogger
 */
//type = release

// Определяем словарь переводов
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
    // Загружаем сохранённые данные или задаём значения по умолчанию
    this.enabled = BdApi.loadData("PingLogger", "enabled");
    if (this.enabled === undefined || this.enabled === null) this.enabled = true;
    // Всегда сохраняем до 100 уведомлений
    this.notifications = BdApi.loadData("PingLogger", "notifications") || [];
    // Загружаем лимит отображения уведомлений (по умолчанию 50)
    this.displayLimit = BdApi.loadData("PingLogger", "displayLimit") || 50;
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

      // Если сообщение содержит стикер, добавляем метку (переводимый)
      if (message.sticker) {
        message.content += " " + i18n.sticker;
      }
      if (message.sticker_items && Array.isArray(message.sticker_items) && message.sticker_items.length > 0) {
        message.content += " " + i18n.sticker;
      }

      // Проверяем наличие прямого упоминания текущего пользователя (без @everyone)
      if (
        (message.content.includes(`<@${currentUserId}>`) || message.content.includes(`<@!${currentUserId}>`)) &&
        !message.mention_everyone
      ) {
        // Заменяем упоминание на ваш ник, чтобы не отображался ваш ID
        let processedText = message.content.replace(new RegExp(`<@!?${currentUserId}>`, 'g'), `@${currentUser.username}`);

        // Обработка вложений: заменяем их на метки (переводимые)
        if (message.attachments && Array.isArray(message.attachments) && message.attachments.length) {
          message.attachments.forEach(attachment => {
            let label = i18n.file;
            if (attachment.filename) {
              const filename = attachment.filename.toLowerCase();
              if (imageExtensions.some(ext => filename.endsWith(ext))) label = i18n.image;
              else if (videoExtensions.some(ext => filename.endsWith(ext))) label = i18n.video;
            }
            processedText += " " + label;
          });
        }
        // Ограничиваем список уведомлений до 100 (FIFO)
        if (this.notifications.length >= 100) {
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

    // Добавляем стили для настроек, разделителей и слайдера
    const style = document.createElement("style");
    style.textContent = `
      .setting-container {
        margin-bottom: 15px;
        padding-bottom: 15px;
      }
      .setting-container:not(:last-child) {
        border-bottom: 1px solid black;
      }
      .setting-title {
        font-size: 16px;
        color: #ffffff;
        margin-bottom: 5px;
      }
      /* Стили для свитча */
      .toggle-wrapper {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .toggle-label {
        font-size: 16px;
        color: #ffffff;
      }
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
      .slider-switch {
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
      .slider-switch:before {
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
      input:checked + .slider-switch {
        background-color: #7289da;
      }
      input:checked + .slider-switch:before {
        transform: translateX(26px);
      }
      /* Стили для слайдера уведомлений */
      .slider-container {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .slider-inner {
        position: relative;
        width: 50%;
      }
      .slider-inner input[type="range"] {
        width: 100%;
		cursor: pointer;
      }
      .current-value {
        position: absolute;
        top: 37px;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #ffffff;
        font-size: 16px;
        pointer-events: none;
      }
      .slider-labels {
        width: 50%;
        display: flex;
        justify-content: space-between;
        margin-top: 1px;
        font-size: 13px;
        color: #ffffff;
      }
      /* Стили для кнопки */
      .discord-button {
        background-color: #7289da;
        color: white;
        border: none;
        border-radius: 3px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        /* Отступ снизу сделан равным верхнему отступу в 15px */
        margin-top: 15px;
        margin-bottom: 1px;
      }
      .discord-button:hover {
        background-color: #5b6eae;
      }
    `;
    panel.appendChild(style);

    // ------------------ Настройка: Включить/Выключить PingLogger ------------------
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
    switchInput.checked = this.enabled;
    switchInput.addEventListener("change", e => {
      this.enabled = e.target.checked;
      BdApi.saveData("PingLogger", "enabled", this.enabled);
    });
    const switchSlider = document.createElement("span");
    switchSlider.className = "slider-switch";
    switchLabel.appendChild(switchInput);
    switchLabel.appendChild(switchSlider);
    
    toggleWrapper.appendChild(toggleLabel);
    toggleWrapper.appendChild(switchLabel);
    toggleContainer.appendChild(toggleWrapper);
    panel.appendChild(toggleContainer);

    // ------------------ Настройка: Количество отображаемых уведомлений ------------------
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
      BdApi.saveData("PingLogger", "displayLimit", this.displayLimit);
    });
    
    panel.appendChild(sliderContainer);

    // ------------------ Кнопка для отображения уведомлений ------------------
    const btnContainer = document.createElement("div");
    // Убираем лишний отступ снизу у контейнера с кнопкой

    const btnShowNotifications = document.createElement("button");
    btnShowNotifications.className = "discord-button";
    btnShowNotifications.textContent = i18n.showNotifications;
    btnShowNotifications.addEventListener("click", () => {
      const React = BdApi.React;
      const notificationsToShow = this.notifications.slice(-this.displayLimit);
		// Создаем элемент заголовка с надписью (scrollable)
		const titleElement = React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%"
          }
        },
        React.createElement("span", null, i18n.modalTitle),
        React.createElement(
          "span",
          { style: { color: "#999999", fontSize: "11px", position: "absolute", right: "20px" } },
          i18n.scrollable
        )
      );

      const modalContent = React.createElement(
        "div",
        { style: { maxHeight: "300px", overflowY: "auto", padding: "10px" } },
        notificationsToShow.length === 0
          ? React.createElement("div", { style: { color: "#ffffff" } }, i18n.noNotifications)
          : notificationsToShow.map((notification, index) =>
              React.createElement(
                "div",
                { key: index, style: { marginBottom: "8px" } },
                React.createElement("span", {
                  style: { color: "#7289da", cursor: "pointer", marginRight: "5px" },
                  title: i18n.copyTooltip,
                  onClick: () => this.copyText(notification.authorId)
                }, notification.authorName),
                React.createElement("span", { style: { color: "#ffffff" } }, ": " + notification.text)
              )
            )
      );

      BdApi.showConfirmationModal(titleElement, modalContent, {
        confirmText: i18n.modalConfirm,
        cancelText: i18n.modalCancel,
        onCancel: () => {
          this.notifications = [];
          BdApi.saveData("PingLogger", "notifications", this.notifications);
          // Удаляем сообщение об ошибке копирования ID, оставляем только подтверждение очистки
          BdApi.showToast(i18n.notificationsCleared, { type: "info" });
        }
      });
    });
    btnContainer.appendChild(btnShowNotifications);
    panel.appendChild(btnContainer);

    return panel;
  }
}

module.exports = PingLogger;
