(function (Game) {
  'use strict';
  var handlers = Object.create(null);
  Game.bus = {
    on: function (name, fn) { if (typeof fn !== 'function') return function () {}; var list = handlers[name] || (handlers[name] = []); list.push(fn); return function () { var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }; },
    emit: function (name, payload) { (handlers[name] || []).slice().forEach(function (fn) { try { fn(payload); } catch (error) { if (typeof console !== 'undefined') console.error('小屋事件处理失败：' + name, error); } }); }
  };
})(window.Game);
