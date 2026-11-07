(function (Game) {
  'use strict';
  // 入口只编排模块；游戏规则与存档数据由系统处理。
  function boot() {
    try {
      // 参观文档先分支，不能读取主人存档、夺取标签租约或启动自动保存。
      if (Game.visit && Game.visit.shouldStart()) { Game.visit.init(); return; }
      if (Game.cloud && Game.cloud.prepare) Game.cloud.prepare();
      Game.store.init(Game.save.load());
      if (!Game.store.canWrite || Game.store.canWrite()) Game.sys.init();
      Game.render.init(document.getElementById('scene'));
      Game.ui.init();
      Game.save.init();
      if (Game.cloud && Game.cloud.init) Game.cloud.init();
      if (Game.offline && Game.offline.init) Game.offline.init();
      if (Game.ui.cloudAccount && Game.ui.cloudAccount.init) Game.ui.cloudAccount.init();
      Game.render.start();
      var dateNode = document.getElementById('island-date');
      if (!Game.sys.time) dateNode.textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
      var lastTime = Date.now(), sessionSec = 0, reminded = false;
      window.setInterval(function () {
        var now = Date.now();
        var elapsed = document.hidden ? 0 : Math.min(30, Math.round((now - lastTime) / 1000));
        lastTime = now;
        if (!elapsed) return;
        if (Game.store.canWrite && !Game.store.canWrite()) return;
        sessionSec += elapsed;
        Game.store.update(function (s) { s.profile.playTimeSec += elapsed; });
        if (!reminded && sessionSec >= 40 * 60 && Game.state.settings.restReminder) {
          reminded = true;
          Game.ui.modal({ title: '糯米的小提醒', content: '小屋会一直在这里等你。休息一下眼睛，看看远方，再喝一口水吧。' });
        }
      }, 30000);
      document.addEventListener('visibilitychange', function () {
        lastTime = Date.now();
        if (document.hidden) Game.save.flush();
      });
    } catch (error) {
      console.error('小屋启动失败：', error);
      var card = document.createElement('div');
      card.className = 'modal-backdrop';
      var box = document.createElement('div'); box.className = 'modal-card';
      var title = document.createElement('h2'); title.textContent = '小屋还没准备好';
      var text = document.createElement('p'); text.textContent = '请确认整个游戏文件夹都在一起，然后重新打开 index.html。已有存档不会被清空。';
      var detail = document.createElement('p'); detail.className = 'ui-small ui-muted'; detail.textContent = error.message;
      var button = document.createElement('button'); button.className = 'ui-button ui-button-primary'; button.textContent = '重新打开'; button.addEventListener('click', function () { location.reload(); });
      box.append(title, text, detail, button); card.appendChild(box); document.body.appendChild(card);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window.Game);
