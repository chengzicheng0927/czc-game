/* 居民小册第二版：只呈现真实规则；选择、标签与失效令牌均为运行态。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const view = G.runtime.residentBookV2 = { filter: null, friend: null, tab: 'today' };
  const tabs = [['today', '今日陪伴'], ['roster', '居民名册'], ['friendship', '好朋友小册']];
  const wishNames = { furniture: '家具心愿', theme: '主题心愿', food: '点心心愿', flower: '花果心愿', activity: '活动心愿', outfit: '换装心愿' };
  const rewardNames = { dialogue: '一句只想与你分享的悄悄话', outfit: '朋友为你挑选的一件衣服', furniture: '一件属于这位朋友的专属家具', story: '一段留给好朋友的小故事', badge: '友情徽章与合照相框' };
  let epoch = 0, modal = null;
  const forwardedModals = new Set();
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const definition = id => G.data.residentById?.[id] || G.data.residents.find(item => item.id === id);
  const resident = id => G.state.residents[id];
  const atHome = id => !!resident(id)?.movedIn;
  const valid = scope => scope.epoch === epoch && scope.root.isConnected;
  const birthday = def => def.birthday.replace('-', '月') + '日';
  function symbol(kind) {
    const paths = {
      chat: '<path d="M4 4h16v11H10l-5 5v-5H4z"/><path d="M8 8h8M8 11h5"/>',
      heart: '<path d="M12 20 4.5 12.5C-1 6 7 1 12 7c5-6 13-1 7.5 5.5Z"/>',
      gift: '<path d="M4 10h16v10H4zM3 6h18v4H3zM12 6v14"/><path d="M12 6C4 7 5 0 9 3l3 3c8 1 7-6 3-3z"/>',
      book: '<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15"/>',
      shirt: '<path d="m8 3 4 2 4-2 6 6-4 4-2-2v10H8V11l-2 2-4-4z"/>',
      star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
      check: '<path d="m5 12 4 4L20 5"/>',
      home: '<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/>'
    };
    const node = el('span', 'rb-symbol'); node.setAttribute('aria-hidden', 'true');
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[kind] || paths.star) + '</svg>'; return node;
  }
  function portrait(id, small) {
    const canvas = el('canvas', small ? 'rb-portrait rb-portrait-small' : 'rb-portrait');
    canvas.dataset.resident = id; canvas.width = 90; canvas.height = 106;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', definition(id).name + ' · ' + definition(id).animal);
    return canvas;
  }
  function draw(root) {
    requestAnimationFrame(() => { if (root.isConnected) root.querySelectorAll('canvas').forEach(canvas => {
      try {
        if (canvas.dataset.resident) G.render.drawCharacter(canvas, canvas.dataset.resident);
        else if (canvas.dataset.item) G.render.drawThumbnail?.(canvas, canvas.dataset.item);
        else if (canvas.dataset.crop && ui.garden?.drawCrop) {
          const ctx = canvas.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); ui.garden.drawCrop(ctx, canvas.dataset.crop, 3, 56, 99, 100); }
        }
      } catch (_) { canvas.title = '插图暂不可用，朋友和心愿的文字仍可查看。'; }
    }); });
  }
  function progress(value, max, label) {
    const bar = el('progress', 'rb-progress'); bar.max = Math.max(1, Number(max) || 1); bar.value = Math.max(0, Math.min(Number(value) || 0, bar.max)); bar.setAttribute('aria-label', label); return bar;
  }
  function scopeFor(root, api) {
    const feedback = el('p', 'rb-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    return { root, api, feedback, epoch };
  }
  function delegate(scope, callback) {
    // 复用共享聊天/送礼/选房内容，仅收集这次同步创建的弹窗，换档时一并收起。
    const create = ui.modal;
    const capture = options => {
      let handle;
      handle = create(Object.assign({}, options, { onClose() { forwardedModals.delete(handle); if (options.onClose) options.onClose(); } }));
      forwardedModals.add(handle); return handle;
    };
    ui.modal = capture;
    try { return callback(); } finally { if (ui.modal === capture) ui.modal = create; }
  }
  function settleFocus(scope, key) {
    requestAnimationFrame(() => {
      if (scope.epoch !== epoch) return;
      const next = document.querySelector('[data-ui-focus="' + key + '"]');
      if (next?.disabled) document.querySelector('.resident-book-v2 .rb-detail')?.focus({ preventScroll: true });
    });
  }
  function action(scope, key, label, run, primary, report) {
    const node = el('button', 'ui-button rb-button' + (primary ? ' rb-primary' : ''), label); node.type = 'button'; node.dataset.uiFocus = 'resident-v2-' + key;
    let busy = false;
    node.addEventListener('click', () => {
      if (!valid(scope) || busy) return;
      node.focus({ preventScroll: true });
      busy = true;
      try {
        const result = run();
        if (report && result) {
          scope.feedback.textContent = result.message || (result.ok ? '这份心意已收好。' : '暂时还不能完成，请再看看条件。');
          scope.api.doAction(result);
          settleFocus(scope, node.dataset.uiFocus);
        }
      } catch (error) {
        scope.feedback.textContent = (error.message || '这次操作没能完成。') + ' 请稍后重试。';
        // 由现有反馈入口接住同步拒写；不推断成功、不补发奖励。
        try { scope.api.doAction({ ok: false, message: scope.feedback.textContent }); } catch (_) { /* 正文反馈仍可读取。 */ }
      } finally { busy = false; }
    });
    return node;
  }
  function refresh() { ui.refresh(); }
  function identity(id, api) {
    const def = definition(id), r = resident(id), home = atHome(id), block = el('header', 'rb-identity'), copy = el('div', 'rb-identity-copy');
    copy.append(el('h3', '', def.name), el('p', 'rb-meta', def.animal + ' · ' + def.personality + ' · ' + birthday(def) + '生日'));
    if (home) {
      const friendship = G.sys.residents.friendship(id);
      copy.append(el('p', 'rb-address', api.roomName(r.roomId)), el('p', 'rb-meta', '好朋友 ' + friendship.level + ' 级 · 好感 ' + r.affection + (friendship.bestFriendBadge ? ' · 最好的朋友' : '')));
      copy.append(progress(friendship.progress, friendship.max, def.name + '的好感进度'));
      copy.append(el('p', 'rb-meta', friendship.nextThreshold === null ? '五阶友谊已点亮' : '下一阶好感 ' + friendship.nextThreshold));
    } else copy.append(el('p', 'rb-address', 'Lv.' + def.unlockLv + ' 来拜访 · 等你准备小房间'));
    if (G.utils.dateKey().slice(5) === def.birthday) copy.append(el('p', 'rb-birthday', '今天是' + def.name + '的生日，普通送礼好感翻倍。'));
    block.append(portrait(id), copy); return block;
  }
  function admission(id, scope) {
    const def = definition(id), eligible = G.sys.residents.eligibility(id), block = el('section', 'rb-admission');
    block.append(el('h4', '', '为' + def.name + '留一个位置'), el('p', 'rb-copy', def.requirement), el('p', 'rb-meta', '每位朋友都需要合格卧室，每间最多住2位。'));
    if (eligible.missing.length) {
      const list = el('ul', 'rb-missing'); eligible.missing.forEach(item => list.append(el('li', '', item.text))); block.append(list);
    } else block.append(el('p', 'rb-ready', '已准备好 ' + eligible.roomIds.length + ' 间可选卧室，选一间欢迎朋友吧。'));
    const invite = action(scope, 'invite-' + id, eligible.ok ? '邀请' + def.name + '入住' : '先准备好小屋', () => {
      const current = G.sys.residents.eligibility(id);
      if (!current.ok || !current.roomIds.length) return current;
      delegate(scope, () => scope.api.invite(id));
    }, true, true);
    invite.disabled = !eligible.ok || !eligible.roomIds.length; block.append(invite); return block;
  }
  function wishBlock(id, scope) {
    const wish = G.sys.residents.wish(id), block = el('section', 'rb-wish'), type = wish.definition?.type;
    block.setAttribute('aria-label', definition(id).name + '的每日心愿');
    const heading = el('div', 'rb-section-head');
    const status = wish.locked ? '日期暂不可用' : wish.claimed ? '今日已收好' : wish.done ? '完成啦，待领取' : '还在慢慢实现';
    heading.append(el('h4', '', wishNames[type] || '今天的小心愿'), el('span', 'rb-state' + (!wish.locked && wish.done && !wish.claimed ? ' is-ready' : ''), status)); block.append(heading);
    block.append(el('p', 'rb-wish-copy', wish.text || '朋友还在准备新的心愿。'));
    if (wish.date) block.append(el('p', 'rb-meta', '心愿日期 ' + wish.date));
    if (wish.definition) {
      const def = wish.definition, crop = G.data.cropById?.[def.cropId], item = G.data.furnitureById?.[def.itemId], outfit = G.data.outfitById?.[def.outfitId];
      const request = el('div', 'rb-wish-request'), copy = el('div');
      if (crop || item) {
        const art = el('canvas', 'rb-request-art'); art.width = 112; art.height = 112; art.setAttribute('aria-hidden', 'true');
        if (crop) art.dataset.crop = crop.id; else art.dataset.item = item.id; request.append(art);
      } else request.append(symbol(type === 'outfit' ? 'shirt' : type === 'activity' ? 'star' : 'home'));
      copy.append(el('strong', '', (crop?.name || item?.name || outfit?.name || (type === 'theme' ? G.data.themes?.[def.theme]?.name : null) || wishNames[type] || '一份小小期待') + ' × ' + wish.target), el('small', '', (['food', 'flower'].includes(type) ? '已准备 ' : '已完成 ') + wish.progress + ' / ' + wish.target));
      request.append(copy); block.append(request);
    }
    if (wish.reward) {
      block.append(progress(wish.progress, wish.target, '每日心愿进度'), el('p', 'rb-meta', '进度 ' + wish.progress + ' / ' + wish.target));
      const rewards = el('ul', 'rb-rewards');
      [['糖果', wish.reward.coin], ['爱心', wish.reward.heart], ['好感', wish.reward.affection], ['经验', wish.reward.exp]].forEach(([name, value]) => rewards.append(el('li', '', name + ' +' + value)));
      block.append(rewards);
    }
    if (wish.missing?.length) { const missing = el('ul', 'rb-missing'); wish.missing.forEach(item => missing.append(el('li', '', item.text))); block.append(missing); }
    const consumed = ['food', 'flower'].includes(type);
    if (!wish.locked && !wish.claimed && consumed) block.append(el('p', 'rb-meta', wish.done ? '送出时消耗 ' + wish.target + ' 份库存，不占今天普通送礼次数。' : '库存还差 ' + Math.max(0, wish.target - wish.progress) + ' 份，准备好后再送出。'));
    if (!wish.locked && !wish.claimed && ['activity', 'outfit'].includes(type)) block.append(el('p', 'rb-meta', '收到这份心愿后，再完成一次指定动作。'));
    const actions = el('div', 'rb-wish-actions');
    const claim = action(scope, 'wish-' + id, wish.locked ? '日期解锁后再来' : wish.claimed ? '今天的心意已收好' : wish.done ? (consumed ? '送出并收下心意' : '收下心愿奖励') : '心愿还差一点点', () => G.sys.residents.claimWish(id), true, true);
    claim.disabled = !!wish.locked || !!wish.claimed || !wish.done; actions.append(claim);
    if (!wish.locked && !wish.claimed && !wish.done) {
      const labels = { furniture: wish.action?.panel === 'decor' ? '去摆放家具' : '去挑选家具', theme: '去添主题家具', food: '去做点心', flower: '去花园', activity: '去玩一局', outfit: '去换装' };
      actions.append(action(scope, 'wish-go-' + id, wish.action?.label || labels[type] || '去准备心愿', () => {
        const current = G.sys.residents.wish(id);
        if (!current.locked && !current.claimed) {
          if (current.action?.panel === 'avatar' && G.runtime.avatarUI) G.runtime.avatarUI.tab = 'clothes';
          scope.api.navigate(current, id);
        }
      }));
    }
    block.append(actions); return block;
  }
  function companionship(id, scope) {
    const r = resident(id), date = G.utils.dateKey(), pats = r.patDate === date ? r.patsToday : 0, block = el('section', 'rb-companionship');
    block.append(el('h4', '', '一起待一会儿'));
    const actions = el('div', 'rb-daily-actions');
    const chat = action(scope, 'chat-' + id, '聊聊天', () => delegate(scope, () => scope.api.chat(id))); chat.append(symbol('chat')); actions.append(chat);
    const pat = action(scope, 'pat-' + id, '摸摸头 · ' + pats + '/3', () => G.sys.residents.pat(id), false, true); pat.append(symbol('heart')); pat.disabled = pats >= 3; actions.append(pat);
    const gift = action(scope, 'gift-' + id, r.giftDate === date ? '今日礼物已送出' : '送一份礼物', () => delegate(scope, () => scope.api.gift(id))); gift.append(symbol('gift')); gift.disabled = r.giftDate === date; actions.append(gift); block.append(actions);
    const bubbles = el('div', 'rb-bubbles'), bubbleCopy = el('div');
    bubbleCopy.append(el('strong', '', '爱心泡泡'), el('small', '', r.heartBubbles + ' 泡 · 幸福 ' + Math.round(r.happiness)));
    const collect = action(scope, 'collect-' + id, '收爱心泡泡 · ' + r.heartBubbles, () => G.sys.residents.collect(id), false, true); collect.disabled = !r.heartBubbles;
    bubbles.append(symbol('heart'), bubbleCopy, collect); block.append(bubbles);
    block.append(el('p', 'rb-meta', '摸头每天3次，每次好感 +5。泡泡最多3个，每泡5–20爱心。'));
    block.append(el('p', 'rb-meta', r.interactDate === date ? '今天已经一起互动啦，仍可以继续聊天。' : '今天首次互动若选择聊天，好感 +2。'));
    block.append(el('p', 'rb-meta', '普通礼物每天1份，好感 +8，偏好礼物 +20；生日翻倍。'));
    return block;
  }
  function showStory(id, level, api) {
    const step = G.sys.residents.friendship(id).steps.find(item => item.level === level);
    if (!step?.claimed || !['dialogue', 'story'].includes(step.reward?.kind)) return;
    const body = el('div', 'friendship-v2 rb-story'), scope = scopeFor(body, api), reward = step.reward;
    const lines = (reward.lines || [reward.text]).filter(Boolean);
    body.append(portrait(id)); lines.forEach(line => body.append(el('p', 'rb-story-line', line)));
    body.append(action(scope, 'story-back-' + id, '回到好朋友小册', () => friendship(id, api), true), scope.feedback);
    openModal({ title: reward.title || definition(id).name + '的悄悄话', content: body, speechText: lines.join('。') }); draw(body);
  }
  function friendshipRows(id, scope, inModal) {
    const status = G.sys.residents.friendship(id), block = el('section', 'rb-friendship');
    block.append(el('h4', '', '每一份陪伴，都有回音'), el('p', 'rb-meta', '好感达到后，按顺序收下五份心意。已收好的悄悄话和故事可以重读。'));
    if (!status.ok) { block.append(el('p', 'rb-empty', '先邀请朋友入住，再慢慢写下你们的故事。')); return block; }
    const list = el('ol', 'rb-friendship-steps');
    status.steps.forEach(step => {
      const row = el('li', 'rb-friendship-step' + (step.claimed ? ' is-claimed' : step.available ? ' is-available' : ''));
      const copy = el('div', 'rb-step-copy'), readable = step.claimed && ['dialogue', 'story'].includes(step.reward?.kind);
      copy.append(el('h5', '', step.level + ' · ' + step.title), el('p', 'rb-meta', rewardNames[step.reward?.kind] || '一份朋友的心意'));
      copy.append(el('p', 'rb-step-state', '好感 ' + step.threshold + ' · ' + (step.claimed ? '已收好' : step.available ? '可以领取' : step.unlocked ? '先收前一份' : '继续陪伴就会解锁')));
      const claim = action(scope, 'friendship-' + id + '-' + step.level, readable ? '再读一遍' : step.claimed ? '已收好' : step.available ? '收下心意' : step.unlocked ? '先收前一份' : '还未解锁', () => {
        const current = G.sys.residents.friendship(id).steps.find(item => item.level === step.level);
        if (current?.claimed && ['dialogue', 'story'].includes(current.reward?.kind)) { showStory(id, step.level, scope.api); return; }
        const result = G.sys.residents.claimFriendship(id, step.level); scope.api.doAction(result);
        if (!result.ok) { scope.feedback.textContent = result.message; return; }
        if (['dialogue', 'story'].includes(current?.reward?.kind)) showStory(id, step.level, scope.api);
        else if (inModal) friendship(id, scope.api);
        else settleFocus(scope, 'resident-v2-friendship-' + id + '-' + step.level);
      }, step.available);
      claim.disabled = !readable && !step.available; claim.setAttribute('aria-label', definition(id).name + '第' + step.level + '份心意：' + claim.textContent);
      row.append(symbol(step.claimed ? 'check' : ['chat', 'shirt', 'gift', 'book', 'heart'][step.level - 1]), copy, claim); list.append(row);
    }); block.append(list); return block;
  }
  function openModal(options) {
    let handle; handle = ui.modal(Object.assign({}, options, { onClose() { if (modal === handle) modal = null; } })); modal = handle;
  }
  function friendship(id, api) {
    if (!definition(id)) return;
    const body = el('div', 'friendship-v2'), scope = scopeFor(body, api);
    body.append(identity(id, api), friendshipRows(id, scope, true), scope.feedback);
    openModal({ title: definition(id).name + '的好朋友小册', content: body }); draw(body);
  }
  function selection(scope, candidates, moved) {
    const aside = el('aside', 'rb-picker'), heading = el('div', 'rb-picker-head');
    heading.append(el('h3', '', '选一位朋友'), el('span', 'rb-meta', moved + '/' + G.data.residents.length + ' 已入住')); aside.append(heading);
    const filter = ui.controls.select([{ id: 'home', name: '住在这里 · ' + moved }, { id: 'visitors', name: '待邀请 · ' + (G.data.residents.length - moved) }, { id: 'all', name: '全部朋友 · ' + G.data.residents.length }], view.filter, id => { if (valid(scope)) { view.filter = id; view.friend = null; ui.open('residents'); } });
    filter.setAttribute('aria-label', '按入住状态查看朋友'); filter.dataset.uiFocus = 'resident-v2-filter'; aside.append(filter);
    if (candidates.length) {
      const picker = ui.controls.select(candidates.map(def => ({ id: def.id, name: def.name + ' · ' + def.animal })), view.friend, id => { if (valid(scope)) { view.friend = id; ui.open('residents'); } });
      picker.setAttribute('aria-label', '选择要陪伴的朋友'); picker.dataset.uiFocus = 'resident-v2-picker'; aside.append(picker);
      const list = el('div', 'rb-faces'); list.setAttribute('aria-label', '朋友头像名册');
      candidates.forEach(def => {
        const node = action(scope, 'choose-' + def.id, '', () => { view.friend = def.id; refresh(); }); node.className = 'rb-face' + (view.friend === def.id ? ' is-selected' : '');
        node.setAttribute('aria-label', '选择' + def.name + ' · ' + def.animal + (atHome(def.id) ? ' · 已入住' : ' · 待邀请')); node.setAttribute('aria-pressed', String(view.friend === def.id));
        node.append(portrait(def.id, true));
        if (view.tab === 'roster') {
          const copy = el('span', 'rb-face-copy');
          copy.append(el('strong', '', def.name + ' · ' + def.animal), el('small', '', 'Lv.' + def.unlockLv + ' · ' + birthday(def)), el('small', '', atHome(def.id) ? '住在这里' : '等待邀请')); node.append(copy);
        } else node.append(el('strong', '', def.name));
        list.append(node);
      }); aside.append(list);
    } else aside.append(el('p', 'rb-empty', view.filter === 'home' ? '还没有朋友入住。去「待邀请」看看，准备一间温暖卧室吧。' : '12位朋友都已入住，回到「住在这里」陪陪大家吧。'));
    return aside;
  }
  function tabBar(scope) {
    const bar = el('div', 'rb-tabs'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', '朋友小册内容');
    tabs.forEach(([id, name], index) => {
      const node = action(scope, 'tab-' + id, name, () => { view.tab = id; refresh(); });
      node.className = 'rb-tab'; node.id = 'resident-v2-tab-' + id; node.setAttribute('role', 'tab'); node.setAttribute('aria-selected', String(view.tab === id)); node.setAttribute('aria-controls', 'resident-v2-detail'); node.tabIndex = view.tab === id ? 0 : -1;
      node.addEventListener('keydown', event => {
        if (!valid(scope) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        const next = bar.children[target]; next.focus(); view.tab = tabs[target][0]; refresh();
      }); bar.append(node);
    }); return bar;
  }
  function panel(api) {
    const defs = G.data.residents, moved = defs.filter(def => atHome(def.id)).length;
    if (!view.filter) view.filter = moved ? 'home' : 'visitors';
    const candidates = defs.filter(def => view.filter === 'all' || (view.filter === 'home') === atHome(def.id));
    if (!candidates.some(def => def.id === view.friend)) view.friend = candidates[0]?.id || null;
    const body = el('div', 'resident-book-v2' + (view.tab === 'roster' ? ' is-roster' : '')), scope = scopeFor(body, api), layout = el('div', 'rb-layout');
    body.append(tabBar(scope));
    layout.append(selection(scope, candidates, moved));
    const main = el('div', 'rb-main');
    const detail = el('section', 'rb-detail'); detail.id = 'resident-v2-detail'; detail.setAttribute('role', 'tabpanel'); detail.setAttribute('aria-labelledby', 'resident-v2-tab-' + view.tab); detail.tabIndex = 0; detail.dataset.uiFocus = 'resident-v2-detail';
    if (view.friend) {
      const id = view.friend; detail.append(identity(id, api));
      if (!atHome(id)) detail.append(admission(id, scope));
      else if (view.tab === 'today') detail.append(wishBlock(id, scope), companionship(id, scope));
      else if (view.tab === 'friendship') detail.append(friendshipRows(id, scope, false));
      else {
        const def = definition(id); detail.append(el('p', 'rb-roster-intro', '“' + def.intro + '”'), el('p', 'rb-copy', '入住心愿：' + def.requirement), el('p', 'rb-meta', '幸福 ' + Math.round(resident(id).happiness) + ' · 生日 ' + birthday(def)));
        detail.append(action(scope, 'book-' + id, '打开' + def.name + '的好朋友小册', () => friendship(id, api), true));
        detail.append(el('p', 'rb-life-note', '白天，朋友会散步、读书、去其他房间做客；夜晚回卧室休息。喜欢的家具旁，还会冒出小爱心。'));
      }
    } else detail.append(el('p', 'rb-empty', view.filter === 'home' ? '先邀请一位朋友，再一起实现每日小心愿。' : '每位朋友都有自己的位置，今天也一起分享快乐。'));
    detail.append(scope.feedback); main.append(detail); layout.append(main); body.append(layout);
    const intro = el('div', 'rb-intro'); intro.append(el('p', '', '把小日子，过成好朋友的故事。'), action(scope, 'wardrobe', '我的换装间', () => ui.open('avatar'))); body.append(intro); draw(body);
    return { title: '小动物朋友', subtitle: moved + ' 位住在这里 · ' + defs.length + ' 位朋友的温暖小册', content: body };
  }
  G.bus.on('state:replace', () => {
    epoch++; view.filter = null; view.friend = null; view.tab = 'today';
    if (modal) modal.close(); modal = null;
    forwardedModals.forEach(handle => { handle.element.querySelectorAll('button').forEach(node => { node.disabled = true; }); handle.close(); }); forwardedModals.clear();
  });
  ui.residentBook = { panel, friendship, focus(id) { if (definition(id)) { view.filter = atHome(id) ? 'home' : 'visitors'; view.friend = id; view.tab = 'today'; } } };
})(window.Game);
