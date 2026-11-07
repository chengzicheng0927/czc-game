/* 独立花园纸页：真实地块编号与3D园区共用；计时只更新读数，保留数量与焦点。 */
(function (G) {
  'use strict';
  G.ui = G.ui || {};
  G.runtime = G.runtime || {};
  let currentTab = 'plots', activeRoot = null, timer = null, activeSeed = null, epoch = 0;
  G.runtime.gardenVisual = G.runtime.gardenVisual || { selectedPlot: 0 };
  const view = () => G.runtime.gardenVisual;
  function selectPlot(index) {
    if (view().selectedPlot !== index) view().seedChoice = null;
    view().selectedPlot = index;
    G.render?.redraw?.();
  }
  // 同一空地重挂面板时保留选种；只保存在运行态，不写入小屋存档。
  function seedChoice(index) {
    const current = view().seedChoice;
    if (current && current.index === index && cropDef(current.cropId)) return current;
    const crop = crops().find(item => stock('seeds', item.id) > 0 && (!item.nightOnly || sys().isNight())) || crops()[0];
    return (view().seedChoice = { index, cropId: crop.id });
  }
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, cls = 'ui-button') => { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  const sys = () => G.sys.garden;
  const crops = () => G.data.crops;
  const cropDef = id => G.data.cropById[id];
  const stock = (group, id) => G.state.garden[group][id] || 0;
  function timeText(ms) { const seconds = Math.ceil(Math.max(0, ms) / 1000); return seconds >= 60 ? Math.floor(seconds / 60) + '分' + String(seconds % 60).padStart(2, '0') + '秒' : seconds + '秒'; }
  function action(run) {
    let result;
    try { result = typeof run === 'function' ? run() : run; }
    catch (error) { result = { ok: false, message: error.message || '这次操作还没收好，请重试或先导出JSON备份。' }; }
    G.ui.toast(result.message);
    if (result.ok) G.ui.refresh(); else (G.ui.audio || G.audio)?.play('error');
    return result.ok;
  }
  const live = root => root === activeRoot && root.isConnected;
  const stamp = at => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function go(tab) { currentTab = tab; G.ui.open('garden'); }
  function iconArt(cropId, stage, className = 'garden-crop-art') {
    const canvas = el('canvas', className); canvas.width = 160; canvas.height = 140;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', cropDef(cropId).name + ' · ' + G.data.gardenConfig.stageNames[stage]);
    drawCrop(canvas.getContext('2d'), cropId, stage, 80, 116, 125); return canvas;
  }
  function circle(ctx, x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
  function ellipse(ctx, x, y, rx, ry, angle, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill(); }
  function star(ctx, x, y, outer, inner, color) { ctx.fillStyle = color; ctx.beginPath(); for (let point = 0; point < 10; point++) { const angle = -Math.PI / 2 + point * Math.PI / 5, radius = point % 2 ? inner : outer; const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius; if (!point) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); }
  // 所有作物共享柔软枝叶，花/果实按形状区分，四阶段都由 Canvas 画出。
  function drawCrop(ctx, cropId, stage, x, y, size = 80) {
    const crop = cropDef(cropId); if (!crop) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ellipse(ctx, 0, 8, 29, 6, 0, '#8D6D6C19');
    if (stage === 0) { ellipse(ctx, 0, -2, 7, 10, -.3, '#CDA98B'); ctx.strokeStyle = '#F3DEC7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, -7); ctx.lineTo(2, 4); ctx.stroke(); }
    else {
      const top = stage === 1 ? -22 : crop.shape === 'tree' ? -59 : -47;
      ctx.strokeStyle = crop.shape === 'tree' ? '#BA9B83' : '#88B490'; ctx.lineWidth = crop.shape === 'tree' ? 6 : 4; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(4, -13, 0, top); ctx.stroke();
      ellipse(ctx, -9, stage === 1 ? -10 : -19, 12, 5, .55, '#9DCBA5'); ellipse(ctx, 10, stage === 1 ? -17 : -29, 12, 5, -.5, '#B5D6AD');
      if (stage === 2) { ellipse(ctx, 0, top, 9, 12, 0, crop.color); ellipse(ctx, -3, top + 7, 7, 4, .5, '#9DCBA5'); }
      else if (stage >= 3) {
        switch (crop.shape) {
          case 'flower': case 'rainbow': {
            const palette = crop.shape === 'rainbow' ? ['#EBA4B8', '#EFBC98', '#F2D991', '#B4D2AB', '#AFCEDD', '#B3B1DB', '#D3B5DC'] : Array(9).fill(crop.color);
            palette.forEach((color, i) => { const angle = i * Math.PI * 2 / palette.length; ellipse(ctx, Math.cos(angle) * 13, top + Math.sin(angle) * 13, 9, 6, angle, color); });
            circle(ctx, 0, top, crop.id === 'sunflower' ? 10 : 7, crop.accent); break;
          }
          case 'tulip': ctx.fillStyle = crop.color; ctx.beginPath(); ctx.moveTo(-17, top - 8); ctx.quadraticCurveTo(-17, top + 18, 0, top + 14); ctx.quadraticCurveTo(18, top + 18, 17, top - 8); ctx.lineTo(7, top - 2); ctx.lineTo(0, top - 11); ctx.lineTo(-7, top - 2); ctx.closePath(); ctx.fill(); break;
          case 'rose': [15, 11, 7].forEach((radius, i) => { circle(ctx, (i % 2 ? -2 : 1), top, radius, i % 2 ? crop.accent : crop.color); }); ctx.strokeStyle = '#BE758F'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, top, 5, .5, 5); ctx.stroke(); break;
          case 'berry': ctx.fillStyle = crop.color; ctx.beginPath(); ctx.moveTo(0, top + 21); ctx.bezierCurveTo(-34, top - 3, -15, top - 22, 0, top - 11); ctx.bezierCurveTo(15, top - 22, 34, top - 3, 0, top + 21); ctx.fill(); [-8, 1, 10].forEach((dx, i) => ellipse(ctx, dx, top + (i % 2 ? 9 : -1), 1.3, 2.2, .3, crop.accent)); ellipse(ctx, -7, top - 11, 9, 4, -.4, '#91BA8D'); ellipse(ctx, 7, top - 11, 9, 4, .4, '#91BA8D'); break;
          case 'carrot': ctx.fillStyle = crop.color; ctx.beginPath(); ctx.moveTo(-15, -35); ctx.quadraticCurveTo(2, -44, 15, -35); ctx.quadraticCurveTo(13, -18, -2, 4); ctx.quadraticCurveTo(-12, -13, -15, -35); ctx.fill(); ctx.strokeStyle = '#D98E63'; ctx.lineWidth = 2; [-27, -17].forEach((cy, i) => { ctx.beginPath(); ctx.moveTo(i ? -2 : -9, cy); ctx.lineTo(i ? 7 : -3, cy + 1); ctx.stroke(); }); break;
          case 'pumpkin': [-12, 12, 0].forEach((dx, i) => ellipse(ctx, dx, -13, i === 2 ? 12 : 15, 20, dx / 90, i === 2 ? crop.accent : crop.color)); ctx.strokeStyle = '#87A781'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -32); ctx.quadraticCurveTo(-3, -44, 4, -42); ctx.stroke(); break;
          case 'lavender': [-11, 0, 11].forEach((dx, i) => { ctx.strokeStyle = '#97B591'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(dx, top - (i % 2 ? 5 : 0)); ctx.stroke(); for (let j = 0; j < 4; j++) { ellipse(ctx, dx - 3, top + j * 6, 5, 3.8, .3, crop.color); ellipse(ctx, dx + 3, top + j * 6 + 2, 5, 3.8, -.3, crop.accent); } }); break;
          case 'blueberry': [[-11, -4], [10, -4], [0, 11]].forEach(([dx, dy]) => { circle(ctx, dx, top + dy, 11, crop.color); star(ctx, dx, top + dy - 2, 4, 2, '#7487B6'); circle(ctx, dx - 3, top + dy - 4, 2, '#DCE4F5'); }); break;
          case 'tree': [-16, 0, 17, -9, 10].forEach((dx, i) => { const cy = top + (i < 3 ? 0 : -14); circle(ctx, dx, cy, 17, i % 2 ? crop.accent : crop.color); circle(ctx, dx - 4, cy - 4, 3, '#FFF1F6'); }); break;
          case 'star': star(ctx, 0, top + 3, 23, 11, crop.color); star(ctx, -3, top - 1, 11, 5, crop.accent); break;
        }
        if (!['carrot', 'pumpkin', 'tree', 'lavender'].includes(crop.shape)) { circle(ctx, -3, top + 1, 1.5, '#806274'); circle(ctx, 4, top + 1, 1.5, '#806274'); }
      }
    }
    ctx.restore();
  }
  // Adapter 只负责材质；未加载时仍可用原绘制与全部正式操作。
  function plotArt(canvas, state, selected) {
    const signature = [state.crop, state.stage, state.needsWater, state.mature, selected, !!G.render.gardenVisual].join(':');
    if (canvas.dataset.signature === signature) return;
    canvas.dataset.signature = signature;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (G.render.gardenVisual?.drawPlot) G.render.gardenVisual.drawPlot(ctx, state, { width: canvas.width, height: canvas.height, selected, drawCrop });
    else {
      ellipse(ctx, 90, 108, 67, 14, 0, '#D1AE90'); ellipse(ctx, 90, 101, 67, 14, 0, '#E9CEB1');
      if (state.crop) drawCrop(ctx, state.crop, state.stage, 90, 98, 106);
      else { ctx.strokeStyle = '#917658'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(84, 97); ctx.lineTo(96, 97); ctx.moveTo(90, 91); ctx.lineTo(90, 103); ctx.stroke(); }
      if (state.needsWater) { ctx.fillStyle = '#76AFC7'; ctx.beginPath(); ctx.moveTo(146, 20); ctx.bezierCurveTo(126, 42, 136, 52, 146, 52); ctx.bezierCurveTo(158, 52, 167, 42, 146, 20); ctx.fill(); }
      if (state.mature) { star(ctx, 145, 30, 8, 3, '#D4A44F'); star(ctx, 32, 57, 6, 2, '#D4A44F'); }
    }
    canvas.setAttribute('aria-label', state.empty ? '空花圃' : cropDef(state.crop).name + ' · ' + state.stageName);
  }
  function refreshPlot(node, now) {
    const index = Number(node.dataset.gardenPlot), state = sys().status(index, now), selected = index === view().selectedPlot;
    const select = node.querySelector('.garden-v2-select'), title = node.querySelector('.garden-plot-heading'), detail = node.querySelector('.garden-plot-status'), water = node.querySelector('.garden-plot-water'), control = node.querySelector('.garden-plot-action');
    node.classList.toggle('is-selected', selected); node.classList.toggle('is-mature', state.mature); node.classList.toggle('is-empty', state.empty); node.classList.toggle('needs-water', state.needsWater);
    select.setAttribute('aria-pressed', String(selected));
    title.textContent = state.empty ? '待播种' : cropDef(state.crop).name;
    detail.textContent = state.empty ? '空地' : state.stageName;
    water.textContent = state.empty ? '选一粒种子' : state.mature ? '可收获 1 份' : state.needsWater ? '需要浇水' : '本阶段已浇水';
    select.setAttribute('aria-label', '第 ' + (index + 1) + ' 块花圃，' + title.textContent + '，' + detail.textContent + '，' + water.textContent + '，查看详情');
    control.textContent = state.empty ? '选种子' : state.mature ? '收获 1 份' : state.needsWater ? '浇水' : '本阶段已浇水';
    control.disabled = state.locked || (!state.empty && !state.mature && !state.needsWater);
    const progress = node.querySelector('.garden-progress'); progress.setAttribute('aria-valuenow', String(Math.round(state.progress * 100)));
    progress.querySelector('i').style.width = (state.progress * 100).toFixed(2) + '%';
    plotArt(node.querySelector('canvas'), state, selected);
  }
  function refreshDetail(root, now) {
    const detail = root.querySelector('.garden-v2-detail'); if (!detail) return;
    const index = view().selectedPlot, state = sys().status(index, now);
    const signature = [index, state.crop, state.stage, state.mature, state.needsWater].join(':');
    if (detail.dataset.signature !== signature) { buildDetail(root, detail, state); detail.dataset.signature = signature; }
    if (state.empty) { detail.updateSeed?.(); return; }
    detail.querySelector('.garden-v2-timing').textContent = state.mature ? '已经成熟，收获后这块花圃会空出来。' : '本阶段还剩 ' + timeText(state.stageRemainingMs) + ' · 距成熟 ' + timeText(state.remainingMs);
    detail.querySelector('.garden-v2-arrival').textContent = '预计成熟：' + stamp(state.matureAt);
  }
  function refresh() {
    const now = Date.now();
    if (activeRoot && live(activeRoot)) {
      activeRoot.querySelectorAll('[data-garden-plot]').forEach(node => refreshPlot(node, now));
      refreshDetail(activeRoot, now);
      refreshCounts(activeRoot, now);
    }
    if (activeSeed?.body.isConnected) activeSeed.update();
  }
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
      const panel = document.getElementById('panel'), inPanel = activeRoot?.isConnected && panel && !panel.classList.contains('hidden') && panel.dataset.kind === 'garden';
      if (!inPanel && !activeSeed?.body.isConnected) { clearInterval(timer); timer = null; return; }
      if (!document.hidden) refresh();
    }, 1000);
  }
  function seedControls(parent, index, valid, close) {
    const choice = seedChoice(index), scope = close ? 'dialog' : 'inline';
    const isCurrent = node => node.isConnected && valid() && view().seedChoice === choice && sys().status(index).empty;
    const preview = el('canvas', 'garden-seed-preview'); preview.width = 240; preview.height = 145; preview.setAttribute('role', 'img');
    const info = el('p', 'garden-v2-seed-info ui-small'), rule = el('p', 'garden-v2-night ui-small');
    const selector = el('div', 'garden-seed-selector'), picker = el('div', 'garden-seed-grid'), cards = [];
    picker.setAttribute('role', 'radiogroup'); picker.setAttribute('aria-label', '选一粒种子');
    crops().forEach((crop, position) => {
      const card = button('', () => { if (!isCurrent(card)) return; choice.cropId = crop.id; update(); }, 'garden-seed-card');
      card.dataset.cropId = crop.id; card.dataset.uiFocus = 'garden-seed-choice-' + scope + '-' + index + '-' + crop.id;
      card.setAttribute('role', 'radio');
      const art = iconArt(crop.id, 3, 'garden-seed-card-art'); art.setAttribute('aria-hidden', 'true');
      card.append(art, el('strong', '', crop.name), el('span', 'garden-seed-card-stock'), el('small', '', crop.seedPrice + ' 糖果 / 粒'));
      if (crop.nightOnly) card.append(el('small', 'garden-seed-card-night', '夜间播种'));
      card.addEventListener('keydown', event => {
        const directions = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -position, End: crops().length - position - 1 };
        if (!Object.prototype.hasOwnProperty.call(directions, event.key) || !isCurrent(card)) return;
        event.preventDefault(); const target = (position + directions[event.key] + cards.length) % cards.length;
        choice.cropId = crops()[target].id; update(); cards[target].focus();
      });
      cards.push(card); picker.append(card);
    });
    selector.append(el('p', 'garden-seed-label', '选一粒种子'), picker);
    const row = el('div', 'garden-v2-actions ui-row');
    const plant = button('种下种子', () => {
      if (!isCurrent(plant)) return;
      if (action(() => {
        const result = sys().plant(index, choice.cropId);
        if (result.ok && view().seedChoice === choice) view().seedChoice = null;
        return result;
      })) close?.();
    }, 'ui-button ui-button-primary');
    plant.dataset.uiFocus = 'garden-seed-plant-' + scope + '-' + index;
    const buy = button('买 1 粒', () => { if (!isCurrent(buy)) return; action(() => sys().buySeeds(choice.cropId, 1)); update(); }, 'ui-button ui-button-soft');
    buy.dataset.uiFocus = 'garden-seed-buy-' + scope + '-' + index;
    row.append(plant, buy); parent.append(selector, preview, info, rule, row);
    function update() {
      const chosen = choice.cropId, crop = cropDef(chosen), n = stock('seeds', chosen), blocked = crop.nightOnly && !sys().isNight();
      cards.forEach(card => {
        const id = card.dataset.cropId, definition = cropDef(id), count = stock('seeds', id), selected = id === chosen;
        card.classList.toggle('is-selected', selected); card.setAttribute('aria-checked', String(selected)); card.tabIndex = selected ? 0 : -1;
        card.querySelector('.garden-seed-card-stock').textContent = '持有 ' + count + ' 粒';
        card.setAttribute('aria-label', definition.name + '，持有 ' + count + ' 粒，种价 ' + definition.seedPrice + ' 糖果，基础 ' + definition.growMinutes + ' 分钟' + (definition.nightOnly ? '，当地20:00—次日06:00播种' : ''));
      });
      const ctx = preview.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, 240, 145); drawCrop(ctx, chosen, 3, 120, 125, 135); }
      preview.setAttribute('aria-label', '成熟的' + crop.name);
      info.textContent = '持有 ' + n + ' 粒 · 种价 ' + crop.seedPrice + ' 糖果/粒 · 基础 ' + crop.growMinutes + ' 分钟 · 收获单价 ' + crop.sellPrice + ' 糖果/份';
      rule.textContent = crop.nightOnly ? '按设备当地时间 20:00—次日06:00 播种；画面夜色不改变时段。' : sys().hasGreenhouse() ? '温室已建好：这次新播种时长为基础时长 ÷ 1.2。' : '每块成熟后收获 1 份，关掉网页也会继续长大。';
      plant.disabled = n <= 0 || blocked || !sys().status(index).empty;
      plant.textContent = blocked ? '等待当地夜晚' : n <= 0 ? '先买一粒种子' : '种下种子';
      buy.textContent = '买 1 粒 · ' + crop.seedPrice + ' 糖果';
      buy.disabled = G.state.wallet.coin < crop.seedPrice || n >= G.data.gardenConfig.maxStock;
    }
    update(); return update;
  }
  function seedDialog(index) {
    const state = sys().status(index); if (state.locked || !state.empty) { go('plots'); return; }
    const token = epoch, body = el('div', 'garden-v2-seed-dialog ui-stack'); let modal;
    const update = seedControls(body, index, () => token === epoch && body.isConnected, () => modal.close());
    modal = G.ui.modal({ title: '第 ' + (index + 1) + ' 块花圃 · 播种', content: body, onClose() { if (activeSeed?.body === body) activeSeed = null; refresh(); } });
    activeSeed = { body, update, modal }; startTimer();
  }
  function buildDetail(root, detail, state) {
    const focused = document.activeElement, focusKey = focused?.dataset.uiFocus;
    const restoreFocus = () => { if (focusKey) detail.querySelector('[data-ui-focus="' + focusKey + '"]')?.focus({ preventScroll: true }); };
    detail.replaceChildren(); detail.updateSeed = null;
    detail.append(el('h3', '', '第 ' + (state.index + 1) + ' 块花圃 · ' + (state.empty ? '空地' : cropDef(state.crop).name)));
    if (state.empty) {
      detail.append(el('p', 'ui-small ui-muted', '这里还留着一份小期待，选一粒真实拥有的种子吧。'));
      detail.updateSeed = seedControls(detail, state.index, () => live(root), null); restoreFocus(); return;
    }
    if (view().seedChoice?.index === state.index) view().seedChoice = null;
    const stages = el('ol', 'garden-v2-stages');
    G.data.gardenConfig.stageNames.forEach((name, i) => { const item = el('li', i === state.stage ? 'is-current' : i < state.stage ? 'is-done' : '', name); if (i === state.stage) item.setAttribute('aria-current', 'step'); stages.append(item); });
    detail.append(stages, el('p', 'garden-v2-timing'), el('p', 'garden-v2-arrival ui-small'));
    const planted = G.state.garden.plots[state.index];
    detail.append(el('p', 'garden-v2-planted ui-small', '播种于 ' + stamp(planted.plantedAt) + ' · 此株初始时长 ' + timeText(state.durationMs)));
    const note = state.mature ? '每块收获 1 份 · 经验 +' + G.data.gardenConfig.harvestExp + ' · 首次收获点亮收藏印记' : state.needsWater ? '每阶段可浇水一次，只缩短这一阶段当下剩余时间的 30%。' : '本阶段已经浇过水，进入下一阶段后可以再浇一次。';
    detail.append(el('p', 'garden-v2-water-note ui-small', note));
    const control = button(state.mature ? '收获这一份' : state.needsWater ? '浇一浇水' : '本阶段已浇水', () => { if (!live(root)) return; action(() => state.mature ? sys().harvest(state.index) : sys().water(state.index)); }, 'ui-button ui-button-primary');
    control.dataset.uiFocus = 'garden-detail-action-' + state.index;
    control.disabled = !state.mature && !state.needsWater; detail.append(control);
    if (state.mature) detail.append(button('看看收获篮', () => go('harvest'), 'ui-button ui-button-soft'));
    restoreFocus();
  }
  function refreshCounts(root, now) {
    const totals = root.querySelector('.garden-v2-counts');
    if (totals) {
      const plots = sys().plots(now), values = [sys().capacity(), plots.filter(plot => !plot.empty).length, plots.filter(plot => plot.mature).length];
      totals.querySelectorAll('strong').forEach((node, index) => { node.textContent = String(values[index]); });
    }
    const supplies = root.querySelector('.garden-page-stock');
    if (supplies) supplies.textContent = '种子袋 ' + crops().reduce((sum, crop) => sum + stock('seeds', crop.id), 0) + ' 粒 · 收获篮 ' + crops().reduce((sum, crop) => sum + stock('harvest', crop.id), 0) + ' 份';
  }
  function plotsView(root) {
    const totals = el('div', 'garden-v2-counts'); totals.setAttribute('aria-label', '花圃近况');
    ['已开放花圃', '已种地块', '可以收获'].forEach(label => { const item = el('span'); item.append(el('strong', '', '0'), el('small', '', label)); totals.append(item); });
    root.append(totals, el('p', 'garden-page-intro', '选一块花圃，照顾这一份小期待。'));
    const grid = el('div', 'garden-plots'); grid.setAttribute('aria-label', '我的花圃');
    sys().plots().forEach(state => {
      const node = el('section', 'garden-plot ui-card'); node.dataset.gardenPlot = String(state.index);
      const select = button('', () => { if (!live(root)) return; selectPlot(state.index); refresh(); }, 'garden-v2-select');
      select.dataset.uiFocus = 'garden-plot-select-' + state.index;
      const number = el('span', 'garden-v2-plot-number', String(state.index + 1)), canvas = el('canvas', 'garden-plot-visual'); canvas.width = 180; canvas.height = 130; canvas.setAttribute('aria-hidden', 'true');
      select.append(number, canvas, el('span', 'garden-plot-heading'), el('span', 'garden-plot-status'), el('span', 'garden-plot-water'));
      select.addEventListener('keydown', event => {
        const offsets = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3, Home: -state.index, End: sys().capacity() - state.index - 1 };
        if (!Object.prototype.hasOwnProperty.call(offsets, event.key)) return;
        event.preventDefault(); const target = Math.max(0, Math.min(sys().capacity() - 1, state.index + offsets[event.key])); selectPlot(target); refresh();
        root.querySelector('[data-garden-plot="' + target + '"] .garden-v2-select')?.focus();
      });
      const progress = el('div', 'garden-progress ui-progress'); progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', '第 ' + (state.index + 1) + ' 块花圃成熟进度'); progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100'); progress.append(el('i'));
      const control = button('', () => { if (!live(root)) return; selectPlot(state.index); const current = sys().status(state.index); if (current.empty) seedDialog(state.index); else action(() => current.mature ? sys().harvest(state.index) : sys().water(state.index)); }, 'garden-plot-action ui-button ui-button-soft');
      control.dataset.uiFocus = 'garden-plot-action-' + state.index;
      node.append(select, progress, control); grid.append(node);
    });
    const layout = el('div', 'garden-v2-layout'), detail = el('section', 'garden-v2-detail ui-stack'); detail.setAttribute('aria-label', '选中花圃详情'); detail.id = 'garden-selected-plot'; grid.querySelectorAll('.garden-v2-select').forEach(control => control.setAttribute('aria-controls', detail.id)); layout.append(grid, detail); root.append(layout);
    const supplies = el('div', 'garden-v2-supplies ui-row');
    supplies.append(button('种子铺 · ' + crops().length + ' 种', () => go('seeds'), 'ui-button ui-button-soft'), button('看看收获篮', () => go('harvest'), 'ui-button ui-button-soft')); root.append(supplies);
    root.append(el('p', 'garden-v2-greenhouse ui-notice', sys().hasGreenhouse() ? '温室守护 · 只使新播种时长按基础时长 ÷ 1.2；已播种花果保留原计时。' : 'Lv.' + G.data.gardenConfig.expandLv + ' 开放九块花圃；温室可让新播种的生长速度提高20%。'));
  }
  function quantity(max, onChange) {
    const input = el('input', 'garden-quantity ui-input'); input.type = 'number'; input.min = '1'; input.max = String(max); input.step = '1'; input.inputMode = 'numeric'; input.value = '1';
    input.addEventListener('input', () => onChange(Number(input.value))); return input;
  }
  function giftDialog(cropId) {
    const crop = cropDef(cropId), token = epoch, body = el('div', 'garden-v2-gift ui-stack');
    const friends = G.data.residents.filter(def => G.state.residents[def.id]?.movedIn); let modal;
    if (!friends.length) body.append(el('p', '', '先邀请一位居民入住，再分享亲手种的' + crop.name + '。'), button('去认识居民', () => { modal.close(); G.ui.open('residents'); }, 'ui-button ui-button-primary'));
    else {
      const today = G.utils.dateKey(), available = friends.find(def => G.state.residents[def.id].giftDate !== today); let chosen = (available || friends[0]).id;
      const picker = G.ui.controls.select(friends.map(def => ({ id: def.id, name: def.name + (G.state.residents[def.id].giftDate === today ? ' · 今天已收礼' : '') })), chosen, id => { if (friends.some(def => def.id === id)) chosen = id; });
      const info = el('p', 'ui-small', '送出 1 份' + crop.name + '。每位居民每天收一份礼物，送出后保留收藏印记。');
      const send = button('送出这一份', () => { if (token !== epoch || !body.isConnected) return; if (action(() => G.sys.residents.gift(chosen, cropId))) modal.close(); }, 'ui-button ui-button-primary');
      body.append(info, G.ui.controls.label(picker, '选一位居民'), send);
    }
    modal = G.ui.modal({ title: '分享' + crop.name, content: body });
  }
  function catalogView(root, harvest) {
    const entries = harvest ? crops().filter(crop => stock('harvest', crop.id) > 0) : crops();
    root.append(el('p', 'garden-v2-catalog-intro ui-small', harvest ? '出售、送给居民或加工；花果用完后，收藏图鉴仍保留发现印记。' : '12种真实花果 · 种子袋最多每种 ' + G.data.gardenConfig.maxStock + ' 粒'));
    if (harvest) root.append(button('查看花果收藏印记', () => { G.ui.collectionBook?.focus({ kind: 'crops' }); G.ui.open('collection'); }, 'ui-button ui-button-soft'));
    if (!entries.length) { root.append(el('p', 'garden-empty ui-empty', '收获篮还空着。先种一粒种子，成熟后每块收获一份。'), button('回花圃播种', () => go('plots'), 'ui-button ui-button-primary')); return; }
    const grid = el('div', 'garden-catalog ui-grid');
    entries.forEach(crop => {
      const node = el('article', 'garden-crop ui-card'); node.dataset.cropId = crop.id;
      const top = el('div', 'garden-crop-top ui-row'), copy = el('div', 'garden-crop-copy');
      copy.append(el('h3', '', crop.name), el('p', 'garden-stock ui-small', harvest ? '收获篮 ' + stock('harvest', crop.id) + ' 份' : '种子袋 ' + stock('seeds', crop.id) + ' 粒'), el('p', 'ui-small', harvest ? '出售单价 ' + crop.sellPrice + ' 糖果/份' : '种价 ' + crop.seedPrice + ' 糖果/粒 · 基础 ' + crop.growMinutes + ' 分钟'), el('p', 'ui-small ui-muted', harvest ? crop.description : '收获单价 ' + crop.sellPrice + ' 糖果/份'));
      top.append(iconArt(crop.id, 3), copy); node.append(top);
      if (crop.nightOnly && !harvest) node.append(el('p', 'garden-v2-night ui-small', '当地20:00—次日06:00可播种，白天也可买种子。'));
      let count = 1, pending = false; const token = epoch, row = el('div', 'garden-buy-row ui-row'), limit = harvest ? stock('harvest', crop.id) : 99;
      const picker = quantity(limit, value => { count = value; update(); }); picker.dataset.uiFocus = 'garden-count-' + (harvest ? 'harvest-' : 'seeds-') + crop.id;
      const control = button('', async () => {
        if (!live(root) || pending || !Number.isInteger(count) || count < 1 || count > limit) return;
        const amount = count;
        if (harvest) {
          pending = true; update();
          const accepted = await G.ui.confirm('出售 ' + amount + ' 份' + crop.name + '，收到 ' + amount * crop.sellPrice + ' 糖果。出售后保留收藏发现印记。', { title: '确认出售收获', accept: '出售这 ' + amount + ' 份' });
          pending = false;
          if (!accepted || token !== epoch || !live(root)) { update(); return; }
        }
        action(() => harvest ? sys().sell(crop.id, amount) : sys().buySeeds(crop.id, amount)); update();
      }, 'ui-button ' + (harvest ? 'ui-button-soft' : 'ui-button-primary'));
      control.dataset.uiFocus = 'garden-stock-action-' + (harvest ? 'harvest-' : 'seeds-') + crop.id;
      row.append(G.ui.controls.label(picker, harvest ? '出售数量' : '购买数量'), control); node.append(row);
      const validation = el('p', 'garden-v2-validation ui-small'); validation.setAttribute('role', 'status'); node.append(validation);
      if (harvest) { const actions = el('div', 'garden-v2-actions ui-row'); actions.append(button('送给居民', () => { if (live(root)) giftDialog(crop.id); }, 'ui-button ui-button-soft')); const recipe = (G.data.craftingRecipes || []).find(r => r.cropId === crop.id); if (recipe && G.ui.crafting) actions.append(G.ui.crafting.entry(recipe.id)); node.append(actions); }
      function update() {
        const valid = Number.isInteger(count) && count >= 1 && count <= limit, price = count * (harvest ? crop.sellPrice : crop.seedPrice);
        control.textContent = pending ? '等待出售确认' : harvest ? '出售 · ' + (valid ? price : '—') + ' 糖果' : '买种子 · ' + (valid ? price : '—') + ' 糖果';
        const full = !harvest && stock('seeds', crop.id) + count > G.data.gardenConfig.maxStock;
        control.disabled = pending || !valid || full || (harvest ? stock('harvest', crop.id) < count : G.state.wallet.coin < price);
        validation.textContent = !valid ? '请输入 1—' + limit + ' 的整数。' : full ? '种子袋快满了，先种下一些吧。' : !harvest && G.state.wallet.coin < price ? '还差 ' + (price - G.state.wallet.coin) + ' 糖果。' : '';
      }
      grid.append(node); update();
    }); root.append(grid);
  }
  G.ui.garden = {
    open() { go('plots'); }, openPlots() { go('plots'); }, openBasket() { go('harvest'); }, drawCrop, refresh,
    panel() {
      const root = el('div', 'garden-panel garden-v2 garden-page ui-stack'); root.dataset.tab = currentTab; activeRoot = root;
      if (G.state.level < G.data.gardenConfig.unlockLv) { root.append(el('div', 'garden-empty ui-empty', '花圃还在云朵里打盹。小屋升到 Lv.' + G.data.gardenConfig.unlockLv + '，就能开始种一份小期待。'), button('去看看任务', () => G.ui.open('quests'), 'ui-button ui-button-soft')); return { title: '云上花园', subtitle: '一粒种子，一份小期待', content: root }; }
      selectPlot(Math.max(0, Math.min(sys().capacity() - 1, Number.isInteger(view().selectedPlot) ? view().selectedPlot : 0)));
      const tabs = el('div', 'garden-tabs ui-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '花园小站');
      [{ id: 'plots', name: '我的花圃' }, ...(G.ui.crafting ? [{ id: 'craft', name: '花果加工' }] : []), { id: 'harvest', name: '收获篮' }, { id: 'seeds', name: '种子铺' }].forEach(tab => { const control = button(tab.name, () => tab.id === 'craft' ? G.ui.crafting.open() : go(tab.id), 'ui-tab' + (currentTab === tab.id ? ' is-active' : '')); control.dataset.uiFocus = 'garden-tab-' + tab.id; control.setAttribute('aria-pressed', String(currentTab === tab.id)); tabs.append(control); }); root.append(tabs);
      root.append(el('p', 'garden-page-stock ui-small'));
      if (currentTab === 'plots') plotsView(root); else catalogView(root, currentTab === 'harvest');
      const now = Date.now(); root.querySelectorAll('[data-garden-plot]').forEach(node => refreshPlot(node, now)); refreshDetail(root, now);
      refreshCounts(root, now);
      if (G.ui.harvestFeedback) { const utilities = el('div', 'garden-v2-utilities'); utilities.append(G.ui.harvestFeedback.entry()); root.append(utilities); }
      startTimer();
      return { title: '云上花园', subtitle: sys().capacity() + ' 块花圃 · ' + crops().length + ' 种花果 · 慢慢种出喜欢的四季', content: root };
    },
    openPlot(index) {
      const state = sys().status(index); if (state.locked) { go('plots'); return; }
      selectPlot(index);
      if (state.empty) seedDialog(index);
      else if (state.mature) action(() => sys().harvest(index));
      else if (state.needsWater) action(() => sys().water(index));
      else { go('plots'); requestAnimationFrame(() => document.querySelector('[data-garden-plot="' + index + '"] .garden-v2-select')?.focus()); }
    }
  };
  G.bus.on('state:replace', () => { epoch++; currentTab = 'plots'; view().selectedPlot = 0; view().seedChoice = null; activeRoot = null; activeSeed?.modal.close(); activeSeed = null; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})(window.Game);
