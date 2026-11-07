/* 所有衣橱写入通过store；重复购买不会扣钱，搭配方案不复制所有权。 */
(function (G) {
  'use strict';
  const D = G.data;
  const ok = (message, extra) => Object.assign({ ok: true, message }, extra || {});
  const fail = message => ({ ok: false, message });
  const definition = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(D.outfitById, id) ? D.outfitById[id] : null;
  const current = () => D.validateAvatar(G.state.avatar);
  const lookKeys = ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'];
  function worn(avatar) { return ['top', 'bottom', 'dress', 'shoes'].map(key => avatar[key]).concat(avatar.acc || []).filter(Boolean).sort(); }
  function publishWear(before) { const after = worn(current()); if (JSON.stringify(before) !== JSON.stringify(after)) G.bus.emit('avatar:worn', { before, after, added: after.filter(id => !before.includes(id)), removed: before.filter(id => !after.includes(id)) }); }
  function remember(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories); }
  function update(fn) {
    G.store.update(state => { const avatar = D.validateAvatar(state.avatar); fn(avatar, state); state.avatar = D.validateAvatar(avatar); });
    G.bus.emit('avatar:changed', {});
  }
  function wear(avatar, item, id) {
    if (item.category === 'acc') { avatar.acc = avatar.acc.filter(old => D.outfitById[old].slot !== item.slot); avatar.acc.push(id); }
    else if (item.category === 'dress') { avatar.dress = id; avatar.top = null; avatar.bottom = null; }
    else if (item.category === 'top' || item.category === 'bottom') { avatar.dress = null; avatar.top = avatar.top || D.avatarConfig.defaultTop; avatar.bottom = avatar.bottom || D.avatarConfig.defaultBottom; avatar[item.category] = id; }
    else avatar.shoes = id;
  }
  function choose(list, field, value, message) {
    if (!list.some(item => item.id === value)) return fail('选一个衣橱里已有的样式吧。');
    update(avatar => { avatar[field] = value; }); return ok(message);
  }
  G.sys.avatar = {
    current,
    buy(id) {
      const item = definition(id); if (!item) return fail('还没有找到这件衣服。');
      if (current().owned[id]) return fail('它已经在衣橱里啦，直接试穿就好。');
      if (G.state.level < item.unlockLv) return fail('Lv.' + item.unlockLv + ' 时，' + item.name + '就会来到衣橱。');
      if (item.source !== 'shop') return fail('这是小屋送你的初见礼物，已经好好收进衣橱啦。');
      if (G.state.wallet.coin < item.price) return fail('还差 ' + (item.price - G.state.wallet.coin) + ' 颗糖果，就能带走它。');
      update((avatar, state) => { state.wallet.coin -= item.price; avatar.owned[id] = true; remember(state, '把「' + item.name + '」收进衣橱，等待一份新搭配。'); });
      G.bus.emit('avatar:bought', { id, coin: item.price }); return ok('「' + item.name + '」收进衣橱啦！', { id, coin: item.price });
    },
    equip(id) {
      const item = definition(id); if (!item) return fail('先选一件喜欢的衣服吧。');
      if (!current().owned[id]) return fail('先把它带回衣橱，再来试穿吧。');
      const before = worn(current());
      update(avatar => wear(avatar, item, id)); publishWear(before); return ok('穿上「' + item.name + '」，今天也很可爱。', { id });
    },
    removeAccessory(id) {
      if (!current().acc.includes(id)) return fail('这件配饰已经收好啦。');
      const before = worn(current());
      update(avatar => { avatar.acc = avatar.acc.filter(item => item !== id); }); publishWear(before); return ok('轻轻收好配饰啦。');
    },
    setSkin(value) { return choose(D.avatarSkins, 'skin', value, '换好喜欢的肤色啦。'); },
    setHair(value) { return choose(D.avatarHairStyles, 'hair', value, '梳好软软的新发型啦。'); },
    setHairColor(value) { return choose(D.avatarHairColors, 'hairColor', typeof value === 'string' ? value.toUpperCase() : value, '新发色像一颗甜甜的糖。'); },
    setFace(value) { return choose(D.avatarFaces, 'face', value, '把今天的好心情带在脸上。'); },
    presets() { return D.avatarPresets.slice(); },
    randomPresetId(random) { const roll = typeof random === 'function' ? random() : Math.random(); return D.avatarPresets[Math.min(D.avatarPresets.length - 1, Math.floor(roll * D.avatarPresets.length))].id; },
    // 预设只改外观字段，保留已拥有的衣物与三格搭配盒；预设只用初始衣橱，永远通过校验。
    applyPreset(id) {
      const look = D.avatarPresetLook(id); if (!look) return fail('这个形象还没有找到。');
      const before = worn(current());
      update(avatar => { lookKeys.forEach(key => { avatar[key] = look[key]; }); });
      G.store.update(state => { state.tutorial.seenTips.avatar_preset = true; });
      publishWear(before); return ok('换上「' + D.avatarPresetById[id].name + '」，出发吧！', { id });
    },
    // 是否已设置过个人形象：挑选过预设形象，或外观已不再是出厂默认
    hasConfigured() {
      if (!G.state || !G.state.avatar) return true;
      if (G.state.tutorial && G.state.tutorial.seenTips && G.state.tutorial.seenTips.avatar_preset) return true;
      return D.avatarFingerprint(current()) !== D.avatarFingerprint(D.defaultAvatar());
    },
    // 只有从未选过、外观仍是出厂默认、引导还没开始的新存档才需要挑选；老存档不会被打扰。
    needsPreset() {
      const tutorial = G.state.tutorial; if (tutorial.done || tutorial.step > 0 || tutorial.seenTips.avatar_preset) return false;
      return D.avatarFingerprint(current()) === D.avatarFingerprint(D.defaultAvatar());
    },
    saveOutfit(slot, name) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= D.avatarConfig.maxSaved) return fail('最多保存三套喜欢的搭配。');
      if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > D.avatarConfig.maxName || /[\u0000-\u001f]/.test(name)) return fail('给搭配起一个1～12字的小名字吧。');
      update(avatar => { while (avatar.outfits.length <= slot) avatar.outfits.push(null); const snapshot = { name: name.trim() }; lookKeys.forEach(key => { snapshot[key] = Array.isArray(avatar[key]) ? avatar[key].slice() : avatar[key]; }); avatar.outfits[slot] = snapshot; });
      return ok('「' + name.trim() + '」已放进第' + (slot + 1) + '格搭配盒。');
    },
    applyOutfit(slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= D.avatarConfig.maxSaved) return fail('选一个搭配盒吧。');
      const saved = current().outfits[slot]; if (!saved) return fail('这个搭配盒还空着，先保存一套吧。');
      const before = worn(current());
      update(avatar => { lookKeys.forEach(key => { avatar[key] = Array.isArray(saved[key]) ? saved[key].slice() : saved[key]; }); }); publishWear(before);
      return ok('换上「' + saved.name + '」，出发去小屋走走吧。');
    }
  };
})(window.Game);
