/* 花果加工：真实配方、材料与报价分步核对；所有扣料和保存仍由系统完成。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, D = G.data;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const view = G.runtime.craftingUi = { selectedId: null, quantity: 1, confirmation: null, result: null, message: '' };
  let lastOptions = null, liveBody = null, ignoredOptions = null, submitting = false;
  const recipeFor = id => typeof id === 'string' && own(D.craftingRecipeById, id) ? D.craftingRecipeById[id] : null;
  function open(input) { ui.controls?.close(); ui.open('crafting', typeof input === 'string' ? { recipeId: input } : input || {}); }
  function entry(recipeId) { return button('🌷 收获加工册', () => open(recipeId), 'ui-button ui-button-soft'); }
  function hasOutput(itemId) { return (G.state.inventory[itemId] || 0) > 0; }
  function destinations(itemId, api, parent) {
    const definition = D.furnitureById[itemId], cake = !!definition.giftCrop;
    const place = button(definition.place === 'yard' ? '布置前院' : '摆进小屋', () => {
      if (!liveBody || !place.isConnected || !hasOutput(itemId)) return;
      if (api.place) api.place(itemId); else G.bus.emit('crafting:place_requested', { itemId });
    }, 'ui-button ui-button-soft');
    place.disabled = !hasOutput(itemId); parent.append(place);
    if (cake) {
      const gift = button('送给朋友', () => {
        if (!liveBody || !gift.isConnected || !hasOutput(itemId)) return;
        if (api.gift) api.gift(itemId); else G.bus.emit('crafting:gift_requested', { itemId });
      }, 'ui-button ui-button-soft');
      gift.disabled = !hasOutput(itemId); parent.append(gift);
    }
  }
  function resetChoice() { view.confirmation = null; view.result = null; view.message = ''; }
  function panel(options = {}, api = {}) {
    const body = el('div', 'crafting-panel crafting-v2'); liveBody = body;
    if (lastOptions !== options) {
      lastOptions = options;
      if (options !== ignoredOptions && recipeFor(options.recipeId)) view.selectedId = options.recipeId;
      view.quantity = 1; resetChoice();
    }
    if (!recipeFor(view.selectedId)) view.selectedId = D.craftingRecipes[0]?.id || null;
    function paint(focusKey) {
      if (liveBody !== body) return;
      body.replaceChildren();
      const recipe = recipeFor(view.selectedId);
      if (!recipe) { body.append(el('p', 'ui-empty', '加工册还在准备，先去花园看看吧。'), button('去小花园', () => ui.open('garden'), 'ui-button ui-button-soft')); return; }
      const state = G.sys.crafting.status(recipe.id, view.quantity), definition = D.furnitureById[recipe.itemId], crop = D.cropById[recipe.cropId];
      const materials = state.materials?.[0] || { need: recipe.cropCount * view.quantity, have: G.state.garden.harvest[recipe.cropId] || 0 };
      if (view.confirmation && view.confirmation.quote !== state.quote) { view.confirmation = null; view.message = '材料、等级或背包刚刚有变化，请重新核对后再制作。'; }
      body.dataset.phase = view.result ? 'result' : view.confirmation ? 'confirm' : 'ready';
      const tabs = el('div', 'crafting-v2-tabs ui-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '花园小站');
      [['我的花圃', () => ui.garden?.openPlots ? ui.garden.openPlots() : ui.open('garden')], ['花果加工', null], ['收获篮', () => ui.garden?.openBasket()]].forEach(([name, action]) => { const tab = button(name, action || (() => {}), 'ui-tab' + (!action ? ' is-active' : '')); tab.setAttribute('aria-pressed', String(!action)); tabs.append(tab); });
      body.append(tabs, el('p', 'crafting-v2-intro ui-small', '五份花果配方，把收获做成小屋里的喜欢。材料从自己的收获篮取出。'));
      const layout = el('div', 'crafting-v2-layout'), recipes = el('nav', 'crafting-v2-recipes ui-stack'), detail = el('div', 'crafting-v2-detail ui-stack');
      recipes.setAttribute('aria-label', '五份现有加工配方');
      const drawings = [];
      function chooseRecipe(id, focus) {
        if (!recipeFor(id) || liveBody !== body) return;
        view.selectedId = id; view.quantity = 1; resetChoice(); paint(focus);
      }
      D.craftingRecipes.forEach(value => {
        const check = G.sys.crafting.status(value.id, 1), ingredient = D.cropById[value.cropId];
        const row = button('', () => chooseRecipe(value.id, 'recipe-' + value.id), 'ui-button ui-button-soft crafting-v2-recipe' + (value.id === recipe.id ? ' is-selected' : '') + (!check.unlocked || !check.hasRoom ? ' is-locked' : ''));
        row.dataset.recipeId = value.id; row.dataset.uiFocus = 'crafting-recipe-' + value.id; row.setAttribute('aria-pressed', String(value.id === recipe.id));
        const thumbnail = el('canvas', 'crafting-v2-recipe-art'), copy = el('span', 'crafting-v2-recipe-copy'); thumbnail.width = 112; thumbnail.height = 88; thumbnail.setAttribute('aria-hidden', 'true');
        copy.append(el('strong', '', value.name), el('span', '', ingredient.name + ' × ' + value.cropCount), el('small', 'crafting-v2-recipe-condition', 'Lv.' + value.unlockLv + (value.requireRoom ? ' · 甜品工坊' : '') + (!check.unlocked ? ' · 未解锁' : !check.hasRoom ? ' · 未建造' : ' · 已开放')));
        const cue = el('span', 'crafting-v2-recipe-cue', value.id === recipe.id ? '正在看' : '看配方'); row.append(thumbnail, copy, cue); recipes.append(row); drawings.push({ canvas: thumbnail, itemId: value.itemId });
      });
      layout.append(recipes, detail); body.append(layout);
      detail.append(el('h3', 'crafting-v2-detail-title', '这一份心意 · ' + recipe.name));
      const controls = el('div', 'crafting-controls'), selection = ui.controls.select(D.craftingRecipes.map(value => ({ id: value.id, name: value.name + (G.state.level < value.unlockLv ? ' · Lv.' + value.unlockLv : '') })), recipe.id, value => chooseRecipe(value, 'recipe'));
      selection.dataset.uiFocus = 'crafting-recipe';
      const amount = ui.controls.select(Array.from({ length: D.craftingConfig.maxBatch }, (_, index) => ({ id: String(index + 1), name: (index + 1) + ' 份' })), String(view.quantity), value => {
        const count = Number(value); if (!Number.isInteger(count) || count < 1 || count > D.craftingConfig.maxBatch || liveBody !== body) return;
        view.quantity = count; resetChoice(); paint('quantity');
      });
      amount.dataset.uiFocus = 'crafting-quantity'; controls.append(ui.controls.label(selection, '想做什么'), ui.controls.label(amount, '制作 1—' + D.craftingConfig.maxBatch + ' 份'));
      const bench = el('section', 'crafting-bench'), preview = el('canvas', 'crafting-product-art'), copy = el('div', 'crafting-product-copy');
      preview.width = 240; preview.height = 190; preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', recipe.name + '的成品预览');
      copy.append(el('h3', '', recipe.name), el('p', 'crafting-description', recipe.description), el('p', 'crafting-output', '做成 ' + number(view.quantity) + ' 份 · 背包已有 ' + number(state.stock)));
      bench.append(preview, copy); detail.append(bench, controls); drawings.push({ canvas: preview, itemId: recipe.itemId });
      if (ui.furnitureRarity) ui.furnitureRarity.decorate(bench, definition, { preview });
      const materialLine = el('div', 'crafting-material' + (materials.have < materials.need ? ' is-short' : '')), inputArt = el('canvas', 'crafting-crop-art'), materialText = el('div');
      inputArt.width = 96; inputArt.height = 84; inputArt.setAttribute('aria-hidden', 'true');
      materialText.append(el('p', '', '用' + crop.name + ' ' + number(materials.need) + ' 份'), el('p', 'crafting-material-stock', '收获篮里有 ' + number(materials.have) + ' 份' + (materials.have < materials.need ? ' · 还差 ' + number(materials.need - materials.have) + ' 份' : ' · 材料够啦')));
      materialLine.append(inputArt, materialText); detail.append(materialLine);
      const requirements = el('div', 'crafting-v2-requirements');
      requirements.append(el('p', 'crafting-requirement' + (!state.unlocked ? ' is-locked' : ''), 'Lv.' + recipe.unlockLv + (state.unlocked ? ' · 等级已达到' : ' · 当前 Lv.' + G.state.level)));
      if (recipe.requireRoom) requirements.append(el('p', 'crafting-requirement' + (!state.hasRoom ? ' is-locked' : ''), '甜品工坊 · ' + (state.hasRoom ? '已建好' : '未建造')));
      detail.append(requirements);
      const actions = el('div', 'crafting-actions'), quote = state.quote, submittedId = recipe.id, submittedCount = view.quantity;
      const blockedLabel = !state.unlocked ? 'Lv' + recipe.unlockLv + '开放' : !state.hasRoom ? '先准备工坊' : materials.have < materials.need ? '材料还差一点' : state.stock + view.quantity > D.craftingConfig.maxStock ? '成品背包满啦' : '加工记录满啦';
      const make = button(view.result ? '这一份已收好' : view.confirmation ? '正在核对这一批' : state.canCraft ? '制作 ' + view.quantity + ' 份' : blockedLabel, () => {
        if (!make.isConnected || liveBody !== body || make.disabled || submitting) return;
        const current = G.sys.crafting.status(submittedId, submittedCount);
        if (current.quote !== quote || !current.canCraft) { view.message = current.quote !== quote ? '材料、等级或背包刚刚有变化，请重新核对后再制作。' : current.reason; paint('message'); return; }
        view.confirmation = { recipeId: submittedId, count: submittedCount, quote, need: materials.need, have: materials.have, stock: state.stock };
        view.message = ''; paint('confirm');
      }, 'ui-button ui-button-primary');
      make.disabled = !!view.result || !!view.confirmation || !state.canCraft; make.dataset.uiFocus = 'crafting-make'; actions.append(make);
      let recovery;
      if (!state.unlocked) recovery = button('看看解锁条件', () => recipe.requireRoom ? ui.open('build', { roomType: 'workshop' }) : definition.place === 'yard' ? ui.open('yard') : ui.open('quests'), 'ui-button ui-button-soft');
      else if (recipe.requireRoom && !state.hasRoom) recovery = button('去建甜品工坊', () => api.build ? api.build() : ui.open('build', { roomType: 'workshop' }), 'ui-button ui-button-soft');
      else if (materials.have < materials.need) recovery = button('去花园收获', () => ui.open('garden'), 'ui-button ui-button-soft');
      if (recovery && !view.result) actions.append(recovery); detail.append(actions);
      if (view.confirmation) {
        const pending = view.confirmation, confirmation = el('section', 'crafting-v2-confirm ui-stack'); confirmation.setAttribute('aria-label', '加工报价确认');
        confirmation.append(el('h3', '', '确认这一批心意'), el('p', 'crafting-v2-quote', '用' + crop.name + ' ' + number(pending.need) + ' 份，制作「' + recipe.name + '」× ' + pending.count + '。'), el('p', 'ui-small', '收获篮：' + number(pending.have) + ' → ' + number(pending.have - pending.need) + ' 份 · 成品背包：' + number(pending.stock) + ' → ' + number(pending.stock + pending.count) + ' 份'), el('p', 'ui-small ui-muted', '不需要额外糖果。确认后保存，离开或返回修改都不会用掉材料。'));
        const confirmActions = el('div', 'crafting-actions'), accept = button('确认制作 ' + pending.count + ' 份', () => {
          if (!accept.isConnected || liveBody !== body || submitting || view.confirmation !== pending || accept.disabled) return;
          submitting = true; accept.disabled = true; view.confirmation = null;
          let response;
          try { response = G.sys.crafting.craft(pending.recipeId, pending.count, pending.quote); }
          catch (_) { response = { ok: false, message: '这份心意暂时没能保存，请先下载JSON备份，再重新核对制作。' }; }
          finally { submitting = false; }
          if (response.ok) { view.result = response; view.message = ''; G.audio?.play('success'); ui.toast(response.message); paint('result'); }
          else { view.result = null; view.message = response.message || '这次没有做成，材料仍好好留着。'; paint('message'); }
        }, 'ui-button ui-button-primary');
        accept.dataset.uiFocus = 'crafting-confirm';
        confirmActions.append(accept, button('返回修改', () => { if (liveBody !== body || submitting) return; view.confirmation = null; view.message = ''; paint('make'); }, 'ui-button ui-button-soft')); confirmation.append(confirmActions); detail.append(confirmation);
      }
      const status = el('p', 'crafting-status' + (view.message ? ' is-error' : ''), view.message || (view.result ? view.result.message : view.confirmation ? '核对好数量，再确认制作。' : state.canCraft ? '先看报价，确认后才会用掉材料。' : state.reason || '材料还在慢慢准备。'));
      status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1; status.dataset.uiFocus = 'crafting-status'; detail.append(status);
      if (view.result) {
        const finished = el('section', 'crafting-finished'); finished.tabIndex = -1; finished.dataset.uiFocus = 'crafting-result'; finished.setAttribute('aria-label', '本次成品已经收好');
        finished.append(el('p', 'crafting-result-title', recipe.name + ' × ' + number(view.result.count) + ' 已放进背包'));
        const resultActions = el('div', 'crafting-result-actions'); destinations(view.result.itemId, api, resultActions);
        resultActions.append(button('继续制作', () => { resetChoice(); paint('make'); }, 'ui-button')); finished.append(resultActions); detail.append(finished);
      }
      const latest = G.sys.crafting.latest?.(), latestRecipe = latest && recipeFor(latest.recipeId);
      if (!view.result && latestRecipe) {
        const recent = el('div', 'crafting-recent'); recent.append(el('p', 'ui-small ui-muted', '最近收好：' + D.furnitureById[latestRecipe.itemId].name + ' × ' + number(latest.count)));
        const recentActions = el('div', 'crafting-result-actions'); destinations(latestRecipe.itemId, api, recentActions); recent.append(recentActions); detail.append(recent);
      }
      const history = el('details', 'crafting-v2-history'), records = G.state.crafting?.counts || {}, total = D.craftingRecipes.reduce((sum, value) => sum + (records[value.id] || 0), 0);
      history.append(el('summary', '', '制作记录 · 累计 ' + number(total) + ' 份'));
      if (!total) history.append(el('p', 'ui-small ui-muted', '做好的心意会记在这里，摆放或送出后仍保留记录。'));
      else D.craftingRecipes.forEach(value => { if (records[value.id]) history.append(el('p', 'ui-small', value.name + ' × ' + number(records[value.id]))); });
      detail.append(history, el('p', 'crafting-footnote', recipe.requireRoom ? '双层蛋糕可以摆在桌面，也可以送给朋友。工坊制作不增加蛋糕屋订单。' : '成品放进家具背包。收获慢慢种，心意慢慢做。'));
      requestAnimationFrame(() => {
        drawings.forEach(drawing => { if (drawing.canvas.isConnected) G.render.drawThumbnail(drawing.canvas, drawing.itemId); });
        if (inputArt.isConnected && ui.garden?.drawCrop) { const ctx = inputArt.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, 96, 84); ui.garden.drawCrop(ctx, crop.id, 3, 48, 75, 76); } }
      });
      if (focusKey === 'recipe') selection.focus({ preventScroll: true });
      else if (focusKey?.startsWith('recipe-')) Array.from(recipes.querySelectorAll('button')).find(node => node.dataset.recipeId === focusKey.slice(7))?.focus({ preventScroll: true });
      else if (focusKey === 'quantity') amount.focus({ preventScroll: true });
      else if (focusKey === 'make') make.focus({ preventScroll: true });
      else if (focusKey === 'message') status.focus({ preventScroll: true });
      else if (focusKey === 'confirm') detail.querySelectorAll('button').forEach(node => { if (node.dataset.uiFocus === 'crafting-confirm') node.focus({ preventScroll: true }); });
      else if (focusKey === 'result') detail.querySelector('.crafting-finished')?.focus();
    }
    paint();
    return { title: '🌷 花果加工', subtitle: '把花园里的收获，做成小屋里的喜欢', content: body };
  }
  G.bus.on('state:replace', () => { ignoredOptions = lastOptions; lastOptions = null; view.selectedId = null; view.quantity = 1; resetChoice(); liveBody = null; });
  ui.crafting = { panel, open, entry };
})(window.Game);
