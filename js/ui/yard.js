(function (G) {
  'use strict';
  G.ui = G.ui || {};
  let tab = 'items';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls = 'ui-button') => { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  function act(result) { G.ui.toast(result.message); G.ui.audio.play(result.ok ? 'success' : 'soft'); if (result.ok) G.ui.refresh(); return result.ok; }
  function preview(def, item) { const canvas = el('canvas', 'yard-preview'); canvas.width = 240; canvas.height = 180; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', def.name); const c = canvas.getContext('2d'), scale = Math.min(220 / def.w, 162 / def.h, 2.2); c.save(); c.translate((240 - def.w * scale) / 2, (180 - def.h * scale) / 2); c.scale(scale, scale); if (!G.draw.crafting || !G.draw.crafting(c, def, 0, 0, item || {})) G.draw.yard(c, def, 0, 0, item || {}); c.restore(); return canvas; }
  function choose(def) { G.runtime.placing = def.id; G.runtime.mode = 'yard'; G.runtime.selected = null; G.ui.panel.close({ keepPlacing: true }); G.runtime.mode = 'yard'; if (G.render.camera.focusYard) G.render.camera.focusYard(); G.ui.toast(def.stroke ? '在前院里按住拖动，铺出一条小风景。' : '点一下前院，把' + def.name + '放下来。'); G.ui.refresh(); }
  function placedControls(body) {
    const selected = G.runtime.selected && G.runtime.selected.yard && G.sys.yard.get(G.runtime.selected.uid); if (!selected) return;
    const def = G.data.furnitureById[selected.defId], box = el('section', 'yard-selected ui-card'), row = el('div', 'ui-row'); box.append(el('h3', 'ui-card-head', '正在照顾：' + def.name));
    if (def.recolor) { const color = G.ui.controls.color(selected.color || def.color || '#E8C6A3', 'yard-color-' + selected.uid); color.addEventListener('change', () => act(G.sys.yard.recolor(selected.uid, color.value))); row.append(G.ui.controls.label(color, '换个颜色')); }
    row.append(button('转过来', () => act(G.sys.yard.flip(selected.uid))), button('往前一层', () => act(G.sys.yard.layer(selected.uid, 1))), button('往后一层', () => act(G.sys.yard.layer(selected.uid, -1))), button('收回背包', () => act(G.sys.yard.remove(selected.uid)), 'ui-button ui-button-soft')); box.append(row, el('p', 'ui-small ui-muted', '在场景中拖动它，可以换一个喜欢的位置。')); body.append(box);
  }
  G.ui.yard = {
    choose(id) { const def = G.data.furnitureById[id]; if (!def || def.place !== 'yard' || !(G.state.inventory[id] > 0)) return false; if (G.state.level < G.data.yardConfig.unlockLv) { G.ui.open('yard'); return false; } choose(def); return true; },
    open() { G.ui.open('yard'); },
    panel() {
      const body = el('div', 'yard-panel ui-stack'), count = G.state.house.yard.items.length;
      if (G.state.level < G.data.yardConfig.unlockLv) { body.append(el('p', 'ui-empty', '前院已经长大啦。Lv.11 开放庭院装饰，就能摆上秋千、花坛和自己的小风景。'), button('去看看成长任务', () => G.ui.open('quests'), 'ui-button ui-button-soft')); return { title: '我的大前院', subtitle: '留一块草地，装下喜欢的生活', content: body }; }
      const tabs = el('div', 'ui-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '前院布置');
      [{ id: 'items', name: '庭院背包' }, { id: 'shop', name: '庭院小铺' }, { id: 'placed', name: '已经摆好 ' + count }].forEach(value => { const control = button(value.name, () => { tab = value.id; G.ui.refresh(); }, 'ui-tab' + (tab === value.id ? ' is-active' : '')); control.setAttribute('aria-pressed', String(tab === value.id)); tabs.append(control); }); body.append(tabs);
      const tools = el('div', 'yard-paint-tools ui-row'), automatic = el('input', 'cute-checkbox'); automatic.type = 'checkbox'; automatic.checked = !!G.runtime.yardAutoBuy; automatic.addEventListener('change', () => { G.runtime.yardAutoBuy = automatic.checked; }); tools.append(G.ui.controls.label(automatic, '连续铺设时自动补购'), el('span', 'ui-small ui-muted', '栅栏和小路按住拖动铺设。仅在库存不足时，按标价用糖果补足；这次设置不存档。')); body.append(tools);
      const placing = G.runtime.placing && G.data.furnitureById[G.runtime.placing]; if (placing && placing.place === 'yard') { const note = el('div', 'yard-placing ui-notice ui-row'); note.append(el('span', '', '已选' + placing.name + ' · 点前院摆放' + (placing.stroke ? '，也可拖动连续铺设' : '')), button('先放下', () => { G.runtime.placing = null; G.ui.refresh(); })); body.append(note); }
      if (tab === 'placed') placedControls(body);
      const defs = tab === 'placed' ? G.state.house.yard.items.map(item => ({ def: G.data.furnitureById[item.defId], item })) : G.data.yardFurniture.filter(def => tab === 'shop' ? !def.rewardOnly : G.state.inventory[def.id] > 0).map(def => ({ def, item: null }));
      const grid = el('div', 'yard-grid item-grid');
      defs.forEach(({ def, item }) => {
        const node = el('article', 'yard-card ui-card'), copy = el('div', 'yard-card-copy'); copy.append(el('strong', '', def.name), el('span', 'ui-small ui-muted', item ? '已摆在前院' : tab === 'shop' ? def.price + ' 颗糖果 · ' + (def.stroke ? '可连续铺设' : '庭院家具') : '背包里有 ' + G.state.inventory[def.id] + ' 件')); node.append(preview(def, item), copy);
        if (item) node.append(button('选中它', () => { G.runtime.selected = { yard: true, uid: item.uid, roomId: null }; G.runtime.placing = null; G.runtime.mode = 'yard'; G.bus.emit('yard:selected', { uid: item.uid }); G.ui.refresh(); }, 'ui-button ui-button-soft'));
        else if (tab === 'shop') { const buy = button('带回家 · ' + def.price, () => act(G.sys.economy.buy(def.id)), 'ui-button ui-button-primary'); buy.disabled = G.state.wallet.coin < def.price || (G.state.inventory[def.id] || 0) >= 9999; node.append(buy); }
        else node.append(button(def.stroke ? '选好，连续铺' : '选好，去摆放', () => choose(def), 'ui-button ui-button-soft'));
        grid.append(node);
      }); body.append(grid);
      if (!defs.length) body.append(el('p', 'ui-empty', tab === 'placed' ? '前院还是一块软软的草地。选一件宝贝，开始布置吧。' : '庭院背包还空着。去小铺挑一件喜欢的宝贝吧。'), button(tab === 'placed' ? '看看庭院背包' : '逛逛庭院小铺', () => { tab = tab === 'placed' ? 'items' : 'shop'; G.ui.refresh(); }, 'ui-button ui-button-primary'));
      body.append(el('p', 'ui-small ui-muted', '在小屋前方的大草地布置。边缘会轻轻挪回可摆放的位置，最多摆 ' + G.data.yardConfig.maxItems + ' 件。'));
      return { title: '我的大前院', subtitle: '留一块草地，装下喜欢的生活', content: body };
    }
  };
})(window.Game);
