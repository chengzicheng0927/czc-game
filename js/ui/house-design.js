/* 小屋个性化按窄纸面板排布；预览使用真实小屋，试穿不写存档，确认后保存真实外观。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  let tab = 'styles', styleId = 'strawberry_cream', message = '';
  let activeRoot = null, previewFrame = null, previewEpoch = 0, archiveEpoch = 0;
  const previewJobs = [], previewCanvases = new Set();
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls = 'ui-button') => { const root = activeRoot, token = previewEpoch, node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', () => { if (owns(root, token)) fn(); }); return node; };
  const costText = cost => [cost.coin ? cost.coin + ' 糖果' : '', cost.heart ? cost.heart + ' 爱心' : ''].filter(Boolean).join(' + ') || '免费';
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

  }
  function schedulePreview() {
    if (previewFrame !== null || !previewJobs.length || document.hidden) return;
    const token = previewEpoch;
    previewFrame = requestAnimationFrame(async () => {
      if (token !== previewEpoch) return;
      previewFrame = null; if (!owns(activeRoot, token) || document.hidden) return;
      const job = previewJobs.shift();
      if (job?.canvas.isConnected) {
        try {
          const result = await G.render.previewExterior(job.canvas, G.utils.clone(job.exterior));
          if (owns(activeRoot, token) && job.canvas.isConnected && job.caption && result) job.caption.textContent = result.ok === false ? '预览暂不可用，仍可查看部件与费用' : '按当前实际建筑试穿 · 尚未换上';
        } catch (_) { if (owns(activeRoot, token) && job.caption?.isConnected) job.caption.textContent = '预览暂不可用，仍可查看部件与费用'; }
      }
      if (token === previewEpoch) schedulePreview();
    });
  }
  function open(next = 'styles') { if (next === 'layouts') { clearPreviews(true); activeRoot = null; ui.open('roomLayout'); return; } tab = next; message = ''; if (next === 'custom') { clearPreviews(true); activeRoot = null; } ui.open(next === 'custom' ? 'exterior' : 'houseDesign'); }
  function navigation(active) {
    const nav = el('div', 'ui-tabs house-design-tabs'); nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', '小屋个性化方式');
    [['styles', '整套灵感'], ['custom', '自由搭配'], ['layouts', '自由布局']].forEach(([id, name]) => {
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
    const stage = el('figure', 'house-style-stage'), info = el('div', 'house-style-info'), caption = el('figcaption', 'house-preview-caption', '按当前实际建筑试穿 · 尚未换上');
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
  function panel() {
    clearPreviews(false); const body = el('div', 'house-design-panel'); activeRoot = body; body.append(navigation(tab)); styles(body);
    return { title:'小屋个性化', subtitle:'挑一份灵感，再搭成自己的模样', content:body };
  }
  G.bus.on('state:replace', () => { archiveEpoch++; clearPreviews(true); activeRoot = null; tab = 'styles'; styleId = 'strawberry_cream'; message = ''; });
  G.bus.on('panel:change', event => {
    if (!activeRoot) return;
    const host = document.getElementById?.('panel');
    if (event?.open === false || !activeRoot.isConnected || host && (host.classList.contains('hidden') || host.dataset.kind !== 'houseDesign')) { clearPreviews(true); activeRoot = null; }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && activeRoot?.isConnected) schedulePreview(); });
  ui.houseDesign = { panel, open, navigation };
})(window.Game);
