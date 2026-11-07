/* 日历与天气只读本机日期；调试值只在 runtime 中，不改变花园等真实时间钟。 */
(function (G) {
  'use strict';
  const D = G.data, DAY = 86400000;
  let initialized = false, lastSignature = '', claiming = false;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const ok = (message, extra) => Object.assign({ ok: true, message: message || '' }, extra || {});
  const fail = message => ({ ok: false, message });
  const pad = number => String(number).padStart(2, '0');
  function parts(date) { return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }; }
  function key(date) { const p = parts(date); return p.year + '-' + pad(p.month) + '-' + pad(p.day); }
  function dayNumber(date) { const p = parts(date); return Date.UTC(p.year, p.month - 1, p.day) / DAY; }
  function fromKey(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const p = value.split('-').map(Number), date = new Date(2000, p[1] - 1, p[2], 12); date.setFullYear(p[0]); return key(date) === value && p[0] >= 1 ? date : null; }
  function hash(value) { let n = 2166136261; for (let i = 0; i < value.length; i++) { n ^= value.charCodeAt(i); n = Math.imul(n, 16777619); } n += n << 13; n ^= n >>> 7; n += n << 3; n ^= n >>> 17; n += n << 5; return (n >>> 0) / 4294967296; }
  function season(month) { return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter'; }
  function weather(date, seasonId) { const weights = D.weatherWeights[seasonId], types = Object.keys(weights), total = types.reduce((n, type) => n + weights[type], 0); let value = hash('cottage-weather-v1:' + date) * total; for (const type of types) { value -= weights[type]; if (value < 0) return type; } return types[0]; }
  function smooth(value) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }
  function displayTime(hour, mode) {
    if (mode === 'day') return { phase: 'day', nightness: 0 };
    if (mode === 'night') return { phase: 'night', nightness: 1 };
    const phase = hour >= 6 && hour < 18 ? 'day' : hour >= 18 && hour < 20 ? 'dusk' : 'night';
    const nightness = hour >= 18 && hour < 20 ? smooth((hour - 18) / 2) : hour >= 20 || hour < 5 ? 1 : hour >= 5 && hour < 6 ? 1 - smooth(hour - 5) : 0;
    return { phase, nightness };
  }
  function event(def, year, resident) {
    const id = resident ? def.id + '_' + resident.id : def.id, eventKey = year + ':' + def.id + (resident ? ':' + resident.id : ''), itemIds = def.itemIds.slice();
    const outfitId = D.festivalOutfitReward?.(def.id);
    return { id, festivalId: def.id, name: resident ? resident.name + '的生日' : def.name, icon: def.icon, greeting: resident ? resident.name + '，生日快乐！今天送给你的礼物，好感会翻倍。谢谢你让小屋多了一份温暖。' : def.greeting, key: eventKey, year, residentId: resident ? resident.id : null, itemIds, gift: Object.assign({ itemId: itemIds[0], count: 1 }, outfitId ? { outfitId } : {}), claimed: !!G.state.calendar.claimed[eventKey] };
  }
  function festivals(date, debugFestival) {
    const p = parts(date), number = dayNumber(date), mmdd = pad(p.month) + '-' + pad(p.day), result = [];
    D.festivals.forEach(def => {
      if (def.type === 'resident') {
        D.residents.filter(resident => G.state.residents[resident.id] && G.state.residents[resident.id].movedIn && (resident.birthday === mmdd || debugFestival === def.id)).forEach(resident => result.push(event(def, p.year, resident)));
        return;
      }
      if (def.type === 'player') { if ((G.state.profile.birthday && G.state.profile.birthday === mmdd) || debugFestival === def.id) result.push(event(def, p.year)); return; }
      let found = false;
      // 比较相邻年份，使节期跨越新年时仍使用节日本身的年份作为领奖键。
      for (let year = p.year - 1; year <= p.year + 1; year++) {
        const text = def.type === 'lunar' ? (D.lunarFestivalDates[year] || {})[def.id] : year + '-' + def.monthDay, center = text && fromKey(text);
        if (!center) continue;
        const distance = number - dayNumber(center);
        if (distance >= -(def.before || 0) && distance <= (def.after || 0)) { result.push(event(def, year)); found = true; break; }
      }
      if (!found && debugFestival === def.id) result.push(event(def, p.year));
    });
    return result;
  }
  function current(now) {
    const actual = new Date(typeof now === 'number' && Number.isFinite(now) ? now : Date.now()), debug = G.runtime.timeDebug || {}, shown = debug.date ? fromKey(debug.date) : new Date(actual.getTime());
    if (debug.date) shown.setHours(actual.getHours(), actual.getMinutes(), actual.getSeconds(), actual.getMilliseconds());
    let hour = own(debug, 'hour') ? debug.hour : shown.getHours() + shown.getMinutes() / 60 + shown.getSeconds() / 3600;
    const date = key(shown), seasonId = season(shown.getMonth() + 1), baseWeather = debug.weather || weather(date, seasonId), afterRain = baseWeather === 'rain' && hour >= 15;
    const time = displayTime(hour, own(debug, 'hour') ? 'real' : G.state.settings.dayMode), active = festivals(shown, debug.festival), rainbow = afterRain && hour < 20 && time.phase !== 'night';
    return { date, hour, phase: time.phase, nightness: time.nightness, season: seasonId, weather: afterRain ? 'clear' : baseWeather, baseWeather, rainbow, festivals: active, events: active, birthdays: active.filter(entry => entry.residentId).map(entry => entry.residentId), debug: Object.keys(debug).length > 0 };
  }
  function signature(value) { return [value.date, value.phase, value.weather, value.rainbow, value.festivals.map(entry => entry.key + ':' + entry.claimed).join('|'), G.state.settings.dayMode, JSON.stringify(G.runtime.timeDebug || {})].join(';'); }
  function tick(force) { const value = current(), next = signature(value); if (force || next !== lastSignature) { lastSignature = next; G.bus.emit('time:change', value); } return value; }
  G.sys.time = {
    current,
    init() { if (initialized) { tick(true); return; } initialized = true; G.bus.on('state:replace', () => { delete G.runtime.timeDebug; tick(true); }); G.bus.on('state:change', () => tick(false)); setInterval(() => tick(false), 10000); tick(true); },
    claim(id) {
      if (claiming) return fail('这份心意正在收好，稍等一下再来吧。');
      const entry = current().festivals.find(value => value.id === id);
      if (!entry) return fail('这份节日心意还没到日子，等庆祝时再来看看吧。');
      if (entry.claimed) return fail('今年的这份节日礼物已经好好收下啦。');
      if ((G.state.inventory[entry.gift.itemId] || 0) + entry.gift.count > 9999) return fail('礼物背包快装满啦，先摆好一些家具吧。');
      const friends = Object.keys(G.state.residents).filter(residentId => G.state.residents[residentId].movedIn);
      if (entry.festivalId === 'children_day' && (G.state.inventory.cake_strawberry || 0) + friends.length > 9999) return fail('点心盒快装满啦，先和朋友分享一些吧。');
      claiming = true;
      try {
        G.store.update(state => {
          state.calendar.claimed[entry.key] = true; state.inventory[entry.gift.itemId] = (state.inventory[entry.gift.itemId] || 0) + entry.gift.count; state.collection[entry.gift.itemId] = true;
          if (entry.gift.outfitId) state.avatar.owned[entry.gift.outfitId] = true;
          if (entry.festivalId === 'children_day' && friends.length) { state.inventory.cake_strawberry = (state.inventory.cake_strawberry || 0) + friends.length; state.collection.cake_strawberry = true; }
          if (entry.festivalId === 'player_birthday' || entry.festivalId === 'children_day') friends.forEach(residentId => { state.residents[residentId].happiness = Math.min(100, state.residents[residentId].happiness + 5); });
          state.memories.push({ at: Date.now(), text: '和糯米一起庆祝' + entry.name + '，收下「' + D.furnitureById[entry.gift.itemId].name + '」。' + (entry.gift.outfitId ? '「' + D.outfitById[entry.gift.outfitId].name + '」也收进衣橱。' : '') + (entry.festivalId === 'children_day' && friends.length ? '朋友们还送来 ' + friends.length + ' 份草莓蛋糕。' : '') });
          if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
        }, { persist: true });
        G.bus.emit('festival:claimed', entry); return ok(entry.greeting + ' 礼物已放进背包。', { event: entry, itemId: entry.gift.itemId });
      } catch (error) { return fail('这份礼物还没有存好，请先留在小屋，检查存储空间后再试一次。'); }
      finally { claiming = false; }
    },
    canBuy(def) { return !def || !def.festivalId || current().festivals.some(entry => entry.festivalId === def.festivalId) ? ok() : fail('这是' + ((D.festivalById[def.festivalId] || {}).name || '节日') + '限定的小礼物，庆祝期间再来带走吧。'); },
    setDebug(patch) {
      if (!patch || Object.prototype.toString.call(patch) !== '[object Object]' || Object.keys(patch).some(field => !['date', 'hour', 'weather', 'festival'].includes(field))) return fail('选一个有效的日历预览吧。');
      const next = Object.assign({}, G.runtime.timeDebug || {});
      for (const field of Object.keys(patch)) {
        const value = patch[field];
        if (value === null) { delete next[field]; continue; }
        if (field === 'date' && !fromKey(value)) return fail('日期请填写 YYYY-MM-DD，并选一个真实存在的日子。');
        if (field === 'hour' && !(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 24)) return fail('时间请选 0 点到 24 点之间。');
        if (field === 'weather' && !own(D.weatherNames, value)) return fail('选一种小屋里支持的天气吧。');
        if (field === 'festival' && !own(D.festivalById, value)) return fail('选一个日历上的节日吧。');
        next[field] = value;
      }
      if (Object.keys(next).length) G.runtime.timeDebug = next; else delete G.runtime.timeDebug;
      tick(true); return ok('日历预览换好啦。');
    },
    clearDebug() { delete G.runtime.timeDebug; tick(true); return ok('已经回到真实的日历啦。'); }
  };
})(window.Game);
