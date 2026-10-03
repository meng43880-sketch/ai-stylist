'use strict';
/* bridge.js — работает НА СТРАНИЦЕ sainvio (не WB!). Слушает window.postMessage
   от приложения {src:'sainvio-web', want:'liveQuery', query, reqId},
   пересылает в service worker (у него доступ к вкладке WB) и возвращает
   ответ обратно странице {src:'sainvio-ext', reqId, items|busy}. */
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.src !== 'sainvio-web') return;
  if (e.data.want !== 'liveQuery' || !e.data.query) return;
  const reqId = e.data.reqId;
  try {
    chrome.runtime.sendMessage({ type: 'liveQuery', query: String(e.data.query).slice(0, 60), reqId }, (res) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ src: 'sainvio-ext', reqId, busy: true }, '*');
        return;
      }
      window.postMessage({ src: 'sainvio-ext', reqId, items: (res && res.items) || [], busy: !!(res && res.busy) }, '*');
    });
  } catch (err) {
    window.postMessage({ src: 'sainvio-ext', reqId, busy: true }, '*');
  }
});
