/* 起動処理 */
(function () {
  'use strict';
  const PPO = window.PPO;

  function measureSafeTop() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:1px;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 0;
    probe.remove();
    return h;
  }

  function boot() {
    const save = PPO.Save.load();
    PPO.Sound.init(save.sound);
    PPO.Input.init(document.getElementById('controls'));
    PPO.Engine.init(document.getElementById('game'), document.getElementById('controls'));
    PPO.Engine.safeTop = measureSafeTop();
    window.addEventListener('resize', () => { PPO.Engine.safeTop = measureSafeTop(); });
    PPO.Score.checkUnlocks();
    PPO.UI.init();
    if (PPO.Save.loadWarning) {
      PPO.UI.toast(PPO.Save.loadWarning);
      PPO.Save.loadWarning = null;
    }
    // オフライン対応（Service Worker）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW登録に失敗:', e));
      });
    }
  }

  window.addEventListener('error', (e) => { console.error('[PPO]', e.message); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
