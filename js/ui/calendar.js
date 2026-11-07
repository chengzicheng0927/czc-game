/* 节日信与生日祝福：主动听、一次领取，不把欢迎弹窗插进正在玩的游戏。 */
(function (G) {
  'use strict';
  const greeted = new Set();
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, className = 'ui-button') => { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', fn); return node; };
  const current = () => G.sys.time ? G.sys.time.current() : { events: [] };
  const events = () => current().events || [];
  function listen(event) {
    const node = button('🔊 听祝福', () => G.ui.speak(event.greeting, node));
    node.dataset.speechKey = 'calendar-' + event.key; node.dataset.listenLabel = '🔊 听祝福'; node.setAttribute('aria-pressed', 'false'); node.setAttribute('aria-label', '听一听' + event.name + '祝福');
    G.ui.syncSpeechButton?.(node);
    return node;
  }
  function preview(event) {
    const defId = event.gift && event.gift.itemId || (event.itemIds || [])[0];
    const def = G.data.furnitureById[defId]; if (!def) return null;
    const node = el('canvas', 'calendar-preview'); node.width = 220; node.height = 180; node.setAttribute('role', 'img'); node.setAttribute('aria-label', def.name);
    requestAnimationFrame(() => { if (G.render && G.render.drawThumbnail) G.render.drawThumbnail(node, defId); });
    return node;
  }
  function eventSection(event, closeLetter) {
    const section = el('section', 'calendar-event ui-stack'), heading = el('div', 'calendar-event-head ui-row'), copy = el('div', 'calendar-notice-copy');
    copy.append(el('h3', '', event.name), el('p', 'ui-small ui-muted', '糯米把今天的祝福，轻轻放在这里。'));
    const art = preview(event); if (art) heading.append(art); heading.append(copy); section.append(heading, el('p', 'calendar-greeting', event.greeting));
    const defId = event.gift && event.gift.itemId, def = G.data.furnitureById[defId];
    section.append(el('p', 'calendar-gift ui-small', def ? '今天的小礼物：' + def.name + ' × ' + (event.gift.count || 1) : '今天也有一份小礼物等你收好。'));
    const outfit = event.gift.outfitId && G.data.outfitById[event.gift.outfitId];
    if (outfit) section.append(el('p', 'calendar-gift ui-small', '节日穿搭：「' + outfit.name + '」直接收进衣橱。已有同款时不重复添加。'));
    const actions = el('div', 'ui-row'), claim = button(event.claimed ? '礼物收好啦' : '收下小礼物', () => {
      claim.disabled = true;
      const result = G.sys.time.claim(event.id); G.ui.toast(result.message);
      const fresh = events().find(item => item.id === event.id), claimed = result.ok || fresh && fresh.claimed;
      claim.disabled = !!claimed; claim.textContent = claimed ? '礼物收好啦' : '收下小礼物';
      claim.classList.toggle('calendar-claimed', !!claimed);
      if (wardrobe) wardrobe.disabled = !claimed;
      if (celebrate) celebrate.disabled = !claimed;
      if (result.ok) {
        G.ui.refresh();
        if (event.festivalId === 'player_birthday' && G.ui.birthday) G.ui.birthday.open({ fromClaim: true });
        else if (G.audio) G.audio.play('success');
      } else if (G.audio) G.audio.play('error');
    }, 'ui-button ui-button-primary');
    claim.disabled = !!event.claimed; claim.classList.toggle('calendar-claimed', !!event.claimed);
    actions.append(claim, listen(event)); section.append(actions);
    const wardrobe = outfit ? button('去衣橱穿穿', () => { closeLetter(); if (G.runtime.avatarUI) Object.assign(G.runtime.avatarUI, { category: outfit.category, filter: 'owned' }); G.ui.open('avatar'); }, 'ui-button ui-button-soft') : null;
    if (wardrobe) { wardrobe.disabled = !event.claimed; actions.append(wardrobe); }
    const celebrate = event.festivalId === 'player_birthday' && G.ui.birthday ? button('一起庆生', () => G.ui.birthday.open(), 'ui-button ui-button-soft') : null;
    if (celebrate) { celebrate.disabled = !event.claimed; actions.append(celebrate); section.append(el('p', 'ui-small ui-muted', '收下礼物后，住在这里的朋友会一起庆生。重看祝福不会重复发礼物。')); }
    if (event.festivalId === 'resident_birthday') section.append(el('p', 'ui-small ui-muted', '生日送给这位朋友的礼物，好感会翻倍哦。'));
    return section;
  }
  function open(eventId) {
    const active = events(), selected = eventId ? active.filter(event => event.id === eventId) : active;
    if (eventId && !selected.length) { G.ui.toast('这封节日信今天先收起来啦。新的祝福会在特别的日子到来。'); return null; }
    const body = el('div', 'calendar-letter ui-stack');
    if (!selected.length) body.append(el('p', 'ui-empty', '今天也值得被温柔记住。节日或生日到来时，糯米会把祝福和小礼物放在这里。'), button('给自己记下生日', () => { modal.close(); G.ui.open('settings'); }, 'ui-button ui-button-soft'));
    selected.forEach(event => { greeted.add(event.key); body.append(eventSection(event, () => modal.close())); });
    const modal = G.ui.modal({ title: selected.length === 1 ? selected[0].name + ' · 糯米的信' : '糯米的节日信', content: body });
    modal.element.classList.add('calendar-modal'); return modal;
  }
  function notices() {
    const active = events(); if (!active.length) return null;
    const root = el('div', 'calendar-notices ui-stack'); root.setAttribute('aria-label', '今天的节日与生日');
    active.forEach(event => {
      const notice = el('div', 'calendar-notice ui-notice ui-row'), copy = el('div', 'calendar-notice-copy');
      copy.append(el('strong', '', event.name), el('p', 'ui-small', event.claimed ? '礼物已收好，祝福一直都在。' : '糯米留了一份祝福和小礼物。'));
      notice.append(copy, button(event.claimed ? '再看祝福' : '打开节日信', () => open(event.id), 'ui-button ui-button-soft')); root.append(notice);
    });
    return root;
  }
  function maybeGreet() {
    if (!G.state || !G.state.tutorial.done || document.hidden || document.querySelector('#modal-root .modal-backdrop') || document.querySelector('#panel:not(.hidden)')) return false;
    if (G.ui.minigames && G.ui.minigames.isRunning() || G.ui.bakery && G.ui.bakery.isRunning()) return false;
    if (!events().some(event => !event.claimed && !greeted.has(event.key))) return false;
    open(); return true;
  }
  G.ui = G.ui || {}; G.ui.calendar = { open, notices, maybeGreet };
})(window.Game);
