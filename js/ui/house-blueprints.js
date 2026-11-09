/* 房子成长书：选择真实整栋房型，先在主场景看看，确认后再搬家。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const view = G.runtime.houseBlueprintsView = { id: null, message: '' };
  let epoch = 0, activeRoot = null, confirmation = null, confirmationToken = 0, pending = false;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const costText = cost => [cost?.coin ? cost.coin + ' 糖果' : '', cost?.heart ? cost.heart + ' 爱心' : ''].filter(Boolean).join(' + ') || '免费';
  const itemCount = items => Object.values(items || {}).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  function visible() {
    const host = document.getElementById('panel');
    return !!activeRoot?.isConnected && (!host || !host.classList.contains('hidden') && host.dataset.kind === 'houseBlueprints');
  }
  const owns = scope => scope.epoch === epoch && scope.root === activeRoot && visible();
  const current = (token, id) => token === epoch && view.id === id && visible();
  function button(scope, text, action, cls = 'ui-button ui-button-soft', key) {
    const node = el('button', cls, text); node.type = 'button';
    if (key) node.dataset.uiFocus = key;
    node.addEventListener('click', () => { if (owns(scope)) action(node); }); return node;
  }
  function status(text) { const node = el('p', 'house-blueprints-status', text); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); return node; }
  function reopen() { ui.open('houseBlueprints'); }
  function bridge(name, ...args) {
    const action = G.buildingEditor?.[name];
    if (typeof action !== 'function') return { ok: false, message: '小屋还在准备，请稍后再试一次。' };
    try { return action(...args); }
    catch (_) { return { ok: false, message: '小屋还没有准备好，当前的房子和家具都保留着。请再试一次。' }; }
  }
  function stamp(id) {
    // 插画只用于挑房型；场景仍由可进入、可剖面的正式三维建筑呈现。
    const node = el('span', 'house-blueprints-stamp'); node.setAttribute('aria-hidden', 'true');
    const artId = { starter: 'house-starter', mushroom: 'house-mushroom', cloud: 'house-cloud', castle: 'house-candy-castle', star_castle: 'house-star-castle' }[id];
    const asset = artId && document.getElementById('art-' + artId);
    if (!asset?.href) { node.append(el('span', 'house-blueprints-image-fallback', '外观图正在准备')); return node; }
    const image = el('img'); image.src = asset.href; image.alt = ''; image.width = 480; image.height = 320; image.loading = 'lazy'; image.decoding = 'async';
    image.dataset.houseId = id;
    image.addEventListener('error', () => node.replaceChildren(el('span', 'house-blueprints-image-fallback', '外观图暂时没打开')));
    node.append(image); return node;
  }
  function choice(scope, plan) {
    const node = button(scope, '', () => { if (pending) return; view.id = plan.id; view.message = ''; reopen(); }, 'house-blueprints-choice' + (plan.id === view.id ? ' is-selected' : ''), 'house-blueprint-choice-' + plan.id);
    node.setAttribute('aria-pressed', String(plan.id === view.id));
    node.setAttribute('aria-label', '看看' + plan.name + '，小屋' + plan.unlockLv + '级可建，' + plan.roomCount + '间房，' + (plan.selected ? '当前房型' : costText(plan.cost)));
    const heading = el('span', 'house-blueprints-choice-head');
    heading.append(el('span', 'house-blueprints-level', 'Lv.' + plan.unlockLv), el('span', 'house-blueprints-choice-state', plan.selected ? '住在这里' : plan.locked ? '可以先看看' : '可以建造'));
    node.append(heading, stamp(plan.id), el('strong', '', plan.name), el('span', 'house-blueprints-choice-meta', plan.floorCount + '层 · ' + plan.roomCount + '间房'), el('span', 'house-blueprints-choice-cost', plan.selected ? '现在的小屋' : costText(plan.cost) + (plan.owned && !plan.cost?.coin && !plan.cost?.heart ? ' · 已有套件' : '')));
    node.disabled = pending; return node;
  }
  function moveNote(plan) {
    const furniture = itemCount(plan.returnedInventory), friends = plan.roomAssignments?.length || 0, paintings = plan.removedPaintings?.length || 0;
    const pieces = [furniture ? furniture + '件已摆家具会收回背包' : '背包里的家具会继续保留', paintings ? paintings + '幅挂画仍收在画册' : '画作仍在画册', friends ? friends + '位朋友一起搬来，好感和礼物保留' : '以后还可以邀请朋友入住'];
    return pieces.join('；') + '。';
  }
  async function askBuild(scope, plan) {
    if (!owns(scope) || pending) return;
    const fresh = G.sys.houseBlueprints.preview(plan.id);
    if (!fresh.ok || fresh.quote !== plan.quote || !fresh.canApply) { view.message = fresh.reason || fresh.message || '小屋刚刚有了变化，请重新看看再确认。'; ui.toast(view.message); reopen(); return; }
    pending = true; const token = ++confirmationToken, era = epoch, id = plan.id;
    const question = '要建造「' + plan.name + '」吗？本次费用：' + costText(plan.cost) + '。原来的房屋布局会换成这个房型。' + moveNote(plan) + '建好后，家具和装饰由你自己来搭配。';
    const answer = ui.confirm(question, { title: '准备搬进' + plan.name + '？', accept: '建好这座房子', cancel: '再看看房型' });
    confirmation = ui.view?.modal || null;
    reopen();
    const accepted = await answer;
    if (token !== confirmationToken) return;
    confirmation = null; pending = false;
    if (!current(era, id)) return;
    if (!accepted) { reopen(); return; }
    pending = true;
    let result;
    try { result = await bridge('buildHouse', id, plan.quote); }
    catch (_) { result = { ok: false, message: '小屋还没有搬好，原来的房子和家具都保留着。请再试一次。' }; }
    if (token !== confirmationToken || era !== epoch) return;
    pending = false;
    view.message = result?.message || '小屋已经收好。'; ui.toast(view.message);
    if (result?.ok) {
      view.message = '';
      bridge('endHousePreview'); G.audio?.play?.('success'); bridge('openFurniture');
    } else if (visible()) reopen();
  }
  function panel() {
    const body = el('div', 'house-blueprints'); activeRoot = body;
    const scope = { root: body, epoch };
    if (!G.sys.houseBlueprints?.list) { body.append(status('房型成长书正在准备，请稍后再来看看。')); return { title: '房子成长书', subtitle: '选房型，一键建好；家具由你来搭配', content: body }; }
    const all = G.sys.houseBlueprints.list().filter(plan => plan?.ok);
    if (!all.length) { body.append(status('房型暂时还没有准备好，当前的小屋和布置都保留着。')); return { title: '房子成长书', subtitle: '选房型，一键建好；家具由你来搭配', content: body }; }
    const chosen = all.find(plan => plan.id === view.id) || all.find(plan => plan.selected) || all[0]; view.id = chosen.id;
    const intro = el('div', 'house-blueprints-intro'); intro.append(el('p', '', '选好整栋房子，再把喜欢的家具摆进去。'), el('span', 'house-blueprints-player-level', '我的小屋 ' + (G.state?.level || 1) + ' 级')); body.append(intro);
    const selected = el('section', 'house-blueprints-selected'); selected.setAttribute('aria-label', '选中的房型');
    const heading = el('div', 'house-blueprints-selected-heading'); heading.append(el('h3', '', chosen.name), el('span', 'house-blueprints-level', 'Lv.' + chosen.unlockLv));
    selected.append(heading, el('p', 'house-blueprints-description', chosen.description), el('p', 'house-blueprints-room-note', chosen.floorCount + '层 · ' + chosen.roomCount + '间房 · 最多住' + chosen.capacity + '位朋友'), el('p', 'house-blueprints-preview-note' + (chosen.selected ? '' : ' is-previewing'), chosen.selected ? '这就是现在的小屋，家具和装饰都还在。' : '正在看房型 · 还没建造'));
    const bill = el('p', 'house-blueprints-bill', chosen.selected ? '已经住在这座小屋里啦' : '本次建造 · ' + costText(chosen.cost)); selected.append(bill, status(view.message || chosen.reason)); body.append(selected);
    const actions = el('div', 'house-blueprints-actions');
    const primary = button(scope, pending ? '正在准备新家…' : chosen.selected ? '去摆家具和装饰' : chosen.locked ? '小屋' + chosen.unlockLv + '级可以建造' : '一键建好 · ' + costText(chosen.cost), () => {
      if (chosen.selected) { bridge('endHousePreview'); bridge('openFurniture'); } else askBuild(scope, chosen);
    }, 'ui-button ui-button-primary', 'house-blueprint-build'); primary.disabled = pending || !chosen.selected && !chosen.canApply;
    const back = button(scope, '回到现在的小屋', () => { bridge('endHousePreview'); ui.panel.close(); }, 'ui-button ui-button-soft', 'house-blueprint-return'); back.disabled = pending;
    actions.append(primary, back); body.append(actions);
    const outdoors = el('div', 'house-blueprints-actions'); outdoors.setAttribute('aria-label', '小屋外的生活');
    const yard = button(scope, '布置我的院子', () => { bridge('endHousePreview'); const result = bridge('openYard'); if (result?.ok === false) ui.toast(result.message); }, 'ui-button ui-button-soft', 'house-blueprint-yard');
    const garden = button(scope, '照顾花园', () => { bridge('endHousePreview'); ui.open('garden'); }, 'ui-button ui-button-soft', 'house-blueprint-garden');
    yard.disabled = garden.disabled = pending; outdoors.append(yard, garden); body.append(outdoors);
    const book = el('section', 'house-blueprints-book'); book.setAttribute('aria-label', '五种成长房型');
    book.append(el('h3', '', '挑一座想住的小屋'));
    const choices = el('div', 'house-blueprints-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '选择房型'); all.forEach(plan => choices.append(choice(scope, plan))); book.append(choices); body.append(book);
    const care = el('div', 'house-blueprints-care'); care.append(el('strong', '', '搬家小提醒'), el('p', '', moveNote(chosen)), el('p', '', '已经收好的套件不会重复收费。')); body.append(care);
    const advanced = el('details', 'house-blueprints-advanced'); advanced.append(el('summary', '', '高级玩法：自己设计房子'), el('p', '', '也可以自己画墙、放门窗，再搭出独一无二的小屋。'), button(scope, '自己画房子', () => { bridge('endHousePreview'); bridge('openAdvanced'); }, 'ui-button ui-button-soft', 'house-blueprint-advanced')); body.append(advanced);
    if (!pending) queueMicrotask(async () => {
      if (!owns(scope)) return;
      let result;
      try { result = await (chosen.selected ? bridge('endHousePreview') : bridge('previewHouse', chosen.id)); }
      catch (_) { result = { ok: false, message: '房型预览暂时没有准备好，当前的小屋还保留着。' }; }
      if (owns(scope) && result?.ok === false) {
        const note = body.querySelector('.house-blueprints-preview-note');
        if (note) note.textContent = result.message || '房型预览暂时没有准备好，当前的小屋还保留着。';
      }
    });
    return { title: '房子成长书', subtitle: '选房型，一键建好；家具由你来搭配', content: body };
  }
  function close() {
    const handle = confirmation; confirmation = null; confirmationToken++; pending = false; activeRoot = null;
    if (handle?.close) handle.close();
    bridge('endHousePreview');
  }
  G.bus.on('state:replace', () => { epoch++; close(); view.id = null; view.message = ''; });
  G.bus.on('panel:change', event => { if (activeRoot && (event?.open === false || !visible())) close(); });
  ui.houseBlueprints = { panel, open() { ui.open('houseBlueprints'); }, close };
})(window.Game);
