/* 外观小衣橱：未拥有先试，拥有后即时换上，颜色沿用可爱调色盘。 */
(function (G) {
  'use strict';
  let category = 'roof', selected = {};
  let previewEpoch = 0, previewFrame = null, activeBody = null, activeCanvas = null, activeDraw = null;
  const names = { roof: '屋顶', wall: '外墙', window: '窗户', door: '大门', chimney: '烟囱' };
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, className = 'ui-button') => { const root = activeBody, token = previewEpoch, node = el('button', className, text); node.type = 'button'; node.addEventListener('click', () => { if (owns(root, token)) fn(); }); return node; };
  const price = def => def.price + (def.currency === 'heart' ? ' 爱心' : ' 糖果');
  function action(result) { G.ui.toast(result.message); if (result.ok && G.audio) G.audio.play('success'); return result.ok; }
  function draft() { return Object.assign({}, G.state.house.exterior, selected); }
  function owns(root, token) {
    if (root !== activeBody || token !== previewEpoch || !root?.isConnected) return false;
    const host = document.getElementById?.('panel'); return !host || !host.classList.contains('hidden') && host.dataset.kind === 'exterior';
  }
  function releasePreview(dispose) {
    previewEpoch++;
    if (previewFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewFrame);
    previewFrame = null; if (activeCanvas) activeCanvas.width = activeCanvas.height = 0; activeCanvas = null; activeBody = null; activeDraw = null;
    if (dispose) G.draw?.exterior?.disposePreview?.();
  }
  function panel() {
    releasePreview(false); const token = previewEpoch;
    const system = G.sys.exterior, current = G.state.house.exterior;
    Object.keys(names).forEach(part => { if (!G.data.exteriorById[selected[part]]) selected[part] = current[part]; });
    const body = el('div', 'exterior-panel ui-stack'), preview = el('canvas', 'exterior-preview'), note = el('p', 'exterior-summary ui-small ui-muted');
    preview.width = 560; preview.height = 400; preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', '小屋外观实时预览');
    activeBody = body; activeCanvas = preview;
    const respond = result => owns(body, token) && action(result);
    const caption = el('p', 'exterior-preview-caption ui-small ui-muted', '按当前小屋的真实楼层和房间预览');
    const draw = () => {
      if (!owns(body, token) || document.hidden || !G.draw.exterior) return;
      try {
        const result = G.draw.exterior.preview(preview, draft(), G.state.house.name, { width: 560, height: 400 });
        if (result) caption.textContent = result.mode === 'webgl' ? '按当前小屋的真实楼层和房间预览' : result.mode === 'canvas-isometric' ? '当前楼层与房间的立体结构示意' : '预览暂不可用，仍可查看款式和价格';
      } catch (_) { caption.textContent = '预览暂不可用，仍可查看款式和价格'; }
    };
    activeDraw = draw;
    if (G.ui.houseDesign) body.append(G.ui.houseDesign.navigation('custom'));
    body.append(preview, caption, note);
    const chooseCategory = G.ui.controls.select(Object.keys(names).map(id => ({ id, name: names[id] })), category, value => { if (!owns(body, token)) return; category = value; G.ui.open('exterior'); });
    body.append(G.ui.controls.label(chooseCategory, '想给小屋换什么呢'));
    const definitions = system.list(category), chosen = definitions.find(def => def.id === selected[category]) || definitions[0];
    const stylePicker = G.ui.controls.select(definitions.map(def => ({ id: def.id, name: def.name + (def.owned ? ' · 已拥有' : def.locked ? ' · Lv.' + def.unlockLv : ' · ' + price(def)) })), chosen.id, id => {
      if (!owns(body, token)) return;
      selected[category] = id;
      if (system.owned(id)) { respond(system.equip(category, id)); if (!owns(body, token)) return; }
      G.ui.open('exterior');
    });
    body.append(G.ui.controls.label(stylePicker, names[category] + '款式'));
    note.textContent = chosen.owned ? '已拥有的款式，选中就会为小屋换上并保存。' : '正在试穿「' + chosen.name + '」。收进小盒子后，就可以为小屋换上啦。';
    const purchase = button(chosen.owned ? current[category] === chosen.id ? '已经换上啦' : '换上这款' : '购买并换上 · ' + price(chosen), () => {
      if (!chosen.owned && !respond(system.buy(chosen.id))) return;
      if (respond(system.equip(category, chosen.id))) G.ui.open('exterior');
    }, 'ui-button ui-button-primary');
    purchase.disabled = chosen.locked || !chosen.owned && !chosen.canAfford || chosen.owned && current[category] === chosen.id;
    const actions = el('div', 'exterior-options ui-row'); actions.append(purchase, button('看看当前外观', () => { selected = {}; G.ui.open('exterior'); }, 'ui-button ui-button-soft')); body.append(actions);
    if (chosen.locked) body.append(el('p', 'exterior-price ui-notice', '小屋到 Lv.' + chosen.unlockLv + '，就能带走这款外观。需要 ' + price(chosen) + '。'));
    else if (!chosen.owned && !chosen.canAfford) body.append(el('p', 'exterior-price ui-notice', '还差 ' + (chosen.price - G.state.wallet[chosen.currency]) + (chosen.currency === 'heart' ? ' 颗爱心' : ' 颗糖果') + '，可以先试试其它款式。'));
    const colors = el('div', 'exterior-colors ui-stack');
    const presets = {
      roof: [
        { name: '草莓软陶', hex: '#E98982' },
        { name: '蜜桃甜粉', hex: '#FF9FB5' },
        { name: '薄荷清风', hex: '#87BCB0' },
        { name: '暖阳蜂蜜', hex: '#E0BC7D' },
        { name: '星空浅紫', hex: '#9EA6CA' },
        { name: '奶茶暖咖', hex: '#C6ADA0' },
        { name: '晴空天蓝', hex: '#6EA6D9' }
      ],
      wall: [
        { name: '奶油原白', hex: '#FFF8F0' },
        { name: '暖杏柔光', hex: '#FFE3C9' },
        { name: '草莓奶昔', hex: '#FFF0F5' },
        { name: '薄荷浅绿', hex: '#EBF5ED' },
        { name: '晨雾浅蓝', hex: '#EBF1F7' },
        { name: '原木温润', hex: '#F7ECE1' }
      ]
    };
    ['roof', 'wall'].forEach(part => {
      const partRow = el('div', 'exterior-color-block ui-stack');
      const headerRow = el('div', 'ui-row ui-between');
      const activeColor = String(current[part + 'Color'] || '').toUpperCase();
      const picker = G.ui.controls.color(current[part + 'Color'], 'exterior-' + part + '-color');
      picker.addEventListener('change', () => { if (owns(body, token) && respond(system.color(part, picker.value))) { draw(); G.render?.redraw?.(); } });
      headerRow.append(el('strong', 'exterior-color-label', names[part] + '颜色'), picker);
      partRow.append(headerRow);

      const swatches = el('div', 'swatch-row exterior-swatches');
      (presets[part] || []).forEach(sw => {
        const btn = el('button', 'swatch' + (sw.hex.toUpperCase() === activeColor ? ' is-active' : ''));
        btn.type = 'button';
        btn.style.backgroundColor = sw.hex;
        btn.setAttribute('aria-label', sw.name + ' ' + sw.hex);
        btn.title = sw.name;
        btn.addEventListener('click', () => {
          if (owns(body, token) && respond(system.color(part, sw.hex))) {
            picker.value = sw.hex;
            swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('is-active'));
            btn.classList.add('is-active');
            draw();
            G.render?.redraw?.();
          }
        });
        swatches.append(btn);
      });
      partRow.append(swatches);
      colors.append(partRow);
    }); body.append(colors);
    const form = el('form', 'exterior-name ui-row'), name = el('input', 'ui-input'); name.type = 'text'; name.value = G.state.house.name; name.maxLength = 8; name.dataset.uiFocus = 'exterior-name';
    const submit = el('button', 'ui-button ui-button-soft', '写上小屋名'); submit.type = 'submit'; form.append(G.ui.controls.label(name, '招牌名字 · 最多8个字'), submit);
    form.addEventListener('submit', event => { event.preventDefault(); if (owns(body, token) && respond(system.rename(name.value))) draw(); }); body.append(form);
    previewFrame = requestAnimationFrame(() => { if (token !== previewEpoch) return; previewFrame = null; draw(); }); return { title: '小屋外观', subtitle: '屋顶、窗和门，都换成喜欢的模样', content: body };
  }
  G.bus.on('state:replace', () => { releasePreview(true); selected = {}; });
  G.bus.on('panel:change', event => {
    if (!activeBody) return;
    const host = document.getElementById?.('panel');
    if (event?.open === false || !activeBody.isConnected || host && (host.classList.contains('hidden') || host.dataset.kind !== 'exterior')) releasePreview(true);
  });
  G.bus.on('exterior:changed', event => { if (event.styleId) selected = {}; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !activeBody?.isConnected || !activeDraw || previewFrame !== null) return;
    const token = previewEpoch; previewFrame = requestAnimationFrame(() => { if (token !== previewEpoch) return; previewFrame = null; activeDraw?.(); });
  });
  G.ui = G.ui || {}; G.ui.exterior = { panel };
})(window.Game);
