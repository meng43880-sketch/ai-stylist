'use strict';
const $ = (id) => document.getElementById(id);
(async () => {
  try { $('ver').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) {}
  const cfg = await chrome.storage.local.get(['backend', 'key', 'set']);
  if (cfg.backend) $('backend').value = cfg.backend;
  if (cfg.key) $('key').value = cfg.key;
  $('set').value = cfg.set || 'auto';
  const draw = async () => {
    const o = await chrome.storage.local.get(['log', 'running', 'lastRun', 'lastCount']);
    $('log').innerHTML = (o.log || []).slice(-12).map((s) => `<div>${s}</div>`).join('');
    $('go').disabled = !!o.running;
    $('go').textContent = o.running ? 'Собираю…' : 'Собрать и отправить';
    $('st').textContent = o.lastRun
      ? `Прошлый прогон: ${new Date(o.lastRun).toLocaleString()}, товаров: ${o.lastCount || 0}. Автопрогон — каждые 6 ч.`
      : 'Ещё не запускалось. Автопрогон — каждые 6 ч.';
  };
  await draw();
  setInterval(draw, 2000);
  try { chrome.runtime.sendMessage({ type: 'pollRelay' }); } catch (e) {}
  $('go').onclick = async () => {
    await chrome.storage.local.set({ backend: $('backend').value.trim(), key: $('key').value.trim(), set: $('set').value, log: [] });
    chrome.runtime.sendMessage({ type: 'collect' });
    await draw();
  };
  $('heal').onclick = async () => {
    await chrome.storage.local.set({ backend: $('backend').value.trim(), key: $('key').value.trim(), log: [] });
    chrome.runtime.sendMessage({ type: 'heal' });
    await draw();
  };
  $('selftest').onclick = async () => {
    await chrome.storage.local.set({ backend: $('backend').value.trim(), key: $('key').value.trim(), log: [] });
    chrome.runtime.sendMessage({ type: 'selftest' });
    await draw();
  };
  $('report').onclick = async () => {
    await chrome.storage.local.set({ backend: $('backend').value.trim(), key: $('key').value.trim() });
    chrome.runtime.sendMessage({ type: 'report' });
    await draw();
  };
})();
