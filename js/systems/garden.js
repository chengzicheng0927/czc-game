/* 花园用真实时间戳计算进度，离线时无需定时器，也不会漏掉生长。 */
(function (Game) {
  'use strict';
  var D = Game.data, C = D.gardenConfig, B = D.balance;
  var initialized = false, acting = false;
  var ok = function (message, extra) { return Object.assign({ ok: true, message: message || '' }, extra || {}); };
  var fail = function (message) { return { ok: false, message: message }; };
  var countValid = function (count) { return Number.isInteger(count) && count > 0 && count <= C.maxStock; };
  function nowValue(now) { return typeof now === 'number' && Number.isFinite(now) && now >= 0 ? Math.floor(now) : Date.now(); }
  function memory(state, text, now) { state.memories.push({ at: nowValue(now), text: text }); if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories); }
  function capacity() { return Game.state.level >= C.expandLv ? C.expandedPlots : C.basePlots; }
  function unlocked() { return Game.state.level >= C.unlockLv; }
  function validIndex(index) { return Number.isInteger(index) && index >= 0 && index < capacity(); }
  function ensurePlots() {
    if (Game.state.garden.plots.length >= capacity()) return;
    Game.store.update(function (state) { while (state.garden.plots.length < capacity()) state.garden.plots.push(null); });
  }
  function night(now) { var hour = new Date(nowValue(now)).getHours(); return hour >= 20 || hour < 6; }
  function greenhouse() { return Game.contentSpaces.list(Game.state).some(function (room) { return Game.contentSpaces.isType(room, 'greenhouse') || Game.contentSpaces.isType(room, 'conservatory'); }); }
  // 浇水只缩短该阶段当下剩余的 30%，之后阶段仍按自己的起点计算。
  function timeline(plot) {
    var duration = plot.durationMs / 3, start = plot.plantedAt, stages = [];
    for (var i = 0; i < 3; i++) {
      var end = start + duration, watered = plot.watered[i];
      if (watered !== null && watered >= start && watered < end) end = watered + (end - watered) * 0.7;
      stages.push({ startAt: start, endAt: end, wateredAt: watered }); start = end;
    }
    return { stages: stages, matureAt: start };
  }
  function status(index, now) {
    now = nowValue(now);
    var locked = !unlocked() || !validIndex(index), plot = Game.state.garden.plots[index];
    if (!plot || locked) return { index: index, empty: true, locked: locked, crop: null, stage: 0, mature: false, progress: 0, remainingMs: 0, needsWater: false };
    var times = timeline(plot), stage = 0;
    while (stage < 3 && now >= times.stages[stage].endAt) stage++;
    var mature = stage === 3, current = mature ? null : times.stages[stage];
    return { index: index, empty: false, locked: false, crop: plot.crop, stage: stage, stageName: C.stageNames[stage], mature: mature, watered: mature || plot.watered[stage] !== null, needsWater: !mature && plot.watered[stage] === null, progress: Math.max(0, Math.min(1, (now - plot.plantedAt) / (times.matureAt - plot.plantedAt))), remainingMs: Math.max(0, Math.ceil(times.matureAt - now)), stageRemainingMs: current ? Math.max(0, Math.ceil(current.endAt - now)) : 0, stageStartAt: current ? current.startAt : times.matureAt, stageEndAt: current ? current.endAt : times.matureAt, matureAt: times.matureAt, durationMs: plot.durationMs };
  }
  function statistics(state, name, amount) {
    state.quests.stats[name] = (state.quests.stats[name] || 0) + amount;
    state.quests.daily.list.forEach(function (entry) { var def = D.dailyQuests.find(function (quest) { return quest.id === entry.id; }); if (def && def.metric === name) { entry.progress += amount; entry.done = entry.progress >= def.target; } });
  }
  Game.sys.garden = {
    init: function () {
      ensurePlots();
      if (initialized) return;
      initialized = true; Game.bus.on('level:up', ensurePlots); Game.bus.on('state:replace', ensurePlots);
    },
    capacity: capacity,
    isNight: night,
    hasGreenhouse: greenhouse,
    timeline: timeline,
    status: status,
    plots: function (now) { return Array.from({ length: capacity() }, function (_, index) { return status(index, now); }); },
    plant: function (index, cropId) {
      if (!unlocked()) return fail('小屋到 Lv.' + C.unlockLv + '，就能打开小花园啦。');
      if (!validIndex(index)) return fail('Lv.' + C.expandLv + ' 会长出更多小花圃。');
      if (Game.state.garden.plots[index]) return fail('这里已经种着一份小期待啦。');
      var crop = D.cropById[cropId], now = Date.now();
      if (!crop) return fail('先选一粒喜欢的种子吧。');
      if (crop.nightOnly && !night(now)) return fail('星星果要等到夜晚 20:00—次日 06:00，再悄悄播种。');
      if (!(Game.state.garden.seeds[cropId] > 0)) return fail('还没有' + crop.name + '种子，去种子铺挑一粒吧。');
      var durationMs = Math.round(crop.growMs / (greenhouse() ? 1.2 : 1));
      Game.store.update(function (state) { while (state.garden.plots.length <= index) state.garden.plots.push(null); state.garden.seeds[cropId]--; state.garden.plots[index] = { crop: cropId, plantedAt: now, durationMs: durationMs, watered: [null, null, null] }; memory(state, '在第 ' + (index + 1) + ' 块小花圃种下' + crop.name + '，等一份小小的惊喜。', now); });
      Game.bus.emit('garden:planted', { index: index, crop: cropId }); return ok(crop.name + '种好啦，浇一点水吧。', { index: index, crop: cropId });
    },
    water: function (index, now) {
      if (acting) return fail('这一份花园记忆正在收好，稍等一下。');
      if (!validIndex(index) || !unlocked()) return fail('先打开一块小花圃吧。');
      now = nowValue(now); var current = status(index, now);
      if (current.empty) return fail('先种下一粒小种子吧。');
      if (current.mature) return fail('已经成熟啦，快收进小篮子吧。');
      if (!current.needsWater) return fail('这个阶段已经喝过水啦，等下一次发芽吧。');
      if (now < current.stageStartAt) return fail('小种子还在等待这段时光，稍后再来吧。');
      acting = true;
      try {
        Game.store.update(function (state) { state.garden.plots[index].watered[current.stage] = now; }, { persist: true });
        Game.bus.emit('garden:watered', { index: index, crop: current.crop, stage: current.stage });
        return ok('咕噜咕噜，这一阶段剩下的时间缩短了 30%。', { index: index, stage: current.stage });
      } catch (_) { return fail('这次浇水还没保存好，先导出备份或整理相册，再试一次吧。'); }
      finally { acting = false; }
    },
    harvest: function (index, now) {
      if (acting) return fail('这一份花园记忆正在收好，稍等一下。');
      if (!validIndex(index) || !unlocked()) return fail('先打开一块小花圃吧。');
      now = nowValue(now); var current = status(index, now);
      if (current.empty) return fail('这里还等着一粒小种子呢。');
      if (!current.mature) return fail('再等一会儿，' + D.cropById[current.crop].name + '还在长大。');
      if ((Game.state.garden.harvest[current.crop] || 0) >= C.maxStock) return fail('收获篮装得满满啦，先送给朋友或卖出一些吧。');
      var crop = D.cropById[current.crop], levels = []; acting = true;
      try {
        Game.store.update(function (state) {
          state.garden.plots[index] = null; state.garden.harvest[current.crop] = (state.garden.harvest[current.crop] || 0) + 1;
          if (state.collectionBook.crops.indexOf(current.crop) < 0) state.collectionBook.crops.push(current.crop);
          statistics(state, 'harvests', 1); memory(state, '收获一份' + crop.name + '。小种子的等待，变成了软软的好心情。', now);
          levels = Game.sys.economy.expInto(state, C.harvestExp);
          while (state.garden.plots.length < (state.level >= C.expandLv ? C.expandedPlots : C.basePlots)) state.garden.plots.push(null);
        }, { persist: true });
        levels.forEach(function (level) { Game.bus.emit('level:up', { level: level }); });
        Game.bus.emit('garden:harvested', { index: index, crop: current.crop, count: 1 }); return ok('收获' + crop.name + '！放进小篮子啦，经验 +' + C.harvestExp + '。', { index: index, crop: current.crop, count: 1 });
      } catch (_) { return fail('收获暂时没能放进存档，作物还在花圃里。先整理相册或导出备份，再试一次吧。'); }
      finally { acting = false; }
    },
    buySeeds: function (cropId, count) {
      if (!unlocked()) return fail('小屋到 Lv.' + C.unlockLv + '，种子铺就开门啦。');
      var crop = D.cropById[cropId];
      if (!crop || !countValid(count)) return fail('选好种子和购买数量吧。');
      if ((Game.state.garden.seeds[cropId] || 0) + count > C.maxStock) return fail('种子袋快装满啦，先种下一些吧。');
      var price = crop.seedPrice * count;
      if (Game.state.wallet.coin < price) return fail('还差 ' + (price - Game.state.wallet.coin) + ' 颗糖果，就能带走这份种子啦。');
      Game.store.update(function (state) { state.wallet.coin -= price; state.garden.seeds[cropId] = (state.garden.seeds[cropId] || 0) + count; });
      Game.bus.emit('garden:seeds_bought', { crop: cropId, count: count }); return ok('把 ' + count + ' 粒' + crop.name + '种子装好啦。');
    },
    sell: function (cropId, count) {
      var crop = D.cropById[cropId];
      if (!crop || !countValid(count)) return fail('选好要分享的收获和数量吧。');
      if ((Game.state.garden.harvest[cropId] || 0) < count) return fail('收获篮里还没有这么多，换个数量吧。');
      var coin = crop.sellPrice * count;
      if (Game.state.wallet.coin + coin > 1000000000) return fail('糖果罐已经很满啦，先给小屋买点礼物吧。');
      Game.store.update(function (state) { state.garden.harvest[cropId] -= count; state.wallet.coin += coin; memory(state, '分享 ' + count + ' 份' + crop.name + '，收到 ' + coin + ' 颗糖果。'); });
      Game.bus.emit('garden:sold', { crop: cropId, count: count, coin: coin }); return ok('分享了 ' + count + ' 份' + crop.name + '，收下 ' + coin + ' 颗糖果。', { coin: coin });
    }
  };
})(window.Game);
