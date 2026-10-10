'use strict';
/* bridge.js — работает НА СТРАНИЦЕ sainvio (не WB!). Слушает window.postMessage
   от приложения {src:'sainvio-web', want:'liveQuery', query, reqId},
   пересылает в service worker (у него доступ к вкладке WB) и возвращает
   ответ обратно странице {src:'sainvio-ext', reqId, items|busy}. */
/* Маяк для страницы: «мост на месте». Страница показывает подсказку,
   только если маяка нет (а не ждёт 35с в пустоту).
   Заодно отдаём backend из настроек: страница сверяет его со своим
   адресом — пуш в один сервер, а читает другой, это ровно «Пока тихо». */
try {
  chrome.storage.local.get(['backend'], (cfg) => {
    try { window.postMessage({ src: 'sainvio-ext', hello: true, backend: String((cfg && cfg.backend) || '') }, '*'); } catch (e) {}
  });
} catch (e) {
  try { window.postMessage({ src: 'sainvio-ext', hello: true }, '*'); } catch (e2) {}
}
/* Обратный канал: расширение толкает страницу (отзывы готовы). */
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'reviewsReady') {
      try { window.postMessage({ src: 'sainvio-ext', reviewsReady: true, productId: String(msg.productId || '') }, '*'); } catch (e) {}
    }
  });
} catch (e) {}
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.src !== 'sainvio-web') return;
  if (e.data.want === 'openProduct' || e.data.want === 'closeProduct') {
    try { chrome.runtime.sendMessage({ type: e.data.want, nmId: String(e.data.nmId || ''), pid: String(e.data.pid || '') }); } catch (err) {}
    return;
  }
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
