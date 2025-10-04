/**
 * @name PingChecker
 * @version 1.0.0
 * @description Check your latency with /ping command
 * @author notfence
 * @authorId 1176524761686364226
 * @source https://github.com/notfence/BDplugins/tree/main/Plugins/PingChecker
 */

module.exports = class PingCommand {
    start() {
        this.command = {
            id: 'ping',
            name: 'ping',
            description: 'Check ping to the current Discord server',
            options: [],
            execute: async () => {
                const { ping, url } = await this.getPing();
                const pingText = (typeof ping === 'number') ? `${ping} ms` : String(ping);
                const embed = {
                    title: 'Ping',
                    description: `🏓 Pong! ${pingText}\n${url}`,
                    timestamp: new Date().toISOString()
                };
                return { embeds: [embed] };
            },
            predicate: () => true,
        };
        BdApi.Commands.register(this.constructor.name, this.command);
    }

    stop() {
        BdApi.Commands.unregister(this.constructor.name, this.command.id);
    }

    /**
     * Возвращает объект { ping, url }:
     * - ping: число (ms) или строка 'неизвестно'
     * - url: строка с адресом/endpoint'ом, который использовался для измерения
     */
    async getPing() {
        const { Webpack } = BdApi;
        let ping = 'unknown';
        let url = 'unknown';

        try {
            // Попытка получить gateway websocket
            const GatewayConnectionStore = Webpack.getModule(
                m => typeof m?.getSocket === 'function' && typeof m?.isConnected === 'function'
            );
            if (GatewayConnectionStore) {
                const socket = GatewayConnectionStore.getSocket();
                if (socket && typeof socket === 'object') {
                    const possible = ['_ping', 'ping', 'latency', 'latencyMs', 'heartbeatLatency', 'heartbeatPing'];
                    for (const key of possible) {
                        const value = socket[key];
                        if (typeof value === 'number' && value > 0) {
                            ping = Math.round(value);
                            break;
                        }
                    }

                    // Попытки получить URL из разных полей сокета
                    url = socket.url
                        || socket._url
                        || (socket._ws && socket._ws.url)
                        || (socket.ws && socket.ws.url)
                        || (socket._socket && socket._socket.remoteAddress)
                        || socket.remoteAddress
                        || url;
                    // Если URL — объект или другой тип, привести к строке
                    if (typeof url !== 'string') {
                        try { url = String(url); } catch(e) { url = 'unknown'; }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to read GatewayConnectionStore', err);
        }

        try {
            // Попытка получить пинг из модулей RTC (голосовой сервер)
            const RTCStore = Webpack.getModule(m => typeof m?.getAveragePing === 'function' && typeof m?.getLastPing === 'function');
            if (RTCStore) {
                const avg = RTCStore.getAveragePing && RTCStore.getAveragePing();
                const last = RTCStore.getLastPing && RTCStore.getLastPing();
                if ((typeof avg === 'number' && avg > 0) || (typeof last === 'number' && last > 0)) {
                    ping = typeof avg === 'number' && avg > 0 ? Math.round(avg) : Math.round(last);
                }
                // Если есть метод получения endpoint/voice server — пробуем
                if (typeof RTCStore.getVoiceServer === 'function') {
                    try {
                        const vs = RTCStore.getVoiceServer();
                        if (vs) url = vs.endpoint || vs.url || url;
                    } catch(e) { /* silent */ }
                }
            }
        } catch (err) {
            console.error('Failed to read RTCStore', err);
        }

        // Если всё ещё неизвестно — fallback: быстрый HTTP HEAD к gateway endpoint
        if (ping === 'unknown') {
            try {
                const fallbackUrl = 'https://discord.com/api/v9/gateway';
                const start = Date.now();
                // HEAD с no-cors — время может быть неточным, но даёт приближение
                await fetch(fallbackUrl, { method: 'HEAD', mode: 'no-cors' });
                const end = Date.now();
                ping = end - start;
                url = fallbackUrl;
            } catch (err) {
                console.error('Failed to check HTTP ping', err);
                // url останется тем, что удалось получить раньше, либо 'неизвестно'
            }
        }

        return { ping, url };
    }
};
