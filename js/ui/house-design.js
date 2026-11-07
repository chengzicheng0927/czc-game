/* 小屋个性化按窄纸面板排布；预览使用真实小屋，风格和布局仍各自确认保存。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  let tab = 'styles', styleId = 'strawberry_cream', templateId = 'together_rows', message = '';
  let activeRoot = null, previewFrame = null, previewEpoch = 0, archiveEpoch = 0;
  const previewJobs = [], previewCanvases = new Set();
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls = 'ui-button') => { const root = activeRoot, token = previewEpoch, node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', () => { if (owns(root, token)) fn(); }); return node; };
  const costText = cost => [cost.coin ? cost.coin + ' 糖果' : '', cost.heart ? cost.heart + ' 爱心' : ''].filter(Boolean).join(' + ') || '免费';
  const location = p => (p.floorIdx + 1) + '楼第' + (p.slotIdx + 1) + '格';
  const roomName = id => G.data.rooms.find(def => def.id === G.state.house.rooms[id]?.type)?.name || '房间';
  function visible(node, kind) {
    if (!node?.isConnected) return false;
    const host = document.getElementById?.('panel');
    return !host || !host.classList.contains('hidden') && host.dataset.kind === kind;
  }
  function owns(root, token) { return root === activeRoot && token === previewEpoch && visible(root, 'houseDesign'); }
  function clearPreviews(dispose) {
    previewEpoch++; previewJobs.length = 0;
    if (previewFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewFrame);
    previewFrame = null; previewCanvases.forEach(canvas => { canvas.width = canvas.height = 0; }); previewCanvases.clear();
    if (dispose) G.draw?.exterior?.disposePreview?.();
  }
  function schedulePreview() {
    if (previewFrame !== null || !previewJobs.length || document.hidden) return;
    const token = previewEpoch;
    previewFrame = requestAnimationFrame(() => {
      if (token !== previewEpoch) return;
      previewFrame = null; if (!owns(activeRoot, token) || document.hidden) return;
      const job = previewJobs.shift();
      if (job?.canvas.isConnected) {
        try {
          const result = G.draw.exterior.preview(job.canvas, job.exterior, G.state.house.name, job.options);
          if (job.caption && result) job.caption.textContent = result.mode === 'webgl' ? '按当前小屋的真实楼层和房间试穿 · 尚未换上' : result.mode === 'canvas-isometric' ? '当前楼层与房间的立体结构示意 · 尚未换上' : '预览暂不可用，仍可查看部件与费用';
        } catch (_) { if (job.caption) job.caption.textContent = '预览暂不可用，仍可查看部件与费用'; }
      }
      schedulePreview();
    });
  }
  function open(next = 'styles') { tab = next; message = ''; if (next === 'custom') { clearPreviews(true); activeRoot = null; } ui.open(next === 'custom' ? 'exterior' : 'houseDesign'); }
  function navigation(active) {
    const nav = el('div', 'ui-tabs house-design-tabs'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', '小屋个性化方式');
    [['styles', '整套灵感'], ['custom', '自由搭配'], ['layouts', '布局模板']].forEach(([id, name]) => {
      const era = archiveEpoch, item = el('button', 'ui-tab' + (id === active ? ' is-active' : ''), name); item.type = 'button';
      item.addEventListener('click', () => { if (era === archiveEpoch && visible(item, active === 'custom' ? 'exterior' : 'houseDesign')) open(id); }); item.setAttribute('aria-pressed', String(id === active)); nav.append(item);
    }); return nav;
  }
  function status(text) { const node = el('p', 'house-design-status', text); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); return node; }
  function previewCanvas(exterior, name, thumbnail = false, caption) {
    const canvas = el('canvas', 'house-style-canvas' + (thumbnail ? ' is-thumbnail' : '')); canvas.width = thumbnail ? 220 : 560; canvas.height = thumbnail ? 160 : 400; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', name + '外观预览');
    previewCanvases.add(canvas); previewJobs.push({ canvas, exterior, caption, options: { width: canvas.width, height: canvas.height } }); schedulePreview(); return canvas;
  }
  function styles(body) {
    const token = previewEpoch;
    const all = G.sys.houseStyles.list(), selected = all.find(style => style.id === styleId) || all[0]; styleId = selected.id;
    const stage = el('figure', 'house-style-stage'), info = el('div', 'house-style-info'), caption = el('figcaption', 'house-preview-caption', '按当前小屋的真实楼层和房间试穿 · 尚未换上');
    const picker = ui.controls.select(all.map(style => ({ id: style.id, name: style.name + (style.selected ? ' · 当前模样' : style.locked ? ' · Lv.' + style.unlockLv : ' · ' + costText(style.cost)) })), styleId, id => { if (!owns(body, token)) return; styleId = id; message = ''; ui.open('houseDesign'); });
    picker.dataset.uiFocus = 'house-style-picker';
    body.append(ui.controls.label(picker, '挑一套灵感 · 只试穿，还没有换上'), el('p', 'house-style-description', selected.description));
    const bill = el('p', 'house-style-bill', selected.selected ? '当前模样 · 可以继续自由搭配' : '本次合计：' + costText(selected.cost) + ' · 已有部件不再收费');
    const accept = button(selected.selected ? '已经换上啦' : selected.missing.length ? '收好部件并换上 · ' + costText(selected.cost) : '换上这套 · 免费', () => {
      accept.disabled = true; const result = G.sys.houseStyles.apply(selected.id, selected.quote); if (!owns(body, token)) return; message = result.message; ui.toast(message); if (result.ok) G.audio.play('success'); ui.open('houseDesign');
    }, 'ui-button ui-button-primary'); accept.disabled = !selected.canApply; accept.dataset.uiFocus = 'house-style-apply';
    const actions = el('div', 'house-design-actions'); actions.append(accept, button('单独搭配屋顶和颜色', () => open('custom'), 'ui-button ui-button-soft'));
    info.append(bill, actions, status(message || selected.reason));
    stage.append(previewCanvas(selected.exterior, selected.name, false, caption), caption); body.append(stage, info);
    const details = el('details', 'house-style-details'), summary = el('summary', '', '看看这套的部件与颜色'); details.append(summary);
    const parts = el('ul', 'house-style-parts'); selected.parts.forEach(part => parts.append(el('li', '', part.name + ' · ' + (part.owned ? '已拥有' : part.price + (part.currency === 'heart' ? ' 爱心' : ' 糖果')) + (part.locked ? ' · Lv.' + part.unlockLv : ''))));
    details.append(parts, el('p', 'ui-small', '屋顶 ' + selected.exterior.roofColor + ' · 外墙 ' + selected.exterior.wallColor)); body.append(details);
    const catalogue = el('div', 'house-style-catalogue'); catalogue.setAttribute('role', 'group'); catalogue.setAttribute('aria-label', '六套小屋灵感预览');
    all.forEach(style => {
      const choose = button('', () => { styleId = style.id; message = ''; ui.open('houseDesign'); }, 'house-style-choice' + (style.id === styleId ? ' is-selected' : '')); choose.setAttribute('aria-pressed', String(style.id === styleId)); choose.setAttribute('aria-label', '试穿' + style.name + (style.locked ? '，Lv.' + style.unlockLv + '开放' : '，' + costText(style.cost)));
      choose.append(previewCanvas(style.exterior, style.name, true), el('strong', '', style.name), el('span', '', style.selected ? '✓ 当前模样' : style.locked ? 'Lv.' + style.unlockLv + ' · 可试穿' : costText(style.cost))); catalogue.append(choose);
    }); body.append(catalogue, el('p', 'ui-small ui-muted', '灵感可以自由混搭。到「自由搭配」单独挑屋顶、墙、窗门和颜色，做成只属于你的小屋。'));
  }
  function map(floors, capacity, title) {
    const figure = el('figure', 'house-template-map'); figure.setAttribute('aria-label', title); figure.append(el('figcaption', '', title));
    for (let f = capacity.floors - 1; f >= 0; f--) {
      const row = el('div', 'house-template-row'); row.append(el('span', 'house-template-floor', (f + 1) + '楼'));
      for (let s = 0; s < capacity.slots; s++) { const id = floors[f]?.slots[s], cell = el('span', 'house-template-cell' + (id ? ' has-room' : ''), id ? roomName(id) : '空位'); cell.setAttribute('title', (f + 1) + '楼第' + (s + 1) + '格 · ' + (id ? roomName(id) : '空位')); row.append(cell); }
      figure.append(row);
    } return figure;
  }
  function layouts(body) {
    const token = previewEpoch;
    const definitions = G.sys.layoutTemplates.list(), def = definitions.find(item => item.id === templateId) || definitions[0], plan = G.sys.layoutTemplates.preview(def.id); templateId = def.id;
    const picker = ui.controls.select(definitions.map(item => ({id:item.id,name:item.name})), templateId, id => { if (!owns(body, token)) return; templateId = id; message = ''; ui.open('houseDesign'); }); picker.dataset.uiFocus = 'house-layout-picker';
    body.append(ui.controls.label(picker, '挑一份布局 · 确认后才搬家'), el('p', 'house-style-description', def.description));
    if (!plan.ok) { body.append(status(plan.message), button('去建一间房', () => ui.open('build'), 'ui-button ui-button-primary')); return; }
    const maps = el('div', 'house-template-comparison'); maps.append(map(plan.before, plan.capacity, '现在的小屋'), map(plan.floors, plan.capacity, '试看的布局')); body.append(maps);
    const accept = button(plan.unchanged ? '已经是这个排列' : '确认搬好 ' + plan.moves.length + ' 间房 · 免费', () => {
      accept.disabled = true; const result = G.sys.layoutTemplates.apply(plan.templateId, plan.signature); if (!owns(body, token)) return; message = result.message; ui.toast(message); if (result.ok) { G.audio.play('success'); G.render.camera.fit(); } ui.open('houseDesign');
    }, 'ui-button ui-button-primary'); accept.disabled = plan.unchanged; accept.dataset.uiFocus = 'house-layout-apply';
    const actions = el('div', 'house-design-actions'); actions.append(accept, button('自己换位置', () => ui.roomLayout.open(), 'ui-button ui-button-soft')); body.append(actions, status(message || plan.message));
    if (plan.moves.length) { const details = el('details', 'house-style-details'); details.append(el('summary', '', '看看每间房搬到哪里')); const list = el('ul', 'house-style-parts'); plan.moves.forEach(move => list.append(el('li', '', roomName(move.roomId) + '：' + location(move.from) + ' → ' + location(move.to)))); details.append(list); body.append(details); }
    body.append(el('p', 'ui-small ui-muted', '只排列现有房间，家具、装修和朋友一起保留，不建房也不拆房。按已经开放的位置排列；房间多了再试，会有新的模样。阁楼和前院保持原位。'));
  }
  function panel() {
    clearPreviews(false); const body = el('div', 'house-design-panel'); activeRoot = body; body.append(navigation(tab)); if (tab === 'layouts') layouts(body); else styles(body);
    return { title:'小屋个性化', subtitle:'挑一份灵感，再搭成自己的模样', content:body };
  }
  G.bus.on('state:replace', () => { archiveEpoch++; clearPreviews(true); activeRoot = null; tab = 'styles'; styleId = 'strawberry_cream'; templateId = 'together_rows'; message = ''; });
  G.bus.on('panel:change', event => {
    if (!activeRoot) return;
    const host = document.getElementById?.('panel');
    if (event?.open === false || !activeRoot.isConnected || host && (host.classList.contains('hidden') || host.dataset.kind !== 'houseDesign')) { clearPreviews(true); activeRoot = null; }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && activeRoot?.isConnected) schedulePreview(); });
  ui.houseDesign = { panel, open, navigation };
})(window.Game);
