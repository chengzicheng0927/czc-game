/* 任务小册沿用绘本小屋：三页签、当前心愿优先、七片彩虹串起章节。
   主线每章可回看，成就逐阶收礼，剧情与派对保留独立的阅读空间。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, view = { tab: 'main', chapter: null, category: null, milestoneId: null, expanded: {}, feedback: null, focusKey: null };
  let activeBook = null, archive = 0;
  const rainbow = [['red', '红', '#F4C3CC'], ['orange', '橙', '#F4D0AE'], ['yellow', '黄', '#F5E4AB'], ['green', '绿', '#CDE1BC'], ['cyan', '青', '#BFE2DF'], ['blue', '蓝', '#CBDCF0'], ['purple', '紫', '#DECEEF']];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const button = (text, action, cls) => { const n = el('button', cls || 'ui-button', text); n.type = 'button'; n.addEventListener('click', action); return n; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  function progress(value, target, label) { const n = el('progress', 'ui-progress'); n.max = Math.max(1, target || 1); n.value = Math.max(0, Math.min(value || 0, n.max)); n.setAttribute('aria-label', label); return n; }
  function drawPortrait(node, id) { if (id !== 'nuomi') requestAnimationFrame(() => { if (node.isConnected) G.render.drawCharacter(node, id); }); }
  function portrait(id) {
    if (id === 'nuomi' || !G.data.residents.some(d => d.id === id)) { const cloud = el('div', 'quest-story-cloud'); cloud.setAttribute('role', 'img'); cloud.setAttribute('aria-label', '糯米'); const face = el('span', 'guide-cloud'); face.append(el('i'), el('i'), el('b', '', '⌣')); cloud.append(face); return cloud; }
    const canvas = el('canvas', 'quest-story-portrait'); canvas.width = 96; canvas.height = 124; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', G.data.residents.find(d => d.id === id).name); drawPortrait(canvas, id); return canvas;
  }
  function story(chapterId, mode = 'opening') {
    const chapter = G.sys.quests.chapters().find(c => Number(c.id) === Number(chapterId));
    if (!chapter || !chapter.available) { ui.toast('先完成前面的心愿，再来翻开这一章吧。'); return; }
    const definition = (G.data.storyChapters || []).find(c => Number(c.id) === Number(chapterId)) || chapter;
    const lines = (mode === 'completion' ? definition.completionStory : chapter.story) || [], body = el('div', 'quest-story'), scene = el('div', 'quest-story-scene'), copy = el('div', 'quest-story-copy'), speaker = el('h3'), sentence = el('p', 'quest-story-line');
    const actions = el('div', 'quest-story-actions'), previous = button('上一句', () => show(index - 1), 'ui-button ui-button-soft'), listen = button('听一听', () => ui.speak(sentence.textContent, listen)), next = button('下一句', () => {
      if (index < lines.length - 1) { show(index + 1); return; }
      const result = G.sys.quests.markStorySeen(chapter.id); if (result && !result.ok) { ui.toast(result.message); return; } modal.close(); ui.refresh();
    }, 'ui-button ui-button-primary');
    listen.dataset.listenLabel = '听一听';
    const count = el('p', 'ui-small ui-muted'); count.setAttribute('aria-live', 'polite'); sentence.setAttribute('aria-live', 'polite');
    copy.append(speaker, sentence); body.append(scene, copy, count); actions.append(previous, listen, next); body.append(actions);
    let index = 0;
    function show(position) {
      G.audio.stopSpeech(); index = Math.max(0, Math.min(lines.length - 1, position)); const line = lines[index] || { speaker: 'nuomi', text: '每一份小小的心愿，都让这座小屋更温暖。' }, id = line.speaker || 'nuomi';
      const resident = G.data.residents.find(d => d.id === id); speaker.textContent = resident ? resident.name : '糯米'; sentence.textContent = line.text;
      scene.replaceChildren(portrait(id)); listen.textContent = '听一听'; listen.dataset.speechKey = 'main-story-' + chapter.id + '-' + index; listen.setAttribute('aria-pressed', 'false');
      previous.disabled = index === 0; next.textContent = index >= lines.length - 1 ? '把故事收好' : '下一句'; count.textContent = (index + 1) + ' / ' + Math.max(1, lines.length);
    }
    const modal = ui.modal({ title: '第' + chapter.id + '章 · ' + chapter.title + (mode === 'completion' ? ' · 回响' : ''), content: body }); show(0);
  }
  function burst(rect, reward) {
    if (!rect || window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const node = el('span', 'quest-reward-float', '+' + number(reward.coin) + ' 糖果'); node.setAttribute('aria-hidden', 'true'); node.style.left = (rect.left + rect.width / 2) + 'px'; node.style.top = rect.top + 'px'; document.body.append(node); setTimeout(() => node.remove(), 850);
  }
  function rewardText(reward) {
    reward = reward || {};
    const parts = ['糖果 ' + number(reward.coin)];
    if (reward.exp) parts.push('经验 ' + number(reward.exp));
    if (reward.heart) parts.push('爱心 ' + number(reward.heart));
    if (reward.outfitId) parts.push('服饰「' + (G.data.outfitById?.[reward.outfitId]?.name || '待确认服饰') + '」');
    return parts.join(' · ');
  }
  function keyed(node, key) { node.dataset.uiFocus = 'quest-v2-' + key; return node; }
  function alive(book) {
    const host = document.getElementById('panel');
    return activeBook === book && book.archive === archive && book.body.isConnected && (!host || !host.classList.contains('hidden') && host.dataset.kind === 'quests');
  }
  function bookButton(book, text, key, action, cls) {
    return keyed(button(text, event => { if (alive(book) && !book.pending) action(event); }, cls), key);
  }
  function refresh(book, key) {
    if (!alive(book)) return;
    view.focusKey = key || null; ui.open('quests');
  }
  function changePage(book, patch, key) {
    Object.assign(view, patch, { feedback: null, milestoneId: null }); refresh(book, key);
  }
  function focusAfterRender(book) {
    const key = view.focusKey;
    if (!key) return;
    // 公共面板首帧会聚焦标题；规则也可能在首帧再刷新一次。
    // 恢复意图直到最新面板真正完成定位，不在排队时提前消费。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!alive(book) || view.focusKey !== key || document.querySelector('.modal-backdrop')) return;
      const node = book.body.querySelector('[data-ui-focus="quest-v2-' + key + '"]') || book.body.querySelector('[data-ui-focus="quest-v2-tab-' + view.tab + '"]');
      if (!node || node.disabled) return;
      node.focus({ preventScroll: true }); view.focusKey = null;
      if (key.startsWith('chapter-') || key.startsWith('milestone-') || key.startsWith('achievement-') || key.startsWith('task-') || key === 'current' || key === 'chest') node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }));
  }
  function claimReward(book, node, perform, reward, key, after) {
    if (!alive(book) || book.pending) return;
    book.pending = true; node.disabled = true; node.setAttribute('aria-busy', 'true');
    const rect = node.getBoundingClientRect(); let result;
    try { result = perform(); }
    catch (_) { result = { ok: false, message: '这次没能确认领取结果。请核对当前进度后再试。' }; }
    if (!alive(book)) return;
    result = result && typeof result.ok === 'boolean' ? result : { ok: false, message: '领取结果暂时读不到，请核对进度后再试。' };
    view.feedback = { ok: result.ok, message: result.message || (result.ok ? '礼物收好啦！' : '这次还没领到，请再试一次。') };
    view.focusKey = key;
    book.api.doAction(result);
    // doAction通常已刷新；失败也重读权威状态，不能让旧按钮继续宣称可领。
    if (activeBook === book) { book.pending = false; refresh(book, key); }
    if (result.ok) { burst(rect, reward || {}); if (after) after(result); }
  }
  function stateLabel(q) { return q.claimed ? '已领取' : q.locked ? (q.type === 'daily' ? '日期锁定' : '尚未开启') : q.done ? '可以领取' : '进行中'; }
  function stamp(text, state) { return el('span', 'qb-state is-' + state, text); }
  function rainbowStrip() {
    const block = el('div', 'quest-rainbow'), owned = G.state.rainbowPieces || [], found = rainbow.filter(([id]) => owned.includes(id)).length;
    const title = el('p', 'quest-rainbow-label', found === 7 ? '七色彩虹回到天空啦' : '找回的彩虹 · ' + found + ' / 7'), list = el('ol', 'quest-rainbow-pieces');
    list.setAttribute('aria-label', '七色彩虹收集进度');
    rainbow.forEach(([id, name, color]) => { const has = owned.includes(id), piece = el('li', 'quest-rainbow-piece' + (has ? ' is-found' : '')); piece.append(el('span', 'quest-rainbow-swatch'), el('small', '', name)); piece.style.setProperty('--piece-color', color); piece.setAttribute('aria-label', name + '色碎片' + (has ? '已找回' : '未找回')); piece.title = name + '色碎片' + (has ? '已找回' : '未找回'); list.append(piece); });
    block.append(list, title); return block;
  }
  function questAction(q, api) {
    if (q.action?.panel === 'avatar' && G.runtime.avatarUI) G.runtime.avatarUI.tab = 'clothes';
    if (q.action && api.navigate) { api.navigate(q.action); return; }
    const metric = q.metric || '', panel = metric.includes('resident') || ['lily', 'pudding', 'orange', 'wishesDone', 'maxAffection'].includes(metric) ? 'residents' : metric.includes('harvest') || metric.includes('water') ? 'garden' : metric.includes('photo') ? 'photo' : metric.includes('outfit') ? 'avatar' : metric.includes('minigame') || metric.includes('bakery') ? 'play' : metric.includes('collection') || metric.includes('theme') ? 'shop' : 'build';
    if (panel === 'avatar' && G.runtime.avatarUI) G.runtime.avatarUI.tab = 'clothes';
    if (api.navigate) api.navigate({ panel }); else if (panel === 'photo') ui.photography.open(); else ui.open(panel);
  }
  function questRow(q, book, featured) {
    const item = keyed(el(featured && q.type === 'main' ? 'article' : 'li', 'quest-book-task' + (featured ? ' is-current' : '') + (q.claimed ? ' is-claimed' : '') + (q.locked ? ' is-locked' : '') + (q.done && !q.locked && !q.claimed ? ' is-ready' : '')), featured && q.type === 'main' ? 'current' : 'task-' + q.id);
    item.tabIndex = -1; item.dataset.questId = q.id;
    const copy = el('div', 'quest-task-copy'), heading = el('div', 'qb-task-heading'), title = el(featured ? 'h3' : 'h4', '', q.title);
    heading.append(title, stamp(stateLabel(q), q.claimed ? 'claimed' : q.locked ? 'locked' : q.done ? 'ready' : 'progress'));
    copy.append(heading);
    const composite = featured && q.conditions && q.conditions.length > 1;
    if (!composite) copy.append(el('p', 'ui-small ui-muted', q.description));
    copy.append(progress(q.progress, q.target, q.title + '进度'), el('span', 'quest-task-count', (q.conditions ? '已满足条件 ' : '当前进度 ') + number(Math.min(q.progress || 0, q.target || 1)) + ' / ' + number(q.target || 1)));
    if (q.conditions && q.conditions.length > 1) {
      const requirements = el('ul', 'quest-conditions');
      q.conditions.forEach(condition => { const row = el('li', condition.done ? 'is-done' : '', (condition.done ? '已满足 · ' : '待完成 · ') + (condition.label || condition.description || '准备条件') + ' ' + number(Math.min(condition.progress || 0, condition.target || 1)) + '/' + number(condition.target || 1)); requirements.append(row); }); copy.append(requirements);
    }
    if (composite) {
      const description = el('details', 'quest-task-description'), descriptionKey = 'task-description-' + q.id; description.open = !!view.expanded[descriptionKey];
      description.append(keyed(el('summary', '', '心愿说明'), descriptionKey), el('p', 'ui-small ui-muted', q.description));
      description.addEventListener('toggle', () => { if (alive(book)) view.expanded[descriptionKey] = description.open; }); copy.append(description);
    }
    const action = el('div', 'quest-task-actions'); action.append(el('p', 'quest-task-reward', rewardText(q.reward)));
    if (q.rainbow) action.append(el('p', 'qb-fragment-note', '本页找回' + (rainbow.find(([id]) => id === q.rainbow)?.[1] || '') + '色彩虹'));
    const claim = bookButton(book, q.claimed ? '奖励已收好' : q.locked ? (q.type === 'daily' ? '日期暂不可用' : '先收前一项') : q.done ? '领取奖励' : '继续小小努力', 'claim-' + q.id, () => {
      claimReward(book, claim, () => G.sys.quests.claim(q.id), q.reward, q.type === 'main' ? 'current' : 'task-' + q.id, result => {
        if (result.endingUnlocked) ui.questParty.open(); else if (result.chapterCompleted) story(Number(result.chapterCompleted) || q.chapter, 'completion');
      });
    }, 'ui-button ' + (q.done && !q.claimed && !q.locked ? 'ui-button-primary' : 'ui-button-soft'));
    claim.setAttribute('aria-label', '领取任务奖励：' + q.title); claim.disabled = !!q.claimed || !!q.locked || !q.done; action.append(claim);
    if (featured && !q.claimed && !q.locked && !q.done) {
      const labels = { rename: '给小屋起名', build: '去建房', decor: '去装扮', shop: '去找家具', residents: '去找朋友', photo: '拍张小屋照', garden: '去花园', avatar: '去换装', concert: '去小合奏', play: q.action?.gameId === 'bakery' ? '去做蛋糕' : '去游乐场' };
      action.append(bookButton(book, q.action?.label || labels[q.action?.panel] || '去完成', 'go-' + q.id, () => questAction(q, book.api), 'ui-button ui-button-soft'));
    }
    item.append(copy, action); return item;
  }
  function folded(book, key, title) {
    const details = el('details', 'quest-chapter-list'), summary = keyed(el('summary', '', title), 'fold-' + key); details.open = !!view.expanded[key];
    details.addEventListener('toggle', () => { if (alive(book)) view.expanded[key] = details.open; }); details.append(summary); return details;
  }
  function mainPage(body, book, data) {
    const { chapters, tasks, ending } = data, main = tasks.filter(q => q.type === 'main'), current = main.find(q => !q.claimed && !q.locked);
    if (!chapters.some(c => Number(c.id) === Number(view.chapter))) view.chapter = current?.chapter || chapters.find(c => c.available && !c.complete)?.id || chapters[chapters.length - 1]?.id || 1;
    body.append(rainbowStrip());
    if (!chapters.length) { body.append(el('p', 'ui-notice', '糯米正在整理新的故事。稍后再来翻翻成长册。')); return; }
    const layout = el('div', 'qb-chapter-layout'), spines = el('nav', 'qb-chapter-spines'); spines.setAttribute('aria-label', '五章成长故事');
    chapters.forEach((c, index) => {
      const spine = bookButton(book, '', 'chapter-' + c.id, () => changePage(book, { chapter: Number(c.id) }, 'chapter-' + c.id), 'qb-chapter-spine' + (Number(c.id) === Number(view.chapter) ? ' is-selected' : '') + (!c.available ? ' is-locked' : ''));
      spine.setAttribute('aria-current', Number(c.id) === Number(view.chapter) ? 'page' : 'false'); spine.style.setProperty('--chapter-paper', rainbow[index % rainbow.length][2]);
      spine.append(el('span', 'qb-chapter-number', '第 ' + c.id + ' 章'), el('strong', '', c.title), el('span', 'qb-chapter-status', !c.available ? '尚未开启' : c.complete ? '全章已收好' : '已收好 ' + c.done + ' / ' + c.total)); spines.append(spine);
    });
    const page = el('section', 'qb-chapter-page'), chapter = chapters.find(c => Number(c.id) === Number(view.chapter)) || chapters[0];
    const heading = el('div', 'quest-book-controls qb-chapter-controls'), picker = keyed(ui.controls.select(chapters.map(c => ({ id: String(c.id), name: '第' + c.id + '章 · ' + c.title + (!c.available ? ' · 未开启' : '') })), String(chapter.id), id => { if (alive(book)) changePage(book, { chapter: Number(id) }, 'chapter-select'); }), 'chapter-select'), read = bookButton(book, chapter.storySeen ? '重读故事' : '读故事', 'read-' + chapter.id, () => story(chapter.id), 'ui-button ui-button-soft'); picker.setAttribute('aria-label', '主线章节'); read.disabled = !chapter.available; heading.append(picker, read); page.append(heading);
    const chapterCopy = folded(book, 'description-' + chapter.id, '本章已收好 ' + chapter.done + ' / ' + chapter.total + ' 项 · 全部 ' + main.filter(q => q.claimed).length + ' / ' + main.length + ' 项'); chapterCopy.className = 'quest-chapter-copy'; chapterCopy.append(el('h2', 'qb-page-title', chapter.title), el('p', 'ui-small ui-muted', chapter.description || '跟着糯米，一起把小屋变成温暖的家。')); page.append(chapterCopy);
    const own = main.filter(q => Number(q.chapter) === Number(chapter.id)), focus = own.find(q => !q.claimed);
    if (!chapter.available) page.append(el('p', 'ui-notice qb-locked-note', '这一章还在等你。先收好前一章的全部任务奖励，再来翻开吧。'));
    else if (focus && !chapter.complete) page.append(questRow(focus, book, true));
    else { const complete = keyed(el('p', 'quest-chapter-finished', own.length ? '这一章的小心愿都实现啦。故事和回忆，随时可以再翻一翻。' : '这一章的清单还在整理，稍后再来看看。'), 'current'); complete.tabIndex = -1; page.append(complete); }
    const others = own.filter(q => !chapter.available || !focus || q.id !== focus.id || chapter.complete);
    if (others.length) { const details = folded(book, 'chapter-' + chapter.id, '本章任务清单 · ' + own.length + ' 项'), list = el('ol', 'quest-book-list'); others.forEach(q => list.append(questRow(q, book, false))); details.append(list); page.append(details); }
    if (ending.unlocked) page.append(bookButton(book, '再开一次彩虹派对', 'party', () => ui.questParty.open(), 'ui-button ui-button-primary quest-party-entry'));
    if (chapter.complete) {
      const actions = el('div', 'ui-actions'); actions.append(bookButton(book, '再听章末故事', 'completion-' + chapter.id, () => story(chapter.id, 'completion'), 'ui-button ui-button-soft'));
      const next = chapters.find(c => Number(c.id) > Number(chapter.id) && c.available);
      if (next) actions.append(bookButton(book, '翻到第' + next.id + '章', 'next-chapter', () => changePage(book, { chapter: Number(next.id) }, 'chapter-select'), 'ui-button ui-button-primary')); page.append(actions);
    }
    const shelf = folded(book, 'shelf', '翻翻五章成长绘本'); shelf.classList.add('qb-chapter-shelf'); shelf.append(spines); layout.append(page, shelf); body.append(layout);
  }
  function dailyPage(body, book, data) {
    const tasks = data.tasks.filter(q => q.type === 'daily'), dateLocked = G.state.quests.daily.date !== G.utils.dateKey();
    const introduction = el('div', 'qb-page-intro'); introduction.append(el('h2', 'qb-page-title', '今天，也长大一点点'), el('p', 'ui-small ui-muted', '每天三份小期待，午夜换新。完成后记得一份份收下奖励。')); body.append(introduction);
    body.append(el('p', 'qb-daily-date', '清单日期 · ' + G.state.quests.daily.date));
    if (dateLocked) body.append(el('p', 'ui-notice', '日期暂不可用。请回到真实日期查看当天清单，旧日奖励不会补领。'));
    if (!tasks.length) body.append(el('p', 'ui-notice', '今天的任务清单还没准备好，稍后重新翻开看看。'));
    const list = el('ol', 'quest-book-list qb-daily-list'); tasks.forEach(q => list.append(questRow(q, book, true))); body.append(list);
    const chest = data.chest, box = keyed(el('section', 'quest-daily-chest'), 'chest'); box.tabIndex = -1;
    const giftArt = el('span', 'qb-chest-art'); giftArt.setAttribute('aria-hidden', 'true'); giftArt.append(el('i')); box.append(giftArt);
    box.append(el('h3', '', '今天的心意宝箱'), stamp(chest.claimed ? '已领取' : dateLocked ? '日期锁定' : chest.available ? '可以开启' : '等待三份奖励', chest.claimed ? 'claimed' : dateLocked ? 'locked' : chest.available ? 'ready' : 'progress'), el('p', 'ui-small', '先收好三张每日任务卡的奖励，再亲手打开这份小礼物。'), progress(chest.done, chest.target, '每日已领取奖励份数'), el('p', 'quest-task-count', '奖励已收好 ' + chest.done + ' / ' + chest.target + ' 份'), el('p', 'quest-task-reward', rewardText(chest.reward)));
    const claim = bookButton(book, chest.claimed ? '今天的宝箱已收好' : dateLocked ? '日期暂不可用' : chest.available ? '打开小宝箱' : '先收齐三份奖励', 'claim-chest', () => claimReward(book, claim, () => G.sys.quests.claimDailyChest(), chest.reward, 'chest'), 'ui-button ' + (chest.available ? 'ui-button-primary' : 'ui-button-soft'));
    claim.disabled = !!chest.claimed || !chest.available; box.append(claim); body.append(box);
  }
  function furniturePreview(itemId) {
    const def = G.data.furnitureById[itemId]; if (!def) return null;
    const preview = el('canvas', 'achievement-furniture'); preview.width = 112; preview.height = 86; preview.dataset.furniture = itemId; preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', def.name); return preview;
  }
  function achievementRow(entry, book) {
    const item = keyed(el('li', 'achievement-step' + (entry.claimed ? ' is-claimed' : '') + (entry.available ? ' is-ready' : '') + (entry.locked ? ' is-locked' : '')), 'achievement-' + entry.id); item.tabIndex = -1; item.dataset.achievementId = entry.id;
    const medal = el('span', 'achievement-medal', String(entry.tier)); medal.setAttribute('aria-label', '第' + entry.tier + '阶徽章');
    const copy = el('div', 'achievement-copy'), heading = el('div', 'qb-task-heading'); heading.append(el('h3', '', entry.title), stamp(entry.claimed ? '已领取' : entry.available ? '可以领取' : entry.locked ? '前阶待领' : '进行中', entry.claimed ? 'claimed' : entry.available ? 'ready' : entry.locked ? 'locked' : 'progress'));
    copy.append(heading, el('p', 'ui-small ui-muted', entry.description), progress(entry.progress, entry.target, entry.title + '进度'), el('p', 'quest-task-count', number(Math.min(entry.progress || 0, entry.target)) + ' / ' + number(entry.target)));
    const reward = entry.reward || {}, action = el('div', 'achievement-action'), preview = reward.itemId && furniturePreview(reward.itemId);
    if (preview) action.append(preview, el('span', 'ui-small qb-gift-name', G.data.furnitureById[reward.itemId].name));
    action.append(el('p', 'quest-task-reward', rewardText(reward)));
    if (reward.outfitId) {
      action.append(el('p', 'ui-small ui-muted', '服饰直接收进衣橱；已有同款时不重复添加或换糖果。'));
      if (entry.claimed) action.append(bookButton(book, '去衣橱穿穿', 'outfit-' + entry.id, () => {
        if (G.runtime.avatarUI) G.runtime.avatarUI.tab = 'clothes';
        if (book.api.navigate) book.api.navigate({ panel: 'avatar', outfitId: reward.outfitId });
        else { const outfit = G.data.outfitById?.[reward.outfitId]; if (outfit && G.runtime.avatarUI) Object.assign(G.runtime.avatarUI, { tab: 'clothes', category: outfit.category, filter: 'owned' }); ui.open('avatar'); }
      }, 'ui-button ui-button-soft'));
    }
    const claim = bookButton(book, entry.claimed ? '徽章已收好' : entry.available ? '收下成就礼' : entry.locked ? '先收前一阶' : '继续积累', 'achievement-claim-' + entry.id, () => claimReward(book, claim, () => G.sys.achievements.claim(entry.id), reward, 'achievement-' + entry.id), 'ui-button ' + (entry.available ? 'ui-button-primary' : 'ui-button-soft'));
    claim.disabled = !!entry.claimed || !entry.available; claim.setAttribute('aria-label', '领取成就：' + entry.title); action.append(claim); item.append(medal, copy, action); return item;
  }
  function achievementsPage(body, book, data) {
    const { categories, summary } = data;
    if (!categories.some(c => c.id === view.category)) view.category = categories.find(c => c.ready > 0)?.id || categories[0]?.id;
    const intro = el('div', 'qb-page-intro'); intro.append(el('h2', 'qb-page-title', '每一步，都值得一枚徽章'), el('p', 'ui-small ui-muted', '已收好 ' + summary.done + ' / ' + summary.total + ' 枚徽章 · 每类按五阶依次收好')); body.append(intro);
    if (categories.length) {
      const controls = el('div', 'quest-book-controls'), picker = keyed(ui.controls.select(categories.map(c => ({ id: c.id, name: (c.name || c.title) + ' · ' + c.done + '/' + c.total + (c.ready ? ' · 有礼物' : '') })), view.category, id => { if (alive(book)) changePage(book, { category: id }, 'category'); }), 'category'); picker.setAttribute('aria-label', '选择成就类别'); controls.append(picker); body.append(controls);
      const selected = categories.find(c => c.id === view.category); if (selected) body.append(el('p', 'ui-small ui-muted', selected.description || '每一点小小的积累，都值得被记住。'));
      if (view.category === 'photographer') body.append(bookButton(book, '拍张小屋照', 'take-photo', () => { if (book.api.navigate) book.api.navigate({ panel: 'photo' }); else ui.photography.open(); }, 'ui-button ui-button-soft'));
      const entries = G.sys.achievements.list(view.category), list = el('ol', 'achievement-steps'); entries.forEach(entry => list.append(achievementRow(entry, book))); body.append(list);
      if (!entries.length) body.append(el('p', 'ui-notice', '这本类别小册还在整理，换一本看看吧。'));
    } else body.append(el('p', 'ui-notice', '徽章小册还在整理，稍后再来看看。'));
    if (summary.milestones?.length) {
      const details = folded(book, 'milestones', '彩虹与小屋的特别礼物'), gifts = el('div', 'achievement-specials'); details.classList.add('achievement-milestones');
      details.open = !!view.milestoneId || !!view.expanded.milestones;
      summary.milestones.forEach(m => {
        const row = keyed(el('article', 'achievement-special' + (m.id === view.milestoneId ? ' is-source' : '')), 'milestone-' + m.id); row.tabIndex = -1;
        const preview = m.itemId && furniturePreview(m.itemId); if (preview) row.append(preview, el('span', 'qb-gift-name', G.data.furnitureById[m.itemId].name));
        row.append(el('h3', '', m.title), stamp(m.claimed ? '已自动收好' : '随主线收好', m.claimed ? 'claimed' : 'progress'), el('p', 'ui-small ui-muted', m.description || ''), el('p', 'quest-task-reward', rewardText(m.reward)), el('p', 'ui-small ui-muted', m.claimed ? '特别礼物已放进背包' : m.id === 'rainbow' ? '集齐七片彩虹时，随主线奖励自动收到。' : '完成35条主线并集齐七色时，随主线奖励自动收到。')); gifts.append(row);
      }); details.append(gifts); body.append(details);
    }
  }
  function panel(api) {
    const body = el('div', 'ui-stack quest-book quest-book-v2'), book = { body, api, archive, pending: false }; activeBook = book;
    let data;
    try { data = { tasks: G.sys.quests.list(), chapters: G.sys.quests.chapters(), ending: G.sys.quests.ending(), chest: G.sys.quests.dailyChest(), categories: G.sys.achievements.categories(), summary: G.sys.achievements.summary() }; }
    catch (_) { data = null; }
    const tabs = el('div', 'ui-tabs quest-book-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '成长小册页签');
    const achievementReady = data?.summary.ready || 0, dailyReady = data ? data.tasks.filter(q => q.type === 'daily' && q.done && !q.claimed && !q.locked).length + (data.chest.available ? 1 : 0) : 0;
    const tabNames = [['main', '主线故事'], ['daily', '每日任务' + (dailyReady ? ' · ' + dailyReady : '')], ['achievements', '成就小册' + (achievementReady ? ' · ' + achievementReady : '')]];
    tabNames.forEach(([id, name], index) => {
      const tab = bookButton(book, name, 'tab-' + id, () => changePage(book, { tab: id }, 'tab-' + id), 'ui-tab' + (view.tab === id ? ' is-active' : ''));
      tab.id = 'quest-v2-tab-' + id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(view.tab === id)); tab.setAttribute('aria-controls', 'quest-v2-page'); tab.tabIndex = view.tab === id ? 0 : -1;
      tab.addEventListener('keydown', event => { if (!alive(book) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabNames.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabNames.length) % tabNames.length; const target = tabNames[next][0]; changePage(book, { tab: target }, 'tab-' + target); }); tabs.append(tab);
    }); body.append(tabs);
    const page = el('div', 'qb-tab-page'); page.id = 'quest-v2-page'; page.setAttribute('role', 'tabpanel'); page.setAttribute('aria-labelledby', 'quest-v2-tab-' + view.tab); body.append(page);
    if (view.feedback) { const feedback = el('p', 'qb-feedback' + (view.feedback.ok ? ' is-success' : ' is-error'), view.feedback.message); feedback.setAttribute('role', view.feedback.ok ? 'status' : 'alert'); page.append(feedback); }
    try {
      if (!data) throw new Error('unavailable');
      if (view.tab === 'main') mainPage(page, book, data); else if (view.tab === 'daily') dailyPage(page, book, data); else achievementsPage(page, book, data);
    } catch (_) {
      page.replaceChildren(); const error = el('p', 'qb-feedback is-error', '成长册暂时没能读好。请重新读取当前进度。'); error.setAttribute('role', 'alert'); page.append(error, bookButton(book, '重新读取', 'retry', () => refresh(book, 'retry'), 'ui-button ui-button-soft'));
    }
    focusAfterRender(book);
    return { title: '糯米的成长小册', subtitle: '从第一块砖，到七色彩虹', content: body };
  }
  G.bus.on('state:replace', () => { archive++; activeBook = null; Object.assign(view, { tab: 'main', chapter: null, category: null, milestoneId: null, expanded: {}, feedback: null, focusKey: null }); });
  G.bus.on('panel:change', event => { if (!event.open) { activeBook = null; view.focusKey = null; } });
  G.bus.on('modal:closed', () => { if (activeBook && alive(activeBook)) focusAfterRender(activeBook); });
  ui.questBook = { panel, story, focus(options = {}) { if (options.tab === 'achievements') view.tab = 'achievements'; if (options.category) view.category = options.category; view.milestoneId = options.milestoneId || null; view.feedback = null; view.focusKey = options.milestoneId ? 'milestone-' + options.milestoneId : options.category ? 'category' : 'tab-' + view.tab; }, party: () => ui.questParty.open() };
})(window.Game);
