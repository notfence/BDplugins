/**
 * @name PingChecker
 * @version 1.0.2
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
        const { ping, url, voiceLastPing, isInVoice } = await this.getPing();
        let desc = `🏓 Pong! ${typeof ping === 'number' ? `${ping} ms` : ping}\n${url}`;
        if (isInVoice && typeof voiceLastPing === 'number' && voiceLastPing > 0)
          desc += `\n🎤 Voice ping: ${Math.round(voiceLastPing)} ms`;
        return { embeds: [{ title: 'Ping', description: desc, timestamp: new Date().toISOString() }] };
      },
      predicate: () => true,
    };
    BdApi.Commands.register(this.constructor.name, this.command);
  }

  stop() {
    try { BdApi.Commands.unregister(this.constructor.name, this.command.id); } catch {}
  }

  async getPing() {
    const { Webpack } = BdApi;
    const safeGet = (o, p) => { try { return p.split('.').reduce((a, k) => a?.[k], o); } catch {} };
    const pingKeys = ['_ping','ping','latency','latencyMs','heartbeatLatency','heartbeatPing','latency_ms','_latency','wsPing','rtpPing'];
    const urlPaths = ['url','_url','_ws.url','ws.url','_socket.remoteAddress','remoteAddress','_connection.url','connection.url','transport.ws.url','transport._ws.url','socketURL','gatewayURL','endpoint'];
    let ping = 'unknown', url = 'unknown', voiceLastPing, isInVoice = false;

    try {
      const store = Webpack.getModule(m => m && (m.getSocket || m.getConnection));
      const socket = store?.getSocket?.() || store?.getConnection?.() || Webpack.getModule(m => (m.ws || m._ws || m.socket || m._socket))?.ws;
      if (socket) {
        for (const k of pingKeys) {
          const v = safeGet(socket, k);
          if (typeof v === 'number' && v >= 0) { ping = Math.round(v); break; }
        }
        if (ping === 'unknown' && typeof socket.getLatency === 'function') {
          const v = socket.getLatency();
          if (typeof v === 'number') ping = Math.round(v);
        }
        for (const p of urlPaths) {
          const v = safeGet(socket, p);
          if (typeof v === 'string' && v) { url = v; break; }
        }
      }
    } catch {}

    try {
      const VoiceStateStore = Webpack.getModule(m => (m?.getVoiceStates && typeof m.getVoiceStates === 'function') || (m?.getVoiceState && typeof m.getVoiceState === 'function'));
      const UserStore = Webpack.getModule(m => m?.getCurrentUser || m?.getUser);
      const currentUser = UserStore?.getCurrentUser?.() || (UserStore?.getUser ? UserStore.getUser() : undefined);
      const allStates = VoiceStateStore?.getVoiceStates?.();

      if (allStates && currentUser?.id) {
        if (allStates instanceof Map) {
          for (const [, users] of allStates.entries()) {
            const st = users?.get?.(currentUser.id) || users?.[currentUser.id];
            if (st?.channelId) { isInVoice = true; break; }
          }
        } else if (typeof allStates === 'object') {
          for (const [, users] of Object.entries(allStates)) {
            const st = users?.[currentUser.id];
            if (st?.channelId) { isInVoice = true; break; }
          }
        }
      }

      const RTC = Webpack.getModule(m => m && (m.getAveragePing || m.getLastPing || m.getVoiceConnection || m.getVoiceConnections || m.getVoiceServers || m.getVoiceServer));
      if (RTC) {
        const last = RTC.getLastPing?.(), avg = RTC.getAveragePing?.();
        if (typeof last === 'number') voiceLastPing = last;
        else if (typeof avg === 'number') voiceLastPing = avg;

        let conn;
        if (typeof RTC.getVoiceConnection === 'function') conn = RTC.getVoiceConnection();
        else if (typeof RTC.getVoiceConnections === 'function') conn = RTC.getVoiceConnections();
        else conn = RTC.getVoiceConnections;

        if (conn) {
          if (conn instanceof Map) {
            for (const [, v] of conn.entries()) {
              if (v?.channelId || v?.endpoint || v?.serverId || v?.voiceChannelId) { isInVoice = true; break; }
            }
          } else if (typeof conn === 'object') {
            for (const k of Object.keys(conn)) {
              const c = conn[k];
              if (c?.channelId || c?.endpoint || c?.server || c?.voiceChannelId) { isInVoice = true; break; }
            }
          }
        }
      }

      if (!isInVoice && typeof voiceLastPing === 'number' && voiceLastPing > 0) isInVoice = true;
    } catch {}

    if (ping === 'unknown') {
      try {
        const target = url !== 'unknown' ? url : 'https://discord.com/api/v9/gateway';
        const s = Date.now();
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5000);
        await fetch(target, { method: 'HEAD', mode: 'no-cors', signal: c.signal }).finally(() => clearTimeout(t));
        ping = Date.now() - s;
        if (url === 'unknown') url = target;
      } catch {}
    }

    if (!url || typeof url !== 'string') url = 'unknown';
    if (typeof ping === 'number' && !isFinite(ping)) ping = 'unknown';
    return { ping, url, voiceLastPing, isInVoice };
  }
};
