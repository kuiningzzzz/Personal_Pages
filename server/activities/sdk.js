/* Personal Pages Activity SDK v1. Loaded automatically into uploaded pages. */
(() => {
  if (window.ActivitySDK) return;
  let port, serial = 0, runtime, appearance = 'light';
  const pending = new Map(), listeners = new Map();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => rejectReady(new Error('未能连接主站，请在活动页面中打开此网页')), 20000);
  ready.catch(() => {});
  function on(type, callback) { const set = listeners.get(type) || new Set(); set.add(callback); listeners.set(type, set); return () => set.delete(callback); }
  function emit(type, data) { for (const callback of listeners.get(type) || []) { try { callback(data); } catch (error) { console.error(error); } } }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'PP_ACTIVITY_CONNECT' || !event.ports[0]) return;
    const expected = window.ActivityRuntime?.parentOrigin || window.ActivityParentOrigin;
    if (expected && expected !== event.origin) return;
    if (port) return;
    port = event.ports[0]; runtime = event.data.runtime; appearance = event.data.theme;
    port.onmessage = ({ data }) => {
      if (data.event) {
        if (data.event === 'theme') appearance = data.data;
        if (data.event === 'runtime') runtime = data.data;
        emit(data.event, data.data); return;
      }
      const call = pending.get(data.id); if (!call) return;
      pending.delete(data.id); clearTimeout(call.timer);
      if (data.error) call.reject(new Error(data.error)); else call.resolve(data.data);
    };
    port.start(); clearTimeout(timer); resolveReady({ runtime, theme: appearance });
  });
  const hello = () => { if (!port && window.parent !== window) window.parent.postMessage({ type: 'PP_ACTIVITY_READY' }, window.ActivityRuntime?.parentOrigin || window.ActivityParentOrigin || '*'); };
  hello(); window.addEventListener('load', hello, { once: true });
  async function call(method, args = {}) {
    await ready; const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('主站请求超时')); }, 60000);
      pending.set(id, { resolve, reject, timer });
      try { port.postMessage({ id, method, args }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  window.ActivitySDK = Object.freeze({
    ready, getUser: () => call('user'), getRuntime: async () => { await ready; return runtime; },
    getTheme: async () => { await ready; return appearance; }, onThemeChange: callback => on('theme', callback), onRuntimeChange: callback => on('runtime', callback),
    requestLogin: () => call('login'),
    storage: Object.freeze({
      get: key => call('storage.get', { key }), set: (key, value) => call('storage.set', { key, value }), remove: key => call('storage.remove', { key }),
      upload: file => call('file.upload', { file }), readFile: async id => new Blob([await call('file.read', { id })]), deleteFile: id => call('file.remove', { id })
    }),
    backend: Object.freeze({
      async openSocket(path, protocols) {
        const { id } = await call('socket.open', { path, protocols });
        return Object.freeze({
          send: data => call('socket.send', { id, data }), close: () => call('socket.close', { id }),
          onMessage: callback => on(`socket:${id}:message`, callback), onClose: callback => on(`socket:${id}:close`, callback), onError: callback => on(`socket:${id}:error`, callback)
        });
      },
      async fetch(path, options = {}) {
        const headers = new Headers(options.headers || {}); let body = options.body;
        if (body instanceof FormData) { const encoded = new Response(body); if (!headers.has('content-type')) headers.set('content-type', encoded.headers.get('content-type')); body = await encoded.arrayBuffer(); }
        else if (body instanceof URLSearchParams) { if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8'); body = body.toString(); }
        const data = await call('backend', { path, options: { method: options.method || 'GET', headers: Object.fromEntries(headers), body } });
        return new Response(data.body, { status: data.status, statusText: data.statusText, headers: data.headers });
      }
    })
  });
})();
