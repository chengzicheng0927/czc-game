(function (G) {
  'use strict';
  var script = typeof document !== 'undefined' && document.currentScript, match = script && /^(https?:\/\/[^/]+)(.*?)\/releases\/r-[a-f0-9]{64}\//.exec(script.src || '');
  var current = { phase: 'unavailable', message: '离线文件版可以直接打开；网址版联网后可准备离线副本。' }, initialized = false;
  function change(phase, message) { current = { phase: phase, message: message }; G.bus.emit('offline:change', G.offline.status()); }
  G.offline = {
    status: function () { return { phase: current.phase, message: current.message }; },
    init: function () {
      if (initialized) return; initialized = true;
      if (!match || !window.navigator || !navigator.serviceWorker || window.isSecureContext === false) return;
      change('preparing', '正在准备离线副本，请先保持联网。');
      navigator.serviceWorker.register(match[2] + '/sw.js', { scope: match[2] + '/', updateViaCache: 'none' }).then(function (registration) {
        function ready() { change(registration.waiting ? 'update' : 'ready', registration.waiting ? '离线副本有更新，关闭所有小屋页面后会自动换好。' : '离线副本已准备好，断网也能打开小屋；联网后再同步进度。'); }
        if (registration.active) ready();
        function watch(worker) { if (!worker) return; worker.addEventListener('statechange', function () { if (worker.state === 'activated' || worker.state === 'installed') ready(); else if (worker.state === 'redundant') change('error', '离线副本没有准备完成，请联网后再打开一次。JSON备份仍可下载。'); }); }
        watch(registration.installing);
        registration.addEventListener('updatefound', function () { watch(registration.installing); });
        return navigator.serviceWorker.ready.then(ready);
      }).catch(function () { change('error', '暂时不能准备离线副本，请保留JSON备份。当前页面仍可继续玩。'); });
    }
  };
})(window.Game);
