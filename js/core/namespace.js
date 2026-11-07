(function (global) {
  'use strict';
  var Game = global.Game = global.Game || {};
  Game.data = Game.data || {};
  Game.sys = Game.sys || {};
  Game.runtime = { mode: 'explore', selected: null, placing: null, activeRoomId: null };
})(window);
