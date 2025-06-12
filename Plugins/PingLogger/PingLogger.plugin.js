/**
 * @name PingLogger
 * @version 1.1.1 beta1
 * @description Logs any messages in which you are mentioned (except @everyone and role mentioning)
 * @author notfence
 */
//type = beta
// Определяем словарь переводов
const i18n = (() => {
    const lang = navigator.language.startsWith("ru") ? "ru" : "en";
    const translations = {
        ru: {
            description: "Логгер уведомлений",
            toggle: "Включить/Выключить PingLogger",
            showNotifications: "Показать уведомления",
            modalTitle: "Уведомления PingLogger",
            modalConfirm: "Назад",
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
            scrollable: "(пролистываемый)",
            expand: "Развернуть",
            hide: "Скрыть"
        },
        en: {
            description: "Notification logger",
            toggle: "Enable/Disable PingLogger",
            showNotifications: "Show notifications",
            modalTitle: "PingLogger Notifications",
            modalConfirm: "Back",
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
            scrollable: "(scrollable)",
            expand: "Expand",
            hide: "Hide"
        }
    };
    return translations[lang];
})();

class PingLogger {
    constructor() {
        this.enabled = BdApi.loadData("PingLogger", "enabled");
        if (this.enabled === undefined || this.enabled === null) this.enabled = true;
        this.notifications = BdApi.loadData("PingLogger", "notifications") || [];
        this.patchModule = null;
    }

    copyText(text) {
        const formattedText = `<@${text}>`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(formattedText)
                .then(() => BdApi.showToast(i18n.idCopied(formattedText), { type: "info" }))
                .catch(() => { this.fallbackCopyText(formattedText); });
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
        } catch {
            BdApi.showToast(i18n.copyError, { type: "error" });
        }
        document.body.removeChild(el);
    }

    start() {
        const UserStore = BdApi.findModuleByProps("getCurrentUser");
        if (!UserStore) { console.error("[PingLogger] UserStore not found!"); return; }
        const currentUser = UserStore.getCurrentUser();
        const currentUserId = currentUser.id;

        const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
        const videoExtensions = [".mp4", ".mov", ".webm", ".avi"];

        const Dispatcher = BdApi.findModuleByProps("dispatch");
        if (!Dispatcher) { console.error("[PingLogger] Dispatcher not found!"); return; }
        this.patchModule = BdApi.Patcher.after("PingLogger", Dispatcher, "dispatch", (thisObject, args) => {
            if (!this.enabled) return;
            const payload = args[0];
            if (!payload || payload.type !== "MESSAGE_CREATE") return;
            const message = payload.message;
            if (!message || !message.content) return;

            // Проверяем упоминание текущего пользователя
            if ((message.content.includes(`<@${currentUserId}>`) ||
                 message.content.includes(`<@!${currentUserId}>`)) &&
                 !message.mention_everyone) {
                let processedText = message.content.replace(new RegExp(`<@!?${currentUserId}>`, 'g'), `@${currentUser.username}`);
                // Метки для вложений
                if (message.attachments && Array.isArray(message.attachments) && message.attachments.length) {
                    message.attachments.forEach(att => {
                        let label = "[ФАЙЛ]";
                        if (att.filename) {
                            const fn = att.filename.toLowerCase();
                            if (imageExtensions.some(ext => fn.endsWith(ext))) label = "[ИЗОБРАЖЕНИЕ]";
                            else if (videoExtensions.some(ext => fn.endsWith(ext))) label = "[ВИДЕО]";
                        }
                        processedText += " " + label;
                    });
                }
                if (this.notifications.length >= 50) this.notifications.shift();
                this.notifications.push({
                    authorName: message.author.username,
                    authorId: message.author.id,
                    text: processedText
                });
                BdApi.saveData("PingLogger", "notifications", this.notifications);
            }
        });
    }

    stop() {
        BdApi.Patcher.unpatchAll("PingLogger");
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";
        // Стили для переключателя и кнопок
        const style = document.createElement("style");
        style.textContent = `
            .switch { position: relative; display: inline-block; width: 50px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
                      background-color: #ccc; transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; 
                            background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: #7289da; }
            input:checked + .slider:before { transform: translateX(26px); }
            .switch-label { color: #ffffff; margin-left: 10px; vertical-align: middle; font-size: 14px; }
            .discord-button { background-color: #7289da; color: white; border: none; border-radius: 3px; 
                              padding: 8px 16px; font-size: 14px; cursor: pointer; margin-top: 10px; }
            .discord-button:hover { background-color: #5b6eae; }
        `;
        panel.appendChild(style);

        // Переключатель включения/выключения
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

        // Кнопка для показа уведомлений
        const btnShowNotifications = document.createElement("button");
        btnShowNotifications.className = "discord-button";
        btnShowNotifications.textContent = i18n.showNotifications;
        btnShowNotifications.addEventListener("click", () => {
            const React = BdApi.React;
            const UserStore = BdApi.findModuleByProps("getCurrentUser");
            const currentUser = UserStore.getCurrentUser();
            const userName = currentUser.username;
            const notificationsToShow = this.notifications;

            // Заголовок модалки: название + имя пользователя + пометка scrollable
            const titleElement = React.createElement("div", 
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" } },
                React.createElement("span", null, `${i18n.modalTitle} (${userName})`),
                React.createElement("span", { style: { color: "#999999", fontSize: "11px", position: "absolute", right: "20px" } }, i18n.scrollable)
            );

            const modalStyle = { maxHeight: "300px", overflowY: notificationsToShow.length === 0 ? "hidden" : "auto", padding: "10px" };
const modalContent = React.createElement(
    "div",
    { style: modalStyle },
    notificationsToShow.length === 0
        ? React.createElement("div", { style: { color: "#ffffff" } }, i18n.noNotifications)
        : notificationsToShow.map((notification, index) => {
            const fullText = notification.text;
            const truncated = fullText.length > 100 ? fullText.slice(0, 100) + "..." : fullText;
            const needsTruncate = fullText.length > 100;
            const textElement = React.createElement("span", {
                style: {
                    color: "#ffffff",
                    whiteSpace: needsTruncate ? "nowrap" : "normal",
                    overflow: needsTruncate ? "hidden" : "visible",
                    textOverflow: needsTruncate ? "ellipsis" : "clip"
                }
            }, ": " + (needsTruncate ? truncated : fullText));

            if (needsTruncate) {
                const toggle = React.createElement("span", {
                    style: { color: "#7289da", cursor: "pointer", marginLeft: "5px" },
                    onClick: (e) => {
                        const span = e.target.previousSibling;
                        if (e.target.textContent === i18n.expand) {
                            span.textContent = ": " + fullText;
                            e.target.textContent = i18n.hide;
                        } else {
                            span.textContent = ": " + truncated;
                            e.target.textContent = i18n.expand;
                        }
                    }
                }, i18n.expand);

                return React.createElement("div", { key: index, style: { marginBottom: "8px" } },
                    React.createElement("span", {
                        style: { color: "#7289da", cursor: "pointer", marginRight: "5px" },
                        title: i18n.copyTooltip,
                        onClick: () => this.copyText(notification.authorId)
                    }, notification.authorName),
                    textElement,
                    toggle
                );
            } else {
                return React.createElement("div", { key: index, style: { marginBottom: "8px" } },
                    React.createElement("span", {
                        style: { color: "#7289da", cursor: "pointer", marginRight: "5px" },
                        title: i18n.copyTooltip,
                        onClick: () => this.copyText(notification.authorId)
                    }, notification.authorName),
                    textElement
                );
            }
        })
);

			BdApi.showConfirmationModal(titleElement, modalContent, {
                confirmText: i18n.modalConfirm,
                cancelText: i18n.modalCancel,
                onCancel: () => {
                    this.notifications = [];
                    BdApi.saveData("PingLogger", "notifications", this.notifications);
                    BdApi.showToast(i18n.notificationsCleared, { type: "info" });
                }
            });
        });
        panel.appendChild(btnShowNotifications);

        return panel;
    }
}

module.exports = PingLogger;
