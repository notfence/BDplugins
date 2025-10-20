/**
 * @name PingChecker
 * @version 1.0.1
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
        const { ping, url, voiceLastPing } = await this.getPing();
        let desc = `🏓 Pong! ${typeof ping === 'number' ? `${ping} ms` : ping}\n${url}`;
        if (typeof voiceLastPing === 'number') desc += `\nVoice ping: ${Math.round(voiceLastPing)} ms`;
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
    let ping = 'unknown', url = 'unknown', voiceLastPing;

    try {
      const store = Webpack.getModule(m => m && (m.getSocket || m.getConnection));
      let socket = store?.getSocket?.() || store?.getConnection?.() || Webpack.getModule(m => (m.ws || m._ws || m.socket || m._socket))?.ws;
      if (socket) {
        for (const k of pingKeys) { const v = safeGet(socket, k); if (typeof v === 'number' && v >= 0) { ping = Math.round(v); break; } }
        if (ping === 'unknown' && typeof socket.getLatency === 'function') { const v = socket.getLatency(); if (typeof v === 'number') ping = Math.round(v); }
        for (const p of urlPaths) { const v = safeGet(socket, p); if (typeof v === 'string' && v) { url = v; break; } }
      }
    } catch {}

    try {
      const RTC = Webpack.getModule(m => m && (m.getAveragePing || m.getLastPing || m.getVoiceServer || m.getVoiceServers || m.getVoiceConnection));
      if (RTC) {
        const last = RTC.getLastPing?.(), avg = RTC.getAveragePing?.();
        if (typeof last === 'number') voiceLastPing = last; else if (typeof avg === 'number') voiceLastPing = avg;
        let vs = RTC.getVoiceServer?.() || (RTC.getVoiceServers?.() || [])[0] || RTC.getVoiceConnection?.();
        const candidate = vs?.endpoint || vs?.url || vs?.host || safeGet(vs, 'server.endpoint') || safeGet(vs, 'connection.endpoint');
        if ((!url || url === 'unknown') && candidate) url = candidate;
      }
    } catch {}

    if (ping === 'unknown') {
      try {
        const target = url !== 'unknown' ? url : 'https://discord.com/api/v9/gateway';
        const s = Date.now(); const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000);
        await fetch(target, { method: 'HEAD', mode: 'no-cors', signal: c.signal }).finally(() => clearTimeout(t));
        ping = Date.now() - s; if (url === 'unknown') url = target;
      } catch {}
    }

    if (!url || typeof url !== 'string') url = 'unknown';
    if (typeof ping === 'number' && !isFinite(ping)) ping = 'unknown';
    return { ping, url, voiceLastPing };
  }
};
